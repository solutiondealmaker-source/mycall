// invitations.ts — inviter un membre sans toucher aux variables d'environnement.
//
// Le gating d'inscription (auth.ts, remédiation H1) reste fail-closed : seuls
// SIGNUP_ALLOWED_EMAILS et les invitations en attente peuvent créer un compte.
// Une invitation est donc une autorisation d'inscription nominative, à durée
// limitée, révocable, et qui porte le rôle attribué au membre — ainsi que les
// événements dont il devient hôte dès la création de son compte, pour ne pas
// avoir à revenir l'ajouter à la main.

import { v } from "convex/values";
import { internal } from "./_generated/api";
import type { Doc, Id } from "./_generated/dataModel";
import {
	internalMutation,
	internalQuery,
	mutation,
	type QueryCtx,
	query,
} from "./_generated/server";
import { requireAdmin } from "./lib/auth";

const INVITE_TTL_MS = 14 * 24 * 60 * 60 * 1000; // 14 jours

const ROLE_VALIDATOR = v.union(
	v.literal("closer"),
	v.literal("setter"),
	v.literal("coach"),
	v.literal("head_of_sales"),
	v.literal("ceo"),
	v.literal("ops"),
	v.literal("admin"),
	v.literal("viewer"),
);

function normalize(email: string): string {
	return email.trim().toLowerCase();
}

// Une invitation est utilisable tant qu'elle n'est ni acceptée, ni révoquée,
// ni expirée.
function isPending(inv: Doc<"invitations">, now: number): boolean {
	return !inv.acceptedAt && !inv.revokedAt && inv.expiresAt > now;
}

async function findPending(
	ctx: QueryCtx,
	email: string,
): Promise<Doc<"invitations"> | null> {
	const now = Date.now();
	const rows = await ctx.db
		.query("invitations")
		.withIndex("by_email", (q) => q.eq("email", email))
		.collect();
	return rows.find((r) => isPending(r, now)) ?? null;
}

// Noms des événements encore existants, dans l'ordre donné.
async function eventNames(
	ctx: QueryCtx,
	ids: Id<"events">[] | undefined,
): Promise<string[]> {
	const names: string[] = [];
	for (const id of ids ?? []) {
		const e = await ctx.db.get(id);
		if (e) names.push(e.name);
	}
	return names;
}

// ============================================================
// QUERIES
// ============================================================

// Invitations non acceptées, pour la page Équipe.
export const listPending = query({
	args: {},
	handler: async (ctx) => {
		await requireAdmin(ctx);
		const now = Date.now();
		const rows = await ctx.db.query("invitations").collect();
		const pending = rows
			.filter((r) => !r.acceptedAt && !r.revokedAt)
			.sort((a, b) => b.createdAt - a.createdAt);
		const out = [];
		for (const r of pending) {
			out.push({
				_id: r._id,
				email: r.email,
				role: r.role,
				createdAt: r.createdAt,
				expiresAt: r.expiresAt,
				expired: r.expiresAt <= now,
				eventNames: await eventNames(ctx, r.eventIds),
			});
		}
		return out;
	},
});

// Invitations en attente rattachées à un événement, pour la section Hôtes.
export const listPendingForEvent = query({
	args: { eventId: v.id("events") },
	handler: async (ctx, { eventId }) => {
		await requireAdmin(ctx);
		const now = Date.now();
		const rows = await ctx.db.query("invitations").collect();
		return rows
			.filter(
				(r) => !r.acceptedAt && !r.revokedAt && r.eventIds?.includes(eventId),
			)
			.sort((a, b) => b.createdAt - a.createdAt)
			.map((r) => ({
				_id: r._id,
				email: r.email,
				role: r.role,
				expired: r.expiresAt <= now,
			}));
	},
});

// ============================================================
// INTERNES — consommées par auth.ts au moment de l'inscription
// ============================================================

export const findPendingInternal = internalQuery({
	args: { email: v.string() },
	handler: async (ctx, { email }) => {
		return await findPending(ctx, normalize(email));
	},
});

// Marque l'invitation acceptée et fait du nouveau membre un hôte des
// événements choisis à l'invitation. Un événement supprimé entre-temps est
// ignoré ; un hôte déjà présent n'est pas dupliqué.
export const markAcceptedInternal = internalMutation({
	args: { invitationId: v.id("invitations"), userId: v.id("users") },
	handler: async (ctx, { invitationId, userId }) => {
		const inv = await ctx.db.get(invitationId);
		if (!inv) return;
		await ctx.db.patch(invitationId, { acceptedAt: Date.now() });

		for (const eventId of inv.eventIds ?? []) {
			if (!(await ctx.db.get(eventId))) continue;
			const existing = await ctx.db
				.query("eventHosts")
				.withIndex("by_eventId_userId", (q) =>
					q.eq("eventId", eventId).eq("userId", userId),
				)
				.first();
			if (existing) continue;
			await ctx.db.insert("eventHosts", {
				eventId,
				userId,
				priority: "medium",
				createdAt: Date.now(),
			});
		}
	},
});

