// Events — CRUD + questions + hosts management.
// All write mutations require admin auth (Better Auth via lib/auth.ts).

import { v } from "convex/values";
import type { Doc } from "./_generated/dataModel";
import { internalQuery, mutation, query } from "./_generated/server";
import { requireAdmin, requireAuth, requireReadAll } from "./lib/auth";

// ============================================================
// QUERIES
// ============================================================

// List all events — admin. Optional filters: isActive, search (name/slug).
export const list = query({
	args: {
		isActive: v.optional(v.boolean()),
		search: v.optional(v.string()),
	},
	handler: async (ctx, { isActive, search }) => {
		// Lecture seule : les observateurs en ont besoin pour filtrer l'analytics.
		await requireReadAll(ctx);
		let rows: Doc<"events">[];
		if (isActive !== undefined) {
			rows = await ctx.db
				.query("events")
				.withIndex("by_isActive", (q) => q.eq("isActive", isActive))
				.collect();
		} else {
			rows = await ctx.db.query("events").collect();
		}
		if (search) {
			const q = search.toLowerCase();
			rows = rows.filter(
				(e) =>
					e.name.toLowerCase().includes(q) || e.slug.toLowerCase().includes(q),
			);
		}
		return rows;
	},
});

// Événements actifs, pour la prise de rendez-vous manuelle depuis le CRM.
// Accessible à tout membre : un closer doit pouvoir choisir l'événement sans
// avoir accès à la page Événements, qui elle exige une vision globale.
// Projeté volontairement : juste de quoi remplir un menu déroulant.
export const listForBooking = query({
	args: {},
	handler: async (ctx) => {
		await requireAuth(ctx);
		const rows = await ctx.db
			.query("events")
			.withIndex("by_isActive", (q) => q.eq("isActive", true))
			.collect();
		return rows
			.map((e) => ({
				_id: e._id,
				name: e.name,
				slug: e.slug,
				durationMinutes: e.durationMinutes,
				timezone: e.timezone,
			}))
			.sort((a, b) => a.name.localeCompare(b.name, "fr"));
	},
});

// Public query — fetch event by slug. Used by the booking page.
// Returns null when not found or not active (no information leak on existence).
export const getBySlug = query({
	args: { slug: v.string() },
	handler: async (ctx, { slug }) => {
		const event = await ctx.db
			.query("events")
			.withIndex("by_slug", (q) => q.eq("slug", slug))
			.first();
		if (!event || !event.isActive) return null;
		return event;
	},
});

// Admin query — fetch event by id, regardless of active status.
export const getById = query({
	args: { id: v.id("events") },
	handler: async (ctx, { id }) => {
		await requireAdmin(ctx);
		return await ctx.db.get(id);
	},
});

// ============================================================
// MUTATIONS — event lifecycle
// ============================================================

