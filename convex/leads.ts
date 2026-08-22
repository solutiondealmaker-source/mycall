// Leads — CRM pipeline. Queries, updates, notes, follow-ups.
// `findLeadByAnyKey` and `upsertLeadForBooking` are internal helpers shared
// with bookings.ts. `applyAutoPhase` re-derives lead.status from bookings.

import { paginationOptsValidator } from "convex/server";
import { v } from "convex/values";
import type { Doc, Id } from "./_generated/dataModel";
import type { MutationCtx, QueryCtx } from "./_generated/server";
import {
	internalMutation,
	internalQuery,
	mutation,
	query,
} from "./_generated/server";
import {
	getAuthenticatedUser,
	isAdminUser,
	requireAdmin,
	requireAuth,
} from "./lib/auth";
import { normalizeEmail, normalizePhone } from "./lib/leadMatch";

// ============================================================
// ROLE SCOPING — cloisonnement CRM
// Non-admins ne voient/modifient que LEURS leads (closerUserId ou
// setterUserId == eux). Admin/direction (isAdminUser) voient tout.
// ============================================================

async function getLeadScope(
	ctx: QueryCtx | MutationCtx,
): Promise<{ userId: Id<"users">; seeAll: boolean }> {
	const user = await getAuthenticatedUser(ctx);
	return { userId: user._id, seeAll: isAdminUser(user) };
}

function ownsLead(lead: Doc<"leads">, userId: Id<"users">): boolean {
	return lead.closerUserId === userId || lead.setterUserId === userId;
}

// ============================================================
// QUERIES
// ============================================================

// List all leads — admin / closer. Supports basic status filter.
export const list = query({
	args: {
		status: v.optional(
			v.union(
				v.literal("potentiel"),
				v.literal("qualifie"),
				v.literal("rdv_reserve"),
				v.literal("tenu"),
				v.literal("gagne"),
				v.literal("perdu"),
				v.literal("follow_up"),
			),
		),
		closerUserId: v.optional(v.id("users")),
	},
	handler: async (ctx, { status, closerUserId }) => {
		const { userId, seeAll } = await getLeadScope(ctx);
		let rows: Doc<"leads">[];
		if (status) {
			rows = await ctx.db
				.query("leads")
				.withIndex("by_status", (q) => q.eq("status", status))
				.collect();
		} else if (closerUserId) {
			rows = await ctx.db
				.query("leads")
				.withIndex("by_closerUserId", (q) => q.eq("closerUserId", closerUserId))
				.collect();
		} else {
			rows = await ctx.db.query("leads").collect();
		}
		if (!seeAll) rows = rows.filter((l) => ownsLead(l, userId));
		return rows;
	},
});

// Paginated list — used by the CRM pipeline view.
export const listPaginated = query({
	args: {
		paginationOpts: paginationOptsValidator,
		status: v.optional(
			v.union(
				v.literal("potentiel"),
				v.literal("qualifie"),
				v.literal("rdv_reserve"),
				v.literal("tenu"),
				v.literal("gagne"),
				v.literal("perdu"),
				v.literal("follow_up"),
			),
		),
	},
	handler: async (ctx, { paginationOpts, status }) => {
		const { userId, seeAll } = await getLeadScope(ctx);
		// Non-admin : cloisonné à ses leads via l'index closerUserId.
		// NB : un lead où l'utilisateur est SETTER seulement (pas closer)
		// n'apparaît pas dans cette vue paginée — limitation connue (erreur du
		// côté sûr : montrer moins, jamais fuiter).
		if (!seeAll) {
			const base = ctx.db
				.query("leads")
				.withIndex("by_closerUserId", (q) => q.eq("closerUserId", userId));
			return status
				? await base
						.filter((q) => q.eq(q.field("status"), status))
						.paginate(paginationOpts)
				: await base.paginate(paginationOpts);
		}
		if (status) {
			const results = await ctx.db
				.query("leads")
				.withIndex("by_status", (q) => q.eq("status", status))
				.paginate(paginationOpts);
			return results;
		}
		return await ctx.db.query("leads").paginate(paginationOpts);
	},
});

