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
	abandonedLeadTemplate,
	BRAND_NAME,
	bookingConfirmationTemplate,
	cancellationTemplate,
	escapeHtml,
	formatDateFR,
	hostNotificationTemplate,
	invitationTemplate,
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

const FROM_EMAIL = process.env.RESEND_FROM_EMAIL ?? "onboarding@resend.dev";

// Base des liens envoyés aux prospects (annulation, reprogrammation) et à
// l'équipe (accès au CRM). APP_BASE_URL est la variable posée à l'installation
// de chaque instance ; SITE_URL n'est gardée que par compatibilité. Sans repli
// sur APP_BASE_URL, une instance qui ne définit que la première enverrait des
// liens vers un domaine tiers — donc morts.
const SITE_URL = (
	process.env.APP_BASE_URL ??
	process.env.SITE_URL ??
	"http://localhost:3002"
).replace(/\/$/, "");

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
	| "email_reschedule"
	| "email_invitation"
	| "email_abandoned_lead";

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

// ============================================================
// sendInvitation — nouveau membre de l'équipe
// ============================================================

// Libellés des rôles, alignés sur la page Équipe. Le descriptif est repris
// tel quel dans l'email : la personne invitée doit comprendre ce qu'elle
// pourra faire avant même de créer son compte.
const ROLE_COPY: Record<string, { label: string; description: string }> = {
	closer: {
		label: "Closer",
		description:
			"Mène les rendez-vous et suit les leads qui lui sont assignés.",
	},
	setter: {
		label: "Setter",
		description: "Qualifie les prospects et prend les rendez-vous.",
	},
	coach: {
		label: "Coach",
		description: "Accompagne l'équipe sur les leads qui lui sont assignés.",
	},
	head_of_sales: {
		label: "Head of Sales",
		description: "Pilote l'équipe commerciale, accès complet.",
	},
	ceo: { label: "CEO", description: "Accès complet à l'espace de travail." },
	ops: {
		label: "Ops",
		description: "Administre la configuration et les intégrations.",
	},
	admin: {
		label: "Admin",
		description: "Accès complet, y compris la gestion des membres.",
	},
	viewer: {
		label: "Observateur",
		description:
			"Consulte les rendez-vous, les leads et le chiffre d'affaires. Ne peut rien modifier.",
	},
};

export const sendInvitation = internalAction({
	args: {
		to: v.string(),
		role: v.string(),
		inviterName: v.union(v.string(), v.null()),
	},
	handler: async (ctx, { to, role, inviterName }) => {
		const copy = ROLE_COPY[role] ?? {
			label: role,
			description: "Accès à l'espace de travail.",
		};
		const expiresAt = Date.now() + 14 * 24 * 60 * 60 * 1000;

		const result = await resendSend({
			to,
			subject: `Invitation à rejoindre ${BRAND_NAME}`,
			html: invitationTemplate({
				inviterName,
				roleLabel: copy.label,
				roleDescription: copy.description,
				signupUrl: `${SITE_URL}/signup`,
				expiresLabel: formatDateFR(expiresAt, "Europe/Paris"),
			}),
		});

		await logEmail(ctx, {
			type: "email_invitation",
			recipient: to,
			result,
		});
	},
});

// ============================================================
// sendAbandonedLead — alerte interne "formulaire abandonné"
// ============================================================
// Destinée à l'équipe, pas au prospect : le relancer par email alors qu'il n'a
// jamais validé son inscription serait déplacé.

export const sendAbandonedLead = internalAction({
	args: { partialLeadId: v.id("partialLeads") },
	handler: async (ctx, { partialLeadId }) => {
		const ctxData = await ctx.runQuery(
			internal.emailsInternal.getAbandonedLeadContext,
			{ partialLeadId },
		);
		if (!ctxData) return;
		if (ctxData.recipients.length === 0) {
			console.log("[emails] sendAbandonedLead: aucun destinataire admin");
			return;
		}

		const prospectName =
			`${ctxData.firstName ?? ""} ${ctxData.lastName ?? ""}`.trim() ||
			ctxData.phone ||
			"Prospect sans nom";

		const html = abandonedLeadTemplate({
			prospectName,
			prospectPhone: ctxData.phone,
			prospectEmail: ctxData.email,
			eventName: ctxData.eventName,
			capturedAtLabel: formatDateFR(ctxData.firstSeenAt, "Europe/Paris"),
			crmUrl: `${SITE_URL}/crm`,
		});

		// Un envoi par destinataire : Resend mettrait sinon les adresses de
		// l'équipe en clair dans le même en-tête To.
		for (const to of ctxData.recipients) {
			const result = await resendSend({
				to,
				subject: `Formulaire abandonné — ${prospectName}`,
				html,
			});
			await logEmail(ctx, {
				type: "email_abandoned_lead",
				recipient: to,
				result,
			});
		}
	},
});
