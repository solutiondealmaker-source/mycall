// convex/userCalendarSettings.ts
// Préférences calendrier par user : writer + conflict-check.
//
// - writerAccountId + writerCalendarId → où créer les nouveaux events Google + Meet links
// - conflictCheckCalendars            → calendriers lus pour vérifier la dispo
//
// Une row par user (singleton). Créée automatiquement à la première connexion.

import { getAuthUserId } from "@convex-dev/auth/server";
import { v } from "convex/values";
import { internal } from "./_generated/api";
import type { Doc, Id } from "./_generated/dataModel";
import type { MutationCtx, QueryCtx } from "./_generated/server";
import {
	internalMutation,
	internalQuery,
	mutation,
	query,
} from "./_generated/server";

type ConflictCalendar = {
	accountId: Id<"userGoogleAccounts">;
	calendarId: string;
	calendarSummary?: string;
};

// ============================================================
// HELPERS privés
// ============================================================

async function getOrCreateSettings(
	ctx: MutationCtx,
	userId: Id<"users">,
): Promise<Doc<"userCalendarSettings">> {
	const existing = await ctx.db
		.query("userCalendarSettings")
		.withIndex("by_userId", (q) => q.eq("userId", userId))
		.first();
	if (existing) return existing;
	const now = Date.now();
	const id = await ctx.db.insert("userCalendarSettings", {
		userId,
		conflictCheckCalendars: [],
		createdAt: now,
		updatedAt: now,
	});
	const row = await ctx.db.get(id);
	if (!row) throw new Error("Failed to create userCalendarSettings");
	return row;
}

async function getRaw(
	ctx: QueryCtx | MutationCtx,
	userId: Id<"users">,
): Promise<Doc<"userCalendarSettings"> | null> {
	return await ctx.db
		.query("userCalendarSettings")
		.withIndex("by_userId", (q) => q.eq("userId", userId))
		.first();
}

// ============================================================
// QUERIES — internal (used by actions)
// ============================================================

export const getSettingsForUserInternal = internalQuery({
	args: { userId: v.id("users") },
	handler: async (ctx, { userId }) => {
		return await getRaw(ctx, userId);
	},
});

// Retourne les calendriers de conflict-check. Inclut toujours le writer (safety net).
export const getConflictCalendarsForUserInternal = internalQuery({
	args: { userId: v.id("users") },
	handler: async (ctx, { userId }): Promise<ConflictCalendar[]> => {
		const s = await getRaw(ctx, userId);
		if (!s) return [];
		const list: ConflictCalendar[] = [...s.conflictCheckCalendars];
		// Safety net G5 — le writer doit toujours être dans la liste
		if (s.writerAccountId && s.writerCalendarId) {
			const alreadyListed = list.some(
				(c) =>
					c.accountId === s.writerAccountId &&
					c.calendarId === s.writerCalendarId,
			);
			if (!alreadyListed) {
				list.push({
					accountId: s.writerAccountId,
					calendarId: s.writerCalendarId,
					calendarSummary: s.writerCalendarSummary,
				});
			}
		}
		return list;
	},
});

// ============================================================
// QUERIES — public (UI)
// ============================================================

export const getMyCalendarSettings = query({
	args: {},
	handler: async (ctx) => {
		const userId = await getAuthUserId(ctx);
		if (!userId) return null;
		const s = await getRaw(ctx, userId);
		return s
			? {
					writerAccountId: s.writerAccountId ?? null,
					writerCalendarId: s.writerCalendarId ?? null,
					writerCalendarSummary: s.writerCalendarSummary ?? null,
					conflictCheckCalendars: s.conflictCheckCalendars,
				}
			: {
					writerAccountId: null,
					writerCalendarId: null,
					writerCalendarSummary: null,
					conflictCheckCalendars: [],
				};
	},
});

// ============================================================
// MUTATIONS — public (UI)
// ============================================================

// Définit le writer calendar. Déclenche automatiquement la souscription watch.
export const setWriter = mutation({
	args: {
		accountId: v.id("userGoogleAccounts"),
		calendarId: v.string(),
		calendarSummary: v.string(),
	},
	handler: async (ctx, { accountId, calendarId, calendarSummary }) => {
		const userId = await getAuthUserId(ctx);
		if (!userId) throw new Error("Non authentifié");
		const acc = await ctx.db.get(accountId);
		if (!acc || acc.userId !== userId)
			throw new Error("Compte Google introuvable");

		const settings = await getOrCreateSettings(ctx, userId);
		await ctx.db.patch(settings._id, {
			writerAccountId: accountId,
			writerCalendarId: calendarId,
			writerCalendarSummary: calendarSummary,
			updatedAt: Date.now(),
		});

		// S'assurer que le writer calendar est aussi surveillé
		await ctx.scheduler.runAfter(
			0,
			internal.googleActions.subscribeCalendarWatchForAccount,
			{
				userId,
				accountId,
				calendarId,
			},
		);
	},
});

