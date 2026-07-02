/**
 * convex/http.ts
 *
 * HTTP router Convex.
 * - Convex Auth routes (sign-in, callbacks) via auth.addHttpRoutes
 * - Phase 9 : /google/callback (OAuth Calendar sync) + /webhooks/google-calendar
 */

import { httpRouter } from "convex/server";
import { internal } from "./_generated/api";
import { httpAction } from "./_generated/server";
import { auth } from "./auth";

const http = httpRouter();

// Convex Auth — toutes les routes /api/auth/* (signin/signup/callback/etc.)
auth.addHttpRoutes(http);

// ─────────────────────────────────────────────────────────────────────────────
// HELPERS HMAC — state verification partagée avec src/lib/oauth-state.ts
// Le secret GOOGLE_OAUTH_STATE_SECRET doit être identique des deux côtés.
// ─────────────────────────────────────────────────────────────────────────────

async function hmacSha256(data: string, secret: string): Promise<string> {
	const key = await crypto.subtle.importKey(
		"raw",
		new TextEncoder().encode(secret),
		{ name: "HMAC", hash: "SHA-256" },
		false,
		["sign"],
	);
	const sig = await crypto.subtle.sign(
		"HMAC",
		key,
		new TextEncoder().encode(data),
	);
	const buf = new Uint8Array(sig);
	let s = "";
	for (const b of buf) s += String.fromCharCode(b);
	return btoa(s).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function b64UrlDecode(str: string): string {
	const pad = "=".repeat((4 - (str.length % 4)) % 4);
	const b64 = (str + pad).replace(/-/g, "+").replace(/_/g, "/");
	return atob(b64);
}

function constantTimeEqual(a: string, b: string): boolean {
	if (a.length !== b.length) return false;
	let diff = 0;
	for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
	return diff === 0;
}

type StatePayload = {
	userId: string;
	returnTo: string;
	nonce: string;
	exp: number;
};

function getOAuthStateSecret(): string {
	const secret = process.env.GOOGLE_OAUTH_STATE_SECRET;
	if (!secret) {
		throw new Error(
			"Missing GOOGLE_OAUTH_STATE_SECRET — set it on the Convex deployment.",
		);
	}
	return secret;
}

async function verifyState(state: string): Promise<StatePayload> {
	const secret = getOAuthStateSecret();
	const dotIdx = state.lastIndexOf(".");
	if (dotIdx === -1) throw new Error("Invalid state format");
	const body = state.slice(0, dotIdx);
	const sig = state.slice(dotIdx + 1);
	const expected = await hmacSha256(body, secret);
	if (!constantTimeEqual(expected, sig)) throw new Error("Invalid signature");
	const json = b64UrlDecode(body);
	const payload = JSON.parse(json) as StatePayload;
	if (payload.exp < Date.now()) throw new Error("State expired");
	return payload;
}

function getAppOrigin(): string {
	const base =
		process.env.APP_BASE_URL ?? process.env.SITE_URL ?? "http://localhost:3002";
	return base.replace(/\/$/, "");
}

// ─────────────────────────────────────────────────────────────────────────────
// Phase 9 — Google Calendar OAuth callback
// G1 : Callback DOIT être sur *.convex.site (jamais sur l'app Next.js).
// ─────────────────────────────────────────────────────────────────────────────
http.route({
	path: "/google/callback",
	method: "GET",
	handler: httpAction(async (ctx, request) => {
		const url = new URL(request.url);
		const code = url.searchParams.get("code");
		const state = url.searchParams.get("state");
		const error = url.searchParams.get("error");
		const appOrigin = getAppOrigin();
		const returnPath = "/settings/calendar";

		if (error) {
			return Response.redirect(
				`${appOrigin}${returnPath}?google=error&reason=${encodeURIComponent(error)}`,
				302,
			);
		}

		if (!code || !state) {
			return Response.redirect(
				`${appOrigin}${returnPath}?google=error&reason=missing_code`,
				302,
			);
		}

		let parsed: StatePayload;
		try {
			parsed = await verifyState(state);
		} catch {
			return Response.redirect(
				`${appOrigin}${returnPath}?google=error&reason=state`,
				302,
			);
		}

		// redirectUri recalculé depuis l'URL de la requête (G1 — doit matcher exactement)
		const redirectUri = `${url.origin}${url.pathname}`;

		try {
			await ctx.runAction(internal.googleActions.handleOAuthCallback, {
				userId: parsed.userId as never,
				code,
				redirectUri,
			});
		} catch (e) {
			const msg = e instanceof Error ? e.message : "unknown";
			return Response.redirect(
				`${appOrigin}${returnPath}?google=error&reason=${encodeURIComponent(msg.slice(0, 200))}`,
				302,
			);
		}

		const target = parsed.returnTo?.startsWith("/")
			? parsed.returnTo
			: returnPath;
		return Response.redirect(`${appOrigin}${target}?google=connected`, 302);
	}),
});

// ─────────────────────────────────────────────────────────────────────────────
// Phase 9 — Google Calendar push notifications
// Headers Google :
//   X-Goog-Channel-ID      — notre UUID channel
//   X-Goog-Channel-Token   — shared secret vérifié en DB
//   X-Goog-Resource-State  — "sync" (handshake initial) | "exists" | "not_exists"
//
// Règles gotchas :
//   - "sync" = handshake initial → 200 sans action
//   - channel inconnu → fail-open 200 (stoppe retries Google)
//   - token mismatch → 403
//   - scheduler.runAfter(0, ...) AVANT de répondre 200
// ─────────────────────────────────────────────────────────────────────────────
http.route({
	path: "/webhooks/google-calendar",
	method: "POST",
	handler: httpAction(async (ctx, request) => {
		const channelId = request.headers.get("x-goog-channel-id");
		const token = request.headers.get("x-goog-channel-token");
		const state = request.headers.get("x-goog-resource-state");

		if (!channelId) {
			return new Response("Missing channel id", { status: 400 });
		}

		// "sync" = handshake initial envoyé par Google à la création du channel.
		// Aucun payload, aucun event — juste répondre 200.
		if (state === "sync") {
			return new Response(null, { status: 200 });
		}

		const channel = await ctx.runQuery(
			internal.googleCalendarChannels.getChannelByIdInternal,
			{ channelId },
		);

		// Channel inconnu : fail-open 200 pour stopper les retries Google (G1 du webhook)
		if (!channel) {
			console.warn(`[google-calendar webhook] unknown channel=${channelId}`);
			return new Response(null, { status: 200 });
		}

		// Vérification du shared secret — protège contre les webhooks spoofés
		if (channel.token !== token) {
			console.error(
				`[google-calendar webhook] token mismatch channel=${channelId}`,
			);
			return new Response("Forbidden", { status: 403 });
		}

		// Planifier le sync incrémental AVANT de répondre (ne pas bloquer la réponse)
		await ctx.scheduler.runAfter(
			0,
			internal.googleActions.runIncrementalSyncForChannel,
			{
				channelId,
			},
		);

		return new Response(null, { status: 200 });
	}),
});

export default http;
