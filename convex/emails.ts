"use node";

// emails.ts — Resend email actions for Phase 12.
//
// "use node" required for fetch() + Resend API calls.
// All send* are internalAction — not callable from the public API.
//
// The DB mutation (insertLogRow) lives in emailsInternal.ts because
// Convex mutations cannot be defined in "use node" files.
//
// Error contract: send failures are caught, logged to notificationLogs
// with status="failed", and NEVER re-thrown. A broken email MUST NOT
// crash the booking mutation or cron that triggered it.

// process is available at runtime in "use node" Convex actions
// but not picked up by the Convex tsconfig (types: []).
declare const process: { env: Record<string, string | undefined> };

import { v } from "convex/values";
import { internal } from "./_generated/api";
import type { ActionCtx } from "./_generated/server";
import { internalAction } from "./_generated/server";
import {
	bookingConfirmationTemplate,
	cancellationTemplate,
	escapeHtml,
	formatDateFR,
	hostNotificationTemplate,
	reminderTemplate,
	rescheduleTemplate,
} from "./lib/emailTemplates";

// ============================================================
// Config
// ============================================================

function getResendKey(): string {
	const key = process.env.RESEND_API_KEY;
	if (!key) throw new Error("Missing RESEND_API_KEY");
	return key;
}

const FROM_EMAIL =
	process.env.RESEND_FROM_EMAIL ?? "iClone <onboarding@resend.dev>";

const SITE_URL = (process.env.SITE_URL ?? "https://app.iclone.io").replace(
	/\/$/,
	"",
);

// ============================================================
// Resend wrapper — never throws
// ============================================================

interface ResendResult {
	ok: boolean;
	messageId?: string;
	error?: string;
}

async function resendSend(payload: {
	to: string;
	subject: string;
	html: string;
}): Promise<ResendResult> {
	try {
		const res = await fetch("https://api.resend.com/emails", {
			method: "POST",
			headers: {
				Authorization: `Bearer ${getResendKey()}`,
				"Content-Type": "application/json",
			},
			body: JSON.stringify({
				from: FROM_EMAIL,
				to: [payload.to],
				subject: payload.subject,
				html: payload.html,
			}),
		});

		const body = (await res.json()) as {
			id?: string;
			message?: string;
			name?: string;
		};

		if (!res.ok) {
			const errMsg = body.message ?? body.name ?? `HTTP ${res.status}`;
			console.error(`[emails] Resend error: ${errMsg} | to=${payload.to}`);
			return { ok: false, error: errMsg.slice(0, 512) };
		}

		return { ok: true, messageId: body.id };
	} catch (err) {
		const msg = err instanceof Error ? err.message : String(err);
		console.error(`[emails] Resend fetch exception: ${msg} | to=${payload.to}`);
		return { ok: false, error: msg.slice(0, 512) };
	}
}

// ============================================================
// Log helper
// ============================================================

type LogType =
	| "email_confirmation"
	| "email_reminder"
	| "email_host_notif"
	| "email_cancellation"
	| "email_reschedule";

async function logEmail(
	ctx: ActionCtx,
	args: {
		type: LogType;
		bookingId?: string;
		leadId?: string;
		recipient: string;
		result: ResendResult;
	},
): Promise<void> {
	try {
		await ctx.runMutation(internal.emailsInternal.insertLogRow, {
			type: args.type,
			bookingId: args.bookingId,
			leadId: args.leadId,
			recipient: args.recipient,
			status: args.result.ok ? "sent" : "failed",
			error: args.result.error,
		});
	} catch (e) {
		console.error("[emails] logEmail mutation failed:", e);
	}
}

// ============================================================
// sendBookingConfirmation — to prospect
// ============================================================