// Quick search — returns top N leads matching name/phone/email fragment.
export const searchTopN = query({
	args: { q: v.string(), limit: v.optional(v.number()) },
	handler: async (ctx, { q, limit }) => {
		const { userId, seeAll } = await getLeadScope(ctx);
		const all = await ctx.db.query("leads").collect();
		const needle = q.toLowerCase();
		const matches = all.filter((l) => {
			if (!seeAll && !ownsLead(l, userId)) return false;
			const name = `${l.firstName ?? ""} ${l.lastName ?? ""}`.toLowerCase();
			return (
				name.includes(needle) ||
				(l.phone ?? "").includes(needle) ||
				(l.email ?? "").toLowerCase().includes(needle)
			);
		});
		return matches.slice(0, limit ?? 10);
	},
});

export const getById = query({
	args: { id: v.id("leads") },
	handler: async (ctx, { id }) => {
		const { userId, seeAll } = await getLeadScope(ctx);
		const lead = await ctx.db.get(id);
		if (!lead) return null;
		if (!seeAll && !ownsLead(lead, userId)) return null;
		return lead;
	},
});

// Count leads per status — used by KPI strip + segment rail counts
export const countByStatus = query({
	args: {},
	handler: async (ctx) => {
		const { userId, seeAll } = await getLeadScope(ctx);
		const all = (await ctx.db.query("leads").collect()).filter(
			(l) => seeAll || ownsLead(l, userId),
		);
		const now = Date.now();
		const sevenDaysAgo = now - 7 * 24 * 60 * 60 * 1000;
		const startOfMonth = new Date();
		startOfMonth.setDate(1);
		startOfMonth.setHours(0, 0, 0, 0);

		const counts: Record<string, number> = {
			total: all.length,
			potentiel: 0,
			qualifie: 0,
			rdv_reserve: 0,
			tenu: 0,
			gagne: 0,
			perdu: 0,
			follow_up: 0,
			new7d: 0,
			gagneThisMonth: 0,
		};

		for (const lead of all) {
			counts[lead.status] = (counts[lead.status] ?? 0) + 1;
			if (lead._creationTime > sevenDaysAgo) counts.new7d++;
			if (
				lead.status === "gagne" &&
				lead.convertedAt &&
				lead.convertedAt >= startOfMonth.getTime()
			) {
				counts.gagneThisMonth++;
			}
		}

		return counts;
	},
});

// Users list for assignee dropdowns. Projeté (M3) : uniquement les champs
// d'affichage (id/nom/email), pas les docs users complets — évite d'exposer
// role/isAdmin/etc. à tout compte authentifié et de contourner le requireAdmin
// de users.listAllUsers.
export const listUsers = query({
	args: {},
	handler: async (ctx) => {
		await requireAuth(ctx);
		const users = await ctx.db.query("users").collect();
		return users.map((u) => ({ _id: u._id, name: u.name, email: u.email }));
	},
});

// Leads les plus récemment actifs — widget dashboard "Leads chauds". Cloisonné.
export const listRecent = query({
	args: { limit: v.optional(v.number()) },
	handler: async (ctx, { limit }) => {
		const { userId, seeAll } = await getLeadScope(ctx);
		const all = await ctx.db.query("leads").collect();
		const scoped = seeAll ? all : all.filter((l) => ownsLead(l, userId));
		scoped.sort(
			(a, b) =>
				(b.lastInteractionAt ?? b._creationTime) -
				(a.lastInteractionAt ?? a._creationTime),
		);
		return scoped.slice(0, limit ?? 5);
	},
});

// ============================================================
// MUTATIONS — lead
// ============================================================

export const update = mutation({
	args: {
		id: v.id("leads"),
		firstName: v.optional(v.string()),
		lastName: v.optional(v.string()),
		phone: v.optional(v.string()),
		email: v.optional(v.string()),
		status: v.optional(
			v.union(
				v.literal("potentiel"),
				v.literal("qualifie"),
				v.literal("rdv_reserve"),
				v.literal("tenu"),
				v.literal("gagne"),
				v.literal("perdu"),
				v.literal("follow_up"),
			),
		),
		phase: v.optional(v.string()),
		closerUserId: v.optional(v.id("users")),
		setterUserId: v.optional(v.id("users")),
		tags: v.optional(v.array(v.string())),
		tagSource: v.optional(v.string()),
		montantContracte: v.optional(v.number()),
	},
	handler: async (ctx, { id, ...patch }) => {
		const { userId, seeAll } = await getLeadScope(ctx);
		const lead = await ctx.db.get(id);
		if (!lead) throw new Error("Lead introuvable");
		if (!seeAll && !ownsLead(lead, userId))
			throw new Error("Accès refusé à ce lead");

		const phonePatch =
			patch.phone !== undefined
				? { phoneNormalized: normalizePhone(patch.phone) || undefined }
				: {};
		const emailPatch =
			patch.email !== undefined
				? { emailNormalized: normalizeEmail(patch.email) || undefined }
				: {};

		const cleanPatch = Object.fromEntries(
			Object.entries({ ...patch, ...phonePatch, ...emailPatch }).filter(
				([, v]) => v !== undefined,
			),
		);

		await ctx.db.patch(id, {
			...cleanPatch,
			lastInteractionAt: Date.now(),
		});
		return id;
	},
});

