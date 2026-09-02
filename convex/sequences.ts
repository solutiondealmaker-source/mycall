// sequences.ts — nurturing : séquences d'emails programmés.
//
// Une séquence est une suite d'étapes décalées dans le temps. Un lead y est
// inscrit (manuellement ou par un déclencheur), et un cron envoie les étapes
// dues toutes les 15 minutes.
//
// Deux sens de décalage, parce que les deux usages existent :
//   offsetMinutes > 0  → APRÈS l'inscription (relance d'un formulaire abandonné)
//   offsetMinutes < 0  → AVANT le rendez-vous (préparation, anti no-show)
//
// L'ancre (`anchorAt`) porte cette différence : instant d'inscription dans le
// premier cas, début du rendez-vous dans le second.
//
// Ce qui compte le plus ici n'est pas d'envoyer, c'est de S'ARRÊTER : relancer
// quelqu'un qui a déjà signé, ou qui s'est désabonné, coûte plus cher que de
// n'avoir rien envoyé.

import { v } from "convex/values";
import { internal } from "./_generated/api";
import type { Doc, Id } from "./_generated/dataModel";
import type { MutationCtx } from "./_generated/server";
import {
	internalMutation,
	internalQuery,
	mutation,
	query,
} from "./_generated/server";
import { requireAdmin, requireAuth } from "./lib/auth";

const TRIGGER = v.union(
	v.literal("manual"),
	v.literal("abandoned_form"),
	v.literal("no_show"),
	v.literal("before_booking"),
);

// ============================================================
// LECTURE — page de configuration
// ============================================================

export const listSequences = query({
	args: {},
	handler: async (ctx) => {
		await requireAdmin(ctx);
		const sequences = await ctx.db.query("emailSequences").collect();
		const out = [];
		for (const s of sequences) {
			const steps = await ctx.db
				.query("sequenceSteps")
				.withIndex("by_sequence", (q) => q.eq("sequenceId", s._id))
				.collect();
			const enrollments = await ctx.db
				.query("sequenceEnrollments")
				.withIndex("by_status", (q) => q.eq("status", "active"))
				.collect();
			out.push({
				...s,
				steps: steps.sort((a, b) => a.order - b.order),
				activeCount: enrollments.filter((e) => e.sequenceId === s._id).length,
			});
		}
		return out.sort((a, b) => a.createdAt - b.createdAt);
	},
});

// Séquences en cours pour un lead — affiché sur sa fiche CRM.
export const listForLead = query({
	args: { leadId: v.id("leads") },
	handler: async (ctx, { leadId }) => {
		await requireAuth(ctx);
		const rows = await ctx.db
			.query("sequenceEnrollments")
			.withIndex("by_lead", (q) => q.eq("leadId", leadId))
			.collect();
		const out = [];
		for (const r of rows) {
			const seq = await ctx.db.get(r.sequenceId);
			const sends = await ctx.db
				.query("sequenceSends")
				.withIndex("by_enrollment", (q) => q.eq("enrollmentId", r._id))
				.collect();
			const steps = await ctx.db
				.query("sequenceSteps")
				.withIndex("by_sequence", (q) => q.eq("sequenceId", r.sequenceId))
				.collect();
			out.push({
				_id: r._id,
				sequenceName: seq?.name ?? "Séquence supprimée",
				status: r.status,
				stopReason: r.stopReason,
				sentCount: sends.length,
				totalSteps: steps.length,
				enrolledAt: r.enrolledAt,
			});
		}
		return out.sort((a, b) => b.enrolledAt - a.enrolledAt);
	},
});

// ============================================================
// ÉCRITURE — édition des séquences
// ============================================================

export const createSequence = mutation({
	args: { name: v.string(), trigger: TRIGGER },
	handler: async (ctx, { name, trigger }) => {
		await requireAdmin(ctx);
		const now = Date.now();
		return await ctx.db.insert("emailSequences", {
			name: name.trim().slice(0, 120) || "Sans nom",
			trigger,
			// Inactive à la création : on n'envoie rien tant que les étapes ne sont
			// pas écrites et relues.
			isActive: false,
			createdAt: now,
			updatedAt: now,
		});
	},
});

