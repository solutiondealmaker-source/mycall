// Bookings — the core engine.
//
// Architecture:
//   Public queries:  getAvailableDays, getAvailableSlotsStatic, getByCancelToken,
//                    getByRescheduleToken
//   Public mutations: createBookingChecked (action), cancelByToken, rescheduleByToken,
//                     trackPageView, capturePartialLead (in partialLeads.ts)
//   Admin mutations:  setOutcome, markNoShow, markCompleted, adminBookByCloser
//   Internal:         reserveBookingInternal, finalizeBookingInternal,
//                     rollbackBookingInternal, cleanupOrphanBookingsInternal
//
// Google Calendar sync (Phase 9):
//   V1 path: googleSyncStatus = "na" — no Google API calls.
//   Phase 9 will add the transactional reserve/finalize/rollback trio with real
//   Google API integration. All TODO markers are tagged // TODO Phase 9.

import { v } from "convex/values";
import { internal } from "./_generated/api";
import type { Doc, Id } from "./_generated/dataModel";
import type { MutationCtx, QueryCtx } from "./_generated/server";
import {
	action,
	internalMutation,
	internalQuery,
	mutation,
	query,
} from "./_generated/server";
import { _applyAutoPhase, _upsertLeadForBooking } from "./leads";
import { getAuthenticatedUser, isAdminUser } from "./lib/auth";
import { isDisqualified } from "./lib/disqualification";
import {
	computeSlotsForDay,
	type HostCtxForCompute,
	normalizeAlwaysAvailableDays,
	type SlotCandidate,
} from "./lib/slotComputation";
import { startOfDayInTz, zonedDowAndMinutes } from "./lib/tz";

// ============================================================
// CONSTANTS
// ============================================================

const PRIORITY_ORDER: Record<"high" | "medium" | "low", number> = {
	high: 0,
	medium: 1,
	low: 2,
};

const MS_PER_MIN = 60 * 1000;
const MS_PER_DAY = 24 * 60 * 60 * 1000;

// Seat hold window. A booking in googleSyncStatus="pending" is treated as a
// live conflict for 60s. After that, the orphan-cleanup cron flags it as failed.
// This window covers the Google API retry loop (worst case ~7s) plus headroom.
const PENDING_HOLD_MS = 60_000;

// Hard cap for alwaysAvailableDays — prevents infinite calendar generation.
const ALWAYS_AVAILABLE_MAX_DAYS = 365;

// ============================================================
// HELPERS — private
// ============================================================

function randomToken(): string {
	return crypto.randomUUID().replace(/-/g, "");
}

function startOfDayUTC(ts: number): number {
	const d = new Date(ts);
	d.setUTCHours(0, 0, 0, 0);
	return d.getTime();
}

// A booking counts as an active conflict unless it is a "pending" hold that has
// already expired. Non-pending rows (confirmed/rescheduled/cancelled) always
// count. This prevents race conditions where two parallel mutations both see
// each other's pending as skippable.
function isActiveSeatHold(b: {
	googleSyncStatus: Doc<"bookings">["googleSyncStatus"];
	_creationTime: number;
}): boolean {
	if (b.googleSyncStatus !== "pending") return true;
	return Date.now() - b._creationTime < PENDING_HOLD_MS;
}

// Write a row to the bookingActivityLog. Central so every mutation logs
// consistently and no field is accidentally omitted.
async function logBookingActivity(
	ctx: MutationCtx,
	args: {
		bookingId: Id<"bookings">;
		leadId?: Id<"leads"> | null;
		type: Doc<"bookingActivityLog">["type"];
		actorType: Doc<"bookingActivityLog">["actorType"];
		actorUserId?: Id<"users">;
		payload?: Record<string, unknown>;
	},
): Promise<void> {
	await ctx.db.insert("bookingActivityLog", {
		bookingId: args.bookingId,
		leadId: args.leadId ?? undefined,
		type: args.type,
		actorType: args.actorType,
		actorUserId: args.actorUserId,
		payload: args.payload ?? {},
		createdAt: Date.now(),
	});
}

// ============================================================
// SLOT HELPERS — shared between getAvailableDays + getAvailableSlotsStatic
// ============================================================

type BusyBlock = { start: number; end: number };

type HostCtxRich = {
	userId: Id<"users">;
	tz: string;
	windowsByDow: Map<number, { start: number; end: number }[]>;
	bookings: { startTime: number; endTime: number }[];
	googleBusy: BusyBlock[];
};

// Pre-fetch per-host context for slot computation. Parallelises all DB reads.
async function buildHostCtxs(
	ctx: QueryCtx | MutationCtx,
	hosts: Doc<"eventHosts">[],
	eventTz: string,
	dayStart: number,
	dayEnd: number,
): Promise<HostCtxRich[]> {
	return Promise.all(
		hosts.map(async (h): Promise<HostCtxRich> => {
			const [user, availRows, bookingRows, busyRows, calSettings] =
				await Promise.all([
					ctx.db.get(h.userId),
					ctx.db
						.query("userAvailability")
						.withIndex("by_userId", (q) => q.eq("userId", h.userId))
						.collect(),
					ctx.db
						.query("bookings")
						.withIndex("by_hostId_startTime", (q) =>
							q
								.eq("hostId", h.userId)
								.gte("startTime", dayStart - MS_PER_DAY)
								.lte("startTime", dayEnd + MS_PER_DAY),
						)
						.collect(),
					ctx.db
						.query("hostBusyBlocks")
						.withIndex("by_userId_start", (q) =>
							q
								.eq("userId", h.userId)
								.gte("start", dayStart - MS_PER_DAY)
								.lt("start", dayEnd + MS_PER_DAY),
						)
						.collect(),
					ctx.db
						.query("userCalendarSettings")
						.withIndex("by_userId", (q) => q.eq("userId", h.userId))
						.first(),
				]);

			const hostTz = user?.defaultTimezone ?? eventTz;

			const windowsByDow = new Map<number, { start: number; end: number }[]>();
			for (const r of availRows) {
				const list = windowsByDow.get(r.dayOfWeek) ?? [];
				list.push({ start: r.startMinute, end: r.endMinute });
				windowsByDow.set(r.dayOfWeek, list);
			}

			const activeBookings = bookingRows
				.filter(
					(b) =>
						(b.status === "confirmed" || b.status === "rescheduled") &&
						b.endTime > dayStart - MS_PER_DAY &&
						isActiveSeatHold(b),
				)
				.map((b) => ({ startTime: b.startTime, endTime: b.endTime }));

			// Filter Google busy blocks by the host's conflict-check calendar list.
			// Without settings, treat all blocks as relevant (safe default).
			let conflictCalIds: Set<string> | null = null;
			if (calSettings) {
				const ids = new Set(
					calSettings.conflictCheckCalendars.map((c) => c.calendarId),
				);
				if (calSettings.writerCalendarId) ids.add(calSettings.writerCalendarId);
				conflictCalIds = ids;
			}

			const googleBusy: BusyBlock[] = busyRows
				.filter((b) => b.start < dayEnd && b.end > dayStart)
				.filter((b) =>
					conflictCalIds ? conflictCalIds.has(b.calendarId) : true,
				)
				.map((b) => ({ start: b.start, end: b.end }));

			return {
				userId: h.userId,
				tz: hostTz,
				windowsByDow,
				bookings: activeBookings,
				googleBusy,
			};
		}),
	);
}

// Returns hosts that have at least one userAvailability row (and optionally
// filters to a single host for the reschedule path).
async function getEligibleHosts(
	ctx: QueryCtx | MutationCtx,
	eventId: Id<"events">,
	restrictToHostUserId?: Id<"users">,
): Promise<Doc<"eventHosts">[]> {
	const all = await ctx.db
		.query("eventHosts")
		.withIndex("by_eventId", (q) => q.eq("eventId", eventId))
		.collect();
	const candidates = restrictToHostUserId
		? all.filter((h) => h.userId === restrictToHostUserId)
		: all;

	const eligible: Doc<"eventHosts">[] = [];
	for (const h of candidates) {
		const hasAvail = await ctx.db
			.query("userAvailability")
			.withIndex("by_userId", (q) => q.eq("userId", h.userId))
			.first();
		if (hasAvail) eligible.push(h);
	}
	return eligible;
}

// ============================================================
// PUBLIC QUERIES
// ============================================================

export type { SlotCandidate };

