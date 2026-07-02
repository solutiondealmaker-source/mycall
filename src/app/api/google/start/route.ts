/**
 * src/app/api/google/start/route.ts
 *
 * GET /api/google/start?returnTo=/settings/calendar
 *
 * Initie le flow OAuth Google Calendar (Phase 9).
 * Ce n'est PAS le sign-in Google — c'est uniquement pour connecter un calendrier.
 *
 * Flow :
 *   1. Récupère le token Convex Auth depuis les cookies HttpOnly
 *   2. Résout le userId via fetchQuery(api.users.getMyProfile)
 *   3. Signe un state HMAC {userId, returnTo, nonce, exp=+15min}
 *   4. Redirige vers accounts.google.com avec scopes calendar + openid
 *
 * IMPORTANT — redirectUri DOIT être sur *.convex.site (jamais Next.js).
 * G1 : Google silent-drop le code sur les domaines tiers pour les apps non vérifiées.
 */

import { convexAuthNextjsToken } from "@convex-dev/auth/nextjs/server";
import { fetchQuery } from "convex/nextjs";
import { NextResponse } from "next/server";
import { signState } from "@/lib/oauth-state";
import { api } from "../../../../../convex/_generated/api";

export const runtime = "nodejs";

// Scopes Google Calendar requis
const GOOGLE_SCOPES = [
	"https://www.googleapis.com/auth/calendar",
	"https://www.googleapis.com/auth/calendar.events",
	"openid",
	"email",
	"profile",
].join(" ");

export async function GET(request: Request) {
	const url = new URL(request.url);
	const returnTo = url.searchParams.get("returnTo") ?? "/settings/calendar";

	// 1. Récupérer le token Convex Auth
	const token = await convexAuthNextjsToken();
	if (!token) {
		return NextResponse.redirect(new URL("/login", request.url));
	}

	// 2. Résoudre le userId via Convex
	let userId: string;
	try {
		const me = await fetchQuery(api.users.getMyProfile, {}, { token });
		if (!me) {
			return NextResponse.redirect(new URL("/login", request.url));
		}
		userId = me._id;
	} catch {
		return NextResponse.redirect(new URL("/login", request.url));
	}

	// 3. Signer le state HMAC
	const state = await signState({ userId, returnTo });

	// 4. Construire l'URL OAuth Google
	// redirectUri = *.convex.site/google/callback (jamais Next.js — G1)
	const convexSiteUrl = process.env.NEXT_PUBLIC_CONVEX_SITE_URL;
	if (!convexSiteUrl) {
		console.error("[google/start] Missing NEXT_PUBLIC_CONVEX_SITE_URL");
		return NextResponse.redirect(
			new URL(`${returnTo}?google=error&reason=config`, request.url),
		);
	}
	const redirectUri = `${convexSiteUrl.replace(/\/$/, "")}/google/callback`;

	// Côté route handler server — on utilise la var privée (pas besoin de NEXT_PUBLIC_)
	const clientId = process.env.GOOGLE_CLIENT_ID;
	if (!clientId) {
		console.error("[google/start] Missing GOOGLE_CLIENT_ID");
		return NextResponse.redirect(
			new URL(`${returnTo}?google=error&reason=config`, request.url),
		);
	}

	const authUrl = new URL("https://accounts.google.com/o/oauth2/v2/auth");
	authUrl.searchParams.set("client_id", clientId);
	authUrl.searchParams.set("redirect_uri", redirectUri);
	authUrl.searchParams.set("response_type", "code");
	authUrl.searchParams.set("scope", GOOGLE_SCOPES);
	authUrl.searchParams.set("access_type", "offline");
	authUrl.searchParams.set("prompt", "consent"); // force refresh_token (G2)
	authUrl.searchParams.set("state", state);

	return NextResponse.redirect(authUrl.toString());
}