// Create a new event. Validates slug uniqueness.
export const create = mutation({
	args: {
		name: v.string(),
		slug: v.string(),
		description: v.optional(v.string()),
		durationMinutes: v.number(),
		timezone: v.string(),
		priorityMode: v.union(v.literal("manual"), v.literal("round_robin")),
		allowReschedule: v.boolean(),
		// Optional fields mirror schema optionals
		bufferBeforeMinutes: v.optional(v.number()),
		bufferAfterMinutes: v.optional(v.number()),
		slotIncrementMinutes: v.optional(v.number()),
		timeFormat: v.optional(v.union(v.literal("h12"), v.literal("h24"))),
		color: v.optional(v.string()),
		rangeType: v.optional(
			v.union(v.literal("rolling"), v.literal("indefinite")),
		),
		rangeDays: v.optional(v.number()),
		rescheduleRangeDays: v.optional(v.number()),
		alwaysAvailableDays: v.optional(v.union(v.boolean(), v.array(v.number()))),
		minimumNoticeHours: v.optional(v.number()),
		businessDaysOnly: v.optional(v.boolean()),
		preventDoubleBooking: v.optional(v.boolean()),
		rescheduleWithSameHost: v.optional(v.boolean()),
		disqualificationRules: v.optional(
			v.array(
				v.object({ questionLabel: v.string(), answers: v.array(v.string()) }),
			),
		),
		disqualificationMessage: v.optional(v.string()),
		disqualificationRedirectUrl: v.optional(v.string()),
		setterId: v.optional(v.id("users")),
		calendarGreeting: v.optional(v.string()),
		calendarBody: v.optional(v.string()),
		calendarSignature: v.optional(v.string()),
		confirmationTitle: v.optional(v.string()),
		confirmationMessage: v.optional(v.string()),
		confirmationRedirectUrl: v.optional(v.string()),
		location: v.optional(v.union(v.literal("googleMeet"), v.literal("custom"))),
		customLocation: v.optional(v.string()),
		reservationTimerMinutes: v.optional(v.number()),
		tagSource: v.optional(v.string()),
		noteInterne: v.optional(v.string()),
	},
	handler: async (ctx, args) => {
		await requireAdmin(ctx);
		// Enforce slug uniqueness
		const existing = await ctx.db
			.query("events")
			.withIndex("by_slug", (q) => q.eq("slug", args.slug))
			.first();
		if (existing) throw new Error(`Slug "${args.slug}" déjà utilisé`);

		const id = await ctx.db.insert("events", {
			...args,
			isActive: true,
		});
		return id;
	},
});

// Patch an existing event. Only provided fields are updated.
export const update = mutation({
	args: {
		id: v.id("events"),
		name: v.optional(v.string()),
		slug: v.optional(v.string()),
		description: v.optional(v.string()),
		durationMinutes: v.optional(v.number()),
		timezone: v.optional(v.string()),
		priorityMode: v.optional(
			v.union(v.literal("manual"), v.literal("round_robin")),
		),
		allowReschedule: v.optional(v.boolean()),
		bufferBeforeMinutes: v.optional(v.number()),
		bufferAfterMinutes: v.optional(v.number()),
		slotIncrementMinutes: v.optional(v.number()),
		timeFormat: v.optional(v.union(v.literal("h12"), v.literal("h24"))),
		color: v.optional(v.string()),
		rangeType: v.optional(
			v.union(v.literal("rolling"), v.literal("indefinite")),
		),
		rangeDays: v.optional(v.number()),
		rescheduleRangeDays: v.optional(v.number()),
		alwaysAvailableDays: v.optional(v.union(v.boolean(), v.array(v.number()))),
		minimumNoticeHours: v.optional(v.number()),
		businessDaysOnly: v.optional(v.boolean()),
		preventDoubleBooking: v.optional(v.boolean()),
		rescheduleWithSameHost: v.optional(v.boolean()),
		disqualificationRules: v.optional(
			v.array(
				v.object({ questionLabel: v.string(), answers: v.array(v.string()) }),
			),
		),
		disqualificationMessage: v.optional(v.string()),
		disqualificationRedirectUrl: v.optional(v.string()),
		setterId: v.optional(v.id("users")),
		calendarGreeting: v.optional(v.string()),
		calendarBody: v.optional(v.string()),
		calendarSignature: v.optional(v.string()),
		confirmationTitle: v.optional(v.string()),
		confirmationMessage: v.optional(v.string()),
		confirmationRedirectUrl: v.optional(v.string()),
		location: v.optional(v.union(v.literal("googleMeet"), v.literal("custom"))),
		customLocation: v.optional(v.string()),
		reservationTimerMinutes: v.optional(v.number()),
		tagSource: v.optional(v.string()),
		noteInterne: v.optional(v.string()),
		isActive: v.optional(v.boolean()),
	},
	handler: async (ctx, { id, ...patch }) => {
		await requireAdmin(ctx);
		const event = await ctx.db.get(id);
		if (!event) throw new Error("Événement introuvable");

		// Slug uniqueness check on change
		if (patch.slug && patch.slug !== event.slug) {
			const conflict = await ctx.db
				.query("events")
				.withIndex("by_slug", (q) => q.eq("slug", patch.slug as string))
				.first();
			if (conflict) throw new Error(`Slug "${patch.slug}" déjà utilisé`);
		}

		// Only include defined fields in the patch to avoid overwriting with undefined
		const cleanPatch = Object.fromEntries(
			Object.entries(patch).filter(([, v]) => v !== undefined),
		) as Partial<Doc<"events">>;

		await ctx.db.patch(id, cleanPatch);
		return id;
	},
});