// Returns array of day-of-month numbers (1–31) for which at least one slot
// exists in the given month/year. Used by the calendar picker.
export const getAvailableDays = query({
	args: {
		slug: v.string(),
		month: v.number(), // 0-indexed (Jan=0)
		year: v.number(),
		mode: v.optional(v.union(v.literal("new"), v.literal("reschedule"))),
		restrictToHostUserId: v.optional(v.id("users")),
	},
	handler: async (ctx, { slug, month, year, mode, restrictToHostUserId }) => {
		const event = await ctx.db
			.query("events")
			.withIndex("by_slug", (q) => q.eq("slug", slug))
			.first();
		if (!event || !event.isActive) return [];

		const hosts = await getEligibleHosts(ctx, event._id, restrictToHostUserId);
		if (hosts.length === 0) return [];

		// Build covered DOW set for cheap pre-filter
		const coveredDow = new Set<number>();
		for (const h of hosts) {
			const rows = await ctx.db
				.query("userAvailability")
				.withIndex("by_userId", (q) => q.eq("userId", h.userId))
				.collect();
			for (const r of rows) coveredDow.add(r.dayOfWeek);
		}

		const now = Date.now();
		const todayStart = startOfDayUTC(now);
		const eventTz = event.timezone;

		const effectiveRangeDays =
			mode === "reschedule"
				? (event.rescheduleRangeDays ?? event.rangeDays)
				: event.rangeDays;

		const rollingLimit =
			event.rangeType === "rolling" && effectiveRangeDays
				? todayStart + effectiveRangeDays * MS_PER_DAY
				: Number.POSITIVE_INFINITY;

		const alwaysOpenDows = new Set(
			normalizeAlwaysAvailableDays(event.alwaysAvailableDays),
		);
		const safetyLimit = todayStart + ALWAYS_AVAILABLE_MAX_DAYS * MS_PER_DAY;
		const minimumNoticeMs = (event.minimumNoticeHours ?? 0) * 60 * MS_PER_MIN;
		const earliestAllowedDay = startOfDayUTC(now + minimumNoticeMs);

		const daysInMonth = new Date(year, month + 1, 0).getDate();
		const out: number[] = [];

		for (let day = 1; day <= daysInMonth; day++) {
			const ts = Date.UTC(year, month, day);
			if (ts < todayStart) continue;
			if (ts < earliestAllowedDay) continue;

			const dow = new Date(ts).getUTCDay();

			if (ts > rollingLimit) {
				if (!alwaysOpenDows.has(dow) || ts > safetyLimit) continue;
			}

			if (event.businessDaysOnly && (dow === 0 || dow === 6)) continue;
			if (!coveredDow.has(dow)) continue;

			out.push(day);
		}

		return out;
	},
});

// Returns available slot candidates for a specific day click.
export const getAvailableSlotsStatic = query({
	args: {
		slug: v.string(),
		dateMs: v.number(), // Date.UTC(y, m, d) — tz-naive day marker from client
		mode: v.optional(v.union(v.literal("new"), v.literal("reschedule"))),
		restrictToHostUserId: v.optional(v.id("users")),
	},
	handler: async (
		ctx,
		{ slug, dateMs, mode, restrictToHostUserId },
	): Promise<SlotCandidate[]> => {
		const event = await ctx.db
			.query("events")
			.withIndex("by_slug", (q) => q.eq("slug", slug))
			.first();
		if (!event || !event.isActive) return [];

		const hosts = await getEligibleHosts(ctx, event._id, restrictToHostUserId);
		if (hosts.length === 0) return [];

		const now = Date.now();
		const eventTz = event.timezone;

		// Day boundaries in the event's presentation timezone (gotcha G1).
		const dayStart = startOfDayInTz(dateMs, eventTz);
		const dayEnd = startOfDayInTz(dateMs + MS_PER_DAY, eventTz);

		if (dayEnd <= now) return [];

		// Rolling window check — mirrors validateSlotGuards (gotcha G2).
		const effectiveRangeDays =
			mode === "reschedule"
				? (event.rescheduleRangeDays ?? event.rangeDays)
				: event.rangeDays;
		const alwaysOpenDows = new Set(
			normalizeAlwaysAvailableDays(event.alwaysAvailableDays),
		);
		if (event.rangeType === "rolling" && effectiveRangeDays) {
			const todayStart = startOfDayInTz(now, eventTz);
			const windowEnd = todayStart + effectiveRangeDays * MS_PER_DAY;
			const safetyLimit = todayStart + ALWAYS_AVAILABLE_MAX_DAYS * MS_PER_DAY;
			if (dayStart > windowEnd) {
				const { dow: dayDow } = zonedDowAndMinutes(
					dayStart + 12 * 60 * MS_PER_MIN,
					eventTz,
				);
				if (!alwaysOpenDows.has(dayDow) || dayStart > safetyLimit) return [];
			}
		}

		if (event.businessDaysOnly) {
			const { dow } = zonedDowAndMinutes(
				dayStart + 12 * 60 * MS_PER_MIN,
				eventTz,
			);
			if (dow === 0 || dow === 6) return [];
		}

		const minimumNoticeMs = (event.minimumNoticeHours ?? 0) * 60 * MS_PER_MIN;
		const earliestAllowed = now + minimumNoticeMs;
		const cutoff = Math.max(earliestAllowed, now + 30 * MS_PER_MIN);

		const hostCtxs = await buildHostCtxs(ctx, hosts, eventTz, dayStart, dayEnd);

		return computeSlotsForDay({
			dayStart,
			cutoff,
			durationMin: event.durationMinutes,
			bufferBeforeMs: (event.bufferBeforeMinutes ?? 0) * MS_PER_MIN,
			bufferAfterMs: (event.bufferAfterMinutes ?? 0) * MS_PER_MIN,
			slotIncrementMin: event.slotIncrementMinutes ?? 15,
			timeFormat: event.timeFormat ?? "h24",
			hosts: hostCtxs.map(
				(hc): HostCtxForCompute => ({
					tz: hc.tz,
					windowsByDow: hc.windowsByDow,
					bookings: hc.bookings,
					googleBusy: hc.googleBusy,
				}),
			),
		});
	},
});

// Token-based queries — public (no auth), used by /book/manage/[token] pages.
export const getByCancelToken = query({
	args: { token: v.string() },
	handler: async (ctx, { token }) => {
		const b = await ctx.db
			.query("bookings")
			.withIndex("by_cancelToken", (q) => q.eq("cancelToken", token))
			.first();
		if (!b) return null;
		// Projection publique (M1) : n'exposer au prospect que le strict nécessaire.
		// Jamais les champs internes (autre token, hostId, leadId, issue/montant,
		// cancelReason…) qui fuitaient via le doc complet.
		return {
			_id: b._id,
			status: b.status,
			startTime: b.startTime,
			timezone: b.timezone,
			eventSlug: b.eventSlug,
		};
	},
});

export const getByRescheduleToken = query({
	args: { token: v.string() },
	handler: async (ctx, { token }) => {
		const b = await ctx.db
			.query("bookings")
			.withIndex("by_rescheduleToken", (q) => q.eq("rescheduleToken", token))
			.first();
		if (!b) return null;
		// Projection publique (M1). hostId est requis pour restreindre la
		// reprogrammation au même host ; id opaque, pas une donnée sensible.
		return {
			_id: b._id,
			status: b.status,
			startTime: b.startTime,
			timezone: b.timezone,
			eventSlug: b.eventSlug,
			hostId: b.hostId,
		};
	},
});

// ============================================================
// PREFLIGHT + SLOT VALIDATION
// ============================================================

