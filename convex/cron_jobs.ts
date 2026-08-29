// Cron job handlers — internal mutations called by crons.ts.
// Separated from crons.ts so the logic can be unit-tested via `bunx convex run`.

import { v } from "convex/values";
import { internal } from "./_generated/api";
import { internalMutation } from "./_generated/server";

// ============================================================
// sendRemindersJob — delegates to notifyDispatch.processReminderQueue
// ============================================================
// Phase 12: fully implemented. Delegates to processReminderQueue which
// stamps reminderSentAt and schedules sendReminder for each eligible booking.
export const sendRemindersJob = internalMutation({
	args: {},
	handler: async (ctx): Promise<{ dispatched: number }> => {
		// Delegate to the orchestrator in notifyDispatch.ts which handles
		// idempotence, reminderSentAt stamping, and email scheduling.
		return (await ctx.runMutation(
			internal.notifyDispatch.processReminderQueue,
			{},
		)) as { dispatched: number };
	},
});

// ============================================================
// detectAbandonedLeadsJob — partialLeads > 10 min without a booking
// ============================================================
// Complementary safety net for the per-session scheduler arm.
// The scheduler arm in capturePartialLead is the primary path; this cron
// catches sessions where the scheduler arm failed silently or was never armed.
export const detectAbandonedLeadsJob = internalMutation({
	args: {},
	handler: async (ctx) => {
		const now = Date.now();
		const cutoff = now - 10 * 60 * 1000; // 10 min ago

		const partialLeads = await ctx.db
			.query("partialLeads")
			.filter((q) =>
				q.and(
					// Only look at recently captured leads (within the last 2 hours)
					q.gte(q.field("firstSeenAt"), now - 2 * 60 * 60 * 1000),
					q.lte(q.field("firstSeenAt"), cutoff),
					q.eq(q.field("abandonedNotifiedAt"), undefined),
					q.eq(q.field("bookingId"), undefined),
				),
			)
			.collect();

		let flagged = 0;
		for (const pl of partialLeads) {
			await ctx.db.patch(pl._id, { abandonedNotifiedAt: now });
			// Même alerte que le chemin principal (checkPartialLeadAbandoned) : ce
			// cron est le filet de sécurité, il doit donc prévenir l'équipe lui aussi.
			// Le filtre ci-dessus exclut déjà les leads notifiés, pas de doublon.
			await ctx.scheduler.runAfter(0, internal.emails.sendAbandonedLead, {
				partialLeadId: pl._id,
			});
			flagged++;
		}

		return { flagged };
	},
});

// ============================================================
// autoMarkLostLeadsJob — silence auto-lose from pipelineSettings
// ============================================================
// Marks leads as "perdu" if they have been in "follow_up" status for longer
// than pipelineSettings.silenceAutoLoseDays without any interaction.
export const autoMarkLostLeadsJob = internalMutation({
	args: {},
	handler: async (ctx) => {
		const settings = await ctx.db
			.query("pipelineSettings")
			.withIndex("by_singleton", (q) => q.eq("singleton", "default"))
			.first();
		if (!settings) return { marked: 0 };

		const silenceDays = settings.silenceAutoLoseDays;
		const cutoff = Date.now() - silenceDays * 24 * 60 * 60 * 1000;
		const now = Date.now();

		const followUpLeads = await ctx.db
			.query("leads")
			.withIndex("by_status", (q) => q.eq("status", "follow_up"))
			.collect();

		let marked = 0;
		for (const lead of followUpLeads) {
			const lastActivity = lead.lastInteractionAt ?? lead._creationTime;
			if (lastActivity > cutoff) continue; // still active

			await ctx.db.patch(lead._id, {
				status: "perdu",
				phase: "perdu",
				lastInteractionAt: now,
			});

			// Bump the auto-lose loss reason usage count if configured
			if (settings.silenceAutoLoseReasonId) {
				const lr = await ctx.db.get(settings.silenceAutoLoseReasonId);
				if (lr) {
					await ctx.db.patch(settings.silenceAutoLoseReasonId, {
						usageCount: lr.usageCount + 1,
					});
				}
			}

			marked++;
		}

		return { marked };
	},
});

// ============================================================
// truncateNotificationLogsJob — keep last 200 rows
// ============================================================
// Prevents the notificationLogs table from growing unbounded on high-volume
// deployments. Deletes the oldest rows beyond the 200-row cap.
export const truncateNotificationLogsJob = internalMutation({
	args: {},
	handler: async (ctx) => {
		const rows = await ctx.db
			.query("notificationLogs")
			.withIndex("by_date")
			.order("desc")
			.collect();

		const MAX_ROWS = 200;
		if (rows.length <= MAX_ROWS) return { deleted: 0 };

		const toDelete = rows.slice(MAX_ROWS);
		let deleted = 0;
		for (const row of toDelete) {
			await ctx.db.delete(row._id);
			deleted++;
		}

		return { deleted };
	},
});