// Soft delete — sets isActive=false.
export const archive = mutation({
	args: { id: v.id("events") },
	handler: async (ctx, { id }) => {
		await requireAdmin(ctx);
		const event = await ctx.db.get(id);
		if (!event) throw new Error("Événement introuvable");
		await ctx.db.patch(id, { isActive: false });
		return id;
	},
});

// Deep clone event + its questions + its hosts.
export const duplicate = mutation({
	args: { id: v.id("events"), newSlug: v.string(), newName: v.string() },
	handler: async (ctx, { id, newSlug, newName }) => {
		await requireAdmin(ctx);

		const event = await ctx.db.get(id);
		if (!event) throw new Error("Événement introuvable");

		// Slug uniqueness
		const conflict = await ctx.db
			.query("events")
			.withIndex("by_slug", (q) => q.eq("slug", newSlug))
			.first();
		if (conflict) throw new Error(`Slug "${newSlug}" déjà utilisé`);

		// Clone event row
		const { _id, _creationTime, ...rest } = event;
		const newEventId = await ctx.db.insert("events", {
			...rest,
			name: newName,
			slug: newSlug,
			isActive: false, // start inactive — admin activates explicitly
		});

		// Clone questions (preserve order)
		const questions = await ctx.db
			.query("eventQuestions")
			.withIndex("by_eventId_order", (q) => q.eq("eventId", id))
			.collect();
		for (const q of questions) {
			const { _id: _qid, _creationTime: _qct, ...qRest } = q;
			await ctx.db.insert("eventQuestions", { ...qRest, eventId: newEventId });
		}

		// Clone hosts
		const hosts = await ctx.db
			.query("eventHosts")
			.withIndex("by_eventId", (q) => q.eq("eventId", id))
			.collect();
		const now = Date.now();
		for (const h of hosts) {
			await ctx.db.insert("eventHosts", {
				eventId: newEventId,
				userId: h.userId,
				priority: h.priority,
				createdAt: now,
			});
		}

		return newEventId;
	},
});
// ============================================================
// MUTATIONS — hosts
// ============================================================

export const addHost = mutation({
	args: {
		eventId: v.id("events"),
		userId: v.id("users"),
		priority: v.union(v.literal("high"), v.literal("medium"), v.literal("low")),
	},
	handler: async (ctx, args) => {
		await requireAdmin(ctx);
		// Prevent duplicate host on same event
		const existing = await ctx.db
			.query("eventHosts")
			.withIndex("by_eventId_userId", (q) =>
				q.eq("eventId", args.eventId).eq("userId", args.userId),
			)
			.first();
		if (existing) throw new Error("Host déjà assigné à cet événement");

		return await ctx.db.insert("eventHosts", {
			eventId: args.eventId,
			userId: args.userId,
			priority: args.priority,
			createdAt: Date.now(),
		});
	},
});

export const removeHost = mutation({
	args: { eventHostId: v.id("eventHosts") },
	handler: async (ctx, { eventHostId }) => {
		await requireAdmin(ctx);
		const h = await ctx.db.get(eventHostId);
		if (!h) throw new Error("Host introuvable");
		await ctx.db.delete(eventHostId);
	},
});