// Server-side hard guards applied to every booking attempt.
// Returns { ok: true, event } on pass, { ok: false, reason } on fail.
// `bypassWindowGuard=true` used by adminBookByCloser to schedule beyond the
// prospect-facing rolling window.
async function preflightBooking(
	ctx: MutationCtx,
	args: {
		slug: string;
		startTime: number;
		phone: string;
		email?: string;
		formAnswers?: string;
		bypassClientGuards?: boolean;
		bypassWindowGuard?: boolean;
		mode?: "new" | "reschedule";
	},
): Promise<{ ok: true; event: Doc<"events"> } | { ok: false; reason: string }> {
	const event = await ctx.db
		.query("events")
		.withIndex("by_slug", (q) => q.eq("slug", args.slug))
		.first();
	if (!event || !event.isActive)
		return { ok: false, reason: "Événement indisponible" };

	const guards = validateSlotGuards(event, args.startTime, args.mode ?? "new", {
		bypassWindowGuard: args.bypassWindowGuard,
	});
	if (!guards.ok) return guards;

	if (
		!args.bypassClientGuards &&
		event.disqualificationRules &&
		event.disqualificationRules.length > 0 &&
		args.formAnswers
	) {
		try {
			const parsed = JSON.parse(args.formAnswers) as Record<
				string,
				string | string[] | undefined
			>;
			if (isDisqualified(event.disqualificationRules, parsed)) {
				return { ok: false, reason: "Profil non qualifié pour cet événement" };
			}
		} catch {
			// JSON parse failure — skip disqualification check
		}
	}

	if (!args.bypassClientGuards && event.preventDoubleBooking === true) {
		const matches: Doc<"bookings">[] = [];
		if (args.email) {
			const byEmail = await ctx.db
				.query("bookings")
				.withIndex("by_eventId_email", (q) =>
					q.eq("eventId", event._id).eq("prospectEmail", args.email),
				)
				.collect();
			matches.push(...byEmail);
		}
		const byPhone = await ctx.db
			.query("bookings")
			.withIndex("by_eventId_phone", (q) =>
				q.eq("eventId", event._id).eq("prospectPhone", args.phone),
			)
			.collect();
		matches.push(...byPhone);
		if (
			matches.some(
				(b) =>
					(b.status === "confirmed" || b.status === "rescheduled") &&
					isActiveSeatHold(b),
			)
		) {
			return {
				ok: false,
				reason: "Un rendez-vous existe déjà pour ce contact sur cet événement",
			};
		}
	}

	return { ok: true, event };
}

// Mirror of the UI slot-guard logic. Must stay in sync with getAvailableSlotsStatic
// to prevent a slot being shown in the UI but rejected server-side (gotcha G2).
function validateSlotGuards(
	event: Doc<"events">,
	startTime: number,
	mode: "new" | "reschedule" = "new",
	opts: { bypassWindowGuard?: boolean } = {},
): { ok: true } | { ok: false; reason: string } {
	const nowMs = Date.now();
	if (startTime <= nowMs) return { ok: false, reason: "Créneau dans le passé" };

	const minimumNoticeMs = (event.minimumNoticeHours ?? 0) * 60 * MS_PER_MIN;
	if (minimumNoticeMs > 0 && startTime < nowMs + minimumNoticeMs) {
		return {
			ok: false,
			reason: "Créneau trop proche (délai minimum non respecté)",
		};
	}

	const eventTz = event.timezone;

	const effectiveRangeDays =
		mode === "reschedule"
			? (event.rescheduleRangeDays ?? event.rangeDays)
			: event.rangeDays;

	if (
		!opts.bypassWindowGuard &&
		event.rangeType === "rolling" &&
		effectiveRangeDays
	) {
		const todayStart = startOfDayInTz(nowMs, eventTz);
		const windowEnd = todayStart + effectiveRangeDays * MS_PER_DAY;
		const slotDayStart = startOfDayInTz(startTime, eventTz);
		if (slotDayStart > windowEnd) {
			const { dow: slotDow } = zonedDowAndMinutes(startTime, eventTz);
			const alwaysOpenDows = new Set(
				normalizeAlwaysAvailableDays(event.alwaysAvailableDays),
			);
			const safetyLimit = todayStart + ALWAYS_AVAILABLE_MAX_DAYS * MS_PER_DAY;
			if (!alwaysOpenDows.has(slotDow) || slotDayStart > safetyLimit) {
				return { ok: false, reason: "Créneau hors de la période autorisée" };
			}
		}
	}

	if (event.businessDaysOnly) {
		const { dow } = zonedDowAndMinutes(startTime, event.timezone);
		if (dow === 0 || dow === 6) {
			return {
				ok: false,
				reason: "Créneau sur un weekend (jours ouvrables uniquement)",
			};
		}
	}

	return { ok: true };
}

// ============================================================
// HOST RESOLUTION — priority + round-robin
// ============================================================

export type ResolveHostResult =
	| {
			ok: true;
			hostId: Id<"users">;
			hostName: string | null;
			hostEmail: string | null;
	  }
	| { ok: false; reason: string };

// Resolves the best available host for a slot. Applies:
//   1. Availability window check (DOW + minutes in host TZ)
//   2. Booking conflict check (with buffer, isActiveSeatHold)
//   3. Google busy block check
//   4. Priority filter (hard — only top tier enters round-robin)
//   5. Round-robin (by 7-day count) or manual (by week count)
//
// `preferredHostId` is used when rescheduleWithSameHost=true.
// `excludeBookingId` prevents a booking from colliding with itself on reschedule.
async function resolveAvailableHost(
	ctx: MutationCtx,
	args: {
		event: Doc<"events">;
		startTime: number;
		endTime: number;
		excludeBookingId?: Id<"bookings">;
		preferredHostId?: Id<"users">;
	},
): Promise<ResolveHostResult> {
	const { event, startTime, endTime, excludeBookingId, preferredHostId } = args;
	const eventTz = event.timezone;
	const bufferBefore = (event.bufferBeforeMinutes ?? 0) * MS_PER_MIN;
	const bufferAfter = (event.bufferAfterMinutes ?? 0) * MS_PER_MIN;

	const hostRows = await ctx.db
		.query("eventHosts")
		.withIndex("by_eventId", (q) => q.eq("eventId", event._id))
		.collect();
	if (hostRows.length === 0) {
		return { ok: false, reason: "Aucun hôte configuré pour cet événement" };
	}

	// Sort by priority ascending (high=0 first)
	const sortedHosts = [...hostRows].sort(
		(a, b) => PRIORITY_ORDER[a.priority] - PRIORITY_ORDER[b.priority],
	);

	const weekStart = startTime - 7 * MS_PER_DAY;

	type Candidate = {
		userId: Id<"users">;
		priority: "high" | "medium" | "low";
		weekCount: number;
	};
	const candidates: Candidate[] = [];

	for (const h of sortedHosts) {
		// 1. Availability window
		const hostUser = await ctx.db.get(h.userId);
		const hostTz = hostUser?.defaultTimezone ?? eventTz;
		const { dow: hostDow, minutesOfDay: hostStartMin } = zonedDowAndMinutes(
			startTime,
			hostTz,
		);
		const { dow: hostEndDow, minutesOfDay: hostEndMinExclusive } =
			zonedDowAndMinutes(endTime - 1, hostTz);
		// Slot crossing midnight in host TZ is invalid (gotcha G4)
		if (hostDow !== hostEndDow) continue;
		const hostEndMin = hostEndMinExclusive + 1;

		const windows = await ctx.db
			.query("userAvailability")
			.withIndex("by_userId_dayOfWeek", (q) =>
				q.eq("userId", h.userId).eq("dayOfWeek", hostDow),
			)
			.collect();
		const inWindow = windows.some(
			(w) => hostStartMin >= w.startMinute && hostEndMin <= w.endMinute,
		);
		if (!inWindow) continue;

		// 2. Booking conflict check (±2 days bounded scan)
		const existing = await ctx.db
			.query("bookings")
			.withIndex("by_hostId_startTime", (q) =>
				q
					.eq("hostId", h.userId)
					.gte("startTime", startTime - 2 * MS_PER_DAY)
					.lt("startTime", startTime + 2 * MS_PER_DAY),
			)
			.collect();

		const nearby = existing.filter(
			(b) =>
				(b.status === "confirmed" || b.status === "rescheduled") &&
				(excludeBookingId ? b._id !== excludeBookingId : true) &&
				isActiveSeatHold(b),
		);
		const hasBookingConflict = nearby.some((b) => {
			const bStart = b.startTime - bufferBefore;
			const bEnd = b.endTime + bufferAfter;
			return startTime < bEnd && endTime > bStart;
		});
		if (hasBookingConflict) continue;

		// 3. Google busy block check
		const calSettings = await ctx.db
			.query("userCalendarSettings")
			.withIndex("by_userId", (q) => q.eq("userId", h.userId))
			.first();
		let conflictCalIds: Set<string> | null = null;
		if (calSettings) {
			const ids = new Set(
				calSettings.conflictCheckCalendars.map((c) => c.calendarId),
			);
			if (calSettings.writerCalendarId) ids.add(calSettings.writerCalendarId);
			conflictCalIds = ids;
		}
		const busyRows = await ctx.db
			.query("hostBusyBlocks")
			.withIndex("by_userId_start", (q) =>
				q
					.eq("userId", h.userId)
					.gte("start", startTime - MS_PER_DAY)
					.lt("start", startTime + MS_PER_DAY),
			)
			.collect();
		const relevantBusy = busyRows.filter((b) =>
			conflictCalIds ? conflictCalIds.has(b.calendarId) : true,
		);
		if (
			relevantBusy.some(
				(b) =>
					b.start < endTime + bufferAfter && b.end > startTime - bufferBefore,
			)
		) {
			continue;
		}

		// Count bookings in the last 7 days (for round-robin / manual tiebreak)
		const weekCount = existing.filter(
			(b) =>
				(b.status === "confirmed" || b.status === "rescheduled") &&
				b.startTime >= weekStart &&
				b.startTime < startTime &&
				(excludeBookingId ? b._id !== excludeBookingId : true) &&
				isActiveSeatHold(b),
		).length;

		candidates.push({ userId: h.userId, priority: h.priority, weekCount });
	}

	if (candidates.length === 0) {
		return { ok: false, reason: "Aucun hôte disponible sur ce créneau" };
	}

	// rescheduleWithSameHost — prefer original host if still eligible
	if (preferredHostId) {
		const preferred = candidates.find((c) => c.userId === preferredHostId);
		if (preferred) {
			const user = await ctx.db.get(preferred.userId);
			return {
				ok: true,
				hostId: preferred.userId,
				hostName: user?.name ?? null,
				hostEmail: user?.email ?? null,
			};
		}
	}

	// Priority is a hard filter — only top tier enters distribution
	const topPriority = candidates[0]!.priority;
	const topTier = candidates.filter((c) => c.priority === topPriority);

	const priorityMode = event.priorityMode ?? "manual";
	let selected: Candidate;

	if (priorityMode === "round_robin") {
		// Count bookings over the rolling 7-day window for each top-tier candidate
		const sevenDaysAgo = startTime - 7 * MS_PER_DAY;
		const withCounts = await Promise.all(
			topTier.map(async (c) => {
				const recent = await ctx.db
					.query("bookings")
					.withIndex("by_hostId_startTime", (q) =>
						q
							.eq("hostId", c.userId)
							.gte("startTime", sevenDaysAgo)
							.lte("startTime", startTime),
					)
					.collect();
				const recentCount = recent.filter(
					(b) =>
						(b.status === "confirmed" || b.status === "rescheduled") &&
						(excludeBookingId ? b._id !== excludeBookingId : true) &&
						isActiveSeatHold(b),
				).length;
				return { ...c, recentCount };
			}),
		);
		// Min count wins; alphabetical userId as deterministic tiebreak under concurrency
		withCounts.sort((a, b) => {
			if (a.recentCount !== b.recentCount) return a.recentCount - b.recentCount;
			return String(a.userId).localeCompare(String(b.userId));
		});
		const pick = withCounts[0]!;
		selected = {
			userId: pick.userId,
			priority: pick.priority,
			weekCount: pick.weekCount,
		};
	} else {
		// Manual: least-booked this week in top tier
		const sorted = [...topTier].sort((a, b) => a.weekCount - b.weekCount);
		selected = sorted[0]!;
	}

	const user = await ctx.db.get(selected.userId);
	return {
		ok: true,
		hostId: selected.userId,
		hostName: user?.name ?? null,
		hostEmail: user?.email ?? null,
	};
}

