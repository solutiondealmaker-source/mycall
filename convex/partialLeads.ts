// Partial lead capture — silent prospect tracking during form fill.
// Triggered client-side on blur of phone + firstName + lastName.
// Upserts by sessionId. Arms the abandoned-lead scheduler once per session INSERT.

import { v } from "convex/values";
import { internal } from "./_generated/api";
import { internalMutation, mutation } from "./_generated/server";
import { _findLeadByAnyKey } from "./leads";
import { normalizeEmail, normalizePhone } from "./lib/leadMatch";

// 10 minutes after first capture — check if the prospect abandoned the form.
const ABANDONED_LEAD_DELAY_MS = 10 * 60 * 1000;

// ============================================================
// capturePartialLead (public mutation — no auth, secured by idempotence + sessionId)
// ============================================================
// Trigger: client calls this on blur of phone + firstName + lastName fields.
// The server is idempotent — multiple calls per session are safe (patch only).
//
// Flow:
//   1. Lookup event by slug
//   2. Upsert partialLeads row by sessionId
//   3. On INSERT only: arm checkPartialLeadAbandoned after 10 min
//   4. Upsert leads row (findLeadByAnyKey → patch existing or insert new)
//   5. Link partialLead.promotedLeadId = leadId
export const capturePartialLead = mutation({
	args: {
		eventSlug: v.string(),
		sessionId: v.string(),
		firstName: v.string(),
		lastName: v.string(),
		phone: v.string(),
		email: v.optional(v.string()),
		formAnswers: v.optional(v.string()),
		// Provenance de la campagne (lus dans l'URL côté client)
		utmSource: v.optional(v.string()),
		utmMedium: v.optional(v.string()),
		utmCampaign: v.optional(v.string()),
		utmTerm: v.optional(v.string()),
		utmContent: v.optional(v.string()),
	},
	handler: async (ctx, rawArgs) => {
		// Sécurité (M2) : borne la taille des entrées publiques non authentifiées
		// pour éviter le stockage de payloads arbitrairement gros. Troncature
		// silencieuse — aucune saisie légitime n'atteint ces limites.
		const args = {
			...rawArgs,
			firstName: rawArgs.firstName.slice(0, 200),
			lastName: rawArgs.lastName.slice(0, 200),
			phone: rawArgs.phone.slice(0, 40),
			email: rawArgs.email?.slice(0, 320),
			formAnswers: rawArgs.formAnswers?.slice(0, 20_000),
			sessionId: rawArgs.sessionId.slice(0, 128),
			utmSource: rawArgs.utmSource?.slice(0, 200),
			utmMedium: rawArgs.utmMedium?.slice(0, 200),
			utmCampaign: rawArgs.utmCampaign?.slice(0, 200),
			utmTerm: rawArgs.utmTerm?.slice(0, 200),
			utmContent: rawArgs.utmContent?.slice(0, 200),
		};

		// Attribution "first touch" : on n'écrase jamais une provenance déjà
		// enregistrée sur le lead (undefined = champ non modifié par le patch).
		const utmPatch = (existing?: {
			utmSource?: string;
			utmMedium?: string;
			utmCampaign?: string;
			utmTerm?: string;
			utmContent?: string;
		}) => ({
			utmSource: existing?.utmSource ?? args.utmSource,
			utmMedium: existing?.utmMedium ?? args.utmMedium,
			utmCampaign: existing?.utmCampaign ?? args.utmCampaign,
			utmTerm: existing?.utmTerm ?? args.utmTerm,
			utmContent: existing?.utmContent ?? args.utmContent,
		});

		// 1. Resolve event
		const event = await ctx.db
			.query("events")
			.withIndex("by_slug", (q) => q.eq("slug", args.eventSlug))
			.first();
		if (!event || !event.isActive) return null; // silent — don't crash the form

		const now = Date.now();
		const normPhone = normalizePhone(args.phone);
		const normEmail = normalizeEmail(args.email);

		// 2. Upsert partialLeads by sessionId
		const existing = await ctx.db
			.query("partialLeads")
			.withIndex("by_sessionId", (q) => q.eq("sessionId", args.sessionId))
			.first();

		let partialLeadId = existing?._id;
		const isInsert = !existing;

		if (existing) {
			await ctx.db.patch(existing._id, {
				firstName: args.firstName,
				lastName: args.lastName,
				phone: args.phone,
				phoneNormalized: normPhone || undefined,
				email: args.email ?? existing.email,
				emailNormalized: normEmail || existing.emailNormalized,
				formAnswers: args.formAnswers ?? existing.formAnswers,
				lastUpdatedAt: now,
			});
		} else {
			partialLeadId = await ctx.db.insert("partialLeads", {
				eventId: event._id,
				eventSlug: event.slug,
				sessionId: args.sessionId,
				firstName: args.firstName,
				lastName: args.lastName,
				phone: args.phone,
				phoneNormalized: normPhone || undefined,
				email: args.email,
				emailNormalized: normEmail || undefined,
				formAnswers: args.formAnswers,
				firstSeenAt: now,
				lastUpdatedAt: now,
			});
		}

		// 3. Arm abandoned-lead scheduler — once per INSERT only.
		// Multiple form blurs within the same session must NOT stack timers.
		if (isInsert && partialLeadId) {
			await ctx.scheduler.runAfter(
				ABANDONED_LEAD_DELAY_MS,
				internal.partialLeads.checkPartialLeadAbandoned,
				{ partialLeadId },
			);
		}

		if (!partialLeadId) return null;

		// 4. Upsert the real leads row immediately (CRM sees it as "potentiel")
		const lead = await _findLeadByAnyKey(ctx, {
			phone: args.phone,
			email: args.email,
		});

		const UNTOUCHED_STATUSES = new Set<string>(["potentiel", "qualifie"]);

		if (lead) {
			const setterPatch =
				lead.setterUserId == null && event.setterId
					? { setterUserId: event.setterId }
					: {};
			// Only update status if lead hasn't advanced past qualification
			const statusPatch = UNTOUCHED_STATUSES.has(lead.status)
				? { status: "potentiel" as const }
				: {};
			await ctx.db.patch(lead._id, {
				firstName: args.firstName,
				lastName: args.lastName,
				phone: args.phone,
				phoneNormalized: normPhone || undefined,
				email: args.email ?? lead.email,
				emailNormalized: normEmail || lead.emailNormalized,
				formAnswers: args.formAnswers ?? lead.formAnswers,
				eventId: event._id,
				eventSlug: event.slug,
				lastInteractionAt: now,
				...utmPatch(lead),
				...statusPatch,
				...setterPatch,
			});
			// 5. Link
			await ctx.db.patch(partialLeadId, {
				promotedLeadId: lead._id,
				lastUpdatedAt: now,
			});
		} else {
			const leadId = await ctx.db.insert("leads", {
				firstName: args.firstName,
				lastName: args.lastName,
				phone: args.phone,
				email: args.email,
				phoneNormalized: normPhone || undefined,
				emailNormalized: normEmail || undefined,
				eventId: event._id,
				eventSlug: event.slug,
				sessionId: args.sessionId,
				formAnswers: args.formAnswers,
				status: "potentiel",
				phase: "potentiel",
				setterUserId: event.setterId,
				tagSource: event.tagSource ?? event.slug,
				...utmPatch(),
				lastInteractionAt: now,
			});
			await ctx.db.patch(partialLeadId, {
				promotedLeadId: leadId,
				lastUpdatedAt: now,
			});
		}

		return partialLeadId;
	},
});

