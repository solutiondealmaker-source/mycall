// catalogues.ts — CRUD pour lossReasons et leadSources.
// Les deux tables sont des référentiels partagés, modifiables uniquement par les admins.

import { v } from "convex/values";
import { mutation, query } from "./_generated/server";
import { requireAdmin, requireAuth } from "./lib/auth";

// ============================================================
// LOSS REASONS
// ============================================================

export const listLossReasons = query({
	args: {},
	handler: async (ctx) => {
		await requireAuth(ctx);
		return await ctx.db
			.query("lossReasons")
			.withIndex("by_order", (q) => q.gte("order", 0))
			.collect();
	},
});

export const createLossReason = mutation({
	args: {
		name: v.string(),
		label: v.string(),
		color: v.optional(v.string()),
	},
	handler: async (ctx, { name, label, color }) => {
		await requireAdmin(ctx);

		// Next order = max + 1
		const all = await ctx.db
			.query("lossReasons")
			.withIndex("by_order", (q) => q.gte("order", 0))
			.collect();
		const maxOrder = all.reduce((acc, r) => Math.max(acc, r.order), -1);

		return await ctx.db.insert("lossReasons", {
			name: name.trim().toLowerCase().replace(/\s+/g, "_"),
			label: label.trim(),
			color: color ?? undefined,
			order: maxOrder + 1,
			archived: false,
			usageCount: 0,
		});
	},
});

export const updateLossReason = mutation({
	args: {
		id: v.id("lossReasons"),
		label: v.optional(v.string()),
		color: v.optional(v.string()),
		archived: v.optional(v.boolean()),
	},
	handler: async (ctx, { id, label, color, archived }) => {
		await requireAdmin(ctx);
		const row = await ctx.db.get(id);
		if (!row) throw new Error("Raison introuvable");

		const patch: Record<string, unknown> = {};
		if (label !== undefined) patch.label = label.trim();
		if (color !== undefined) patch.color = color;
		if (archived !== undefined) patch.archived = archived;

		await ctx.db.patch(id, patch);
		return { ok: true };
	},
});

export const archiveLossReason = mutation({
	args: { id: v.id("lossReasons") },
	handler: async (ctx, { id }) => {
		await requireAdmin(ctx);
		const row = await ctx.db.get(id);
		if (!row) throw new Error("Raison introuvable");
		await ctx.db.patch(id, { archived: !row.archived });
		return { ok: true, archived: !row.archived };
	},
});

// ============================================================
// LEAD SOURCES
// ============================================================

export const listLeadSources = query({
	args: {},
	handler: async (ctx) => {
		await requireAuth(ctx);
		return await ctx.db.query("leadSources").collect();
	},
});

export const createLeadSource = mutation({
	args: {
		name: v.string(),
		color: v.optional(v.string()),
	},
	handler: async (ctx, { name, color }) => {
		await requireAdmin(ctx);

		// Dedup by name
		const existing = await ctx.db
			.query("leadSources")
			.withIndex("by_name", (q) => q.eq("name", name.trim()))
			.first();
		if (existing) throw new Error("Une source avec ce nom existe déjà");

		return await ctx.db.insert("leadSources", {
			name: name.trim(),
			color: color ?? undefined,
			usageCount: 0,
		});
	},
});

export const updateLeadSource = mutation({
	args: {
		id: v.id("leadSources"),
		name: v.optional(v.string()),
		color: v.optional(v.string()),
	},
	handler: async (ctx, { id, name, color }) => {
		await requireAdmin(ctx);
		const row = await ctx.db.get(id);
		if (!row) throw new Error("Source introuvable");

		const patch: Record<string, unknown> = {};
		if (name !== undefined) patch.name = name.trim();
		if (color !== undefined) patch.color = color;

		await ctx.db.patch(id, patch);
		return { ok: true };
	},
});

export const deleteLeadSource = mutation({
	args: { id: v.id("leadSources") },
	handler: async (ctx, { id }) => {
		await requireAdmin(ctx);
		const row = await ctx.db.get(id);
		if (!row) throw new Error("Source introuvable");
		await ctx.db.delete(id);
		return { ok: true };
	},
});