// ============================================================
// BOOKING CREATION — V1 (no Google, direct confirm)
// ============================================================
// V1 path: googleSyncStatus = "na" — booking is confirmed immediately.
// Phase 9 will introduce the transactional reserve/finalize/rollback trio
// with real Google Meet creation. The action shell below is already wired
// for that migration.

type InsertBookingResult = {
	bookingId: Id<"bookings">;
	hostId: Id<"users">;
	hostName: string | null;
	hostEmail: string | null;
	startTime: number;
	endTime: number;
	cancelToken: string;
	rescheduleToken: string;
	googleSyncStatus: Doc<"bookings">["googleSyncStatus"];
	partialLeadId?: Id<"partialLeads">;
};

async function insertBookingRow(
	ctx: MutationCtx,
	args: {
		event: Doc<"events">;
		startTime: number;
		endTime: number;
		firstName: string;
		lastName: string;
		phone: string;
		email?: string;
		formAnswers?: string;
		sessionId?: string;
		timezone: string;
		googleSyncStatus: Doc<"bookings">["googleSyncStatus"];
		excludeBookingId?: Id<"bookings">;
		preferredHostId?: Id<"users">;
	},
): Promise<InsertBookingResult | { error: string }> {
	const resolved = await resolveAvailableHost(ctx, {
		event: args.event,
		startTime: args.startTime,
		endTime: args.endTime,
		excludeBookingId: args.excludeBookingId,
		preferredHostId: args.preferredHostId,
	});
	if (!resolved.ok) return { error: resolved.reason };

	// Resolve partialLead link by sessionId if provided
	let partialLeadId: Id<"partialLeads"> | undefined;
	if (args.sessionId) {
		const partial = await ctx.db
			.query("partialLeads")
			.withIndex("by_sessionId", (q) => q.eq("sessionId", args.sessionId!))
			.first();
		if (partial) partialLeadId = partial._id;
	}

	const now = Date.now();
	const cancelToken = randomToken();
	const rescheduleToken = randomToken();
	const prospectName = `${args.firstName} ${args.lastName}`.trim();

	const bookingId = await ctx.db.insert("bookings", {
		eventId: args.event._id,
		eventSlug: args.event.slug,
		hostId: resolved.hostId,
		partialLeadId,
		prospectFirstName: args.firstName,
		prospectLastName: args.lastName,
		prospectName,
		prospectEmail: args.email,
		prospectPhone: args.phone,
		startTime: args.startTime,
		endTime: args.endTime,
		timezone: args.timezone,
		googleSyncStatus: args.googleSyncStatus,
		googleSyncStartedAt: args.googleSyncStatus === "pending" ? now : undefined,
		googleSyncedAt: args.googleSyncStatus === "na" ? now : undefined,
		status: "confirmed",
		tenue: "planifie",
		issue: "en_attente",
		cancelToken,
		rescheduleToken,
	});

	return {
		bookingId,
		hostId: resolved.hostId,
		hostName: resolved.hostName,
		hostEmail: resolved.hostEmail,
		startTime: args.startTime,
		endTime: args.endTime,
		cancelToken,
		rescheduleToken,
		googleSyncStatus: args.googleSyncStatus,
		partialLeadId,
	};
}

// Link the lead + partialLead + write audit log. Called once per confirmed booking.
async function commitBookingLead(
	ctx: MutationCtx,
	args: {
		bookingId: Id<"bookings">;
		event: Doc<"events">;
		startTime: number;
		hostUserId: Id<"users">;
		firstName: string;
		lastName: string;
		phone: string;
		email?: string;
		formAnswers?: string;
		partialLeadId?: Id<"partialLeads">;
	},
): Promise<Id<"leads">> {
	const leadId = await _upsertLeadForBooking(ctx, {
		eventId: args.event._id,
		eventSlug: args.event.slug,
		eventSetterId: args.event.setterId,
		eventTagSource: args.event.tagSource,
		firstName: args.firstName,
		lastName: args.lastName,
		phone: args.phone,
		email: args.email,
		formAnswers: args.formAnswers,
		startTime: args.startTime,
		hostUserId: args.hostUserId,
	});

	const now = Date.now();
	await ctx.db.patch(args.bookingId, { leadId });

	if (args.partialLeadId) {
		await ctx.db.patch(args.partialLeadId, {
			bookingId: args.bookingId,
			promotedLeadId: leadId,
			lastUpdatedAt: now,
		});
	}

	await logBookingActivity(ctx, {
		bookingId: args.bookingId,
		leadId,
		type: "created",
		actorType: "prospect",
		payload: { newStartTime: args.startTime },
	});

	return leadId;
}