export const sendBookingConfirmation = internalAction({
	args: { bookingId: v.id("bookings") },
	handler: async (ctx, { bookingId }) => {
		const booking = await ctx.runQuery(
			internal.emailsInternal.getBookingForEmail,
			{ bookingId },
		);
		if (!booking) {
			console.warn(
				`[emails] sendBookingConfirmation: booking ${bookingId} not found`,
			);
			return;
		}
		if (!booking.prospectEmail) return;

		// Skip if Google already sent an invite (Google invite carries Meet link + context).
		if (booking.googleEventId && booking.googleCalendarId) {
			console.log(
				`[emails] sendBookingConfirmation: skipped — Google invite sent for ${bookingId}`,
			);
			return;
		}

		const event = await ctx.runQuery(internal.emailsInternal.getEventForEmail, {
			eventId: booking.eventId,
		});
		if (!event) return;

		const host = await ctx.runQuery(internal.emailsInternal.getUserForEmail, {
			userId: booking.hostId,
		});

		const dateStr = formatDateFR(booking.startTime, booking.timezone);

		const html = bookingConfirmationTemplate({
			prospectName: booking.prospectName,
			prospectFirstName: booking.prospectFirstName,
			eventName: event.name,
			dateTime: dateStr,
			hostName: host?.name ?? null,
			meetUrl: booking.googleMeetUrl,
			cancelUrl: `${SITE_URL}/book/manage/${booking.cancelToken}`,
			rescheduleUrl: `${SITE_URL}/book/reschedule/${booking.rescheduleToken}`,
		});

		const result = await resendSend({
			to: booking.prospectEmail,
			subject: `Confirmation — ${event.name} le ${dateStr}`,
			html,
		});

		await logEmail(ctx, {
			type: "email_confirmation",
			bookingId,
			leadId: booking.leadId,
			recipient: booking.prospectEmail,
			result,
		});
	},
});

// ============================================================
// sendHostNotification — to closer / host
// ============================================================

export const sendHostNotification = internalAction({
	args: { bookingId: v.id("bookings") },
	handler: async (ctx, { bookingId }) => {
		const booking = await ctx.runQuery(
			internal.emailsInternal.getBookingForEmail,
			{ bookingId },
		);
		if (!booking) return;

		const event = await ctx.runQuery(internal.emailsInternal.getEventForEmail, {
			eventId: booking.eventId,
		});
		if (!event) return;

		const host = await ctx.runQuery(internal.emailsInternal.getUserForEmail, {
			userId: booking.hostId,
		});
		if (!host?.email) {
			console.log(
				`[emails] sendHostNotification: host has no email, booking=${bookingId}`,
			);
			return;
		}

		let customAnswers: Record<string, string> | undefined;
		const bookingAny = booking as typeof booking & { formAnswers?: string };
		if (bookingAny.formAnswers) {
			try {
				const parsed = JSON.parse(bookingAny.formAnswers) as unknown;
				if (
					parsed !== null &&
					typeof parsed === "object" &&
					!Array.isArray(parsed)
				) {
					customAnswers = Object.fromEntries(
						Object.entries(parsed as Record<string, unknown>).map(([k, v]) => [
							k,
							typeof v === "string" ? v : String(v),
						]),
					);
				}
			} catch {
				// formAnswers is best-effort — ignore parse failures
			}
		}

		const dateStr = formatDateFR(booking.startTime, booking.timezone);

		const html = hostNotificationTemplate({
			hostName: host.name ?? null,
			prospectName: booking.prospectName,
			eventName: event.name,
			dateTime: dateStr,
			meetUrl: booking.googleMeetUrl,
			prospectEmail: booking.prospectEmail,
			prospectPhone: booking.prospectPhone,
			customAnswers,
			dashboardUrl: `${SITE_URL}/crm`,
		});

		const result = await resendSend({
			to: host.email,
			subject: `Nouveau RDV — ${booking.prospectName} (${event.name})`,
			html,
		});

		await logEmail(ctx, {
			type: "email_host_notif",
			bookingId,
			leadId: booking.leadId,
			recipient: host.email,
			result,
		});
	},
});

// ============================================================
// sendReminder — H-2 to prospect
// ============================================================