// ============================================================
// MUTATIONS — suppression (admin / direction uniquement)
// ============================================================

// Supprime définitivement un lead ET tout ce qui lui est rattaché :
// rendez-vous (+ leur journal d'activité), notes, relances, captures
// partielles et logs de notification. Irréversible.
async function _purgeLead(
	ctx: MutationCtx,
	leadId: Id<"leads">,
): Promise<{ bookings: number; notes: number; followUps: number }> {
	// 1. Bookings + leur journal d'activité
	const bookings = await ctx.db
		.query("bookings")
		.withIndex("by_leadId_startTime", (q) => q.eq("leadId", leadId))
		.collect();
	for (const b of bookings) {
		const logs = await ctx.db
			.query("bookingActivityLog")
			.withIndex("by_booking", (q) => q.eq("bookingId", b._id))
			.collect();
		for (const l of logs) await ctx.db.delete(l._id);

		const notifs = await ctx.db
			.query("notificationLogs")
			.withIndex("by_booking", (q) => q.eq("bookingId", b._id))
			.collect();
		for (const n of notifs) await ctx.db.delete(n._id);

		await ctx.db.delete(b._id);
	}

	// 2. Journal d'activité restant rattaché au lead
	const leadLogs = await ctx.db
		.query("bookingActivityLog")
		.withIndex("by_lead_date", (q) => q.eq("leadId", leadId))
		.collect();
	for (const l of leadLogs) await ctx.db.delete(l._id);

	// 3. Notes
	const notes = await ctx.db
		.query("leadNotes")
		.withIndex("by_lead", (q) => q.eq("leadId", leadId))
		.collect();
	for (const n of notes) await ctx.db.delete(n._id);

	// 4. Relances
	const followUps = await ctx.db
		.query("leadFollowUps")
		.withIndex("by_lead", (q) => q.eq("leadId", leadId))
		.collect();
	for (const f of followUps) await ctx.db.delete(f._id);

	// 5. Logs de notification rattachés au lead
	const leadNotifs = await ctx.db
		.query("notificationLogs")
		.withIndex("by_lead", (q) => q.eq("leadId", leadId))
		.collect();
	for (const n of leadNotifs) await ctx.db.delete(n._id);

	// 6. Captures partielles promues vers ce lead (pas d'index dédié → filtre)
	const partials = await ctx.db
		.query("partialLeads")
		.filter((q) => q.eq(q.field("promotedLeadId"), leadId))
		.collect();
	for (const p of partials) await ctx.db.delete(p._id);

	// 7. Le lead
	await ctx.db.delete(leadId);

	return {
		bookings: bookings.length,
		notes: notes.length,
		followUps: followUps.length,
	};
}

export const remove = mutation({
	args: { id: v.id("leads") },
	handler: async (ctx, { id }) => {
		await requireAdmin(ctx);
		const lead = await ctx.db.get(id);
		if (!lead) throw new Error("Lead introuvable");
		return await _purgeLead(ctx, id);
	},
});

export const removeMany = mutation({
	args: { ids: v.array(v.id("leads")) },
	handler: async (ctx, { ids }) => {
		await requireAdmin(ctx);
		if (ids.length > 100) {
			throw new Error("Trop de leads sélectionnés (100 max par suppression).");
		}
		let deleted = 0;
		let bookings = 0;
		for (const id of ids) {
			const lead = await ctx.db.get(id);
			if (!lead) continue; // déjà supprimé — on ignore
			const res = await _purgeLead(ctx, id);
			bookings += res.bookings;
			deleted++;
		}
		return { deleted, bookings };
	},
});

// ============================================================
// MUTATIONS — notes
// ============================================================

