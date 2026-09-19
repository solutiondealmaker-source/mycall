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

// ─────────────────────────────────────────────────────────────────────────────
// Stripe — webhook de paiement
//
// Sécurité : Stripe signe chaque requête (header `Stripe-Signature`).
// On recalcule le HMAC-SHA256 de `${timestamp}.${rawBody}` avec le secret
// `whsec_…` et on compare en temps constant. Sans cette vérification,
// n'importe qui pourrait déclarer un paiement en appelant cette URL.
// ─────────────────────────────────────────────────────────────────────────────

async function hmacSha256Hex(data: string, secret: string): Promise<string> {
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
	return Array.from(new Uint8Array(sig))
		.map((b) => b.toString(16).padStart(2, "0"))
		.join("");
}

const STRIPE_TOLERANCE_SEC = 300; // 5 min — rejette les rejeux tardifs

http.route({
	path: "/webhooks/stripe",
	method: "POST",
	handler: httpAction(async (ctx, request) => {
		const rawBody = await request.text();
		const sigHeader = request.headers.get("stripe-signature");
		if (!sigHeader) return new Response("Missing signature", { status: 400 });

		const secret = await ctx.runQuery(
			internal.stripe.getWebhookSecretInternal,
			{},
		);
		if (!secret) {
			console.warn("[stripe webhook] no webhook secret configured");
			return new Response("Not configured", { status: 400 });
		}

		// Header : "t=1699999999,v1=abc...,v1=def..."
		const parts = sigHeader.split(",").map((p) => p.trim());
		const timestamp = parts.find((p) => p.startsWith("t="))?.slice(2);
		const signatures = parts
			.filter((p) => p.startsWith("v1="))
			.map((p) => p.slice(3));
		if (!timestamp || signatures.length === 0) {
			return new Response("Malformed signature", { status: 400 });
		}

		const age = Math.abs(Date.now() / 1000 - Number(timestamp));
		if (!Number.isFinite(age) || age > STRIPE_TOLERANCE_SEC) {
			return new Response("Timestamp outside tolerance", { status: 400 });
		}

		const expected = await hmacSha256Hex(`${timestamp}.${rawBody}`, secret);
		if (!signatures.some((s) => constantTimeEqual(s, expected))) {
			console.error("[stripe webhook] signature mismatch");
			return new Response("Invalid signature", { status: 400 });
		}

		// Signature valide — on peut faire confiance au contenu.
		let event: {
			type?: string;
			data?: { object?: Record<string, unknown> };
		};
		try {
			event = JSON.parse(rawBody);
		} catch {
			return new Response("Invalid JSON", { status: 400 });
		}

		// Échéancier : chaque prélèvement d'un abonnement produit une facture. Le
		// PaymentIntent correspondant n'hérite PAS des metadata du lien de départ,
		// c'est donc l'abonnement qui porte l'identifiant du lead — d'où cet
		// événement distinct. Sans lui, seule la première mensualité entrerait
		// dans le CRM.
		if (event.type === "invoice.payment_succeeded") {
			const inv = event.data?.object ?? {};
			const subscriptionId = String(inv.subscription ?? "");
			const piId = String(inv.payment_intent ?? "");
			const amount = Number(inv.amount_paid ?? 0);

			if (!subscriptionId || !piId || !amount) {
				return new Response(null, { status: 200 });
			}

			const sub = await ctx.runAction(
				internal.stripe.fetchSubscriptionInternal,
				{ subscriptionId },
			);
			if (!sub?.leadId || !sub.installments) {
				// Abonnement non créé par l'app : rien à rattacher.
				return new Response(null, { status: 200 });
			}

			const applied = await ctx.runMutation(
				internal.stripe.applyPaymentSucceededInternal,
				{ leadId: sub.leadId, amountCents: amount, paymentIntentId: piId },
			);

			const plan = await ctx.runMutation(
				internal.stripe.recordInstallmentInternal,
				{
					subscriptionId,
					leadId: sub.leadId,
					installments: sub.installments,
					amountCents: amount,
					alreadyApplied: applied.reason === "already_applied",
				},
			);

			// Stripe ne sait pas plafonner le nombre de cycles : c'est nous qui
			// résilions à la dernière échéance, sans quoi le prospect serait
			// prélevé indéfiniment.
			if (plan.shouldCancel) {
				await ctx.runAction(internal.stripe.cancelSubscriptionInternal, {
					subscriptionId,
				});
			}

			return new Response(null, { status: 200 });
		}

		if (event.type !== "payment_intent.succeeded") {
			return new Response(null, { status: 200 }); // ignoré, mais acquitté
		}

		const pi = event.data?.object ?? {};

		// Un PaymentIntent issu d'une facture d'abonnement est déjà traité
		// ci-dessus : l'ignorer ici évite de compter deux fois la même échéance.
		if (pi.invoice) {
			return new Response(null, { status: 200 });
		}
		const metadata = (pi.metadata ?? {}) as Record<string, string>;
		const leadId = metadata.leadId;
		const amount = Number(pi.amount_received ?? pi.amount ?? 0);
		const piId = String(pi.id ?? "");

		if (!leadId || !amount || !piId) {
			console.warn("[stripe webhook] payment without leadId metadata");
			return new Response(null, { status: 200 });
		}

		await ctx.runMutation(internal.stripe.applyPaymentSucceededInternal, {
			leadId,
			amountCents: amount,
			paymentIntentId: piId,
		});

		return new Response(null, { status: 200 });
	}),
});