// ============================================================
// createBookingChecked — public action (Phase 9: Google integration)
// ============================================================
// Entry point for the booking form submit.
//
// Flow Phase 9 :
//   1. reserveBookingInternal("pending") — seat hold atomique
//   2. Vérifier si l'hôte résolu a Google actif (writer + channel)
//   3a. Si oui → createGoogleEventAndReturnInternal (3 retries) → finalize ou rollback
//   3b. Si non → finalizeAsNaInternal (patch "na" + commit lead)
//
// Fail-closed (G5) : hôte avec Google mais channel expiré → path "na"
export const createBookingChecked = action({
	args: {
		slug: v.string(),
		sessionId: v.optional(v.string()),
		startTime: v.number(),
		firstName: v.string(),
		lastName: v.string(),
		phone: v.string(),
		email: v.optional(v.string()),
		formAnswers: v.optional(v.string()),
		timezone: v.string(),
	},
	handler: async (
		ctx,
		args,
	): Promise<
		| { ok: false; error: string }
		| {
				ok: true;
				bookingId: Id<"bookings">;
				hostId: Id<"users">;
				hostName: string | null;
				hostEmail: string | null;
				startTime: number;
				endTime: number;
				cancelToken: string;
				rescheduleToken: string;
				googleMeetUrl: string | null;
		  }
	> => {
		// Phase 1 — Reserve (seat hold atomique, googleSyncStatus="pending")
		const reservation = (await ctx.runMutation(
			internal.bookings.reserveBookingInternal,
			{ ...args, googleSyncStatus: "pending" },
		)) as InsertBookingResult | { error: string };

		if ("error" in reservation) {
			return { ok: false as const, error: reservation.error };
		}

		// Vérifier si l'hôte a Google actif
		const hostStatus = (await ctx.runQuery(
			internal.bookings.getHostGoogleStatusInternal,
			{ hostId: reservation.hostId },
		)) as { hasActiveGoogle: boolean };

		// Si pas de Google → finaliser directement en "na"
		if (!hostStatus.hasActiveGoogle) {
			await ctx.runMutation(internal.bookings.finalizeAsNaInternal, {
				bookingId: reservation.bookingId,
			});
			return {
				ok: true as const,
				bookingId: reservation.bookingId,
				hostId: reservation.hostId,
				hostName: reservation.hostName,
				hostEmail: reservation.hostEmail,
				startTime: reservation.startTime,
				endTime: reservation.endTime,
				cancelToken: reservation.cancelToken,
				rescheduleToken: reservation.rescheduleToken,
				googleMeetUrl: null as null,
			};
		}

		// Phase 2 — Créer l'event Google (3 tentatives, backoff exponentiel)
		type GoogleInfo = {
			googleEventId: string;
			googleMeetUrl: string | null;
			googleCalendarId: string;
			googleAccountId: Id<"userGoogleAccounts">;
		};
		let googleInfo: GoogleInfo | null = null;
		let lastError: string | null = null;

		for (let attempt = 1; attempt <= 3; attempt++) {
			try {
				googleInfo = await ctx.runAction(
					internal.googleActions.createGoogleEventAndReturnInternal,
					{ bookingId: reservation.bookingId },
				);
				if (googleInfo) break;
			} catch (e) {
				const msg = e instanceof Error ? e.message : String(e);
				lastError = msg;
				const statusMatch = msg.match(/Google API http (\d{3})/);
				const status = statusMatch?.[1]
					? Number.parseInt(statusMatch[1], 10)
					: 0;
				const retriable = status
					? status === 429 || status >= 500
					: msg.toLowerCase().includes("timeout") ||
						msg.toLowerCase().includes("network") ||
						msg.toLowerCase().includes("fetch failed");
				if (!retriable || attempt === 3) {
					console.warn(
						`[createBookingChecked] Google failed (attempt ${attempt}/3): ${msg.slice(0, 200)}`,
					);
					break;
				}
				// Backoff : 500ms → 1500ms → 4500ms
				await new Promise((r) => setTimeout(r, 500 * 3 ** (attempt - 1)));
			}
		}

		if (!googleInfo) {
			// Rollback — le lead n'est jamais lié avant finalize
			await ctx.runMutation(internal.bookings.rollbackBookingInternal, {
				bookingId: reservation.bookingId,
				reason: lastError ?? "google_event_create_failed",
			});
			return {
				ok: false as const,
				error:
					"La réservation a échoué — le lien Google Meet n'a pas pu être généré. Merci de réessayer dans un instant.",
			};
		}

		// Phase 3 — Finalize (patch booking + upsert lead)
		await ctx.runMutation(internal.bookings.finalizeBookingInternal, {
			bookingId: reservation.bookingId,
			googleEventId: googleInfo.googleEventId,
			googleMeetUrl: googleInfo.googleMeetUrl ?? undefined,
			googleCalendarId: googleInfo.googleCalendarId,
			googleAccountId: googleInfo.googleAccountId,
		});

		// Phase 12 — Dispatch notifications (confirmation prospect + notification host)
		await ctx.scheduler.runAfter(
			0,
			internal.notifyDispatch.dispatchBookingCreated,
			{ bookingId: reservation.bookingId },
		);

		return {
			ok: true as const,
			bookingId: reservation.bookingId,
			hostId: reservation.hostId,
			hostName: reservation.hostName,
			hostEmail: reservation.hostEmail,
			startTime: reservation.startTime,
			endTime: reservation.endTime,
			cancelToken: reservation.cancelToken,
			rescheduleToken: reservation.rescheduleToken,
			googleMeetUrl: googleInfo.googleMeetUrl,
		};
	},
});

// ============================================================
// INTERNAL MUTATIONS — reserve / finalize / rollback
// ============================================================

// V1 combined path — reserve + finalize in one mutation (no Google).
export const reserveAndFinalizeV1 = internalMutation({
	args: {
		slug: v.string(),
		sessionId: v.optional(v.string()),
		startTime: v.number(),
		firstName: v.string(),
		lastName: v.string(),
		phone: v.string(),
		email: v.optional(v.string()),
		formAnswers: v.optional(v.string()),
		timezone: v.string(),
	},
	handler: async (
		ctx,
		args,
	): Promise<InsertBookingResult | { error: string }> => {
		const pre = await preflightBooking(ctx, {
			slug: args.slug,
			startTime: args.startTime,
			phone: args.phone,
			email: args.email,
			formAnswers: args.formAnswers,
		});
		if (!pre.ok) return { error: pre.reason };
		const event = pre.event;
		const endTime = args.startTime + event.durationMinutes * MS_PER_MIN;

		const insert = await insertBookingRow(ctx, {
			event,
			startTime: args.startTime,
			endTime,
			firstName: args.firstName,
			lastName: args.lastName,
			phone: args.phone,
			email: args.email,
			formAnswers: args.formAnswers,
			sessionId: args.sessionId,
			timezone: args.timezone,
			// V1: no Google — confirm directly
			googleSyncStatus: "na",
		});
		if ("error" in insert) return insert;

		// Commit lead immediately (no async Google step in V1)
		await commitBookingLead(ctx, {
			bookingId: insert.bookingId,
			event,
			startTime: args.startTime,
			hostUserId: insert.hostId,
			firstName: args.firstName,
			lastName: args.lastName,
			phone: args.phone,
			email: args.email,
			formAnswers: args.formAnswers,
			partialLeadId: insert.partialLeadId,
		});

		// Phase 12: dispatch confirmation + host notification emails
		// Scheduled AFTER the booking row + lead are committed (ordering gotcha)
		await ctx.scheduler.runAfter(
			0,
			internal.notifyDispatch.dispatchBookingCreated,
			{
				bookingId: insert.bookingId,
			},
		);

		return insert;
	},
});

// TODO Phase 9: Two-phase reserve — inserts booking with googleSyncStatus="pending".
// Does NOT touch the lead. Called by the action BEFORE the Google API call.
export const reserveBookingInternal = internalMutation({
	args: {
		slug: v.string(),
		sessionId: v.optional(v.string()),
		startTime: v.number(),
		firstName: v.string(),
		lastName: v.string(),
		phone: v.string(),
		email: v.optional(v.string()),
		formAnswers: v.optional(v.string()),
		timezone: v.string(),
		// "pending" when host has Google; "na" when no Google configured
		googleSyncStatus: v.union(v.literal("pending"), v.literal("na")),
	},
	handler: async (
		ctx,
		args,
	): Promise<InsertBookingResult | { error: string }> => {
		const pre = await preflightBooking(ctx, {
			slug: args.slug,
			startTime: args.startTime,
			phone: args.phone,
			email: args.email,
			formAnswers: args.formAnswers,
		});
		if (!pre.ok) return { error: pre.reason };
		const event = pre.event;
		const endTime = args.startTime + event.durationMinutes * MS_PER_MIN;

		const result = await insertBookingRow(ctx, {
			event,
			startTime: args.startTime,
			endTime,
			firstName: args.firstName,
			lastName: args.lastName,
			phone: args.phone,
			email: args.email,
			formAnswers: args.formAnswers,
			sessionId: args.sessionId,
			timezone: args.timezone,
			googleSyncStatus: args.googleSyncStatus,
		});
		if ("error" in result) return result;

		// For "na" (no Google needed) — commit lead right away
		if (args.googleSyncStatus === "na") {
			await commitBookingLead(ctx, {
				bookingId: result.bookingId,
				event,
				startTime: args.startTime,
				hostUserId: result.hostId,
				firstName: args.firstName,
				lastName: args.lastName,
				phone: args.phone,
				email: args.email,
				formAnswers: args.formAnswers,
				partialLeadId: result.partialLeadId,
			});
		}

		return result;
	},
});

