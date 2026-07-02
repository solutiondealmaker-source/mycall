// User availability — weekly windows for booking slot computation.
// Each row = one [dayOfWeek, startMinute, endMinute] window for one user.
// Multiple rows per (userId, dayOfWeek) = multiple windows on the same day.

import { v } from "convex/values";
import { mutation, query } from "./_generated/server";
import { requireAuth } from "./lib/auth";

// Helpers to format minutes as "HH:MM"
function minutesToHHMM(minutes: number): string {
	const h = Math.floor(minutes / 60)
		.toString()
		.padStart(2, "0");
	const m = (minutes % 60).toString().padStart(2, "0");
	return `${h}:${m}`;
}

const DAY_LABELS_FR = ["Dim", "Lun", "Mar", "Mer", "Jeu", "Ven", "Sam"];

// Returns all availability windows for the authenticated user.
export const getMyAvailability = query({
	args: {},
	handler: async (ctx) => {
		const userId = await requireAuth(ctx);
		return await ctx.db
			.query("userAvailability")
			.withIndex("by_userId", (q) => q.eq("userId", userId))
			.collect();
	},
});

// Replace all availability windows for the authenticated user.
// Accepts the full desired state — deletes all existing rows then re-inserts.
// This avoids tracking row ids on the client.
//
// `windows` = array of { dayOfWeek, startMinute, endMinute }.
// dayOfWeek: 0=Sun … 6=Sat (matches Date.getDay()).
// startMinute / endMinute: minutes from midnight in the user's local timezone.
//
// Validation:
//   - dayOfWeek must be 0–6
//   - startMinute < endMinute
//   - both values in [0, 1440)
export const setWeekly = mutation({
	args: {
		windows: v.array(
			v.object({
				dayOfWeek: v.number(),
				startMinute: v.number(),
				endMinute: v.number(),
			}),
		),
	},
	handler: async (ctx, { windows }) => {
		const userId = await requireAuth(ctx);

		// Validate before any write
		for (const w of windows) {
			if (
				w.dayOfWeek < 0 ||
				w.dayOfWeek > 6 ||
				!Number.isInteger(w.dayOfWeek)
			) {
				throw new Error(`dayOfWeek invalide : ${w.dayOfWeek}`);
			}
			if (w.startMinute < 0 || w.startMinute >= 1440) {
				throw new Error(`startMinute hors plage : ${w.startMinute}`);
			}
			if (w.endMinute <= 0 || w.endMinute > 1440) {
				throw new Error(`endMinute hors plage : ${w.endMinute}`);
			}
			if (w.startMinute >= w.endMinute) {
				throw new Error(
					`Fenêtre invalide : startMinute (${w.startMinute}) >= endMinute (${w.endMinute})`,
				);
			}
		}

		// Delete existing rows
		const existing = await ctx.db
			.query("userAvailability")
			.withIndex("by_userId", (q) => q.eq("userId", userId))
			.collect();
		for (const row of existing) {
			await ctx.db.delete(row._id);
		}

		// Insert new rows
		for (const w of windows) {
			await ctx.db.insert("userAvailability", {
				userId,
				dayOfWeek: w.dayOfWeek,
				startMinute: w.startMinute,
				endMinute: w.endMinute,
			});
		}

		return { ok: true, count: windows.length };
	},
});

// Preview the next 7 days of availability for the authenticated user.
// Returns one entry per day with the windows active that day (based on dayOfWeek).
export const previewMyNextSlots = query({
	args: {},
	handler: async (ctx) => {
		const userId = await requireAuth(ctx);

		const allWindows = await ctx.db
			.query("userAvailability")
			.withIndex("by_userId", (q) => q.eq("userId", userId))
			.collect();

		// Group by dayOfWeek
		const byDay = new Map<number, Array<{ start: string; end: string }>>();
		for (const w of allWindows) {
			if (!byDay.has(w.dayOfWeek)) byDay.set(w.dayOfWeek, []);
			byDay.get(w.dayOfWeek)?.push({
				start: minutesToHHMM(w.startMinute),
				end: minutesToHHMM(w.endMinute),
			});
		}

		// Build next 7 days starting from tomorrow
		const now = new Date();
		const result: Array<{
			date: string;
			dayLabel: string;
			dayOfWeek: number;
			windows: Array<{ start: string; end: string }>;
		}> = [];

		for (let i = 0; i < 7; i++) {
			const d = new Date(now);
			d.setDate(d.getDate() + i);
			const dow = d.getDay(); // 0=Sun … 6=Sat
			const windows = byDay.get(dow) ?? [];
			result.push({
				date: d.toISOString().slice(0, 10),
				dayLabel: DAY_LABELS_FR[dow] ?? "?",
				dayOfWeek: dow,
				windows,
			});
		}

		return result;
	},
});
