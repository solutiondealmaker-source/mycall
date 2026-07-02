/**
 * src/lib/oauth-state.ts
 *
 * HMAC-signed state helpers pour le flow OAuth Google Calendar (Phase 9).
 * Utilisé côté Next.js (route /api/google/start) pour signer l'état.
 * Le même state est vérifié côté Convex (convex/http.ts /google/callback).
 *
 * Secret partagé : GOOGLE_OAUTH_STATE_SECRET (même valeur des deux côtés).
 * Expiration : 15 minutes (900 000 ms).
 */

// Server-only — ne jamais importer depuis un Client Component
import "server-only";

const STATE_EXPIRY_MS = 15 * 60 * 1000; // 15 minutes

type StatePayload = {
	userId: string;
	returnTo: string;
	nonce: string;
	exp: number;
};

// ─── helpers HMAC ──────────────────────────────────────────────────────────────

function getSecret(): string {
	const s = process.env.GOOGLE_OAUTH_STATE_SECRET;
	if (!s) throw new Error("Missing GOOGLE_OAUTH_STATE_SECRET env var");
	return s;
}

function b64UrlEncode(buf: ArrayBuffer): string {
	const bytes = new Uint8Array(buf);
	let s = "";
	for (const b of bytes) s += String.fromCharCode(b);
	return btoa(s).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function b64UrlDecode(str: string): string {
	const pad = "=".repeat((4 - (str.length % 4)) % 4);
	return atob((str + pad).replace(/-/g, "+").replace(/_/g, "/"));
}

async function hmacSha256(data: string, secret: string): Promise<string> {
	const enc = new TextEncoder();
	const key = await crypto.subtle.importKey(
		"raw",
		enc.encode(secret),
		{ name: "HMAC", hash: "SHA-256" },
		false,
		["sign"],
	);
	const sig = await crypto.subtle.sign("HMAC", key, enc.encode(data));
	return b64UrlEncode(sig);
}

// ─── signState ─────────────────────────────────────────────────────────────────

/**
 * Signe un payload state OAuth et retourne la chaîne `body.sig`.
 * Le body est un JSON base64url, sig est un HMAC-SHA256 base64url.
 */
export async function signState(payload: {
	userId: string;
	returnTo: string;
}): Promise<string> {
	const secret = getSecret();
	const nonce = crypto.randomUUID().replace(/-/g, "");
	const data: StatePayload = {
		userId: payload.userId,
		returnTo: payload.returnTo,
		nonce,
		exp: Date.now() + STATE_EXPIRY_MS,
	};
	const body = btoa(JSON.stringify(data))
		.replace(/\+/g, "-")
		.replace(/\//g, "_")
		.replace(/=+$/, "");
	const sig = await hmacSha256(body, secret);
	return `${body}.${sig}`;
}

// ─── verifyState ───────────────────────────────────────────────────────────────

/**
 * Vérifie un state signé et retourne le payload si valide.
 * Lève une erreur si la signature est invalide ou si le state a expiré.
 */
export async function verifyState(state: string): Promise<StatePayload> {
	const secret = getSecret();
	const dotIdx = state.lastIndexOf(".");
	if (dotIdx === -1) throw new Error("Invalid state format");
	const body = state.slice(0, dotIdx);
	const sig = state.slice(dotIdx + 1);

	// Comparaison en temps constant pour éviter les timing attacks
	const expected = await hmacSha256(body, secret);
	if (expected.length !== sig.length) throw new Error("Invalid signature");
	let diff = 0;
	for (let i = 0; i < expected.length; i++) {
		diff |= expected.charCodeAt(i) ^ sig.charCodeAt(i);
	}
	if (diff !== 0) throw new Error("Invalid signature");

	const json = b64UrlDecode(body);
	const payload = JSON.parse(json) as StatePayload;
	if (payload.exp < Date.now()) throw new Error("State expired");
	return payload;
}