// ============================================================
// checkPartialLeadAbandoned (internalMutation — called by scheduler)
// ============================================================
// Runs 10 min after first capture. If the partialLead has no bookingId yet
// (prospect never completed the form) flag abandonedNotifiedAt.
//
// Prévient ensuite les admins par email (emails.sendAbandonedLead).
export const checkPartialLeadAbandoned = internalMutation({
	args: { partialLeadId: v.id("partialLeads") },
	handler: async (ctx, { partialLeadId }) => {
		const pl = await ctx.db.get(partialLeadId);
		if (!pl) return; // already deleted (edge case)

		// Already notified or already converted to a booking — skip
		if (pl.abandonedNotifiedAt) return;
		if (pl.bookingId) return;

		const now = Date.now();
		// Le marquage précède l'envoi : c'est lui qui rend l'opération idempotente
		// (le garde `abandonedNotifiedAt` ci-dessus). Une double alerte serait plus
		// gênante qu'une alerte manquée.
		await ctx.db.patch(partialLeadId, { abandonedNotifiedAt: now });

		await ctx.scheduler.runAfter(0, internal.emails.sendAbandonedLead, {
			partialLeadId,
		});

		// Le prospect entre aussi dans les s�quences de nurturing d�clench�es par
		// un formulaire abandonn�, s'il en existe une active.
		if (pl.promotedLeadId) {
			await ctx.runMutation(internal.sequences.enrollByTriggerInternal, {
				trigger: "abandoned_form" as const,
				leadId: pl.promotedLeadId,
				anchorAt: now,
			});
		}
	},
});
