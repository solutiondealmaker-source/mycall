// Auth helpers — shared across all admin mutations.
// iClone utilise Convex Auth (@convex-dev/auth). getAuthUserId résout
// directement l'Id<"users"> depuis la session du caller.

import { getAuthUserId } from "@convex-dev/auth/server";
import type { Id } from "../_generated/dataModel";
import type { MutationCtx, QueryCtx } from "../_generated/server";

// Returns the authenticated user's Convex Id, or throws if unauthenticated.
export async function getAuthenticatedUserId(
	ctx: MutationCtx | QueryCtx,
): Promise<Id<"users">> {
	const userId = await getAuthUserId(ctx);
	if (!userId) throw new Error("Non authentifié");
	return userId;
}

// Same as above but returns the full user doc.
export async function getAuthenticatedUser(ctx: MutationCtx | QueryCtx) {
	const userId = await getAuthenticatedUserId(ctx);
	const user = await ctx.db.get(userId);
	if (!user) throw new Error("Utilisateur introuvable");
	return user;
}

const ADMIN_ROLES = new Set(["admin", "ceo", "ops", "head_of_sales"] as const);

type AnyUser = { _id: Id<"users">; isAdmin?: boolean; role?: string };

export function isAdminUser(user: AnyUser): boolean {
	return Boolean(user.isAdmin) || ADMIN_ROLES.has(user.role as never);
}

// Lecture globale : les admins, plus le rôle "viewer" (observateur externe qui
// suit l'activité — RDV, leads, chiffre d'affaires — sans rien pouvoir modifier).
// À n'utiliser que dans des `query`. Toute écriture reste sous requireAdmin.
export function canReadAll(user: AnyUser): boolean {
	return isAdminUser(user) || user.role === "viewer";
}

// Throws unless caller is admin / privileged.
export async function requireAdmin(
	ctx: MutationCtx | QueryCtx,
): Promise<Id<"users">> {
	const user = await getAuthenticatedUser(ctx);
	if (!isAdminUser(user)) throw new Error("Réservé à l'administration");
	return user._id;
}

// Idem, mais accepte aussi les observateurs. Réservé aux lectures.
export async function requireReadAll(
	ctx: MutationCtx | QueryCtx,
): Promise<Id<"users">> {
	const user = await getAuthenticatedUser(ctx);
	if (!canReadAll(user)) throw new Error("Réservé à l'administration");
	return user._id;
}

// Returns userId without role check — any authenticated user OK.
export async function requireAuth(
	ctx: MutationCtx | QueryCtx,
): Promise<Id<"users">> {
	return getAuthenticatedUserId(ctx);
}