export const updateSequence = mutation({
	args: {
		sequenceId: v.id("emailSequences"),
		name: v.optional(v.string()),
		trigger: v.optional(TRIGGER),
		isActive: v.optional(v.boolean()),
	},
	handler: async (ctx, { sequenceId, name, trigger, isActive }) => {
		await requireAdmin(ctx);
		const seq = await ctx.db.get(sequenceId);
		if (!seq) throw new Error("Séquence introuvable");

		if (isActive === true) {
			const steps = await ctx.db
				.query("sequenceSteps")
				.withIndex("by_sequence", (q) => q.eq("sequenceId", sequenceId))
				.collect();
			if (steps.length === 0) {
				throw new Error("Ajoute au moins une étape avant d'activer.");
			}
		}

		await ctx.db.patch(sequenceId, {
			...(name !== undefined ? { name: name.trim().slice(0, 120) } : {}),
			...(trigger !== undefined ? { trigger } : {}),
			...(isActive !== undefined ? { isActive } : {}),
			updatedAt: Date.now(),
		});
		return { ok: true };
	},
});

export const deleteSequence = mutation({
	args: { sequenceId: v.id("emailSequences") },
	handler: async (ctx, { sequenceId }) => {
		await requireAdmin(ctx);
		const steps = await ctx.db
			.query("sequenceSteps")
			.withIndex("by_sequence", (q) => q.eq("sequenceId", sequenceId))
			.collect();
		for (const s of steps) await ctx.db.delete(s._id);

		// Les inscriptions en cours sont arrêtées, pas supprimées : leur historique
		// reste lisible sur la fiche du lead.
		const enrollments = await ctx.db
			.query("sequenceEnrollments")
			.withIndex("by_status", (q) => q.eq("status", "active"))
			.collect();
		for (const e of enrollments) {
			if (e.sequenceId === sequenceId) {
				await ctx.db.patch(e._id, {
					status: "stopped" as const,
					stopReason: "Séquence supprimée",
				});
			}
		}
		await ctx.db.delete(sequenceId);
		return { ok: true };
	},
});

export const upsertStep = mutation({
	args: {
		stepId: v.optional(v.id("sequenceSteps")),
		sequenceId: v.id("emailSequences"),
		order: v.number(),
		offsetMinutes: v.number(),
		subject: v.string(),
		body: v.string(),
	},
	handler: async (ctx, args) => {
		await requireAdmin(ctx);
		const patch = {
			order: args.order,
			offsetMinutes: Math.round(args.offsetMinutes),
			subject: args.subject.trim().slice(0, 200),
			body: args.body.slice(0, 20_000),
		};
		if (!patch.subject) throw new Error("Le sujet est obligatoire.");
		if (!patch.body.trim()) throw new Error("Le message est obligatoire.");

		if (args.stepId) {
			await ctx.db.patch(args.stepId, patch);
			return args.stepId;
		}
		return await ctx.db.insert("sequenceSteps", {
			sequenceId: args.sequenceId,
			...patch,
		});
	},
});

export const deleteStep = mutation({
	args: { stepId: v.id("sequenceSteps") },
	handler: async (ctx, { stepId }) => {
		await requireAdmin(ctx);
		await ctx.db.delete(stepId);
		return { ok: true };
	},
});

// ============================================================
// INSCRIPTION
// ============================================================

// Inscrit un lead. Partagée par le bouton du CRM et les déclencheurs
// automatiques, pour que les deux appliquent exactement les mêmes refus.
async function enroll(
	ctx: MutationCtx,
	args: {
		sequenceId: Id<"emailSequences">;
		leadId: Id<"leads">;
		bookingId?: Id<"bookings">;
		anchorAt: number;
	},
): Promise<{ ok: boolean; reason?: string }> {
	const seq = await ctx.db.get(args.sequenceId);
	if (!seq || !seq.isActive) return { ok: false, reason: "sequence_inactive" };

	const lead = await ctx.db.get(args.leadId);
	if (!lead) return { ok: false, reason: "lead_not_found" };
	if (!lead.email) return { ok: false, reason: "no_email" };
	if (lead.emailOptOutAt) return { ok: false, reason: "opted_out" };

	// Jamais deux fois la même séquence en parallèle sur un lead.
	const existing = await ctx.db
		.query("sequenceEnrollments")
		.withIndex("by_lead", (q) => q.eq("leadId", args.leadId))
		.collect();
	if (
		existing.some(
			(e) => e.sequenceId === args.sequenceId && e.status === "active",
		)
	) {
		return { ok: false, reason: "already_enrolled" };
	}

	await ctx.db.insert("sequenceEnrollments", {
		sequenceId: args.sequenceId,
		leadId: args.leadId,
		bookingId: args.bookingId,
		anchorAt: args.anchorAt,
		status: "active" as const,
		enrolledAt: Date.now(),
	});
	return { ok: true };
}

