// users.ts — Profile queries/mutations + admin team management.
// Ne pas modifier auth.ts / schema.ts.

import { v } from "convex/values";
import { mutation, query } from "./_generated/server";
import { requireAdmin, requireAuth } from "./lib/auth";

// ============================================================
// QUERIES
// ============================================================

// Returns the authenticated user's full profile doc.
export const getMyProfile = query({
	args: {},
	handler: async (ctx) => {
		const userId = await requireAuth(ctx);
		return await ctx.db.get(userId);
	},
});

// Returns all users — admin only.
export const listAllUsers = query({
	args: {},
	handler: async (ctx) => {
		await requireAdmin(ctx);
		return await ctx.db.query("users").collect();
	},
});

// ============================================================
// MUTATIONS — profile (self-edit)
// ============================================================

export const updateMyProfile = mutation({
	args: {
		name: v.optional(v.string()),
		defaultTimezone: v.optional(v.string()),
		image: v.optional(v.string()),
	},
	handler: async (ctx, { name, defaultTimezone, image }) => {
		const userId = await requireAuth(ctx);

		const patch: Record<string, string | undefined> = {};
		if (name !== undefined) patch.name = name.trim() || undefined;
		if (defaultTimezone !== undefined) patch.defaultTimezone = defaultTimezone;
		if (image !== undefined) patch.image = image;

		await ctx.db.patch(userId, patch);
		return { ok: true };
	},
});

// ============================================================
// MUTATIONS — admin team management
// ============================================================

const ROLE_VALUES = [
	"closer",
	"setter",
	"coach",
	"head_of_sales",
	"ceo",
	"ops",
	"admin",
	"viewer",
] as const;
type RoleValue = (typeof ROLE_VALUES)[number];

export const updateUserRole = mutation({
	args: {
		userId: v.id("users"),
		role: v.union(
			v.literal("closer"),
			v.literal("setter"),
			v.literal("coach"),
			v.literal("head_of_sales"),
			v.literal("ceo"),
			v.literal("ops"),
			v.literal("admin"),
			v.literal("viewer"),
		),
	},
	handler: async (ctx, { userId, role }) => {
		await requireAdmin(ctx);
		const target = await ctx.db.get(userId);
		if (!target) throw new Error("Utilisateur introuvable");
		await ctx.db.patch(userId, { role });
		return { ok: true };
	},
});

export const toggleAdmin = mutation({
	args: { userId: v.id("users") },
	handler: async (ctx, { userId }) => {
		const callerId = await requireAdmin(ctx);

		// Guard: cannot remove your own admin access
		if (callerId === userId) {
			throw new Error(
				"Tu ne peux pas retirer tes propres droits admin. Demande à un autre admin.",
			);
		}

		const target = await ctx.db.get(userId);
		if (!target) throw new Error("Utilisateur introuvable");

		await ctx.db.patch(userId, { isAdmin: !target.isAdmin });
		return { ok: true, isAdmin: !target.isAdmin };
	},
});

export const removeUser = mutation({
	args: { userId: v.id("users") },
	handler: async (ctx, { userId }) => {
		const callerId = await requireAdmin(ctx);

		// Guard: cannot remove yourself
		if (callerId === userId) {
			throw new Error("Tu ne peux pas te supprimer toi-même.");
		}

		const target = await ctx.db.get(userId);
		if (!target) throw new Error("Utilisateur introuvable");

		// Hard delete the user doc.
		// Bookings / leads / availability referencing this user will keep their
		// userId FK (acceptable for V1 — soft-delete out of scope).
		await ctx.db.delete(userId);

		// Clean up availability windows
		const avails = await ctx.db
			.query("userAvailability")
			.withIndex("by_userId", (q) => q.eq("userId", userId))
			.collect();
		for (const row of avails) {
			await ctx.db.delete(row._id);
		}

		return { ok: true };
	},
});
