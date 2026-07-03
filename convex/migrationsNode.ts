"use node";

import {
	createAccount,
	modifyAccountCredentials,
} from "@convex-dev/auth/server";
import { v } from "convex/values";
import { internalAction } from "./_generated/server";

// Create a password Account for an existing user (or create a new user).
// Run: bunx convex run migrationsNode:createPasswordAccount '{"email":"x","password":"y"}'
export const createPasswordAccount = internalAction({
	args: {
		email: v.string(),
		password: v.string(),
		name: v.optional(v.string()),
	},
	handler: async (ctx, args) => {
		const email = args.email.trim().toLowerCase();
		const result = await createAccount(ctx, {
			provider: "password",
			account: { id: email, secret: args.password },
			profile: { email, name: args.name ?? email.split("@")[0] },
			shouldLinkViaEmail: true,
		});
		return { ok: true, userId: result.user._id };
	},
});

// Reset the password of an EXISTING account — keeps the user row + admin role.
// Run: bunx convex run migrationsNode:resetPassword '{"email":"x","password":"y"}'
export const resetPassword = internalAction({
	args: { email: v.string(), password: v.string() },
	handler: async (ctx, args) => {
		const email = args.email.trim().toLowerCase();
		await modifyAccountCredentials(ctx, {
			provider: "password",
			account: { id: email, secret: args.password },
		});
		return { ok: true };
	},
});
