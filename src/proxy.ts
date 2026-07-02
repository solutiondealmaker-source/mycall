/**
 * src/proxy.ts — Convex Auth (Next.js 16 "proxy", ex-"middleware").
 *
 * Next 16 a renommé la convention `middleware` → `proxy` (même sémantique).
 * Protège les routes dashboard ; redirige vers /login si non authentifié.
 */

import {
	convexAuthNextjsMiddleware,
	createRouteMatcher,
	nextjsMiddlewareRedirect,
} from "@convex-dev/auth/nextjs/server";

const isProtectedRoute = createRouteMatcher([
	"/dashboard(.*)",
	"/events(.*)",
	"/crm(.*)",
	"/settings(.*)",
	"/team(.*)",
	"/analytics(.*)",
]);

const isAuthRoute = createRouteMatcher(["/login", "/signup"]);
const isPublicAlways = createRouteMatcher(["/reset"]);

export default convexAuthNextjsMiddleware(
	async (request, { convexAuth }) => {
		if (isPublicAlways(request)) return;

		const isAuthed = await convexAuth.isAuthenticated();

		if (isProtectedRoute(request) && !isAuthed) {
			return nextjsMiddlewareRedirect(request, "/login");
		}

		if (isAuthRoute(request) && isAuthed) {
			return nextjsMiddlewareRedirect(request, "/dashboard");
		}
	},
	{ verbose: process.env.NODE_ENV === "development" },
);

export const config = {
	matcher: [
		"/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)",
	],
};