// TODO Phase 9: Patch booking → synced + commit lead after Google success.
export const finalizeBookingInternal = internalMutation({
	args: {
		bookingId: v.id("bookings"),
		googleEventId: v.string(),
		googleMeetUrl: v.optional(v.string()),
		googleCalendarId: v.string(),
		googleAccountId: v.optional(v.id("userGoogleAccounts")),
	},
	handler: async (ctx, args) => {
		const booking = await ctx.db.get(args.bookingId);
		if (!booking) throw new Error("Réservation introuvable");
		// Idempotent — safe to call multiple times
		if (booking.googleSyncStatus === "synced") return;

		const event = await ctx.db.get(booking.eventId);
		if (!event) throw new Error("Événement introuvable");

		const now = Date.now();
		await ctx.db.patch(args.bookingId, {
			googleEventId: args.googleEventId,
			googleMeetUrl: args.googleMeetUrl,
			googleCalendarId: args.googleCalendarId,
			googleAccountId: args.googleAccountId,
			googleSyncStatus: "synced",
			googleSyncedAt: now,
		});

		await commitBookingLead(ctx, {
			bookingId: args.bookingId,
			event,
			startTime: booking.startTime,
			hostUserId: booking.hostId,
			firstName: booking.prospectFirstName,
			lastName: booking.prospectLastName,
			phone: booking.prospectPhone,
			email: booking.prospectEmail,
			formAnswers: undefined,
			partialLeadId: booking.partialLeadId,
		});
	},
});

// TODO Phase 9: DELETE booking row if still pending after Google hard fail.
// Lead is never touched because commitBookingLead hasn't run yet.
export const rollbackBookingInternal = internalMutation({
	args: { bookingId: v.id("bookings"), reason: v.optional(v.string()) },
	handler: async (ctx, { bookingId, reason }) => {
		const booking = await ctx.db.get(bookingId);
		if (!booking) return { rolledBack: false };
		// Safety: only delete if still in the pending window
		if (booking.googleSyncStatus !== "pending") return { rolledBack: false };
		// Clean any audit rows (defensive)
		const auditRows = await ctx.db
			.query("bookingActivityLog")
			.withIndex("by_booking", (q) => q.eq("bookingId", bookingId))
			.collect();
		for (const a of auditRows) await ctx.db.delete(a._id);
		await ctx.db.delete(bookingId);
		console.warn(
			`[rollbackBookingInternal] deleted booking=${bookingId} reason=${reason ?? "unknown"}`,
		);
		return { rolledBack: true };
	},
});

// Cron entry point — flag bookings stuck in "pending" > 2 min (gotcha G5).
// These are orphans from actions that crashed before rollback could run.
export const cleanupOrphanBookingsInternal = internalMutation({
	args: {},
	handler: async (ctx) => {
		const now = Date.now();
		const staleCutoff = now - 2 * 60 * 1000; // 2 min
		const stuck = await ctx.db
			.query("bookings")
			.withIndex("by_googleSyncStatus", (q) =>
				q.eq("googleSyncStatus", "pending"),
			)
			.collect();
		let flagged = 0;
		for (const b of stuck) {
			const startedAt = b.googleSyncStartedAt ?? b._creationTime;
			if (startedAt > staleCutoff) continue;
			await ctx.db.patch(b._id, {
				googleSyncStatus: "failed",
			});
			flagged++;
			console.warn(
				`[cleanupOrphanBookings] flagged booking=${b._id} stuck for ${Math.round((now - startedAt) / 1000)}s`,
			);
		}
		return { flagged };
	},
});

// ============================================================
// PUBLIC MUTATIONS — cancel + reschedule via tokens
// ============================================================

// Cancel a booking via the public cancel link. No auth required — secured by
// opaque 32-char token. Idempotent (double-cancel returns ok).
export const cancelByToken = mutation({
	args: {
		token: v.string(),
		reason: v.optional(v.string()),
	},
	handler: async (ctx, { token, reason }) => {
		const booking = await ctx.db
			.query("bookings")
			.withIndex("by_cancelToken", (q) => q.eq("cancelToken", token))
			.first();
		if (!booking) throw new Error("Lien invalide");
		if (booking.status === "cancelled") return { ok: true };

		const now = Date.now();
		await ctx.db.patch(booking._id, {
			status: "cancelled",
			tenue: "annule",
			cancelReason: reason,
			cancelledAt: now,
		});

		if (booking.leadId) {
			// Do not regress lead status if already advanced past rdv_reserve
			const lead = await ctx.db.get(booking.leadId);
			if (lead && (lead.status === "rdv_reserve" || lead.status === "tenu")) {
				await _applyAutoPhase(ctx, booking.leadId);
			}
		}

		await logBookingActivity(ctx, {
			bookingId: booking._id,
			leadId: booking.leadId,
			type: "cancelled",
			actorType: "prospect",
			payload: { reason },
		});

		// Phase 9 — Supprimer l'event Google Calendar si présent
		if (booking.googleEventId && booking.googleCalendarId) {
			await ctx.scheduler.runAfter(
				0,
				internal.googleActions.deleteGoogleEventForBooking,
				{ bookingId: booking._id },
			);
		}

		// Phase 12: send cancellation email — scheduled AFTER the patch above
		await ctx.scheduler.runAfter(
			0,
			internal.notifyDispatch.dispatchBookingCancelled,
			{
				bookingId: booking._id,
			},
		);

		return { ok: true };
	},
});

// Reschedule via the public reschedule link. Validates new slot, resolves host,
// patches booking, logs activity.
export const rescheduleByToken = mutation({
	args: {
		token: v.string(),
		newStartTime: v.number(),
		timezone: v.string(),
	},
	handler: async (ctx, { token, newStartTime, timezone }) => {
		const booking = await ctx.db
			.query("bookings")
			.withIndex("by_rescheduleToken", (q) => q.eq("rescheduleToken", token))
			.first();
		if (!booking) throw new Error("Lien invalide");
		if (booking.status === "cancelled") throw new Error("Réservation annulée");

		const event = await ctx.db.get(booking.eventId);
		if (!event || !event.isActive) throw new Error("Événement indisponible");
		if (!event.allowReschedule)
			throw new Error("Reschedule désactivé sur cet événement");

		const newEnd = newStartTime + event.durationMinutes * MS_PER_MIN;
		const previousStartTime = booking.startTime;

		const guards = validateSlotGuards(event, newStartTime, "reschedule");
		if (!guards.ok) throw new Error(guards.reason);

		const preferredHostId =
			event.rescheduleWithSameHost !== false ? booking.hostId : undefined;

		const resolved = await resolveAvailableHost(ctx, {
			event,
			startTime: newStartTime,
			endTime: newEnd,
			excludeBookingId: booking._id,
			preferredHostId,
		});
		if (!resolved.ok) throw new Error(resolved.reason);

		const hostChanged = resolved.hostId !== booking.hostId;
		const now = Date.now();

		await ctx.db.patch(booking._id, {
			startTime: newStartTime,
			endTime: newEnd,
			timezone,
			status: "rescheduled",
			hostId: resolved.hostId,
			rescheduledFromBookingId: booking._id,
			rescheduledAt: now,
			// TODO Phase 9: reset googleSyncStatus to "pending" and schedule
			// Google event update/recreate based on hostChanged.
			// googleSyncStatus: hostChanged ? "pending" : booking.googleSyncStatus,
		});

		if (booking.leadId) {
			await _applyAutoPhase(ctx, booking.leadId);
		}

		await logBookingActivity(ctx, {
			bookingId: booking._id,
			leadId: booking.leadId,
			type: "rescheduled",
			actorType: "prospect",
			payload: {
				previousStartTime,
				newStartTime,
				...(hostChanged
					? { previousHostId: booking.hostId, newHostId: resolved.hostId }
					: {}),
			},
		});

		// Phase 9 — Mettre à jour ou recréer l'event Google Calendar
		if (booking.googleEventId && booking.googleCalendarId) {
			// Même hôte → PATCH les heures. Hôte différent → recreate sur le nouveau compte.
			// updateGoogleEventForBooking gère les deux cas (recrée si pas d'event existant).
			await ctx.scheduler.runAfter(
				0,
				internal.googleActions.updateGoogleEventForBooking,
				{ bookingId: booking._id },
			);
		}

		// Phase 12: dispatch reschedule email — AFTER the patch + activity log above
		await ctx.scheduler.runAfter(
			0,
			internal.notifyDispatch.dispatchBookingRescheduled,
			{
				bookingId: booking._id,
				previousStartTime,
				previousTimezone: booking.timezone,
			},
		);

		return { ok: true, hostChanged };
	},
});

