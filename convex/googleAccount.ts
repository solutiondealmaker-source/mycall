// convex/googleAccount.ts
// CRUD layer for userGoogleAccounts — multi-compte OAuth storage.
//
// Un user peut avoir N comptes Google connectés.
// Les préférences writer / conflict-check vivent dans userCalendarSettings.ts.
//
// API publique UI :
//   listAccountsForUser  query  → tous les comptes connectés de l'appelant
//   disconnectAccount    mutation → supprime un compte (cleanup channels + busy blocks)

import { getAuthUserId } from "@convex-dev/auth/server";
import { v } from "convex/values";
import { internal } from "./_generated/api";
import type { Id } from "./_generated/dataModel";
import type { QueryCtx } from "./_generated/server";
import {
	internalMutation,
	internalQuery,
	mutation,
	query,
} from "./_generated/server";

// ============================================================
// QUERIES — internal (used by actions)
// ============================================================

export const getAccountByIdInternal = internalQuery({
	args: { accountId: v.id("userGoogleAccounts") },
	handler: async (ctx, { accountId }) => {
		return await ctx.db.get(accountId);
	},
});

export const listAccountsForUserInternal = internalQuery({
	args: { userId: v.id("users") },
	handler: async (ctx, { userId }) => {
		return await ctx.db
			.query("userGoogleAccounts")
			.withIndex("by_userId", (q) => q.eq("userId", userId))
			.collect();
	},
});

// Résout le compte writer pour un user — null si aucun writer défini.
// Utilisé par googleActions.createGoogleEventForBooking et les fetches de token.
export const getWriterAccountForUserInternal = internalQuery({
	args: { userId: v.id("users") },
	handler: async (ctx, { userId }) => {
		const settings = await ctx.db
			.query("userCalendarSettings")
			.withIndex("by_userId", (q) => q.eq("userId", userId))
			.first();
		if (!settings?.writerAccountId) return null;
		const acc = await ctx.db.get(settings.writerAccountId);
		if (!acc) return null;
		return {
			...acc,
			writerCalendarId: settings.writerCalendarId ?? null,
			writerCalendarSummary: settings.writerCalendarSummary ?? null,
		};
	},
});
// ============================================================
// QUERIES — public (used by UI)
// ============================================================

async function getAccountsSummary(
	ctx: QueryCtx,
	userId: Id<"users">,
): Promise<
	Array<{
		_id: Id<"userGoogleAccounts">;
		googleEmail: string;
		connectedAt: number;
		invalidSince?: number;
	}>
> {
	const rows = await ctx.db
		.query("userGoogleAccounts")
		.withIndex("by_userId", (q) => q.eq("userId", userId))
		.collect();
	return rows
		.map((r) => ({
			_id: r._id,
			googleEmail: r.googleEmail,
			invalidSince: r.invalidSince,
			connectedAt: r.connectedAt,
		}))
		.sort((a, b) => a.connectedAt - b.connectedAt);
}

// Liste tous les comptes Google connectés de l'utilisateur authentifié.
export const listAccountsForUser = query({
	args: {},
	handler: async (ctx) => {
		const userId = await getAuthUserId(ctx);
		if (!userId) return [];
		return await getAccountsSummary(ctx, userId);
	},
});
// ============================================================
// MUTATIONS — internal (token upsert + refresh)
// ============================================================

// Insère ou met à jour un compte Google (keyed by userId + googleSub).
// Retourne l'_id de la row pour finaliser le flow OAuth.
export const upsertAccountInternal = internalMutation({
	args: {
		userId: v.id("users"),
		googleSub: v.string(),
		googleEmail: v.string(),
		accessToken: v.string(),
		refreshToken: v.string(),
		tokenExpiryMs: v.number(),
		scope: v.string(),
	},
	handler: async (ctx, args): Promise<Id<"userGoogleAccounts">> => {
		const existing = await ctx.db
			.query("userGoogleAccounts")
			.withIndex("by_userId_googleSub", (q) =>
				q.eq("userId", args.userId).eq("googleSub", args.googleSub),
			)
			.first();
		const now = Date.now();
		if (existing) {
			await ctx.db.patch(existing._id, {
				googleEmail: args.googleEmail,
				accessToken: args.accessToken,
				// On ne remplace le refresh_token que s'il est présent (Google ne le
				// renvoie pas sur les reconnexions sans prompt=consent).
				refreshToken: args.refreshToken || existing.refreshToken,
				tokenExpiryMs: args.tokenExpiryMs,
				scope: args.scope,
				lastRefreshedAt: now,
			});
			return existing._id;
		}
		return await ctx.db.insert("userGoogleAccounts", {
			userId: args.userId,
			googleSub: args.googleSub,
			googleEmail: args.googleEmail,
			accessToken: args.accessToken,
			refreshToken: args.refreshToken,
			tokenExpiryMs: args.tokenExpiryMs,
			scope: args.scope,
			connectedAt: now,
		});
	},
});

export const patchAccountTokensInternal = internalMutation({
	args: {
		accountId: v.id("userGoogleAccounts"),
		accessToken: v.string(),
		tokenExpiryMs: v.number(),
	},
	handler: async (ctx, { accountId, accessToken, tokenExpiryMs }) => {
		await ctx.db.patch(accountId, {
			accessToken,
			tokenExpiryMs,
			lastRefreshedAt: Date.now(),
			// Un refresh réussi lève le drapeau d'invalidité.
			invalidSince: undefined,
			invalidReason: undefined,
		});
	},
});

// Marque une connexion Google comme morte (refresh token révoqué/expiré).
export const markAccountInvalidInternal = internalMutation({
	args: {
		accountId: v.id("userGoogleAccounts"),
		reason: v.string(),
	},
	handler: async (ctx, { accountId, reason }) => {
		const acc = await ctx.db.get(accountId);
		if (!acc || acc.invalidSince) return; // déjà marqué
		await ctx.db.patch(accountId, {
			invalidSince: Date.now(),
			invalidReason: reason,
		});
	},
});

// Supprime une row compte Google — appelé APRÈS que l'action a stoppé les
// watch channels et purgé le cache busy blocks.
export const deleteAccountInternal = internalMutation({
	args: { accountId: v.id("userGoogleAccounts") },
	handler: async (ctx, { accountId }) => {
		await ctx.db.delete(accountId);
	},
});

// ============================================================
// MUTATIONS — public (UI)
// ============================================================

// Déconnecte un compte spécifique. Planifie le cleanup action (arrêt channels,
// purge busy blocks, nettoyage settings, suppression row).
export const disconnectAccount = mutation({
	args: { accountId: v.id("userGoogleAccounts") },
	handler: async (ctx, { accountId }) => {
		const userId = await getAuthUserId(ctx);
		if (!userId) throw new Error("Non authentifié");
		const acc = await ctx.db.get(accountId);
		if (!acc || acc.userId !== userId)
			throw new Error("Compte Google introuvable");
		// Le cleanup complet se fait dans l'action (Node runtime requis pour Google API).
		await ctx.scheduler.runAfter(
			0,
			internal.googleActions.unsubscribeAccountForUser,
			{
				userId,
				accountId,
			},
		);
	},
});