export const updateHostPriority = mutation({
	args: {
		eventHostId: v.id("eventHosts"),
		priority: v.union(v.literal("high"), v.literal("medium"), v.literal("low")),
	},
	handler: async (ctx, { eventHostId, priority }) => {
		await requireAdmin(ctx);
		const h = await ctx.db.get(eventHostId);
		if (!h) throw new Error("Host introuvable");
		await ctx.db.patch(eventHostId, { priority });
		return eventHostId;
	},
});

// ============================================================
// QUERIES — admin : hosts + questions by event + users picker
// ============================================================

// List hosts of an event with denormalized user info (name/email/image).
export const listHostsByEvent = query({
	args: { eventId: v.id("events") },
	handler: async (ctx, { eventId }) => {
		await requireAdmin(ctx);
		const hosts = await ctx.db
			.query("eventHosts")
			.withIndex("by_eventId", (q) => q.eq("eventId", eventId))
			.collect();
		const out = [];
		for (const h of hosts) {
			const u = await ctx.db.get(h.userId);
			out.push({
				_id: h._id,
				eventId: h.eventId,
				userId: h.userId,
				priority: h.priority,
				createdAt: h.createdAt,
				user: u
					? { name: u.name, email: u.email ?? "", image: u.image }
					: undefined,
			});
		}
		return out;
	},
});

// List questions of an event ordered by `order` ascending.
export const listQuestionsByEvent = query({
	args: { eventId: v.id("events") },
	handler: async (ctx, { eventId }) => {
		await requireAdmin(ctx);
		return await ctx.db
			.query("eventQuestions")
			.withIndex("by_eventId_order", (q) => q.eq("eventId", eventId))
			.order("asc")
			.collect();
	},
});

// List all users available as event hosts (any role with email).
export const listAvailableHosts = query({
	args: {},
	handler: async (ctx) => {
		await requireAdmin(ctx);
		const users = await ctx.db.query("users").collect();
		return users
			.filter((u) => u.email)
			.map((u) => ({
				id: u._id,
				name: u.name ?? u.email ?? "Sans nom",
				email: u.email ?? "",
				image: u.image,
				role: u.role,
			}));
	},
});

// Replace-all questions for an event in a single transaction.
// Strategy: delete existing then re-insert in the provided order.
export const setQuestions = mutation({
	args: {
		eventId: v.id("events"),
		questions: v.array(
			v.object({
				type: v.union(
					v.literal("email"),
					v.literal("short_text"),
					v.literal("long_text"),
					v.literal("single_select"),
					v.literal("multi_select"),
					v.literal("yes_no"),
					v.literal("number"),
				),
				label: v.string(),
				required: v.boolean(),
				options: v.optional(v.array(v.string())),
				disqualifyingValues: v.optional(v.array(v.string())),
			}),
		),
	},
	handler: async (ctx, { eventId, questions }) => {
		await requireAdmin(ctx);
		const event = await ctx.db.get(eventId);
		if (!event) throw new Error("Événement introuvable");

		// Delete existing questions
		const existing = await ctx.db
			.query("eventQuestions")
			.withIndex("by_eventId", (q) => q.eq("eventId", eventId))
			.collect();
		for (const q of existing) {
			await ctx.db.delete(q._id);
		}

		// Re-insert in order
		for (let i = 0; i < questions.length; i++) {
			const q = questions[i];
			if (!q) continue;
			await ctx.db.insert("eventQuestions", {
				eventId,
				order: i,
				type: q.type,
				label: q.label,
				required: q.required,
				options: q.options,
				disqualifyingValues: q.disqualifyingValues,
			});
		}
	},
});
// Public query — list questions for a booking page (by slug, no auth).
export const listQuestionsPublic = query({
	args: { slug: v.string() },
	handler: async (ctx, { slug }) => {
		const event = await ctx.db
			.query("events")
			.withIndex("by_slug", (q) => q.eq("slug", slug))
			.first();
		if (!event || !event.isActive) return [];
		return await ctx.db
			.query("eventQuestions")
			.withIndex("by_eventId_order", (q) => q.eq("eventId", event._id))
			.order("asc")
			.collect();
	},
});