// Désabonnement du nurturing. Servi depuis le domaine Convex plutôt que par
// Next : un lien de désinscription doit répondre même pendant un redéploiement
// du site, et rester valable indéfiniment.
http.route({
	pathPrefix: "/unsubscribe/",
	method: "GET",
	handler: httpAction(async (ctx, request) => {
		const token = new URL(request.url).pathname.split("/").pop() ?? "";
		const ok = token
			? await ctx.runMutation(internal.sequences.unsubscribeByTokenInternal, {
					token,
				})
			: false;

		const message = ok
			? "C'est fait. Vous ne recevrez plus nos emails de suivi."
			: "Ce lien n'est plus valide. Vous êtes peut-être déjà désabonné.";

		const page = `<!DOCTYPE html>
<html lang="fr">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>Désabonnement</title>
</head>
<body style="margin:0;min-height:100vh;display:flex;align-items:center;justify-content:center;background:#F8F4EC;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;color:#201C16">
<div style="max-width:420px;padding:40px;text-align:center">
<p style="font-size:17px;line-height:1.6;margin:0">${message}</p>
</div>
</body>
</html>`;

		return new Response(page, {
			status: 200,
			headers: { "Content-Type": "text/html; charset=utf-8" },
		});
	}),
});

// ─────────────────────────────────────────────────────────────────────────────
// FATHOM — appels enregistrés
//
// Une adresse par connexion (/webhooks/fathom/<id>) : chaque membre a son
// propre compte Fathom, donc son propre secret de signature. Format Standard
// Webhooks : en-têtes webhook-id / webhook-timestamp / webhook-signature
// (« v1,<base64> », éventuellement plusieurs séparées par des espaces).
// ─────────────────────────────────────────────────────────────────────────────

const FATHOM_TOLERANCE_SEC = 300;

async function fathomSignature(
	secret: string,
	content: string,
): Promise<string> {
	const raw = secret.startsWith("whsec_") ? secret.slice(6) : secret;
	const keyBytes = Uint8Array.from(atob(raw), (c) => c.charCodeAt(0));
	const key = await crypto.subtle.importKey(
		"raw",
		keyBytes,
		{ name: "HMAC", hash: "SHA-256" },
		false,
		["sign"],
	);
	const sig = await crypto.subtle.sign(
		"HMAC",
		key,
		new TextEncoder().encode(content),
	);
	let s = "";
	for (const b of new Uint8Array(sig)) s += String.fromCharCode(b);
	return btoa(s);
}

http.route({
	pathPrefix: "/webhooks/fathom/",
	method: "POST",
	handler: httpAction(async (ctx, request) => {
		const connectionId =
			new URL(request.url).pathname.split("/").filter(Boolean).pop() ?? "";
		const conn = await ctx.runQuery(internal.fathom.getWebhookSecretInternal, {
			connectionId,
		});
		// Connexion supprimée : 410 pour que Fathom cesse d'envoyer.
		if (!conn) return new Response("Unknown connection", { status: 410 });

		const body = await request.text();
		const id = request.headers.get("webhook-id") ?? "";
		const timestamp = request.headers.get("webhook-timestamp") ?? "";
		const header = request.headers.get("webhook-signature") ?? "";
		if (!id || !timestamp || !header) {
			return new Response("Missing signature", { status: 400 });
		}
		const age = Math.abs(Date.now() / 1000 - Number(timestamp));
		if (!Number.isFinite(age) || age > FATHOM_TOLERANCE_SEC) {
			return new Response("Stale timestamp", { status: 400 });
		}

		let expected: string;
		try {
			expected = await fathomSignature(
				conn.secret,
				`${id}.${timestamp}.${body}`,
			);
		} catch {
			return new Response("Invalid secret", { status: 500 });
		}
		const valid = header
			.split(" ")
			.map((part) => part.split(",")[1] ?? "")
			.some((sig) => constantTimeEqual(sig, expected));
		if (!valid) return new Response("Invalid signature", { status: 401 });

		// Traitement hors requête : Fathom attend une réponse rapide.
		await ctx.scheduler.runAfter(0, internal.fathom.receiveInternal, {
			connectionId: conn.id,
			body,
		});
		return new Response(null, { status: 200 });
	}),
});