export const addNote = mutation({
	args: {
		leadId: v.id("leads"),
		body: v.string(),
	},
	handler: async (ctx, { leadId, body }) => {
		const { userId, seeAll } = await getLeadScope(ctx);
		const lead = await ctx.db.get(leadId);
		if (!lead) throw new Error("Lead introuvable");
		if (!seeAll && !ownsLead(lead, userId))
			throw new Error("Accès refusé à ce lead");

		const now = Date.now();
		const noteId = await ctx.db.insert("leadNotes", {
			leadId,
			body: body.trim(),
			authorUserId: userId,
			createdAt: now,
		});

		await ctx.db.patch(leadId, { lastInteractionAt: now });
		return noteId;
	},
});

export const deleteNote = mutation({
	args: { noteId: v.id("leadNotes") },
	handler: async (ctx, { noteId }) => {
		const userId = await requireAuth(ctx);
		const note = await ctx.db.get(noteId);
		if (!note) throw new Error("Note introuvable");
		// Only the author or an admin can delete
		const caller = await ctx.db.get(userId);
		if (note.authorUserId !== userId && !caller?.isAdmin) {
			throw new Error("Seul l'auteur ou un admin peut supprimer cette note");
		}
		await ctx.db.delete(noteId);
	},
});

// ============================================================
// MUTATIONS — follow-ups
// ============================================================

export const addFollowUp = mutation({
	args: {
		leadId: v.id("leads"),
		dueAt: v.number(),
		reason: v.string(),
		channel: v.union(
			v.literal("call"),
			v.literal("sms"),
			v.literal("email"),
			v.literal("other"),
		),
		note: v.optional(v.string()),
	},
	handler: async (ctx, args) => {
		const { userId, seeAll } = await getLeadScope(ctx);
		const lead = await ctx.db.get(args.leadId);
		if (!lead) throw new Error("Lead introuvable");
		if (!seeAll && !ownsLead(lead, userId))
			throw new Error("Accès refusé à ce lead");

		if (args.dueAt < Date.now() - 60_000) {
			throw new Error("La date de relance doit être dans le futur");
		}

		const followUpId = await ctx.db.insert("leadFollowUps", {
			leadId: args.leadId,
			dueAt: args.dueAt,
			reason: args.reason.trim(),
			channel: args.channel,
			note: args.note,
			status: "pending",
			closerUserId: userId,
		});

		await ctx.db.patch(args.leadId, { lastInteractionAt: Date.now() });
		return followUpId;
	},
});

export const completeFollowUp = mutation({
	args: {
		followUpId: v.id("leadFollowUps"),
		note: v.optional(v.string()),
	},
	handler: async (ctx, { followUpId, note }) => {
		const { userId, seeAll } = await getLeadScope(ctx);
		const fu = await ctx.db.get(followUpId);
		if (!fu) throw new Error("Follow-up introuvable");
		const fuLead = await ctx.db.get(fu.leadId);
		if (fuLead && !seeAll && !ownsLead(fuLead, userId))
			throw new Error("Accès refusé à ce lead");
		await ctx.db.patch(followUpId, {
			status: "done",
			...(note !== undefined ? { note } : {}),
		});
		await ctx.db.patch(fu.leadId, { lastInteractionAt: Date.now() });
	},
});

export const cancelFollowUp = mutation({
	args: { followUpId: v.id("leadFollowUps") },
	handler: async (ctx, { followUpId }) => {
		const { userId, seeAll } = await getLeadScope(ctx);
		const fu = await ctx.db.get(followUpId);
		if (!fu) throw new Error("Follow-up introuvable");
		const fuLead = await ctx.db.get(fu.leadId);
		if (fuLead && !seeAll && !ownsLead(fuLead, userId))
			throw new Error("Accès refusé à ce lead");
		await ctx.db.patch(followUpId, { status: "cancelled" });
	},
});

// ============================================================
// QUERY — Activity stream (timeline fiche lead)
// Aggregates bookingActivityLog + leadNotes for a single lead.
// ============================================================