// ============================================================
// OUTCOME MUTATIONS
// ============================================================

// Record what happened on a call. Atomically:
//   1. Patches booking tenue + issue + amounts
//   2. Bumps lossReason.usageCount if issue=perdu
//   3. Inserts leadFollowUp if issue=follow_up
//   4. Re-derives lead.status via applyAutoPhase
export const setOutcome = mutation({
	args: {
		bookingId: v.id("bookings"),
		tenue: v.union(
			v.literal("planifie"),
			v.literal("tenu"),
			v.literal("no_show"),
			v.literal("annule"),
		),
		issue: v.optional(
			v.union(
				v.literal("en_attente"),
				v.literal("follow_up"),
				v.literal("gagne"),
				v.literal("perdu"),
			),
		),
		issueLossReasonId: v.optional(v.id("lossReasons")),
		issueAmountCents: v.optional(v.number()),
		issueOfferId: v.optional(v.string()),
		followUp: v.optional(
			v.object({
				dueAt: v.number(),
				reason: v.string(),
				channel: v.union(
					v.literal("call"),
					v.literal("sms"),
					v.literal("email"),
					v.literal("other"),
				),
			}),
		),
		cancelReason: v.optional(v.string()),
	},
	handler: async (ctx, args) => {
		const caller = await getAuthenticatedUser(ctx);
		const booking = await ctx.db.get(args.bookingId);
		if (!booking) throw new Error("Booking introuvable");
		if (!booking.leadId)
			throw new Error("Ce booking n'est pas relié à une fiche lead");

		// Authorization: host, lead closer/setter, or admin
		const isPrivileged = isAdminUser(caller);
		const isHost = booking.hostId === caller._id;
		let isLeadOwner = false;
		if (booking.leadId) {
			const lead = await ctx.db.get(booking.leadId);
			isLeadOwner =
				lead?.closerUserId === caller._id || lead?.setterUserId === caller._id;
		}
		if (!isPrivileged && !isHost && !isLeadOwner) {
			throw new Error("Tu n'as pas accès à ce booking");
		}

		// Validation rules (mirror DG COACHING bookingOutcomes.ts)
		if (args.tenue === "tenu" && !args.issue) {
			throw new Error("Un appel tenu doit avoir une issue");
		}
		if (args.tenue !== "tenu" && args.issue && args.issue !== "en_attente") {
			throw new Error("L'issue n'est valide que pour un appel tenu");
		}
		if (args.issue === "perdu" && !args.issueLossReasonId) {
			throw new Error("Une raison de perte est requise");
		}
		if (args.issue === "gagne") {
			if (
				typeof args.issueAmountCents !== "number" ||
				args.issueAmountCents <= 0
			) {
				throw new Error("Un montant contracté > 0 est requis pour une vente");
			}
		}
		if (args.issue === "follow_up") {
			if (!args.followUp) {
				throw new Error("Une relance (date + raison + canal) est requise");
			}
			if (args.followUp.dueAt < Date.now() - 60_000) {
				throw new Error("La date de relance doit être dans le futur");
			}
			if (!args.followUp.reason.trim()) {
				throw new Error("Une raison de relance est requise");
			}
		}

		const now = Date.now();

		// Derive legacy status from tenue (for queries that still use status)
		let statusPatch: Partial<Doc<"bookings">> = {};
		if (args.tenue === "no_show") statusPatch = { status: "no_show" };
		else if (args.tenue === "annule") statusPatch = { status: "cancelled" };
		else if (args.tenue === "tenu") statusPatch = { status: "completed" };
		else if (args.tenue === "planifie") statusPatch = { status: "confirmed" };

		await ctx.db.patch(args.bookingId, {
			tenue: args.tenue,
			issue: args.issue ?? "en_attente",
			issueLossReasonId:
				args.issue === "perdu" ? args.issueLossReasonId : undefined,
			issueAmountCents:
				args.issue === "gagne" ? args.issueAmountCents : undefined,
			issueOfferId: args.issue === "gagne" ? args.issueOfferId : undefined,
			cancelReason: args.tenue === "annule" ? args.cancelReason : undefined,
			...statusPatch,
		});

		// Sync montantContracte on the lead
		if (args.issue === "gagne" && args.issueAmountCents) {
			await ctx.db.patch(booking.leadId, {
				montantContracte: args.issueAmountCents,
				convertedAt: now,
				lastInteractionAt: now,
			});
		}

		// Bump loss reason usage count
		if (args.issue === "perdu" && args.issueLossReasonId) {
			const lr = await ctx.db.get(args.issueLossReasonId);
			if (lr) {
				await ctx.db.patch(args.issueLossReasonId, {
					usageCount: lr.usageCount + 1,
				});
			}
		}

		// Auto-create follow-up row
		if (args.issue === "follow_up" && args.followUp) {
			const lead = await ctx.db.get(booking.leadId);
			const assignedTo: Id<"users"> = lead?.closerUserId ?? caller._id;
			await ctx.db.insert("leadFollowUps", {
				leadId: booking.leadId,
				dueAt: args.followUp.dueAt,
				reason: args.followUp.reason.trim(),
				channel: args.followUp.channel,
				status: "pending",
				closerUserId: assignedTo,
			});
		}

		// Re-derive lead phase
		await _applyAutoPhase(ctx, booking.leadId);

		await logBookingActivity(ctx, {
			bookingId: args.bookingId,
			leadId: booking.leadId,
			type: "outcome_recorded",
			actorType: "user",
			actorUserId: caller._id,
			payload: {
				tenue: args.tenue,
				issue: args.issue,
				issueAmountCents: args.issueAmountCents,
				issueLossReasonId: args.issueLossReasonId,
			},
		});
	},
});

// Set tenue="no_show" + re-derive lead phase.
export const markNoShow = mutation({
	args: { bookingId: v.id("bookings") },
	handler: async (ctx, { bookingId }) => {
		const caller = await getAuthenticatedUser(ctx);
		const booking = await ctx.db.get(bookingId);
		if (!booking) throw new Error("Booking introuvable");

		const isPrivileged = isAdminUser(caller);
		if (!isPrivileged && booking.hostId !== caller._id) {
			throw new Error("Accès refusé");
		}

		await ctx.db.patch(bookingId, {
			tenue: "no_show",
			status: "no_show",
		});

		if (booking.leadId) {
			await _applyAutoPhase(ctx, booking.leadId);
		}

		await logBookingActivity(ctx, {
			bookingId,
			leadId: booking.leadId,
			type: "no_show_marked",
			actorType: "user",
			actorUserId: caller._id,
		});
	},
});

// Set status="completed" (call was held, all good).
export const markCompleted = mutation({
	args: { bookingId: v.id("bookings") },
	handler: async (ctx, { bookingId }) => {
		const caller = await getAuthenticatedUser(ctx);
		const booking = await ctx.db.get(bookingId);
		if (!booking) throw new Error("Booking introuvable");

		const isPrivileged = isAdminUser(caller);
		if (!isPrivileged && booking.hostId !== caller._id) {
			throw new Error("Accès refusé");
		}

		await ctx.db.patch(bookingId, { status: "completed" });

		await logBookingActivity(ctx, {
			bookingId,
			leadId: booking.leadId,
			type: "completed",
			actorType: "user",
			actorUserId: caller._id,
		});
	},
});