// ============================================================
// MUTATIONS — administration
// ============================================================

export const create = mutation({
	args: {
		email: v.string(),
		role: ROLE_VALIDATOR,
		eventIds: v.optional(v.array(v.id("events"))),
	},
	handler: async (ctx, { email, role, eventIds }) => {
		const callerId = await requireAdmin(ctx);
		const normalized = normalize(email);

		if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(normalized)) {
			throw new Error("Adresse email invalide");
		}

		const requestedEvents: Id<"events">[] = [];
		for (const id of new Set(eventIds ?? [])) {
			if (!(await ctx.db.get(id))) throw new Error("Événement introuvable");
			requestedEvents.push(id);
		}

		// Déjà membre ? Inviter n'aurait aucun effet : l'inscription est refusée
		// aux comptes existants, qui doivent simplement se connecter.
		const existingUser = await ctx.db
			.query("users")
			.withIndex("email", (q) => q.eq("email", normalized))
			.first();
		if (existingUser) {
			throw new Error(
				requestedEvents.length > 0
					? "Cette personne fait déjà partie de l'équipe : ajoute-la directement comme hôte."
					: "Cette personne fait déjà partie de l'équipe.",
			);
		}

		const pending = await findPending(ctx, normalized);
		if (pending) {
			// Invitée depuis un autre événement : on complète son invitation plutôt
			// que de refuser. Le rôle initial est conservé.
			const current = pending.eventIds ?? [];
			const added = requestedEvents.filter((id) => !current.includes(id));
			if (added.length === 0) {
				throw new Error(
					requestedEvents.length > 0
						? "Cette personne est déjà invitée sur cet événement."
						: "Une invitation est déjà en attente pour cette adresse. Révoque-la d'abord pour en changer le rôle.",
				);
			}
			await ctx.db.patch(pending._id, { eventIds: [...current, ...added] });
			return { ok: true, invitationId: pending._id, merged: true };
		}

		const now = Date.now();
		const invitationId = await ctx.db.insert("invitations", {
			email: normalized,
			role,
			invitedByUserId: callerId,
			...(requestedEvents.length > 0 && { eventIds: requestedEvents }),
			createdAt: now,
			expiresAt: now + INVITE_TTL_MS,
		});

		const inviter = await ctx.db.get(callerId);
		await ctx.scheduler.runAfter(0, internal.emails.sendInvitation, {
			to: normalized,
			role,
			inviterName: inviter?.name ?? inviter?.email ?? null,
			eventNames: await eventNames(ctx, requestedEvents),
		});

		return { ok: true, invitationId, merged: false };
	},
});

export const revoke = mutation({
	args: { invitationId: v.id("invitations") },
	handler: async (ctx, { invitationId }) => {
		await requireAdmin(ctx);
		const inv = await ctx.db.get(invitationId);
		if (!inv) throw new Error("Invitation introuvable");
		if (inv.acceptedAt) {
			throw new Error(
				"Invitation déjà acceptée. Retire plutôt le membre depuis la liste.",
			);
		}
		await ctx.db.patch(invitationId, { revokedAt: Date.now() });
		return { ok: true };
	},
});

// Retire un événement d'une invitation, sans annuler l'invitation elle-même.
export const detachEvent = mutation({
	args: { invitationId: v.id("invitations"), eventId: v.id("events") },
	handler: async (ctx, { invitationId, eventId }) => {
		await requireAdmin(ctx);
		const inv = await ctx.db.get(invitationId);
		if (!inv) throw new Error("Invitation introuvable");
		if (inv.acceptedAt) throw new Error("Invitation déjà acceptée.");
		await ctx.db.patch(invitationId, {
			eventIds: (inv.eventIds ?? []).filter((id) => id !== eventId),
		});
		return { ok: true };
	},
});

// Renvoie l'email et repousse l'expiration — utile quand l'invitation a expiré
// ou s'est perdue dans les spams.
export const resend = mutation({
	args: { invitationId: v.id("invitations") },
	handler: async (ctx, { invitationId }) => {
		const callerId = await requireAdmin(ctx);
		const inv = await ctx.db.get(invitationId);
		if (!inv) throw new Error("Invitation introuvable");
		if (inv.acceptedAt) throw new Error("Invitation déjà acceptée.");
		if (inv.revokedAt) throw new Error("Invitation révoquée.");

		await ctx.db.patch(invitationId, { expiresAt: Date.now() + INVITE_TTL_MS });

		const inviter = await ctx.db.get(callerId);
		await ctx.scheduler.runAfter(0, internal.emails.sendInvitation, {
			to: inv.email,
			role: inv.role,
			inviterName: inviter?.name ?? inviter?.email ?? null,
			eventNames: await eventNames(ctx, inv.eventIds),
		});
		return { ok: true };
	},
});
