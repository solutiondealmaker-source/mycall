import { NextResponse } from "next/server";

/**
 * POST /api/auth/clear
 *
 * Delete tous les cookies Convex Auth HttpOnly côté serveur.
 * Utilisé par /reset pour forcer un état propre.
 */
export async function POST() {
	const response = NextResponse.json({ ok: true });
	const cookieNames = [
		"__convexAuthJWT",
		"__convexAuthRefreshToken",
		"__convexAuthOAuthVerifier",
		"__Host-__convexAuthJWT",
		"__Host-__convexAuthRefreshToken",
		"__Host-__convexAuthOAuthVerifier",
	];
	for (const name of cookieNames) {
		response.cookies.set(name, "", {
			path: "/",
			expires: new Date(0),
			httpOnly: true,
			sameSite: "lax",
		});
	}
	return response;
}
