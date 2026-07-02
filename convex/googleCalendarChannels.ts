// convex/googleCalendarChannels.ts
// Couche DB pour les canaux webhook Google Calendar et le cache hostBusyBlocks.
//
// Les actions qui appellent l'API Google Calendar vivant dans googleActions.ts ;
// ce fichier ne contient que des queries/mutations Convex pures.

import { v } from "convex/values";
import type { Id } from "./_generated/dataModel";
import { internalMutation, internalQuery } from "./_generated/server";

// ============================================================
// CHANNELS — queries
// ============================================================

export const getChannelByIdInternal = internalQuery({
	args: { channelId: v.string() },
	handler: async (ctx, { channelId }) => {
		return await ctx.db
			.query("googleCalendarChannels")
			.withIndex("by_channelId", (q) => q.eq("channelId", channelId))
			.first();
	},
});

export const getChannelsForUserInternal = internalQuery({
	args: { userId: v.id("users") },
	handler: async (ctx, { userId }) => {
		return await ctx.db
			.query("googleCalendarChannels")
			.withIndex("by_userId", (q) => q.eq("userId", userId))
			.collect();
	},
});

// Channels qui expirent avant `beforeMs` — pour le cron renew.
export const listExpiringChannelsInternal = internalQuery({
	args: { beforeMs: v.number() },
	handler: async (ctx, { beforeMs }) => {
		return await ctx.db
			.query("googleCalendarChannels")
			.withIndex("by_expirationMs", (q) => q.lt("expirationMs", beforeMs))
			.collect();
	},
});

export const listAllChannelsInternal = internalQuery({
	args: {},
	handler: async (ctx) => {
		return await ctx.db.query("googleCalendarChannels").collect();
	},
});

// Channels avec renewAttempts > 0 et expirant dans les 6h — pour retryFailedChannelRenewals.
export const listChannelsNeedingRetryInternal = internalQuery({
	args: {},
	handler: async (ctx) => {
		const cutoff = Date.now() + 6 * 60 * 60 * 1000;
		const rows = await ctx.db
			.query("googleCalendarChannels")
			.withIndex("by_expirationMs", (q) => q.lt("expirationMs", cutoff))
			.collect();
		return rows.filter((r) => r.renewAttempts > 0);
	},
});

// ============================================================
// CHANNELS — mutations
// ============================================================

// Upsert d'un channel par (userId, calendarId). Si la row existe, on remplace
// channelId / resourceId / token / expirationMs.
export const upsertChannelInternal = internalMutation({
	args: {
		userId: v.id("users"),
		accountId: v.id("userGoogleAccounts"),
		calendarId: v.string(),
		channelId: v.string(),
		resourceId: v.string(),
		token: v.string(),
		expirationMs: v.number(),
	},
	handler: async (ctx, args) => {
		const existing = await ctx.db
			.query("googleCalendarChannels")
			.withIndex("by_calendarId", (q) => q.eq("calendarId", args.calendarId))
			.filter((q) => q.eq(q.field("userId"), args.userId))
			.first();
		if (existing) {
			await ctx.db.patch(existing._id, {
				accountId: args.accountId,
				channelId: args.channelId,
				resourceId: args.resourceId,
				token: args.token,
				expirationMs: args.expirationMs,
				renewAttempts: 0,
			});
			return existing._id;
		}
		return await ctx.db.insert("googleCalendarChannels", {
			userId: args.userId,
			accountId: args.accountId,
			calendarId: args.calendarId,
			channelId: args.channelId,
			resourceId: args.resourceId,
			token: args.token,
			expirationMs: args.expirationMs,
			renewAttempts: 0,
		});
	},
});

export const deleteChannelInternal = internalMutation({
	args: { id: v.id("googleCalendarChannels") },
	handler: async (ctx, { id }) => {
		await ctx.db.delete(id);
	},
});

export const updateSyncTokenInternal = internalMutation({
	args: { channelId: v.string(), syncToken: v.string() },
	handler: async (ctx, { channelId, syncToken }) => {
		const row = await ctx.db
			.query("googleCalendarChannels")
			.withIndex("by_channelId", (q) => q.eq("channelId", channelId))
			.first();
		if (!row) return;
		await ctx.db.patch(row._id, { syncToken });
	},
});

// ============================================================
// CHANNEL RENEWAL — success / failure tracking
// ============================================================

export const markRenewalSuccessInternal = internalMutation({
	args: { channelId: v.string() },
	handler: async (ctx, { channelId }) => {
		const row = await ctx.db
			.query("googleCalendarChannels")
			.withIndex("by_channelId", (q) => q.eq("channelId", channelId))
			.first();
		if (!row) return;
		await ctx.db.patch(row._id, {
			renewAttempts: 0,
			lastRenewedAt: Date.now(),
		});
	},
});

export const markRenewalFailureInternal = internalMutation({
	args: { channelId: v.string(), error: v.string() },
	handler: async (ctx, { channelId, error }) => {
		const row = await ctx.db
			.query("googleCalendarChannels")
			.withIndex("by_channelId", (q) => q.eq("channelId", channelId))
			.first();
		if (!row) return;
		console.warn(
			`[markRenewalFailure] channel=${channelId} attempt=${row.renewAttempts + 1}: ${error.slice(0, 200)}`,
		);
		await ctx.db.patch(row._id, {
			renewAttempts: row.renewAttempts + 1,
		});
	},
});

// ============================================================
// BUSY BLOCKS — upsert / delete
// ============================================================