export const sendReminder = internalAction({
	args: { bookingId: v.id("bookings") },
	handler: async (ctx, { bookingId }) => {
		const booking = await ctx.runQuery(
			internal.emailsInternal.getBookingForEmail,
			{ bookingId },
		);
		if (!booking) return;

		// Double-check idempotence — guard against two overlapping cron ticks
		if (
			booking.reminderSentAt !== undefined &&
			booking.reminderSentAt !== null
		) {
			console.log(`[emails] sendReminder: already sent, booking=${bookingId}`);
			return;
		}

		if (!booking.prospectEmail) return;
		if (booking.status !== "confirmed" && booking.status !== "rescheduled")
			return;

		const event = await ctx.runQuery(internal.emailsInternal.getEventForEmail, {
			eventId: booking.eventId,
		});
		if (!event) return;

		const host = await ctx.runQuery(internal.emailsInternal.getUserForEmail, {
			userId: booking.hostId,
		});

		const dateStr = formatDateFR(booking.startTime, booking.timezone);

		const html = reminderTemplate({
			prospectFirstName: booking.prospectFirstName,
			eventName: event.name,
			dateTime: dateStr,
			hostName: host?.name ?? null,
			meetUrl: booking.googleMeetUrl,
			cancelUrl: `${SITE_URL}/book/manage/${booking.cancelToken}`,
		});

		const result = await resendSend({
			to: booking.prospectEmail,
			subject: `Rappel — votre rendez-vous dans 2h (${event.name})`,
			html,
		});

		await logEmail(ctx, {
			type: "email_reminder",
			bookingId,
			leadId: booking.leadId,
			recipient: booking.prospectEmail,
			result,
		});
	},
});

// ============================================================
// sendCancellation — to prospect
// ============================================================

export const sendCancellation = internalAction({
	args: { bookingId: v.id("bookings") },
	handler: async (ctx, { bookingId }) => {
		const booking = await ctx.runQuery(
			internal.emailsInternal.getBookingForEmail,
			{ bookingId },
		);
		if (!booking) return;
		if (!booking.prospectEmail) return;

		const event = await ctx.runQuery(internal.emailsInternal.getEventForEmail, {
			eventId: booking.eventId,
		});
		if (!event) return;

		const dateStr = formatDateFR(booking.startTime, booking.timezone);
		const rescheduleUrl = event.allowReschedule
			? `${SITE_URL}/book/reschedule/${booking.rescheduleToken}`
			: undefined;

		const html = cancellationTemplate({
			prospectFirstName: booking.prospectFirstName,
			eventName: event.name,
			dateTime: dateStr,
			reason: booking.cancelReason,
			rescheduleUrl,
		});

		const result = await resendSend({
			to: booking.prospectEmail,
			subject: `Annulation — ${event.name}`,
			html,
		});

		await logEmail(ctx, {
			type: "email_cancellation",
			bookingId,
			leadId: booking.leadId,
			recipient: booking.prospectEmail,
			result,
		});
	},
});

// ============================================================
// sendReschedule — to prospect
// ============================================================

export const sendReschedule = internalAction({
	args: {
		bookingId: v.id("bookings"),
		previousStartTime: v.number(),
		previousTimezone: v.string(),
	},
	handler: async (ctx, { bookingId, previousStartTime, previousTimezone }) => {
		const booking = await ctx.runQuery(
			internal.emailsInternal.getBookingForEmail,
			{ bookingId },
		);
		if (!booking) return;
		if (!booking.prospectEmail) return;

		const event = await ctx.runQuery(internal.emailsInternal.getEventForEmail, {
			eventId: booking.eventId,
		});
		if (!event) return;

		const host = await ctx.runQuery(internal.emailsInternal.getUserForEmail, {
			userId: booking.hostId,
		});

		const oldDateStr = formatDateFR(previousStartTime, previousTimezone);
		const newDateStr = formatDateFR(booking.startTime, booking.timezone);

		const html = rescheduleTemplate({
			prospectFirstName: booking.prospectFirstName,
			eventName: event.name,
			oldDateTime: oldDateStr,
			newDateTime: newDateStr,
			hostName: host?.name ?? null,
			meetUrl: booking.googleMeetUrl,
			cancelUrl: `${SITE_URL}/book/manage/${booking.cancelToken}`,
		});

		const result = await resendSend({
			to: booking.prospectEmail,
			subject: `Replanification — ${event.name} le ${newDateStr}`,
			html,
		});

		await logEmail(ctx, {
			type: "email_reschedule",
			bookingId,
			leadId: booking.leadId,
			recipient: booking.prospectEmail,
			result,
		});
	},
});