export const enrollLead = mutation({
	args: {
		sequenceId: v.id("emailSequences"),
		leadId: v.id("leads"),
	},
	handler: async (ctx, { sequenceId, leadId }) => {
		await requireAdmin(ctx);
		const res = await enroll(ctx, {
			sequenceId,
			leadId,
			anchorAt: Date.now(),
		});
		if (!res.ok) {
			const messages: Record<string, string> = {
				sequence_inactive: "Cette séquence n'est pas active.",
				lead_not_found: "Lead introuvable.",
				no_email: "Ce lead n'a pas d'adresse email.",
				opted_out: "Ce lead s'est désabonné des emails.",
				already_enrolled: "Ce lead suit déjà cette séquence.",
			};
			throw new Error(messages[res.reason ?? ""] ?? "Inscription impossible.");
		}
		return { ok: true };
	},
});

export const stopEnrollment = mutation({
	args: { enrollmentId: v.id("sequenceEnrollments") },
	handler: async (ctx, { enrollmentId }) => {
		await requireAdmin(ctx);
		await ctx.db.patch(enrollmentId, {
			status: "stopped" as const,
			stopReason: "Arrêtée manuellement",
		});
		return { ok: true };
	},
});

// Inscription déclenchée par un événement métier (formulaire abandonné,
// no-show, rendez-vous pris). Silencieuse : aucun déclencheur ne doit faire
// échouer l'action qui l'a provoqué.
export const enrollByTriggerInternal = internalMutation({
	args: {
		trigger: TRIGGER,
		leadId: v.id("leads"),
		bookingId: v.optional(v.id("bookings")),
		anchorAt: v.number(),
	},
	handler: async (ctx, { trigger, leadId, bookingId, anchorAt }) => {
		const sequences = await ctx.db
			.query("emailSequences")
			.withIndex("by_trigger", (q) =>
				q.eq("trigger", trigger).eq("isActive", true),
			)
			.collect();
		for (const seq of sequences) {
			await enroll(ctx, {
				sequenceId: seq._id,
				leadId,
				bookingId,
				anchorAt,
			});
		}
	},
});

// ============================================================
// MOTEUR — appelé par le cron
// ============================================================

// Raisons d'arrêt, dans l'ordre où on les teste.
function stopReasonFor(lead: Doc<"leads">): string | null {
	if (lead.emailOptOutAt) return "Désabonnement";
	if (lead.status === "gagne") return "Lead gagné";
	return null;
}