type BusyBlockInput = {
	userId: Id<"users">;
	accountId: Id<"userGoogleAccounts">;
	calendarId: string;
	googleEventId: string;
	start: number;
	end: number;
	transparency?: string;
};

// G7 — transparency = "transparent" → event "libre" → supprimer le busy block.
async function upsertOne(
	ctx: {
		db: {
			query: Function;
			insert: Function;
			patch: Function;
			delete: Function;
		};
	},
	block: BusyBlockInput,
): Promise<void> {
	// Supprimer si transparent (hôte "libre" pendant cet event) ou cancelled
	if (block.transparency === "transparent") {
		const existing = await ctx.db
			.query("hostBusyBlocks")
			.withIndex("by_googleEventId", (q: unknown) =>
				(q as { eq: Function }).eq("googleEventId", block.googleEventId),
			)
			.first();
		if (existing) await ctx.db.delete(existing._id);
		return;
	}

	const existing = await ctx.db
		.query("hostBusyBlocks")
		.withIndex("by_googleEventId", (q: unknown) =>
			(q as { eq: Function }).eq("googleEventId", block.googleEventId),
		)
		.first();

	const payload = {
		userId: block.userId,
		accountId: block.accountId,
		calendarId: block.calendarId,
		googleEventId: block.googleEventId,
		start: block.start,
		end: block.end,
		transparency: block.transparency as "opaque" | "transparent" | undefined,
	};

	if (existing) {
		await ctx.db.patch(existing._id, payload);
	} else {
		await ctx.db.insert("hostBusyBlocks", payload);
	}
}

export const upsertBusyBlocksInternal = internalMutation({
	args: {
		blocks: v.array(
			v.object({
				userId: v.id("users"),
				accountId: v.id("userGoogleAccounts"),
				calendarId: v.string(),
				googleEventId: v.string(),
				start: v.number(),
				end: v.number(),
				transparency: v.optional(v.string()),
			}),
		),
	},
	handler: async (ctx, { blocks }) => {
		for (const b of blocks) {
			await upsertOne(ctx as Parameters<typeof upsertOne>[0], b);
		}
	},
});

export const deleteBusyBlocksByEventIdsInternal = internalMutation({
	args: { googleEventIds: v.array(v.string()) },
	handler: async (ctx, { googleEventIds }) => {
		for (const eid of googleEventIds) {
			const existing = await ctx.db
				.query("hostBusyBlocks")
				.withIndex("by_googleEventId", (q) => q.eq("googleEventId", eid))
				.first();
			if (existing) await ctx.db.delete(existing._id);
		}
	},
});

// Supprime les busy blocks d'un compte spécifique (utilisé lors de la déconnexion).
// Paginé pour rester sous les limites Convex.
export const deleteBlocksForAccountInternal = internalMutation({
	args: {
		userId: v.id("users"),
		accountId: v.id("userGoogleAccounts"),
		limit: v.optional(v.number()),
	},
	handler: async (ctx, { userId, accountId, limit }) => {
		const MAX = Math.min(limit ?? 500, 500);
		const probe = await ctx.db
			.query("hostBusyBlocks")
			.withIndex("by_userId_calendarId", (q) => q.eq("userId", userId))
			.filter((q) => q.eq(q.field("accountId"), accountId))
			.take(MAX + 1);
		const batch = probe.slice(0, MAX);
		for (const r of batch) await ctx.db.delete(r._id);
		const remaining = probe.length > MAX ? 1 : 0;
		return { deleted: batch.length, remaining };
	},
});

// Supprime tous les busy blocks d'un user (optionnellement pour un calendar donné).
// Utilisé lors d'un full resync pour vider le cache avant de le re-remplir.
export const deleteBlocksForUserInternal = internalMutation({
	args: {
		userId: v.id("users"),
		calendarId: v.optional(v.string()),
		limit: v.optional(v.number()),
	},
	handler: async (ctx, { userId, calendarId, limit }) => {
		const MAX = Math.min(limit ?? 500, 500);
		const probe = calendarId
			? await ctx.db
					.query("hostBusyBlocks")
					.withIndex("by_userId_calendarId", (q) =>
						q.eq("userId", userId).eq("calendarId", calendarId),
					)
					.take(MAX + 1)
			: await ctx.db
					.query("hostBusyBlocks")
					.withIndex("by_userId_start", (q) => q.eq("userId", userId))
					.take(MAX + 1);
		const batch = probe.slice(0, MAX);
		for (const r of batch) await ctx.db.delete(r._id);
		const remaining = probe.length > MAX ? 1 : 0;
		return { deleted: batch.length, remaining };
	},
});

// Annule les bookings liés aux events Google supprimés (webhook incremental sync).
export const cancelBookingsByGoogleEventIdsInternal = internalMutation({
	args: { googleEventIds: v.array(v.string()) },
	handler: async (ctx, { googleEventIds }) => {
		let cancelled = 0;
		for (const eid of googleEventIds) {
			const booking = await ctx.db
				.query("bookings")
				.withIndex("by_googleSyncStatus", (q) =>
					q.eq("googleSyncStatus", "synced"),
				)
				.filter((q) => q.eq(q.field("googleEventId"), eid))
				.first();
			if (!booking) continue;
			if (booking.status === "cancelled") continue;
			await ctx.db.patch(booking._id, {
				status: "cancelled",
				tenue: "annule",
				cancelReason: "Google Calendar: événement supprimé par l'hôte",
				cancelledAt: Date.now(),
				googleSyncStatus: "na",
			});
			cancelled++;
		}
		return { cancelled };
	},
});