export const activityStream = query({
	args: { leadId: v.id("leads") },
	handler: async (ctx, { leadId }) => {
		const { userId, seeAll } = await getLeadScope(ctx);
		const lead = await ctx.db.get(leadId);
		if (!lead || (!seeAll && !ownsLead(lead, userId))) return [];

		// Booking activity logs for this lead
		const activityLogs = await ctx.db
			.query("bookingActivityLog")
			.withIndex("by_lead_date", (q) => q.eq("leadId", leadId))
			.order("desc")
			.take(100);

		// Notes for this lead
		const notes = await ctx.db
			.query("leadNotes")
			.withIndex("by_lead_date", (q) => q.eq("leadId", leadId))
			.order("desc")
			.take(50);

		// Bookings for this lead (to enrich log items with event name)
		const bookings = await ctx.db
			.query("bookings")
			.withIndex("by_leadId_startTime", (q) => q.eq("leadId", leadId))
			.collect();

		const bookingMap = new Map(bookings.map((b) => [b._id, b]));

		// Enrich activity logs with actor name if available
		const actorIds = [
			...new Set(
				activityLogs
					.filter((l) => l.actorUserId != null)
					.map((l) => l.actorUserId as Id<"users">),
			),
		];
		const actors = await Promise.all(actorIds.map((id) => ctx.db.get(id)));
		const actorMap = new Map(
			actors.filter(Boolean).map((a) => [a!._id, a!.name ?? a!.email]),
		);

		// Note author ids
		const noteAuthorIds = [...new Set(notes.map((n) => n.authorUserId))];
		const noteAuthors = await Promise.all(
			noteAuthorIds.map((id) => ctx.db.get(id)),
		);
		const noteAuthorMap = new Map(
			noteAuthors.filter(Boolean).map((a) => [a!._id, a!.name ?? a!.email]),
		);

		type ActivityItem = {
			id: string;
			type: Doc<"bookingActivityLog">["type"] | "note_added";
			actorName?: string;
			createdAt: number;
			payload?: Record<string, unknown>;
			bookingSlug?: string;
			body?: string; // for notes
		};

		const items: ActivityItem[] = [
			...activityLogs.map((log) => ({
				id: log._id,
				type: log.type,
				actorName: log.actorUserId ? actorMap.get(log.actorUserId) : undefined,
				createdAt: log.createdAt,
				payload: log.payload as Record<string, unknown> | undefined,
				bookingSlug: log.bookingId
					? bookingMap.get(log.bookingId)?.eventSlug
					: undefined,
			})),
			...notes.map((note) => ({
				id: note._id,
				type: "note_added" as const,
				actorName: noteAuthorMap.get(note.authorUserId),
				createdAt: note.createdAt,
				body: note.body,
			})),
		];

		// Sort by createdAt desc
		items.sort((a, b) => b.createdAt - a.createdAt);

		return items;
	},
});

// Bookings for a specific lead (used in Appels tab)
export const listBookingsByLead = query({
	args: { leadId: v.id("leads") },
	handler: async (ctx, { leadId }) => {
		const { userId, seeAll } = await getLeadScope(ctx);
		const lead = await ctx.db.get(leadId);
		if (!lead || (!seeAll && !ownsLead(lead, userId))) return [];
		const bookings = await ctx.db
			.query("bookings")
			.withIndex("by_leadId_startTime", (q) => q.eq("leadId", leadId))
			.order("desc")
			.take(50);
		return bookings;
	},
});

// Relances d'un lead (onglet Relances de la fiche). Cloisonné comme le reste.
export const listFollowUpsByLead = query({
	args: { leadId: v.id("leads") },
	handler: async (ctx, { leadId }) => {
		const { userId, seeAll } = await getLeadScope(ctx);
		const lead = await ctx.db.get(leadId);
		if (!lead || (!seeAll && !ownsLead(lead, userId))) return [];

		const rows = await ctx.db
			.query("leadFollowUps")
			.withIndex("by_lead", (q) => q.eq("leadId", leadId))
			.collect();
		rows.sort((a, b) => a.dueAt - b.dueAt);

		// Enrichit avec le nom du closer responsable
		const closerIds = [...new Set(rows.map((r) => r.closerUserId))];
		const closers = await Promise.all(closerIds.map((id) => ctx.db.get(id)));
		const nameById = new Map(
			closers.filter(Boolean).map((c) => [c?._id, c?.name ?? c?.email]),
		);

		return rows.map((r) => ({
			...r,
			closerName: nameById.get(r.closerUserId) ?? null,
		}));
	},
});

