// convex/googleHelpers.ts
// Queries et mutations internes utilisées par googleActions.ts (qui est "use node").
// Convex ne permet pas d'avoir des queries/mutations dans un fichier "use node".
// Ce fichier tourne dans l'environnement Convex standard.

import { getAuthUserId } from "@convex-dev/auth/server";
import { v } from "convex/values";
import { internalMutation, internalQuery } from "./_generated/server";

// ============================================================
// QUERIES — lookup helpers pour les actions Google
// ============================================================

export const getBookingInternal = internalQuery({
	args: { id: v.id("bookings") },
	handler: async (ctx, { id }) => {
		return await ctx.db.get(id);
	},
});

export const getEventInternal = internalQuery({
	args: { id: v.id("events") },
	handler: async (ctx, { id }) => {
		return await ctx.db.get(id);
	},
});

// Retourne le user authentifié — utilisé par listCalendarsAcrossMyAccounts
export const getCurrentUserInternal = internalQuery({
	args: {},
	handler: async (ctx) => {
		const userId = await getAuthUserId(ctx);
		if (!userId) return null;
		return await ctx.db.get(userId);
	},
});