// ─────────────────────────────────────────────────────────────────────────────
// API ENTRANTE — Make, Zapier, n8n…
//
// Authentification par clé (Paramètres → Intégrations) : en-tête
// « Authorization: Bearer mc_… », « X-API-Key », ou paramètre ?api_key=.
// Corps accepté en JSON ou en formulaire (le format par défaut de Zapier), en
// snake_case comme en camelCase.
// ─────────────────────────────────────────────────────────────────────────────

const json = (body: unknown, status = 200) =>
	new Response(JSON.stringify(body), {
		status,
		headers: { "Content-Type": "application/json; charset=utf-8" },
	});

async function authenticate(
	ctx: Parameters<Parameters<typeof httpAction>[0]>[0],
	request: Request,
) {
	const url = new URL(request.url);
	const header = request.headers.get("authorization") ?? "";
	const key = (
		/^Bearer\s+(.+)$/i.exec(header)?.[1] ??
		request.headers.get("x-api-key") ??
		url.searchParams.get("api_key") ??
		""
	).trim();
	if (!key) return null;
	return await ctx.runMutation(internal.automations.verifyApiKeyInternal, {
		keyHash: await sha256Hex(key),
	});
}

async function sha256Hex(input: string): Promise<string> {
	const digest = await crypto.subtle.digest(
		"SHA-256",
		new TextEncoder().encode(input),
	);
	return Array.from(new Uint8Array(digest))
		.map((b) => b.toString(16).padStart(2, "0"))
		.join("");
}

type Body = Record<string, unknown>;

async function readBody(request: Request): Promise<Body> {
	const type = request.headers.get("content-type") ?? "";
	const text = await request.text();
	if (!text.trim()) return {};
	if (type.includes("application/x-www-form-urlencoded")) {
		return Object.fromEntries(new URLSearchParams(text));
	}
	try {
		const parsed = JSON.parse(text);
		return parsed && typeof parsed === "object" && !Array.isArray(parsed)
			? parsed
			: {};
	} catch {
		throw new Error("Corps de requête illisible : envoie du JSON.");
	}
}

// Lit un champ texte sous ses deux écritures : first_name ou firstName.
function field(body: Body, snake: string): string | undefined {
	const camel = snake.replace(/_([a-z])/g, (_, c: string) => c.toUpperCase());
	const value = body[snake] ?? body[camel];
	if (value === undefined || value === null) return undefined;
	const s = String(value).trim();
	return s === "" ? undefined : s;
}

function numberField(body: Body, snake: string): number | undefined {
	const raw = field(body, snake);
	if (raw === undefined) return undefined;
	const n = Number(raw.replace(",", "."));
	if (!Number.isFinite(n)) throw new Error(`${snake} doit être un nombre.`);
	return n;
}

function tagsField(body: Body): string[] | undefined {
	const raw = body.tags;
	if (Array.isArray(raw))
		return raw
			.map(String)
			.map((t) => t.trim())
			.filter(Boolean);
	if (typeof raw === "string" && raw.trim()) {
		return raw
			.split(",")
			.map((t) => t.trim())
			.filter(Boolean);
	}
	return undefined;
}

function errorMessage(err: unknown): string {
	const msg = err instanceof Error ? err.message : String(err);
	return /Uncaught Error: ([^\n]+)/.exec(msg)?.[1] ?? msg.split("\n")[0];
}