// Notes for a specific lead (used in Notes tab)
export const listNotesByLead = query({
	args: { leadId: v.id("leads") },
	handler: async (ctx, { leadId }) => {
		const { userId, seeAll } = await getLeadScope(ctx);
		const lead = await ctx.db.get(leadId);
		if (!lead || (!seeAll && !ownsLead(lead, userId))) return [];
		const notes = await ctx.db
			.query("leadNotes")
			.withIndex("by_lead_date", (q) => q.eq("leadId", leadId))
			.order("desc")
			.take(100);

		// Enrich with author name
		const authorIds = [...new Set(notes.map((n) => n.authorUserId))];
		const authors = await Promise.all(authorIds.map((id) => ctx.db.get(id)));
		const authorMap = new Map(
			authors.filter(Boolean).map((a) => [a!._id, a!.name ?? a!.email]),
		);

		return notes.map((n) => ({
			...n,
			authorName: authorMap.get(n.authorUserId) ?? "Inconnu",
		}));
	},
});

// ============================================================
// INTERNAL HELPERS — called by bookings.ts + partialLeads.ts
// ============================================================

// Resolve an existing lead via normalized phone/email indexes (O(log n)).
// iClone is a new deployment — all leads are indexed from day 1, so no legacy
// fallback is needed (unlike DG COACHING which had pre-migration rows).
export const findLeadByAnyKeyInternal = internalQuery({
	args: {
		phone: v.optional(v.string()),
		email: v.optional(v.string()),
	},
	handler: async (ctx, { phone, email }) => {
		const normPhone = normalizePhone(phone);
		const normEmail = normalizeEmail(email);
		if (normPhone) {
			const byPhone = await ctx.db
				.query("leads")
				.withIndex("by_phoneNormalized", (q) =>
					q.eq("phoneNormalized", normPhone),
				)
				.first();
			if (byPhone) return byPhone;
		}
		if (normEmail) {
			const byEmail = await ctx.db
				.query("leads")
				.withIndex("by_emailNormalized", (q) =>
					q.eq("emailNormalized", normEmail),
				)
				.first();
			if (byEmail) return byEmail;
		}
		return null;
	},
});

// Upsert lead for a confirmed booking. Writes normalized dedup keys.
// Preserves: setter if already assigned, closer if lead already converted.
// Returns the leadId.
export const upsertLeadForBookingInternal = internalMutation({
	args: {
		eventId: v.id("events"),
		eventSlug: v.string(),
		eventSetterId: v.optional(v.id("users")),
		eventTagSource: v.optional(v.string()),
		firstName: v.string(),
		lastName: v.string(),
		phone: v.string(),
		email: v.optional(v.string()),
		formAnswers: v.optional(v.string()),
		startTime: v.number(),
		hostUserId: v.id("users"),
	},
	handler: async (ctx, args) => {
		return await _upsertLeadForBooking(ctx, args);
	},
});

// Module-internal version usable within bookings.ts mutations directly.
// Exported as a plain async function (not a Convex function) so bookings.ts
// can call it synchronously within the same mutation transaction.
export async function _upsertLeadForBooking(
	ctx: MutationCtx,
	args: {
		eventId: Id<"events">;
		eventSlug: string;
		eventSetterId?: Id<"users">;
		eventTagSource?: string;
		firstName: string;
		lastName: string;
		phone: string;
		email?: string;
		formAnswers?: string;
		startTime: number;
		hostUserId: Id<"users">;
	},
): Promise<Id<"leads">> {
	const normPhone = normalizePhone(args.phone);
	const normEmail = normalizeEmail(args.email);
	const now = Date.now();

	const lead = await _findLeadByAnyKey(ctx, {
		phone: args.phone,
		email: args.email,
	});

	if (lead) {
		// Preserve setter if already assigned
		const setterPatch =
			lead.setterUserId == null && args.eventSetterId
				? { setterUserId: args.eventSetterId }
				: {};
		// Freeze closer after conversion (gotcha G7 from DG COACHING)
		const closerPatch = lead.convertedAt
			? {}
			: { closerUserId: args.hostUserId };

		await ctx.db.patch(lead._id, {
			firstName: args.firstName,
			lastName: args.lastName,
			phone: args.phone,
			email: args.email ?? lead.email,
			phoneNormalized: normPhone || undefined,
			emailNormalized: normEmail || undefined,
			eventId: args.eventId,
			eventSlug: args.eventSlug,
			formAnswers: args.formAnswers ?? lead.formAnswers,
			lastInteractionAt: now,
			...closerPatch,
			...setterPatch,
		});
		return lead._id;
	}

	return await ctx.db.insert("leads", {
		firstName: args.firstName,
		lastName: args.lastName,
		phone: args.phone,
		email: args.email,
		phoneNormalized: normPhone || undefined,
		emailNormalized: normEmail || undefined,
		eventId: args.eventId,
		eventSlug: args.eventSlug,
		sessionId: undefined,
		formAnswers: args.formAnswers,
		status: "rdv_reserve",
		phase: "rdv_reserve",
		closerUserId: args.hostUserId,
		setterUserId: args.eventSetterId,
		tagSource: args.eventTagSource ?? args.eventSlug,
		lastInteractionAt: now,
	});
}

