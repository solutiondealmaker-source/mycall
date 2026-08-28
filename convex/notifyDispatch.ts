// notifyDispatch.ts — Email notification orchestrator for Phase 12.
//
// Routing layer between domain mutations (bookings.ts) and the Resend
// email actions (emails.ts). Keeps bookings.ts free of email concerns.
//
// Contract:
//   - dispatch* functions are internalMutation (called via scheduler.runAfter)
//   - They are scheduled AFTER the booking row is inserted/patched
//     (per gotcha applyAutoPhase ordering — always act after the DB write)
//   - processReminderQueue is internalMutation called by the cron every 5 min
//   - No function in this file throws — silently skip on missing data

import { v } from "convex/values";
import { internal } from "./_generated/api";
import { internalMutation } from "./_generated/server";

// ============================================================
// dispatchBookingCreated — schedule confirmation + host notification
// ============================================================

export const dispatchBookingCreated = internalMutation({
	args: { bookingId: v.id("bookings") },
	handler: async (ctx, { bookingId }) => {
		await ctx.scheduler.runAfter(0, internal.emails.sendBookingConfirmation, {
			bookingId,
		});
		await ctx.scheduler.runAfter(0, internal.emails.sendHostNotification, {
			bookingId,
		});
	},
});

// ============================================================
// dispatchBookingCancelled — cancellation email to prospect
// ============================================================

export const dispatchBookingCancelled = internalMutation({
	args: { bookingId: v.id("bookings") },
	handler: async (ctx, { bookingId }) => {
		await ctx.scheduler.runAfter(0, internal.emails.sendCancellation, {
			bookingId,
		});
	},
});

// ============================================================
// dispatchBookingRescheduled — reschedule email to prospect
// ============================================================

export const dispatchBookingRescheduled = internalMutation({
	args: {
		bookingId: v.id("bookings"),
		previousStartTime: v.number(),
		previousTimezone: v.string(),
	},
	handler: async (ctx, { bookingId, previousStartTime, previousTimezone }) => {
		await ctx.scheduler.runAfter(0, internal.emails.sendReschedule, {
			bookingId,
			previousStartTime,
			previousTimezone,
		});
	},
});

// ============================================================
// dispatchReminder — reminder email to prospect + mark reminderSentAt
//
// Called from processReminderQueue. Double-checks reminderSentAt === null
// (race condition guard: two overlapping cron ticks could both pick the
// same booking before either has patched reminderSentAt).
// ============================================================

export const dispatchReminder = internalMutation({
	args: { bookingId: v.id("bookings") },
	handler: async (ctx, { bookingId }) => {
		const booking = await ctx.db.get(bookingId);
		if (!booking) return;

		// Idempotence double-check (primary guard is in sendReminder action too)
		if (
			booking.reminderSentAt !== undefined &&
			booking.reminderSentAt !== null
		) {
			return;
		}

		// Mark BEFORE scheduling so a concurrent tick sees it already stamped
		await ctx.db.patch(bookingId, { reminderSentAt: Date.now() });

		await ctx.scheduler.runAfter(0, internal.emails.sendReminder, {
			bookingId,
		});
	},
});

// ============================================================
// processReminderQueue — cron entry point (every 5 min)
//
// Finds confirmed bookings with startTime in [now+1h45, now+2h15]
// that have not yet received a reminder, and dispatches one per booking.
// ============================================================

export const processReminderQueue = internalMutation({
	args: {},
	handler: async (ctx) => {
		const now = Date.now();
		const windowStart = now + 105 * 60 * 1000; // +1h45
		const windowEnd = now + 135 * 60 * 1000; // +2h15

		const bookings = await ctx.db
			.query("bookings")
			.withIndex("by_status_startTime", (q) =>
				q
					.eq("status", "confirmed")
					.gte("startTime", windowStart)
					.lte("startTime", windowEnd),
			)
			.collect();

		let dispatched = 0;
		for (const b of bookings) {
			if (b.reminderSentAt !== undefined && b.reminderSentAt !== null) continue;

			// Stamp immediately to prevent duplicate dispatch from a concurrent tick
			await ctx.db.patch(b._id, { reminderSentAt: now });
			await ctx.scheduler.runAfter(0, internal.emails.sendReminder, {
				bookingId: b._id,
			});
			dispatched++;
		}

		return { dispatched };
	},
});
