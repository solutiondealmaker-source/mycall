// Analytics — Phase 13.
// All queries require admin auth.

import { v } from "convex/values";
import { query } from "./_generated/server";
import { requireAdmin } from "./lib/auth";

// ============================================================
// HELPERS
// ============================================================

function inRange(ts: number, startMs: number, endMs: number): boolean {
	return ts >= startMs && ts <= endMs;
}

function getPeriodKey(
	ts: number,
	granularity: "day" | "week" | "month" | "quarter" | "year",
): string {
	const d = new Date(ts);
	const y = d.getUTCFullYear();
	const m = d.getUTCMonth() + 1;
	const day = d.getUTCDate();

	if (granularity === "day") {
		return `${y}-${String(m).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
	}
	if (granularity === "week") {
		// ISO week: find Monday
		const dayOfWeek = d.getUTCDay() === 0 ? 6 : d.getUTCDay() - 1;
		const monday = new Date(d);
		monday.setUTCDate(day - dayOfWeek);
		const mm = monday.getUTCMonth() + 1;
		const md = monday.getUTCDate();
		return `${monday.getUTCFullYear()}-${String(mm).padStart(2, "0")}-${String(md).padStart(2, "0")}`;
	}
	if (granularity === "month") {
		return `${y}-${String(m).padStart(2, "0")}`;
	}
	if (granularity === "quarter") {
		const q = Math.ceil(m / 3);
		return `${y}-Q${q}`;
	}
	// year
	return `${y}`;
}

function sortedPeriods(
	map: Map<string, unknown>,
	granularity: "day" | "week" | "month" | "quarter" | "year",
): string[] {
	return Array.from(map.keys()).sort((a, b) => {
		if (granularity === "quarter") {
			// "2026-Q1" comparison
			const [ya, qa] = a.split("-Q");
			const [yb, qb] = b.split("-Q");
			return Number(ya) - Number(yb) || Number(qa ?? 0) - Number(qb ?? 0);
		}
		return a.localeCompare(b);
	});
}

// ============================================================
// getFunnelStats
// ============================================================

export const getFunnelStats = query({
	args: {
		eventIds: v.optional(v.array(v.id("events"))),
		startMs: v.number(),
		endMs: v.number(),
	},
	handler: async (ctx, { eventIds, startMs, endMs }) => {
		await requireAdmin(ctx);

		// Page views — distinct sessionIds
		const allViews = await ctx.db.query("bookingPageViews").collect();
		const filteredViews = allViews.filter((v) => {
			if (!inRange(v.viewedAt, startMs, endMs)) return false;
			if (eventIds && !eventIds.includes(v.eventId)) return false;
			return true;
		});
		const uniqueSessions = new Set(filteredViews.map((v) => v.sessionId));
		const pageViews = uniqueSessions.size;

		// Contacts — partial leads (first form contact captured)
		const allPartials = await ctx.db.query("partialLeads").collect();
		const filteredPartials = allPartials.filter((p) => {
			if (!inRange(p.firstSeenAt, startMs, endMs)) return false;
			if (eventIds && !eventIds.includes(p.eventId)) return false;
			return true;
		});
		const contacts = filteredPartials.length;

		// Calls — bookings with status confirmed
		const allBookings = await ctx.db.query("bookings").collect();
		const filteredBookings = allBookings.filter((b) => {
			if (!inRange(b._creationTime, startMs, endMs)) return false;
			if (b.status !== "confirmed") return false;
			if (eventIds && !eventIds.includes(b.eventId)) return false;
			return true;
		});
		const calls = filteredBookings.length;

		const viewsToContactsPct =
			pageViews > 0 ? Math.round((contacts / pageViews) * 100) : 0;
		const contactsToCallsPct =
			contacts > 0 ? Math.round((calls / contacts) * 100) : 0;

		return {
			pageViews,
			contacts,
			calls,
			viewsToContactsPct,
			contactsToCallsPct,
		};
	},
});

// ============================================================
// getCallsCreatedByPeriod
// ============================================================

export const getCallsCreatedByPeriod = query({
	args: {
		eventIds: v.optional(v.array(v.id("events"))),
		startMs: v.number(),
		endMs: v.number(),
		granularity: v.union(
			v.literal("day"),
			v.literal("week"),
			v.literal("month"),
			v.literal("quarter"),
			v.literal("year"),
		),
	},
	handler: async (ctx, { eventIds, startMs, endMs, granularity }) => {
		await requireAdmin(ctx);

		const allBookings = await ctx.db.query("bookings").collect();
		const filtered = allBookings.filter((b) => {
			if (!inRange(b._creationTime, startMs, endMs)) return false;
			if (b.status !== "confirmed") return false;
			if (eventIds && !eventIds.includes(b.eventId)) return false;
			return true;
		});

		const countMap = new Map<string, number>();
		for (const b of filtered) {
			const key = getPeriodKey(b._creationTime, granularity);
			countMap.set(key, (countMap.get(key) ?? 0) + 1);
		}

		const periods = sortedPeriods(countMap, granularity);
		return periods.map((p) => ({ period: p, count: countMap.get(p) ?? 0 }));
	},
});

// ============================================================
// getOutcomeStats
// ============================================================

export const getOutcomeStats = query({
	args: {
		eventIds: v.optional(v.array(v.id("events"))),
		startMs: v.number(),
		endMs: v.number(),
		granularity: v.optional(
			v.union(
				v.literal("day"),
				v.literal("week"),
				v.literal("month"),
				v.literal("quarter"),
				v.literal("year"),
			),
		),
	},
	handler: async (ctx, { eventIds, startMs, endMs, granularity }) => {
		await requireAdmin(ctx);

		const gran = granularity ?? "week";

		const allBookings = await ctx.db.query("bookings").collect();
		const filtered = allBookings.filter((b) => {
			if (!inRange(b._creationTime, startMs, endMs)) return false;
			if (b.status === "cancelled" || b.status === "rescheduled") return false;
			if (eventIds && !eventIds.includes(b.eventId)) return false;
			return true;
		});

		let won = 0;
		let lost = 0;
		let pending = 0;
		let followUp = 0;

		const timelineMap = new Map<
			string,
			{ won: number; lost: number; pending: number; followUp: number }
		>();

		for (const b of filtered) {
			const key = getPeriodKey(b._creationTime, gran);
			if (!timelineMap.has(key)) {
				timelineMap.set(key, { won: 0, lost: 0, pending: 0, followUp: 0 });
			}
			const entry = timelineMap.get(key)!;

			if (b.issue === "gagne") {
				won++;
				entry.won++;
			} else if (b.issue === "perdu") {
				lost++;
				entry.lost++;
			} else if (b.issue === "follow_up") {
				followUp++;
				entry.followUp++;
			} else {
				// en_attente
				pending++;
				entry.pending++;
			}
		}

		const totalPlanned = filtered.length;

		const periods = sortedPeriods(timelineMap, gran);
		const timeline = periods.map((p) => ({
			period: p,
			...(timelineMap.get(p) ?? { won: 0, lost: 0, pending: 0, followUp: 0 }),
		}));

		return {
			totalPlanned,
			won,
			lost,
			pending,
			followUp,
			timeline,
		};
	},
});

// ============================================================
// getLossReasonStats
// ============================================================

export const getLossReasonStats = query({
	args: {
		eventIds: v.optional(v.array(v.id("events"))),
		startMs: v.number(),
		endMs: v.number(),
	},
	handler: async (ctx, { eventIds, startMs, endMs }) => {
		await requireAdmin(ctx);

		const allBookings = await ctx.db.query("bookings").collect();
		const lostBookings = allBookings.filter((b) => {
			if (!inRange(b._creationTime, startMs, endMs)) return false;
			if (b.issue !== "perdu") return false;
			if (eventIds && !eventIds.includes(b.eventId)) return false;
			return true;
		});

		const lossReasons = await ctx.db.query("lossReasons").collect();
		const reasonMap = new Map<string, number>(); // lossReasonId → count

		let noReasonCount = 0;
		for (const b of lostBookings) {
			if (b.issueLossReasonId) {
				const key = b.issueLossReasonId;
				reasonMap.set(key, (reasonMap.get(key) ?? 0) + 1);
			} else {
				noReasonCount++;
			}
		}

		const reasons = lossReasons
			.map((r) => ({
				id: r._id,
				name: r.name,
				label: r.label,
				color: r.color,
				count: reasonMap.get(r._id) ?? 0,
			}))
			.filter((r) => r.count > 0)
			.sort((a, b) => b.count - a.count);

		// Breakdown de tenue pour les perdus
		const followUpCount = lostBookings.filter((b) => b.tenue === "tenu").length; // tenu mais perdu → suivi
		const noShowCount = lostBookings.filter(
			(b) => b.tenue === "no_show",
		).length;
		const cancelledCount = lostBookings.filter(
			(b) => b.tenue === "annule",
		).length;
		const otherCount =
			lostBookings.length - followUpCount - noShowCount - cancelledCount;

		return {
			reasons,
			total: lostBookings.length,
			breakdown: {
				followUp: followUpCount,
				noShow: noShowCount,
				cancelled: cancelledCount,
				other: otherCount,
			},
		};
	},
});

// ============================================================
// getRevenueStats
// ============================================================

export const getRevenueStats = query({
	args: {
		eventIds: v.optional(v.array(v.id("events"))),
		startMs: v.number(),
		endMs: v.number(),
	},
	handler: async (ctx, { eventIds, startMs, endMs }) => {
		await requireAdmin(ctx);

		const allBookings = await ctx.db.query("bookings").collect();
		const wonBookings = allBookings.filter((b) => {
			if (!inRange(b._creationTime, startMs, endMs)) return false;
			if (b.issue !== "gagne") return false;
			if (eventIds && !eventIds.includes(b.eventId)) return false;
			return true;
		});

		const totalAmountCents = wonBookings.reduce(
			(sum, b) => sum + (b.issueAmountCents ?? 0),
			0,
		);
		const count = wonBookings.length;
		const avgDealSizeCents =
			count > 0 ? Math.round(totalAmountCents / count) : 0;

		// By month
		const monthMap = new Map<string, number>();
		for (const b of wonBookings) {
			const key = getPeriodKey(b._creationTime, "month");
			monthMap.set(key, (monthMap.get(key) ?? 0) + (b.issueAmountCents ?? 0));
		}
		const periods = sortedPeriods(monthMap, "month");
		const byMonth = periods.map((p) => ({
			period: p,
			amountCents: monthMap.get(p) ?? 0,
		}));

		return {
			totalAmountCents,
			count,
			avgDealSizeCents,
			byMonth,
		};
	},
});

// ============================================================
// getShowUpStats
// ============================================================

export const getShowUpStats = query({
	args: {
		eventIds: v.optional(v.array(v.id("events"))),
		startMs: v.number(),
		endMs: v.number(),
	},
	handler: async (ctx, { eventIds, startMs, endMs }) => {
		await requireAdmin(ctx);

		const allBookings = await ctx.db.query("bookings").collect();
		// Only bookings where the event date is within range
		const relevant = allBookings.filter((b) => {
			if (!inRange(b.startTime, startMs, endMs)) return false;
			if (b.status === "rescheduled") return false;
			if (eventIds && !eventIds.includes(b.eventId)) return false;
			return true;
		});

		const tenu = relevant.filter((b) => b.tenue === "tenu").length;
		const noShow = relevant.filter((b) => b.tenue === "no_show").length;
		const annule = relevant.filter((b) => b.tenue === "annule").length;
		const planifie = relevant.filter((b) => b.tenue === "planifie").length;
		const total = relevant.length;

		const showUpRate = total > 0 ? Math.round((tenu / total) * 100) : 0;

		return {
			tenu,
			noShow,
			annule,
			planifie,
			total,
			showUpRate,
		};
	},
});