export const processDue = internalMutation({
	args: {},
	handler: async (ctx): Promise<{ sent: number; stopped: number }> => {
		const now = Date.now();
		const active = await ctx.db
			.query("sequenceEnrollments")
			.withIndex("by_status", (q) => q.eq("status", "active"))
			.collect();

		let sent = 0;
		let stopped = 0;

		for (const enr of active) {
			const lead = await ctx.db.get(enr.leadId);
			if (!lead) {
				await ctx.db.patch(enr._id, {
					status: "stopped" as const,
					stopReason: "Lead supprimé",
				});
				stopped++;
				continue;
			}

			const reason = stopReasonFor(lead);
			if (reason) {
				await ctx.db.patch(enr._id, {
					status: "stopped" as const,
					stopReason: reason,
				});
				stopped++;
				continue;
			}

			// Séquence adossée à un rendez-vous : elle n'a plus d'objet si celui-ci
			// est annulé, et son ancre doit suivre une reprogrammation — sinon on
			// annoncerait « dans 2 jours » pour une date qui a bougé, ou pour un
			// rendez-vous qui n'existe plus.
			if (enr.bookingId) {
				const booking = await ctx.db.get(enr.bookingId);
				if (!booking || booking.status === "cancelled") {
					await ctx.db.patch(enr._id, {
						status: "stopped" as const,
						stopReason: "Rendez-vous annulé",
					});
					stopped++;
					continue;
				}
				const seqDoc = await ctx.db.get(enr.sequenceId);
				if (
					seqDoc?.trigger === "before_booking" &&
					booking.startTime !== enr.anchorAt
				) {
					await ctx.db.patch(enr._id, { anchorAt: booking.startTime });
					enr.anchorAt = booking.startTime;
				}
			}

			const seq = await ctx.db.get(enr.sequenceId);
			if (!seq || !seq.isActive) {
				await ctx.db.patch(enr._id, {
					status: "stopped" as const,
					stopReason: "Séquence désactivée",
				});
				stopped++;
				continue;
			}

			const steps = (
				await ctx.db
					.query("sequenceSteps")
					.withIndex("by_sequence", (q) => q.eq("sequenceId", enr.sequenceId))
					.collect()
			).sort((a, b) => a.order - b.order);

			const sends = await ctx.db
				.query("sequenceSends")
				.withIndex("by_enrollment", (q) => q.eq("enrollmentId", enr._id))
				.collect();
			const sentStepIds = new Set(sends.map((s) => s.stepId));

			for (const step of steps) {
				if (sentStepIds.has(step._id)) continue;
				const dueAt = enr.anchorAt + step.offsetMinutes * 60_000;
				if (dueAt > now) continue;

				// La trace d'envoi est écrite AVANT de planifier l'action : si deux
				// exécutions du cron se chevauchent, la seconde voit l'étape déjà
				// consommée. Mieux vaut un email perdu qu'un email en double.
				await ctx.db.insert("sequenceSends", {
					enrollmentId: enr._id,
					stepId: step._id,
					sentAt: now,
				});
				await ctx.scheduler.runAfter(0, internal.emails.sendSequenceStep, {
					leadId: enr.leadId,
					subject: step.subject,
					body: step.body,
				});
				sent++;
			}

			if (steps.length > 0 && sentStepIds.size + sent >= steps.length) {
				const remaining = steps.filter(
					(s) =>
						!sentStepIds.has(s._id) &&
						enr.anchorAt + s.offsetMinutes * 60_000 > now,
				);
				if (remaining.length === 0) {
					await ctx.db.patch(enr._id, { status: "done" as const });
				}
			}
		}

		return { sent, stopped };
	},
});

// ============================================================
// DÉSABONNEMENT
// ============================================================

// Jeton de désinscription, créé à la volée à la première utilisation.
export const getOrCreateUnsubTokenInternal = internalMutation({
	args: { leadId: v.id("leads") },
	handler: async (ctx, { leadId }): Promise<string | null> => {
		const lead = await ctx.db.get(leadId);
		if (!lead) return null;
		if (lead.unsubToken) return lead.unsubToken;
		const token = crypto.randomUUID().replace(/-/g, "");
		await ctx.db.patch(leadId, { unsubToken: token });
		return token;
	},
});

export const unsubscribeByTokenInternal = internalMutation({
	args: { token: v.string() },
	handler: async (ctx, { token }): Promise<boolean> => {
		const leads = await ctx.db.query("leads").collect();
		const lead = leads.find((l) => l.unsubToken === token);
		if (!lead) return false;

		if (!lead.emailOptOutAt) {
			await ctx.db.patch(lead._id, { emailOptOutAt: Date.now() });
		}

		// Toutes les séquences en cours s'arrêtent immédiatement.
		const enrollments = await ctx.db
			.query("sequenceEnrollments")
			.withIndex("by_lead", (q) => q.eq("leadId", lead._id))
			.collect();
		for (const e of enrollments) {
			if (e.status === "active") {
				await ctx.db.patch(e._id, {
					status: "stopped" as const,
					stopReason: "Désabonnement",
				});
			}
		}
		return true;
	},
});

export const getLeadForSequenceInternal = internalQuery({
	args: { leadId: v.id("leads") },
	handler: async (ctx, { leadId }) => {
		const lead = await ctx.db.get(leadId);
		if (!lead) return null;
		return {
			email: lead.email ?? null,
			firstName: lead.firstName ?? null,
			lastName: lead.lastName ?? null,
			optedOut: Boolean(lead.emailOptOutAt),
		};
	},
});