// Plain async function version of findLeadByAnyKey (used within the same mutation).
export async function _findLeadByAnyKey(
	ctx: MutationCtx,
	args: { phone?: string | null; email?: string | null },
): Promise<Doc<"leads"> | null> {
	const normPhone = normalizePhone(args.phone);
	const normEmail = normalizeEmail(args.email);
	if (normPhone) {
		const byPhone = await ctx.db
			.query("leads")
			.withIndex("by_phoneNormalized", (q) =>
				q.eq("phoneNormalized", normPhone),
			)
			.first();
		if (byPhone) return byPhone;
	}
	if (normEmail) {
		const byEmail = await ctx.db
			.query("leads")
			.withIndex("by_emailNormalized", (q) =>
				q.eq("emailNormalized", normEmail),
			)
			.first();
		if (byEmail) return byEmail;
	}
	return null;
}

// Re-derive lead.status from its bookings + outcomes. Called after every
// setOutcome / markNoShow / markCompleted / cancelByToken mutation.
//
// Auto-phase derivation rules (in priority order):
//   gagne   — any booking with issue="gagne"
//   perdu   — all held bookings have issue="perdu" (no gagne, no follow_up)
//   follow_up — any booking with issue="follow_up" and no gagne
//   tenu    — any booking with tenue="tenu" (call was held) but issue still en_attente
//   rdv_reserve — any confirmed/rescheduled future booking
//   potentiel — no bookings yet, or all cancelled
export async function _applyAutoPhase(
	ctx: MutationCtx,
	leadId: Id<"leads">,
): Promise<void> {
	const bookings = await ctx.db
		.query("bookings")
		.withIndex("by_leadId_startTime", (q) => q.eq("leadId", leadId))
		.collect();

	const now = Date.now();
	const active = bookings.filter(
		(b) => b.status !== "cancelled" && b.status !== "rescheduled",
	);

	// Check for any won booking
	if (active.some((b) => b.issue === "gagne")) {
		await ctx.db.patch(leadId, {
			status: "gagne",
			phase: "gagne",
			convertedAt: now,
			lastInteractionAt: now,
		});
		return;
	}

	// Check for follow_up
	if (active.some((b) => b.issue === "follow_up")) {
		await ctx.db.patch(leadId, {
			status: "follow_up",
			phase: "follow_up",
			lastInteractionAt: now,
		});
		return;
	}

	// All held bookings are perdu
	const heldBookings = active.filter((b) => b.tenue === "tenu");
	if (
		heldBookings.length > 0 &&
		heldBookings.every((b) => b.issue === "perdu")
	) {
		await ctx.db.patch(leadId, {
			status: "perdu",
			phase: "perdu",
			lastInteractionAt: now,
		});
		return;
	}

	// Call was held but issue still pending
	if (active.some((b) => b.tenue === "tenu" && b.issue === "en_attente")) {
		await ctx.db.patch(leadId, {
			status: "tenu",
			phase: "tenu",
			lastInteractionAt: now,
		});
		return;
	}

	// Future confirmed booking
	const hasFutureBooking = active.some(
		(b) => b.status === "confirmed" && b.startTime > now,
	);
	if (hasFutureBooking) {
		await ctx.db.patch(leadId, {
			status: "rdv_reserve",
			phase: "rdv_reserve",
			lastInteractionAt: now,
		});
		return;
	}

	// Fallback: potentiel
	await ctx.db.patch(leadId, {
		status: "potentiel",
		phase: "potentiel",
		lastInteractionAt: now,
	});
}

// Convex-registered version of _applyAutoPhase for cross-file use.
export const applyAutoPhaseInternal = internalMutation({
	args: { leadId: v.id("leads") },
	handler: async (ctx, { leadId }) => {
		await _applyAutoPhase(ctx, leadId);
	},
});
