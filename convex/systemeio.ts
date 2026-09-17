// systemeio.ts — synchronisation des prospects vers systeme.io.
//
// systeme.io n'expose pas d'envoi d'email ponctuel : ses emails partent de ses
// propres automatisations, déclenchées par des tags. Mycall crée donc chaque
// prospect comme contact et lui pose un tag à chaque étape (nouveau lead, RDV
// réservé, absent, gagné…). Le client branche ses campagnes sur ces tags.

import { v } from "convex/values";
import { internal } from "./_generated/api";
import {
	action,
	internalAction,
	internalMutation,
	internalQuery,
	mutation,
	query,
} from "./_generated/server";
import { requireAdmin } from "./lib/auth";

const API = "https://api.systeme.io/api";
const DEFAULT_PREFIX = "Mycall";

const STATUS_TAGS: Record<string, string> = {
	qualifie: "Qualifié",
	rdv_reserve: "RDV réservé",
	tenu: "RDV tenu",
	gagne: "Gagné",
	perdu: "Perdu",
	follow_up: "Follow-up",
};

// Tags posés pour un événement, avant préfixe.
function tagsFor(
	type: string,
	data: Record<string, unknown>,
	eventName: string | null,
): string[] {
	switch (type) {
		case "lead.created":
			return ["Nouveau lead"];
		case "booking.created":
			return eventName
				? ["RDV réservé", `RDV : ${eventName}`]
				: ["RDV réservé"];
		case "booking.rescheduled":
			return ["RDV déplacé"];
		case "booking.cancelled":
			return ["RDV annulé"];
		case "booking.outcome_updated":
			return data.attendance === "no_show" ? ["Absent au RDV"] : [];
		case "lead.status_changed": {
			const tag = STATUS_TAGS[String(data.status)];
			return tag ? [tag] : [];
		}
		case "payment.succeeded":
			return ["Client payant"];
		default:
			return [];
	}
}

class SystemeioError extends Error {
	constructor(
		readonly status: number,
		message: string,
	) {
		super(message);
	}
}

async function call<T>(
	apiKey: string,
	method: "GET" | "POST",
	path: string,
	body?: unknown,
): Promise<T> {
	for (let attempt = 0; ; attempt++) {
		const res = await fetch(`${API}${path}`, {
			method,
			headers: {
				"X-API-Key": apiKey,
				Accept: "application/json",
				...(body !== undefined && { "Content-Type": "application/json" }),
			},
			body: body !== undefined ? JSON.stringify(body) : undefined,
		});
		if (res.status === 429 && attempt < 4) {
			const wait = Number(res.headers.get("retry-after"));
			await new Promise((r) =>
				setTimeout(
					r,
					Number.isFinite(wait) && wait > 0
						? wait * 1000
						: 2000 * (attempt + 1),
				),
			);
			continue;
		}
		if (res.status === 204) return undefined as T;
		const text = await res.text();
		if (!res.ok) {
			if (res.status === 401 || res.status === 403) {
				throw new SystemeioError(
					res.status,
					"Clé API systeme.io refusée : vérifie qu'elle est complète et toujours active.",
				);
			}
			throw new SystemeioError(
				res.status,
				`systeme.io a répondu ${res.status} : ${text.slice(0, 200)}`,
			);
		}
		return (text ? JSON.parse(text) : undefined) as T;
	}
}

// ============================================================
// Réglages
// ============================================================

export const getStatus = query({
	args: {},
	handler: async (ctx) => {
		await requireAdmin(ctx);
		const s = await ctx.db
			.query("integrationSettings")
			.withIndex("by_singleton", (q) => q.eq("singleton", "default"))
			.first();
		return {
			connected: Boolean(s?.systemeioApiKey),
			keyPreview: s?.systemeioApiKey
				? `••••${s.systemeioApiKey.slice(-4)}`
				: null,
			tagPrefix: s?.systemeioTagPrefix ?? DEFAULT_PREFIX,
		};
	},
});

export const assertAdminInternal = internalQuery({
	args: {},
	handler: async (ctx) => await requireAdmin(ctx),
});

export const saveInternal = internalMutation({
	args: {
		userId: v.id("users"),
		apiKey: v.optional(v.string()),
		tagPrefix: v.optional(v.string()),
	},
	handler: async (ctx, { userId, apiKey, tagPrefix }) => {
		const patch = {
			systemeioApiKey: apiKey,
			systemeioTagPrefix: tagPrefix,
			updatedAt: Date.now(),
			updatedByUserId: userId,
		};
		const existing = await ctx.db
			.query("integrationSettings")
			.withIndex("by_singleton", (q) => q.eq("singleton", "default"))
			.first();
		if (existing) await ctx.db.patch(existing._id, patch);
		else
			await ctx.db.insert("integrationSettings", {
				singleton: "default",
				...patch,
			});
	},
});

