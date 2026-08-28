// emailsInternal.ts — Non-node Convex functions for the email system.
//
// This file intentionally has NO "use node" directive.
// It contains the internalMutation that writes to notificationLogs,
// which is called by the internalActions in emails.ts ("use node").
//
// Convex rule: mutations cannot be defined in "use node" files.

import { v } from "convex/values";
import type { Id } from "./_generated/dataModel";
import { internalMutation, internalQuery, query } from "./_generated/server";
import { getAuthenticatedUser } from "./lib/auth";

// ============================================================
// insertLogRow — called by logEmail() helper in emails.ts
// ============================================================

export const insertLogRow = internalMutation({
	args: {
		type: v.union(
			v.literal("email_confirmation"),
			v.literal("email_reminder"),
			v.literal("email_host_notif"),
			v.literal("email_cancellation"),
			v.literal("email_reschedule"),
			v.literal("email_invitation"),
		),
		bookingId: v.optional(v.string()),
		leadId: v.optional(v.string()),
		recipient: v.string(),
		status: v.union(v.literal("sent"), v.literal("failed")),
		error: v.optional(v.string()),
	},
	handler: async (ctx, args) => {
		// bookingId and leadId arrive as strings from the "use node" action
		// (Convex ID serializes to string over the scheduler boundary).
		// The cast is safe: the caller always sourced them from actual DB rows.
		await ctx.db.insert("notificationLogs", {
			type: args.type,
			bookingId: args.bookingId as Id<"bookings"> | undefined,
			leadId: args.leadId as Id<"leads"> | undefined,
			recipient: args.recipient,
			status: args.status,
			error: args.error,
			sentAt: Date.now(),
		});
	},
});

// ============================================================
// Data queries for email actions — called via ctx.runQuery in emails.ts
// ============================================================

export const getBookingForEmail = internalQuery({
	args: { bookingId: v.id("bookings") },
	handler: async (ctx, { bookingId }) => ctx.db.get(bookingId),
});

export const getEventForEmail = internalQuery({
	args: { eventId: v.id("events") },
	handler: async (ctx, { eventId }) => ctx.db.get(eventId),
});

export const getUserForEmail = internalQuery({
	args: { userId: v.id("users") },
	handler: async (ctx, { userId }) => ctx.db.get(userId),
});

// ============================================================
// listRecentLogs — public query for settings/notifications page
// ============================================================

export const listRecentLogs = query({
	args: {},
	handler: async (ctx) => {
		await getAuthenticatedUser(ctx);
		return await ctx.db
			.query("notificationLogs")
			.withIndex("by_date")
			.order("desc")
			.take(50);
	},
});