// Met à jour la liste des calendriers de conflict-check.
// Abonne automatiquement les nouveaux calendriers.
export const setConflictCalendars = mutation({
	args: {
		calendars: v.array(
			v.object({
				accountId: v.id("userGoogleAccounts"),
				calendarId: v.string(),
				calendarSummary: v.optional(v.string()),
			}),
		),
	},
	handler: async (ctx, { calendars }) => {
		const userId = await getAuthUserId(ctx);
		if (!userId) throw new Error("Non authentifié");
		for (const c of calendars) {
			const acc = await ctx.db.get(c.accountId);
			if (!acc || acc.userId !== userId)
				throw new Error("Compte Google invalide");
		}
		const settings = await getOrCreateSettings(ctx, userId);
		const previous = new Set(
			settings.conflictCheckCalendars.map(
				(c) => `${c.accountId}:${c.calendarId}`,
			),
		);
		await ctx.db.patch(settings._id, {
			conflictCheckCalendars: calendars,
			updatedAt: Date.now(),
		});
		// Abonner les nouveaux (account, calendar) qui n'avaient pas encore de channel
		for (const c of calendars) {
			const key = `${c.accountId}:${c.calendarId}`;
			if (previous.has(key)) continue;
			await ctx.scheduler.runAfter(
				0,
				internal.googleActions.subscribeCalendarWatchForAccount,
				{
					userId,
					accountId: c.accountId,
					calendarId: c.calendarId,
				},
			);
		}
	},
});

// ============================================================
// MUTATIONS — internal (called during OAuth callback)
// ============================================================

// Positionne le writer uniquement si aucun writer n'est encore défini.
// Appelé sur le premier compte connecté. Les comptes suivants n'overrident pas.
export const ensureWriterInternal = internalMutation({
	args: {
		userId: v.id("users"),
		accountId: v.id("userGoogleAccounts"),
		calendarId: v.string(),
		calendarSummary: v.string(),
	},
	handler: async (ctx, { userId, accountId, calendarId, calendarSummary }) => {
		const settings = await getOrCreateSettings(ctx, userId);
		// Ne pas écraser si déjà défini
		if (settings.writerAccountId && settings.writerCalendarId) return;
		await ctx.db.patch(settings._id, {
			writerAccountId: accountId,
			writerCalendarId: calendarId,
			writerCalendarSummary: calendarSummary,
			updatedAt: Date.now(),
		});
	},
});

// Ajoute un calendrier à conflictCheckCalendars si pas déjà présent. Idempotent.
export const addConflictCalendarInternal = internalMutation({
	args: {
		userId: v.id("users"),
		accountId: v.id("userGoogleAccounts"),
		calendarId: v.string(),
		calendarSummary: v.optional(v.string()),
	},
	handler: async (ctx, { userId, accountId, calendarId, calendarSummary }) => {
		const settings = await getOrCreateSettings(ctx, userId);
		const already = settings.conflictCheckCalendars.some(
			(c) => c.accountId === accountId && c.calendarId === calendarId,
		);
		if (already) return;
		await ctx.db.patch(settings._id, {
			conflictCheckCalendars: [
				...settings.conflictCheckCalendars,
				{ accountId, calendarId, calendarSummary },
			],
			updatedAt: Date.now(),
		});
	},
});

// Retire toutes les références à un compte (writer + conflict-check).
// Appelé lors de la déconnexion d'un compte Google.
export const purgeAccountReferencesInternal = internalMutation({
	args: {
		userId: v.id("users"),
		accountId: v.id("userGoogleAccounts"),
	},
	handler: async (ctx, { userId, accountId }) => {
		const settings = await getRaw(ctx, userId);
		if (!settings) return;
		const filtered = settings.conflictCheckCalendars.filter(
			(c) => c.accountId !== accountId,
		);
		const patch: Partial<Doc<"userCalendarSettings">> = {
			conflictCheckCalendars: filtered,
			updatedAt: Date.now(),
		};
		if (settings.writerAccountId === accountId) {
			patch.writerAccountId = undefined;
			patch.writerCalendarId = undefined;
			patch.writerCalendarSummary = undefined;
		}
		await ctx.db.patch(settings._id, patch);
	},
});