export const connect = action({
	args: { apiKey: v.string(), tagPrefix: v.optional(v.string()) },
	handler: async (ctx, { apiKey, tagPrefix }) => {
		const userId = await ctx.runQuery(
			internal.systemeio.assertAdminInternal,
			{},
		);
		const key = apiKey.trim();
		if (key.length < 20)
			throw new Error("Cette clé systeme.io semble incomplète.");
		// Lecture minimale pour valider la clé avant de l'enregistrer.
		await call(key, "GET", "/contacts?limit=10");
		await ctx.runMutation(internal.systemeio.saveInternal, {
			userId,
			apiKey: key,
			tagPrefix: tagPrefix?.trim() || DEFAULT_PREFIX,
		});
		return { ok: true };
	},
});

export const updatePrefix = mutation({
	args: { tagPrefix: v.string() },
	handler: async (ctx, { tagPrefix }) => {
		const userId = await requireAdmin(ctx);
		const existing = await ctx.db
			.query("integrationSettings")
			.withIndex("by_singleton", (q) => q.eq("singleton", "default"))
			.first();
		if (!existing?.systemeioApiKey)
			throw new Error("systeme.io n'est pas connecté.");
		await ctx.db.patch(existing._id, {
			systemeioTagPrefix: tagPrefix.trim(),
			updatedAt: Date.now(),
			updatedByUserId: userId,
		});
		return { ok: true };
	},
});

export const disconnect = mutation({
	args: {},
	handler: async (ctx) => {
		const userId = await requireAdmin(ctx);
		const existing = await ctx.db
			.query("integrationSettings")
			.withIndex("by_singleton", (q) => q.eq("singleton", "default"))
			.first();
		if (!existing) return { ok: true };
		await ctx.db.patch(existing._id, {
			systemeioApiKey: undefined,
			systemeioTagPrefix: undefined,
			updatedAt: Date.now(),
			updatedByUserId: userId,
		});
		return { ok: true };
	},
});

// ============================================================
// Synchronisation
// ============================================================

export const getSyncContextInternal = internalQuery({
	args: {
		leadId: v.id("leads"),
		bookingId: v.optional(v.id("bookings")),
	},
	handler: async (ctx, { leadId, bookingId }) => {
		const s = await ctx.db
			.query("integrationSettings")
			.withIndex("by_singleton", (q) => q.eq("singleton", "default"))
			.first();
		const lead = await ctx.db.get(leadId);
		if (!s?.systemeioApiKey || !lead) return null;
		const booking = bookingId ? await ctx.db.get(bookingId) : null;
		const event = booking ? await ctx.db.get(booking.eventId) : null;
		return {
			apiKey: s.systemeioApiKey,
			prefix: s.systemeioTagPrefix ?? DEFAULT_PREFIX,
			email: lead.email ?? null,
			firstName: lead.firstName ?? null,
			lastName: lead.lastName ?? null,
			phone: lead.phone ?? null,
			optedOut: Boolean(lead.emailOptOutAt),
			eventName: event?.name ?? null,
		};
	},
});

interface Paged<T> {
	items: T[];
}

export const syncLead = internalAction({
	args: {
		leadId: v.id("leads"),
		bookingId: v.optional(v.id("bookings")),
		type: v.string(),
		data: v.optional(v.string()),
	},
	handler: async (ctx, { leadId, bookingId, type, data }) => {
		const c = await ctx.runQuery(internal.systemeio.getSyncContextInternal, {
			leadId,
			bookingId,
		});
		// systeme.io identifie un contact par son email : sans email, rien à
		// synchroniser. Un prospect désabonné n'y est pas poussé non plus.
		if (!c?.email || c.optedOut) return;

		const parsed = data ? (JSON.parse(data) as Record<string, unknown>) : {};
		const tags = tagsFor(type, parsed, c.eventName).map((t) =>
			c.prefix ? `${c.prefix} · ${t}` : t,
		);

		try {
			const found = await call<Paged<{ id: number }>>(
				c.apiKey,
				"GET",
				`/contacts?email=${encodeURIComponent(c.email)}&limit=10`,
			);
			let contactId = found?.items?.[0]?.id;
			if (!contactId) {
				const fields = [
					c.firstName && { slug: "first_name", value: c.firstName },
					c.lastName && { slug: "surname", value: c.lastName },
					c.phone && { slug: "phone_number", value: c.phone },
				].filter(Boolean);
				const created = await call<{ id: number }>(
					c.apiKey,
					"POST",
					"/contacts",
					{
						email: c.email,
						fields,
					},
				);
				contactId = created.id;
			}

			for (const name of tags) {
				const existing = await call<Paged<{ id: number; name: string }>>(
					c.apiKey,
					"GET",
					`/tags?query=${encodeURIComponent(name)}&limit=100`,
				);
				let tagId = existing?.items?.find((t) => t.name === name)?.id;
				if (!tagId) {
					const created = await call<{ id: number }>(
						c.apiKey,
						"POST",
						"/tags",
						{
							name,
						},
					);
					tagId = created.id;
				}
				try {
					await call(c.apiKey, "POST", `/contacts/${contactId}/tags`, {
						tagId,
					});
				} catch (err) {
					// Tag déjà posé : systeme.io répond 422, ce n'est pas une erreur.
					if (!(err instanceof SystemeioError) || err.status !== 422) throw err;
				}
			}
		} catch (err) {
			console.error(
				`[systeme.io] synchro lead ${leadId} (${type}) : ${err instanceof Error ? err.message : String(err)}`,
			);
		}
	},
});
