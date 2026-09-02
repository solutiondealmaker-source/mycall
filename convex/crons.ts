// Crons â€” scheduled jobs for iClone.
//
// Schedule summary:
//   every 5 min  â€” cleanupOrphanBookings (orphan pending â†’ failed)
//   every 5 min  â€” sendReminders (booking -2h window)
//   every 10 min â€” detectAbandonedLeads (partialLeads > 10 min without booking)
//   daily 03:00  â€” autoMarkLostLeads (silence auto-lose)
//   daily 04:00  â€” truncateNotificationLogs (keep last 200)

import { cronJobs } from "convex/server";
import { internal } from "./_generated/api";

const crons = cronJobs();

// Flag bookings stuck in "pending" > 2 min as "failed" (orphan detector).
// Runs every 5 min. Source: gotcha G5 from discovery/01-booking-core.md.
crons.interval(
	"cleanupOrphanBookings",
	{ minutes: 5 },
	internal.bookings.cleanupOrphanBookingsInternal,
	{},
);

// Check for bookings with startTime in [now+1h45, now+2h15] and send reminder.
// Runs every 5 min to stay within the 30-min reminder window.
// DÃ©lÃ¨gue Ã  notifyDispatch.processReminderQueue, qui estampille reminderSentAt
// puis planifie l.envoi â€” la garde d.idempotence vit lÃ -bas.
crons.interval(
	"sendReminders",
	{ minutes: 5 },
	internal.cron_jobs.sendRemindersJob,
	{},
);

// Flag partialLeads older than 10 min without a bookingId as abandoned.
// Complement to the per-session scheduler arm in capturePartialLead â€” this
// catches any session where the scheduler arm failed silently.
crons.interval(
	"detectAbandonedLeads",
	{ minutes: 10 },
	internal.cron_jobs.detectAbandonedLeadsJob,
	{},
);

// Auto-mark leads as "perdu" after N days of silence (from pipelineSettings).
// Runs at 03:00 UTC daily.
crons.daily(
	"autoMarkLostLeads",
	{ hourUTC: 3, minuteUTC: 0 },
	internal.cron_jobs.autoMarkLostLeadsJob,
	{},
);

// Truncate notificationLogs to last 200 rows to prevent unbounded growth.
// Runs at 04:00 UTC daily (after the daily auto-lose job).
crons.daily(
	"truncateNotificationLogs",
	{ hourUTC: 4, minuteUTC: 0 },
	internal.cron_jobs.truncateNotificationLogsJob,
	{},
);

// Phase 9 â€” Renouvelle les watch channels Google Calendar expirant dans les 48h.
// Tourne Ã  04h00 UTC quotidiennement.
crons.daily(
	"renew-google-calendar-channels",
	{ hourUTC: 4, minuteUTC: 0 },
	internal.googleActions.renewExpiringChannels,
	{},
);

// Phase 9 â€” Full resync de tous les calendriers Google actifs.
// Tourne Ã  04h15 UTC (15 min aprÃ¨s renew pour que les channels soient frais).
// Corrige la dÃ©rive silencieuse due aux push notifications Google manquÃ©es.
crons.daily(
	"daily-resync-google-calendars",
	{ hourUTC: 4, minuteUTC: 15 },
	internal.googleActions.dailyResyncAllCalendars,
	{},
);

// Nurturing : envoie les étapes de séquence arrivées à échéance et arrête les
// inscriptions devenues sans objet (lead gagné, désabonné, séquence désactivée).
// 15 min : un décalage d'un quart d'heure sur une relance à J+3 est sans effet,
// et ça divise par quatre le travail d'un cron horaire.
crons.interval(
	"processSequences",
	{ minutes: 15 },
	internal.sequences.processDue,
	{},
);

export default crons;