// Manual admin booking — bypass disqualification + rolling window guard.
// Used for no-show relance or outbound calls scheduled from the CRM.
export const adminBookByCloser = mutation({
	args: {
		slug: v.string(),
		startTime: v.number(),
		firstName: v.string(),
		lastName: v.string(),
		phone: v.string(),
		email: v.optional(v.string()),
		formAnswers: v.optional(v.string()),
		timezone: v.string(),
		// Force a specific host (optional — still falls back to resolveAvailableHost)
		forceHostId: v.optional(v.id("users")),
		// Link to existing lead if known
		existingLeadId: v.optional(v.id("leads")),
	},
	handler: async (ctx, args) => {
		const caller = await getAuthenticatedUser(ctx);
		if (
			!isAdminUser(caller) &&
			caller.role !== "closer" &&
			caller.role !== "setter"
		) {
			throw new Error("Réservé aux closers et admins");
		}

		const pre = await preflightBooking(ctx, {
			slug: args.slug,
			startTime: args.startTime,
			phone: args.phone,
			email: args.email,
			formAnswers: args.formAnswers,
			bypassClientGuards: true,
			bypassWindowGuard: true,
		});
		if (!pre.ok) throw new Error(pre.reason);
		const event = pre.event;
		const endTime = args.startTime + event.durationMinutes * MS_PER_MIN;

		const insert = await insertBookingRow(ctx, {
			event,
			startTime: args.startTime,
			endTime,
			firstName: args.firstName,
			lastName: args.lastName,
			phone: args.phone,
			email: args.email,
			formAnswers: args.formAnswers,
			timezone: args.timezone,
			googleSyncStatus: "na",
			preferredHostId: args.forceHostId,
		});
		if ("error" in insert) throw new Error(insert.error);

		// Use existing lead or upsert a new one
		let leadId: Id<"leads">;
		if (args.existingLeadId) {
			const existing = await ctx.db.get(args.existingLeadId);
			if (!existing) throw new Error("Lead introuvable");
			await ctx.db.patch(insert.bookingId, { leadId: args.existingLeadId });
			await _applyAutoPhase(ctx, args.existingLeadId);
			leadId = args.existingLeadId;
		} else {
			leadId = await commitBookingLead(ctx, {
				bookingId: insert.bookingId,
				event,
				startTime: args.startTime,
				hostUserId: insert.hostId,
				firstName: args.firstName,
				lastName: args.lastName,
				phone: args.phone,
				email: args.email,
				formAnswers: args.formAnswers,
				partialLeadId: insert.partialLeadId,
			});
		}

		await logBookingActivity(ctx, {
			bookingId: insert.bookingId,
			leadId,
			type: "created",
			actorType: "user",
			actorUserId: caller._id,
			payload: { byAdmin: true, bookedBySetterId: caller._id },
		});

		return {
			bookingId: insert.bookingId,
			hostId: insert.hostId,
			cancelToken: insert.cancelToken,
			rescheduleToken: insert.rescheduleToken,
			leadId,
		};
	},
});

// ============================================================
// ANALYTICS
// ============================================================

// Track one booking page view per (sessionId, eventId). Public, no auth.
export const trackPageView = mutation({
	args: {
		slug: v.string(),
		sessionId: v.string(),
		userAgent: v.optional(v.string()),
		referer: v.optional(v.string()),
	},
	handler: async (ctx, args) => {
		const event = await ctx.db
			.query("events")
			.withIndex("by_slug", (q) => q.eq("slug", args.slug))
			.first();
		if (!event) return; // silent — don't block page load

		// Dedup: one view per sessionId per event
		const existing = await ctx.db
			.query("bookingPageViews")
			.withIndex("by_event_date", (q) => q.eq("eventId", event._id))
			.order("desc")
			.first();
		// Lightweight dedup: skip if same session within same minute
		if (existing && existing.sessionId === args.sessionId.slice(0, 64)) {
			if (Date.now() - existing.viewedAt < 60_000) return;
		}

		await ctx.db.insert("bookingPageViews", {
			eventId: event._id,
			sessionId: args.sessionId.slice(0, 64),
			viewedAt: Date.now(),
			userAgent: args.userAgent?.slice(0, 512),
			referer: args.referer?.slice(0, 2048),
		});
	},
});

// List active loss reasons — used by outcome modal
export const listLossReasons = query({
	args: {},
	handler: async (ctx) => {
		await getAuthenticatedUser(ctx);
		return await ctx.db
			.query("lossReasons")
			.withIndex("by_archived", (q) => q.eq("archived", false))
			.collect();
	},
});

// List bookings by lead (public — used by lead detail Appels tab)
export const listByLead = query({
	args: { leadId: v.id("leads") },
	handler: async (ctx, { leadId }) => {
		// Cloisonnement CRM : non-admin ne voit les bookings que de ses leads.
		const user = await getAuthenticatedUser(ctx);
		const lead = await ctx.db.get(leadId);
		if (!lead) return [];
		if (
			!isAdminUser(user) &&
			lead.closerUserId !== user._id &&
			lead.setterUserId !== user._id
		) {
			return [];
		}
		return await ctx.db
			.query("bookings")
			.withIndex("by_leadId_startTime", (q) => q.eq("leadId", leadId))
			.order("desc")
			.take(50);
	},
});

// ============================================================
// INTERNAL QUERIES — used by crons
// ============================================================

export const listPendingExpired = internalQuery({
	args: { staleCutoffMs: v.number() },
	handler: async (ctx, { staleCutoffMs }) => {
		const stuck = await ctx.db
			.query("bookings")
			.withIndex("by_googleSyncStatus", (q) =>
				q.eq("googleSyncStatus", "pending"),
			)
			.collect();
		return stuck.filter((b) => {
			const startedAt = b.googleSyncStartedAt ?? b._creationTime;
			return startedAt < staleCutoffMs;
		});
	},
});

export const listConfirmedWithReminderWindow = internalQuery({
	args: { windowStart: v.number(), windowEnd: v.number() },
	handler: async (ctx, { windowStart, windowEnd }) => {
		return await ctx.db
			.query("bookings")
			.withIndex("by_status_startTime", (q) =>
				q
					.eq("status", "confirmed")
					.gte("startTime", windowStart)
					.lte("startTime", windowEnd),
			)
			.filter((q) => q.eq(q.field("reminderSentAt"), undefined))
			.collect();
	},
});

// ============================================================
// INTERNAL HELPERS — Phase 9 Google integration
// ============================================================

// Vérifie si l'hôte a Google actif (writer configuré + channel non expiré).
// Utilisé par createBookingChecked pour décider du path "pending" vs "na".
export const getHostGoogleStatusInternal = internalQuery({
	args: { hostId: v.id("users") },
	handler: async (ctx, { hostId }) => {
		const settings = await ctx.db
			.query("userCalendarSettings")
			.withIndex("by_userId", (q) => q.eq("userId", hostId))
			.first();

		if (!settings?.writerAccountId || !settings.writerCalendarId) {
			return { hasActiveGoogle: false };
		}

		const now = Date.now();
		const channels = await ctx.db
			.query("googleCalendarChannels")
			.withIndex("by_userId", (q) => q.eq("userId", hostId))
			.collect();

		const writerChannel = channels.find(
			(c) => c.calendarId === settings.writerCalendarId && c.expirationMs > now,
		);

		return { hasActiveGoogle: Boolean(writerChannel) };
	},
});

// Finalise un booking "pending" en "na" (no Google) + commit lead.
export const finalizeAsNaInternal = internalMutation({
	args: { bookingId: v.id("bookings") },
	handler: async (ctx, { bookingId }) => {
		const booking = await ctx.db.get(bookingId);
		if (!booking) throw new Error("Booking introuvable");
		if (booking.googleSyncStatus !== "pending") return; // idempotent

		const event = await ctx.db.get(booking.eventId);
		if (!event) throw new Error("Event introuvable");

		await ctx.db.patch(bookingId, {
			googleSyncStatus: "na",
			googleSyncedAt: Date.now(),
		});

		await commitBookingLead(ctx, {
			bookingId,
			event,
			startTime: booking.startTime,
			hostUserId: booking.hostId,
			firstName: booking.prospectFirstName,
			lastName: booking.prospectLastName,
			phone: booking.prospectPhone,
			email: booking.prospectEmail,
			formAnswers: undefined,
			partialLeadId: booking.partialLeadId,
		});
	},
});