const API_DOC = {
	authentication:
		"En-tête Authorization: Bearer <clé>, ou X-API-Key: <clé>, ou ?api_key=<clé>",
	endpoints: {
		"GET /api/v1/me": "Vérifie la clé.",
		"GET /api/v1/events": "Événements actifs et leurs liens de réservation.",
		"GET /api/v1/leads?email=|phone=|id=": "Retrouve un lead.",
		"POST /api/v1/leads":
			"Crée ou complète un lead (email ou phone requis). Champs : first_name, last_name, email, phone, status, source, tags, note, closer_email, event_slug, amount, utm_source, utm_medium, utm_campaign, utm_term, utm_content.",
		"POST /api/v1/leads/notes":
			"Ajoute une note. Champs : id | email | phone, body.",
		"POST /api/v1/leads/status":
			"Change le statut. Champs : id | email | phone, status, amount (optionnel, en euros).",
	},
	statuses: [
		"potentiel",
		"qualifie",
		"rdv_reserve",
		"tenu",
		"gagne",
		"perdu",
		"follow_up",
	],
};

http.route({
	pathPrefix: "/api/v1/",
	method: "GET",
	handler: httpAction(async (ctx, request) => {
		const auth = await authenticate(ctx, request);
		if (!auth) return json({ error: "Clé d'API absente ou invalide." }, 401);
		const url = new URL(request.url);
		const path = url.pathname.replace(/\/+$/, "");

		try {
			if (path === "/api/v1/me") {
				return json({ ok: true, key: auth.name, documentation: API_DOC });
			}
			if (path === "/api/v1/events") {
				return json({
					events: await ctx.runQuery(
						internal.automations.apiListEventsInternal,
						{},
					),
				});
			}
			if (path === "/api/v1/leads") {
				const ref = {
					leadId: url.searchParams.get("id") ?? undefined,
					email: url.searchParams.get("email") ?? undefined,
					phone: url.searchParams.get("phone") ?? undefined,
				};
				if (!ref.leadId && !ref.email && !ref.phone) {
					return json({ error: "Précise id, email ou phone." }, 400);
				}
				const lead = await ctx.runQuery(
					internal.automations.apiFindLeadInternal,
					ref,
				);
				return lead
					? json({ lead })
					: json({ error: "Lead introuvable." }, 404);
			}
			return json({ error: "Route inconnue.", documentation: API_DOC }, 404);
		} catch (err) {
			return json({ error: errorMessage(err) }, 400);
		}
	}),
});

http.route({
	pathPrefix: "/api/v1/",
	method: "POST",
	handler: httpAction(async (ctx, request) => {
		const auth = await authenticate(ctx, request);
		if (!auth) return json({ error: "Clé d'API absente ou invalide." }, 401);
		const path = new URL(request.url).pathname.replace(/\/+$/, "");

		try {
			const body = await readBody(request);
			const ref = {
				leadId: field(body, "id") ?? field(body, "lead_id"),
				email: field(body, "email"),
				phone: field(body, "phone"),
			};

			if (path === "/api/v1/leads") {
				const res = await ctx.runMutation(
					internal.automations.apiUpsertLeadInternal,
					{
						userId: auth.userId,
						email: ref.email,
						phone: ref.phone,
						firstName: field(body, "first_name"),
						lastName: field(body, "last_name"),
						status: field(body, "status"),
						source: field(body, "source"),
						tags: tagsField(body),
						note: field(body, "note"),
						closerEmail: field(body, "closer_email"),
						eventSlug: field(body, "event_slug"),
						amount: numberField(body, "amount"),
						utmSource: field(body, "utm_source"),
						utmMedium: field(body, "utm_medium"),
						utmCampaign: field(body, "utm_campaign"),
						utmTerm: field(body, "utm_term"),
						utmContent: field(body, "utm_content"),
					},
				);
				return json({ ok: true, ...res }, res.created ? 201 : 200);
			}

			if (path === "/api/v1/leads/notes") {
				const note = field(body, "body") ?? field(body, "note");
				if (!note) return json({ error: "Champ body manquant." }, 400);
				const res = await ctx.runMutation(
					internal.automations.apiAddNoteInternal,
					{ userId: auth.userId, ...ref, body: note },
				);
				return json({ ok: true, ...res }, 201);
			}

			if (path === "/api/v1/leads/status") {
				const status = field(body, "status");
				if (!status) return json({ error: "Champ status manquant." }, 400);
				const res = await ctx.runMutation(
					internal.automations.apiSetStatusInternal,
					{ ...ref, status, amount: numberField(body, "amount") },
				);
				return json({ ok: true, ...res });
			}

			return json({ error: "Route inconnue.", documentation: API_DOC }, 404);
		} catch (err) {
			const message = errorMessage(err);
			return json({ error: message }, /introuvable/i.test(message) ? 404 : 400);
		}
	}),
});

export default http;
