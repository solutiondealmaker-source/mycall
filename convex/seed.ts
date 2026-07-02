// Seed — initial data for a fresh iClone deployment.
//
// Run:  bunx convex run --prod seed:run
//
// Idempotent — safe to run multiple times. Checks existence before inserting.
//
// Creates:
//   - 1 admin user (admin@example.com — change before running, or
//     just sign up and promote yourself with migrations:promoteAdmin)
//   - 3 default loss reasons
//   - 1 default pipelineSettings singleton

import { v } from "convex/values";
import { internalMutation } from "./_generated/server";

export const run = internalMutation({
	args: {},
	handler: async (ctx) => {
		const now = Date.now();
		const results: string[] = [];

		// ── Admin user ────────────────────────────────────────────────────────
		// Better Auth creates user rows via its Convex adapter. We insert a
		// minimal row here so the rest of the seed can reference it by _id.
		// If BA has already created the row, we skip insertion.
		const adminEmail = "admin@example.com";
		const existingAdmin = await ctx.db
			.query("users")
			.withIndex("email", (q) => q.eq("email", adminEmail))
			.first();

		let adminUserId = existingAdmin?._id;
		if (!existingAdmin) {
			adminUserId = await ctx.db.insert("users", {
				email: adminEmail,
				name: "Admin",
				isAdmin: true,
				role: "admin",
				defaultTimezone: "Europe/Paris",
			});
			results.push(`Created admin user: ${adminEmail}`);
		} else {
			results.push(`Admin user already exists: ${adminEmail}`);
		}

		// ── Default loss reasons ──────────────────────────────────────────────
		type LossReasonSeed = {
			name: string;
			label: string;
			color: string;
			order: number;
		};
		const defaultLossReasons: LossReasonSeed[] = [
			{
				name: "pas_le_budget",
				label: "Pas le budget",
				color: "#ef4444",
				order: 0,
			},
			{
				name: "pas_le_bon_moment",
				label: "Pas le bon moment",
				color: "#f97316",
				order: 1,
			},
			{
				name: "pas_qualifie",
				label: "Pas qualifié",
				color: "#6b7280",
				order: 2,
			},
		];

		for (const lr of defaultLossReasons) {
			// Dedup by name (stable slug)
			const existing = await ctx.db
				.query("lossReasons")
				.filter((q) => q.eq(q.field("name"), lr.name))
				.first();
			if (!existing) {
				await ctx.db.insert("lossReasons", {
					name: lr.name,
					label: lr.label,
					color: lr.color,
					order: lr.order,
					archived: false,
					usageCount: 0,
				});
				results.push(`Created loss reason: ${lr.label}`);
			} else {
				results.push(`Loss reason already exists: ${lr.label}`);
			}
		}

		// ── Pipeline settings singleton ───────────────────────────────────────
		const existingSettings = await ctx.db
			.query("pipelineSettings")
			.withIndex("by_singleton", (q) => q.eq("singleton", "default"))
			.first();

		if (!existingSettings) {
			await ctx.db.insert("pipelineSettings", {
				singleton: "default",
				silenceAlertDays: 7,
				silenceAutoLoseDays: 30,
				followUpReminderHour: 9, // 09:00 UTC
			});
			results.push("Created default pipelineSettings");
		} else {
			results.push("pipelineSettings already exists");
		}

		return { ok: true, results };
	},
});
