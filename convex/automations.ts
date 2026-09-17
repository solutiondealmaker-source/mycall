// automations.ts — Mycall dans la boucle de Make, Zapier, n8n…
//
// Sortant : chaque adresse enregistrée reçoit en POST les événements auxquels
// elle est abonnée, signés (HMAC SHA-256) et réessayés en cas d'échec.
// Entrant : une clé d'API permet de créer ou compléter un lead, d'ajouter une
// note ou de changer un statut (routes /api/v1 dans http.ts).

import { v } from "convex/values";
import { internal } from "./_generated/api";
import type { Doc, Id } from "./_generated/dataModel";
import {
	action,
	internalAction,
	internalMutation,
	internalQuery,
	type MutationCtx,
	mutation,
	type QueryCtx,
	query,
} from "./_generated/server";
import { _findLeadByAnyKey } from "./leads";
import { requireAdmin } from "./lib/auth";
import { BRAND_NAME } from "./lib/emailTemplates";
import { normalizeEmail, normalizePhone } from "./lib/leadMatch";
import { type EventSource, emitEvent } from "./lib/outbound";
import {
	LEAD_STATUS_LABELS,
	OUTBOUND_EVENT_TYPES,
	type OutboundEventType,
} from "./lib/outboundEvents";

// Délais avant les nouvelles tentatives : 1 min, 10 min, 1 h.
const RETRY_DELAYS_MS = [60_000, 600_000, 3_600_000];
const MAX_DELIVERIES_KEPT = 50;

const SITE_URL = (
	process.env.APP_BASE_URL ??
	process.env.SITE_URL ??
	"http://localhost:3000"
).replace(/\/$/, "");

function randomToken(bytes: number): string {
	const buf = new Uint8Array(bytes);
	crypto.getRandomValues(buf);
	return btoa(String.fromCharCode(...buf))
		.replace(/\+/g, "-")
		.replace(/\//g, "_")
		.replace(/=+$/, "");
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

async function hmacHex(secret: string, data: string): Promise<string> {
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

function validateUrl(url: string): string {
	const clean = url.trim();
	let parsed: URL;
	try {
		parsed = new URL(clean);
	} catch {
		throw new Error("Adresse invalide : colle l'URL complète du webhook.");
	}
	if (parsed.protocol !== "https:") {
		throw new Error("L'adresse doit commencer par https://");
	}
	return clean;
}

function validateEvents(events: string[]): string[] {
	const unique = [...new Set(events)];
	if (unique.length === 0) throw new Error("Choisis au moins un événement.");
	for (const e of unique) {
		if (e !== "*" && !OUTBOUND_EVENT_TYPES.includes(e)) {
			throw new Error(`Événement inconnu : ${e}`);
		}
	}
	return unique;
}

// ============================================================
// Contenu envoyé
// ============================================================

const euros = (cents: number | undefined) =>
	cents === undefined ? null : Math.round(cents) / 100;

const iso = (ms: number | undefined) =>
	ms === undefined ? null : new Date(ms).toISOString();

async function personOf(ctx: QueryCtx, id: Id<"users"> | undefined) {
	if (!id) return null;
	const u = await ctx.db.get(id);
	return u ? { name: u.name ?? null, email: u.email ?? null } : null;
}

async function leadPayload(ctx: QueryCtx, lead: Doc<"leads">) {
	let formAnswers: unknown = null;
	if (lead.formAnswers) {
		try {
			formAnswers = JSON.parse(lead.formAnswers);
		} catch {
			formAnswers = lead.formAnswers;
		}
	}
	const event = lead.eventId ? await ctx.db.get(lead.eventId) : null;
	const fullName = [lead.firstName, lead.lastName].filter(Boolean).join(" ");
	return {
		id: lead._id,
		first_name: lead.firstName ?? null,
		last_name: lead.lastName ?? null,
		full_name: fullName || null,
		email: lead.email ?? null,
		phone: lead.phone ?? null,
		status: lead.status,
		status_label: LEAD_STATUS_LABELS[lead.status] ?? lead.status,
		source: lead.tagSource ?? null,
		tags: lead.tags ?? [],
		utm_source: lead.utmSource ?? null,
		utm_medium: lead.utmMedium ?? null,
		utm_campaign: lead.utmCampaign ?? null,
		utm_term: lead.utmTerm ?? null,
		utm_content: lead.utmContent ?? null,
		form_answers: formAnswers,
		amount_contracted: euros(lead.montantContracte),
		converted_at: iso(lead.convertedAt),
		unsubscribed: Boolean(lead.emailOptOutAt),
		event: event ? { name: event.name, slug: event.slug } : null,
		closer: await personOf(ctx, lead.closerUserId),
		setter: await personOf(ctx, lead.setterUserId),
		created_at: iso(lead._creationTime),
		crm_url: `${SITE_URL}/crm/${lead._id}`,
	};
}

async function bookingPayload(ctx: QueryCtx, booking: Doc<"bookings">) {
	const event = await ctx.db.get(booking.eventId);
	return {
		id: booking._id,
		event: event
			? { name: event.name, slug: event.slug }
			: { name: null, slug: booking.eventSlug },
		start_time: iso(booking.startTime),
		end_time: iso(booking.endTime),
		timezone: booking.timezone,
		status: booking.status,
		attendance: booking.tenue,
		outcome: booking.issue,
		amount: euros(booking.issueAmountCents),
		meet_url: booking.googleMeetUrl ?? null,
		host: await personOf(ctx, booking.hostId),
		prospect: {
			first_name: booking.prospectFirstName,
			last_name: booking.prospectLastName,
			email: booking.prospectEmail ?? null,
			phone: booking.prospectPhone,
		},
		cancel_url: `${SITE_URL}/book/manage/${booking.cancelToken}`,
		reschedule_url: `${SITE_URL}/book/reschedule/${booking.rescheduleToken}`,
	};
}

export const buildPayloadInternal = internalQuery({
	args: {
		leadId: v.optional(v.id("leads")),
		bookingId: v.optional(v.id("bookings")),
	},
	handler: async (ctx, { leadId, bookingId }) => {
		const booking = bookingId ? await ctx.db.get(bookingId) : null;
		const effectiveLeadId = leadId ?? booking?.leadId;
		const lead = effectiveLeadId ? await ctx.db.get(effectiveLeadId) : null;
		return {
			lead: lead ? await leadPayload(ctx, lead) : null,
			booking: booking ? await bookingPayload(ctx, booking) : null,
		};
	},
});

// ============================================================
// Envoi
// ============================================================

export const getEndpointInternal = internalQuery({
	args: { id: v.id("webhookEndpoints") },
	handler: async (ctx, { id }) => await ctx.db.get(id),
});

export const recordDeliveryInternal = internalMutation({
	args: {
		endpointId: v.id("webhookEndpoints"),
		eventId: v.string(),
		eventType: v.string(),
		status: v.union(
			v.literal("success"),
			v.literal("failed"),
			v.literal("retrying"),
		),
		attempt: v.number(),
		httpStatus: v.optional(v.number()),
		error: v.optional(v.string()),
		disable: v.optional(v.string()),
	},
	handler: async (ctx, { disable, ...args }) => {
		const endpoint = await ctx.db.get(args.endpointId);
		if (!endpoint) return;
		const now = Date.now();
		await ctx.db.insert("webhookDeliveries", { ...args, createdAt: now });
		await ctx.db.patch(endpoint._id, {
			lastDeliveryAt: now,
			lastStatus: args.status === "success" ? "success" : "failed",
			lastHttpStatus: args.httpStatus,
			...(disable && { active: false, disabledReason: disable }),
		});

		const old = await ctx.db
			.query("webhookDeliveries")
			.withIndex("by_endpoint_createdAt", (q) =>
				q.eq("endpointId", endpoint._id),
			)
			.order("desc")
			.collect();
		for (const row of old.slice(MAX_DELIVERIES_KEPT)) {
			await ctx.db.delete(row._id);
		}
	},
});

async function post(
	url: string,
	secret: string,
	type: string,
	body: string,
): Promise<{ ok: boolean; httpStatus?: number; error?: string }> {
	const timestamp = Math.floor(Date.now() / 1000).toString();
	const signature = await hmacHex(secret, `${timestamp}.${body}`);
	try {
		const res = await fetch(url, {
			method: "POST",
			headers: {
				"Content-Type": "application/json",
				"User-Agent": "Mycall-Webhooks/1.0",
				"X-Mycall-Event": type,
				"X-Mycall-Timestamp": timestamp,
				"X-Mycall-Signature": `sha256=${signature}`,
			},
			body,
			signal: AbortSignal.timeout(15_000),
		});
		if (res.ok) return { ok: true, httpStatus: res.status };
		const text = (await res.text().catch(() => "")).slice(0, 300);
		return {
			ok: false,
			httpStatus: res.status,
			error: text || `HTTP ${res.status}`,
		};
	} catch (err) {
		return {
			ok: false,
			error: err instanceof Error ? err.message : String(err),
		};
	}
}

export const deliver = internalAction({
	args: {
		endpointId: v.id("webhookEndpoints"),
		eventId: v.string(),
		type: v.string(),
		occurredAt: v.number(),
		leadId: v.optional(v.id("leads")),
		bookingId: v.optional(v.id("bookings")),
		data: v.optional(v.string()),
		source: v.string(),
		attempt: v.number(),
	},
	handler: async (ctx, args) => {
		const endpoint = await ctx.runQuery(
			internal.automations.getEndpointInternal,
			{ id: args.endpointId },
		);
		if (!endpoint?.active) return;

		const payload = await ctx.runQuery(
			internal.automations.buildPayloadInternal,
			{ leadId: args.leadId, bookingId: args.bookingId },
		);
		const body = JSON.stringify({
			id: args.eventId,
			type: args.type,
			occurred_at: new Date(args.occurredAt).toISOString(),
			source: args.source,
			instance: BRAND_NAME,
			...payload,
			data: args.data ? JSON.parse(args.data) : {},
		});

		const res = await post(endpoint.url, endpoint.secret, args.type, body);
		const status = res.httpStatus;
		// 410 : l'outil a supprimé ce webhook (Zapier le fait quand un Zap est
		// effacé). Inutile d'insister : on le désactive.
		const gone = status === 410;
		const permanent =
			status !== undefined &&
			status >= 400 &&
			status < 500 &&
			status !== 408 &&
			status !== 429;
		const retry =
			!res.ok && !permanent && args.attempt <= RETRY_DELAYS_MS.length;

		await ctx.runMutation(internal.automations.recordDeliveryInternal, {
			endpointId: args.endpointId,
			eventId: args.eventId,
			eventType: args.type,
			status: res.ok ? "success" : retry ? "retrying" : "failed",
			attempt: args.attempt,
			httpStatus: status,
			error: res.error,
			disable: gone
				? "Supprimé côté outil d'automatisation (HTTP 410)"
				: undefined,
		});

		if (retry) {
			await ctx.scheduler.runAfter(
				RETRY_DELAYS_MS[args.attempt - 1],
				internal.automations.deliver,
				{ ...args, attempt: args.attempt + 1 },
			);
		}
	},
});

// ============================================================
// Gestion des webhooks
// ============================================================

export const listEndpoints = query({
	args: {},
	handler: async (ctx) => {
		await requireAdmin(ctx);
		const endpoints = await ctx.db.query("webhookEndpoints").collect();
		return endpoints.sort((a, b) => a.createdAt - b.createdAt);
	},
});

export const listDeliveries = query({
	args: { endpointId: v.id("webhookEndpoints") },
	handler: async (ctx, { endpointId }) => {
		await requireAdmin(ctx);
		return await ctx.db
			.query("webhookDeliveries")
			.withIndex("by_endpoint_createdAt", (q) => q.eq("endpointId", endpointId))
			.order("desc")
			.take(15);
	},
});

export const insertEndpointInternal = internalMutation({
	args: {
		userId: v.id("users"),
		url: v.string(),
		description: v.optional(v.string()),
		events: v.array(v.string()),
		secret: v.string(),
	},
	handler: async (ctx, args) => {
		return await ctx.db.insert("webhookEndpoints", {
			url: args.url,
			description: args.description,
			events: args.events,
			secret: args.secret,
			active: true,
			createdByUserId: args.userId,
			createdAt: Date.now(),
		});
	},
});

export const assertAdminInternal = internalQuery({
	args: {},
	handler: async (ctx) => await requireAdmin(ctx),
});

// Action : le secret de signature est tiré d'un générateur cryptographique.
export const createEndpoint = action({
	args: {
		url: v.string(),
		events: v.array(v.string()),
		description: v.optional(v.string()),
	},
	handler: async (ctx, args): Promise<Id<"webhookEndpoints">> => {
		const userId = await ctx.runQuery(
			internal.automations.assertAdminInternal,
			{},
		);
		return await ctx.runMutation(internal.automations.insertEndpointInternal, {
			userId,
			url: validateUrl(args.url),
			events: validateEvents(args.events),
			description: args.description?.trim() || undefined,
			secret: `whsec_${randomToken(24)}`,
		});
	},
});

export const updateEndpoint = mutation({
	args: {
		id: v.id("webhookEndpoints"),
		url: v.optional(v.string()),
		events: v.optional(v.array(v.string())),
		description: v.optional(v.string()),
		active: v.optional(v.boolean()),
	},
	handler: async (ctx, { id, url, events, description, active }) => {
		await requireAdmin(ctx);
		const endpoint = await ctx.db.get(id);
		if (!endpoint) throw new Error("Webhook introuvable");
		await ctx.db.patch(id, {
			...(url !== undefined && { url: validateUrl(url) }),
			...(events !== undefined && { events: validateEvents(events) }),
			...(description !== undefined && {
				description: description.trim() || undefined,
			}),
			...(active !== undefined && {
				active,
				...(active && { disabledReason: undefined }),
			}),
		});
		return { ok: true };
	},
});

export const deleteEndpoint = mutation({
	args: { id: v.id("webhookEndpoints") },
	handler: async (ctx, { id }) => {
		await requireAdmin(ctx);
		const deliveries = await ctx.db
			.query("webhookDeliveries")
			.withIndex("by_endpoint_createdAt", (q) => q.eq("endpointId", id))
			.collect();
		for (const d of deliveries) await ctx.db.delete(d._id);
		await ctx.db.delete(id);
		return { ok: true };
	},
});

// Envoie un exemple réaliste : Make et Zapier en ont besoin pour détecter la
// structure des données et proposer les champs à relier.
export const sendTest = action({
	args: { id: v.id("webhookEndpoints"), type: v.optional(v.string()) },
	handler: async (
		ctx,
		{ id, type },
	): Promise<{ ok: boolean; httpStatus?: number; error?: string }> => {
		await ctx.runQuery(internal.automations.assertAdminInternal, {});
		const endpoint = await ctx.runQuery(
			internal.automations.getEndpointInternal,
			{ id },
		);
		if (!endpoint) throw new Error("Webhook introuvable");

		const eventType =
			type ??
			endpoint.events.find((e) => e !== "*") ??
			("booking.created" satisfies OutboundEventType);
		const now = Date.now();
		const start = now + 2 * 86_400_000;
		const body = JSON.stringify({
			id: `evt_test_${now.toString(36)}`,
			type: eventType,
			occurred_at: new Date(now).toISOString(),
			source: "test",
			instance: BRAND_NAME,
			lead: {
				id: "test_lead",
				first_name: "Camille",
				last_name: "Exemple",
				full_name: "Camille Exemple",
				email: "camille.exemple@example.com",
				phone: "+33600000000",
				status: "rdv_reserve",
				status_label: "RDV réservé",
				source: "test",
				tags: ["exemple"],
				utm_source: "instagram",
				utm_medium: null,
				utm_campaign: null,
				utm_term: null,
				utm_content: null,
				form_answers: { "Votre objectif": "Exemple de réponse" },
				amount_contracted: null,
				converted_at: null,
				unsubscribed: false,
				event: { name: "Appel découverte", slug: "appel-decouverte" },
				closer: { name: "Alex Closer", email: "alex@example.com" },
				setter: null,
				created_at: new Date(now).toISOString(),
				crm_url: `${SITE_URL}/crm`,
			},
			booking: {
				id: "test_booking",
				event: { name: "Appel découverte", slug: "appel-decouverte" },
				start_time: new Date(start).toISOString(),
				end_time: new Date(start + 1_800_000).toISOString(),
				timezone: "Europe/Paris",
				status: "confirmed",
				attendance: "planifie",
				outcome: "en_attente",
				amount: null,
				meet_url: "https://meet.google.com/abc-defg-hij",
				host: { name: "Alex Closer", email: "alex@example.com" },
				prospect: {
					first_name: "Camille",
					last_name: "Exemple",
					email: "camille.exemple@example.com",
					phone: "+33600000000",
				},
				cancel_url: `${SITE_URL}/book/manage/exemple`,
				reschedule_url: `${SITE_URL}/book/reschedule/exemple`,
			},
			data: {},
		});

		const res = await post(endpoint.url, endpoint.secret, eventType, body);
		await ctx.runMutation(internal.automations.recordDeliveryInternal, {
			endpointId: id,
			eventId: `test_${now}`,
			eventType: `${eventType} (test)`,
			status: res.ok ? "success" : "failed",
			attempt: 1,
			httpStatus: res.httpStatus,
			error: res.error,
		});
		return res;
	},
});

// ============================================================
// Clés d'API (entrant)
// ============================================================

export const listApiKeys = query({
	args: {},
	handler: async (ctx) => {
		await requireAdmin(ctx);
		const keys = await ctx.db.query("apiKeys").collect();
		return keys
			.filter((k) => !k.revokedAt)
			.sort((a, b) => b.createdAt - a.createdAt)
			.map((k) => ({
				_id: k._id,
				name: k.name,
				prefix: k.prefix,
				createdAt: k.createdAt,
				lastUsedAt: k.lastUsedAt ?? null,
			}));
	},
});

export const insertApiKeyInternal = internalMutation({
	args: {
		userId: v.id("users"),
		name: v.string(),
		keyHash: v.string(),
		prefix: v.string(),
	},
	handler: async (ctx, args) => {
		await ctx.db.insert("apiKeys", {
			name: args.name,
			keyHash: args.keyHash,
			prefix: args.prefix,
			createdByUserId: args.userId,
			createdAt: Date.now(),
		});
	},
});

// La clé n'est renvoyée qu'ici, une seule fois : seule son empreinte est
// conservée.
export const createApiKey = action({
	args: { name: v.string() },
	handler: async (ctx, { name }): Promise<{ key: string }> => {
		const userId = await ctx.runQuery(
			internal.automations.assertAdminInternal,
			{},
		);
		const label = name.trim();
		if (!label) throw new Error("Donne un nom à cette clé (ex. « Make »).");
		const key = `mc_${randomToken(32)}`;
		await ctx.runMutation(internal.automations.insertApiKeyInternal, {
			userId,
			name: label.slice(0, 60),
			keyHash: await sha256Hex(key),
			prefix: key.slice(0, 10),
		});
		return { key };
	},
});

export const revokeApiKey = mutation({
	args: { id: v.id("apiKeys") },
	handler: async (ctx, { id }) => {
		await requireAdmin(ctx);
		await ctx.db.patch(id, { revokedAt: Date.now() });
		return { ok: true };
	},
});

export const verifyApiKeyInternal = internalMutation({
	args: { keyHash: v.string() },
	handler: async (ctx, { keyHash }) => {
		const key = await ctx.db
			.query("apiKeys")
			.withIndex("by_keyHash", (q) => q.eq("keyHash", keyHash))
			.first();
		if (!key || key.revokedAt) return null;
		const now = Date.now();
		// Une écriture par minute au plus : une automatisation qui boucle ne
		// doit pas transformer chaque appel en écriture.
		if (!key.lastUsedAt || now - key.lastUsedAt > 60_000) {
			await ctx.db.patch(key._id, { lastUsedAt: now });
		}
		return { keyId: key._id, name: key.name, userId: key.createdByUserId };
	},
});

// ============================================================
// Actions entrantes
// ============================================================

const STATUS_ALIASES: Record<string, Doc<"leads">["status"]> = {
	potentiel: "potentiel",
	new: "potentiel",
	lead: "potentiel",
	qualifie: "qualifie",
	qualified: "qualifie",
	rdv_reserve: "rdv_reserve",
	booked: "rdv_reserve",
	tenu: "tenu",
	held: "tenu",
	showed: "tenu",
	gagne: "gagne",
	won: "gagne",
	perdu: "perdu",
	lost: "perdu",
	follow_up: "follow_up",
	followup: "follow_up",
};

export function parseStatus(
	input: unknown,
): Doc<"leads">["status"] | undefined {
	if (input === undefined || input === null || input === "") return undefined;
	const key = String(input)
		.trim()
		.toLowerCase()
		.normalize("NFD")
		.replace(/[̀-ͯ]/g, "")
		.replace(/[\s-]+/g, "_");
	const status = STATUS_ALIASES[key];
	if (!status) {
		throw new Error(
			`Statut inconnu « ${input} ». Valeurs possibles : ${Object.keys(LEAD_STATUS_LABELS).join(", ")}.`,
		);
	}
	return status;
}

async function findLead(
	ctx: MutationCtx | QueryCtx,
	ref: { leadId?: string; email?: string; phone?: string },
): Promise<Doc<"leads"> | null> {
	if (ref.leadId) {
		const id = ctx.db.normalizeId("leads", ref.leadId);
		return id ? await ctx.db.get(id) : null;
	}
	const normEmail = normalizeEmail(ref.email);
	const normPhone = normalizePhone(ref.phone);
	if (normEmail) {
		const byEmail = await ctx.db
			.query("leads")
			.withIndex("by_emailNormalized", (q) =>
				q.eq("emailNormalized", normEmail),
			)
			.first();
		if (byEmail) return byEmail;
	}
	if (normPhone) {
		return await ctx.db
			.query("leads")
			.withIndex("by_phoneNormalized", (q) =>
				q.eq("phoneNormalized", normPhone),
			)
			.first();
	}
	return null;
}

async function applyStatus(
	ctx: MutationCtx,
	lead: Doc<"leads">,
	status: Doc<"leads">["status"],
	amountCents: number | undefined,
	source: EventSource,
) {
	const now = Date.now();
	if (status === lead.status && amountCents === undefined) return false;
	await ctx.db.patch(lead._id, {
		status,
		phase: status,
		lastInteractionAt: now,
		...(status === "gagne" && !lead.convertedAt && { convertedAt: now }),
		...(amountCents !== undefined && {
			montantContracte: (lead.montantContracte ?? 0) + amountCents,
		}),
	});
	if (status !== lead.status) {
		await emitEvent(ctx, "lead.status_changed", {
			leadId: lead._id,
			source,
			data: { previous_status: lead.status, status },
		});
	}
	return true;
}

const optionalString = v.optional(v.string());

export const apiUpsertLeadInternal = internalMutation({
	args: {
		userId: v.id("users"),
		email: optionalString,
		phone: optionalString,
		firstName: optionalString,
		lastName: optionalString,
		status: optionalString,
		source: optionalString,
		tags: v.optional(v.array(v.string())),
		note: optionalString,
		closerEmail: optionalString,
		eventSlug: optionalString,
		amount: v.optional(v.number()),
		utmSource: optionalString,
		utmMedium: optionalString,
		utmCampaign: optionalString,
		utmTerm: optionalString,
		utmContent: optionalString,
	},
	handler: async (ctx, args) => {
		const email = args.email?.trim().toLowerCase() || undefined;
		const phone = args.phone?.trim() || undefined;
		if (!email && !phone) {
			throw new Error("Il faut au moins un email ou un téléphone.");
		}
		const status = parseStatus(args.status);
		const amountCents =
			args.amount !== undefined ? Math.round(args.amount * 100) : undefined;

		let closerUserId: Id<"users"> | undefined;
		if (args.closerEmail) {
			const closer = await ctx.db
				.query("users")
				.withIndex("email", (q) =>
					q.eq("email", args.closerEmail?.trim().toLowerCase()),
				)
				.first();
			if (!closer) {
				throw new Error(`Aucun membre avec l'email ${args.closerEmail}.`);
			}
			closerUserId = closer._id;
		}

		let event: Doc<"events"> | null = null;
		if (args.eventSlug) {
			event = await ctx.db
				.query("events")
				.withIndex("by_slug", (q) => q.eq("slug", args.eventSlug?.trim() ?? ""))
				.first();
			if (!event) throw new Error(`Événement introuvable : ${args.eventSlug}`);
		}

		const utm = {
			...(args.utmSource && { utmSource: args.utmSource }),
			...(args.utmMedium && { utmMedium: args.utmMedium }),
			...(args.utmCampaign && { utmCampaign: args.utmCampaign }),
			...(args.utmTerm && { utmTerm: args.utmTerm }),
			...(args.utmContent && { utmContent: args.utmContent }),
		};
		const now = Date.now();
		const existing = await _findLeadByAnyKey(ctx, { email, phone });

		let lead: Doc<"leads">;
		let created = false;
		if (existing) {
			const tags = args.tags?.length
				? [...new Set([...(existing.tags ?? []), ...args.tags])]
				: undefined;
			await ctx.db.patch(existing._id, {
				...(args.firstName && { firstName: args.firstName }),
				...(args.lastName && { lastName: args.lastName }),
				...(email && { email, emailNormalized: normalizeEmail(email) }),
				...(phone && {
					phone,
					phoneNormalized: normalizePhone(phone) || undefined,
				}),
				...(args.source && { tagSource: args.source }),
				...(tags && { tags }),
				...(closerUserId && { closerUserId }),
				...(event && { eventId: event._id, eventSlug: event.slug }),
				...utm,
				lastInteractionAt: now,
			});
			lead = (await ctx.db.get(existing._id)) as Doc<"leads">;
		} else {
			const id = await ctx.db.insert("leads", {
				firstName: args.firstName,
				lastName: args.lastName,
				email,
				phone,
				emailNormalized: normalizeEmail(email) || undefined,
				phoneNormalized: normalizePhone(phone) || undefined,
				status: "potentiel",
				phase: "potentiel",
				tagSource: args.source ?? "api",
				tags: args.tags,
				closerUserId,
				eventId: event?._id,
				eventSlug: event?.slug,
				...utm,
				lastInteractionAt: now,
			});
			lead = (await ctx.db.get(id)) as Doc<"leads">;
			created = true;
			await emitEvent(ctx, "lead.created", { leadId: id, source: "api" });
		}

		if (status || amountCents !== undefined) {
			await applyStatus(
				ctx,
				lead,
				status ?? (amountCents !== undefined ? "gagne" : lead.status),
				amountCents,
				"api",
			);
		}
		if (args.note?.trim()) {
			await ctx.db.insert("leadNotes", {
				leadId: lead._id,
				body: args.note.trim(),
				authorUserId: args.userId,
				createdAt: now,
			});
		}
		return { id: lead._id, created };
	},
});

export const apiAddNoteInternal = internalMutation({
	args: {
		userId: v.id("users"),
		leadId: optionalString,
		email: optionalString,
		phone: optionalString,
		body: v.string(),
	},
	handler: async (ctx, { userId, body, ...ref }) => {
		if (!body.trim()) throw new Error("La note est vide.");
		const lead = await findLead(ctx, ref);
		if (!lead) throw new Error("Lead introuvable.");
		const now = Date.now();
		await ctx.db.insert("leadNotes", {
			leadId: lead._id,
			body: body.trim(),
			authorUserId: userId,
			createdAt: now,
		});
		await ctx.db.patch(lead._id, { lastInteractionAt: now });
		return { id: lead._id };
	},
});

export const apiSetStatusInternal = internalMutation({
	args: {
		leadId: optionalString,
		email: optionalString,
		phone: optionalString,
		status: v.string(),
		amount: v.optional(v.number()),
	},
	handler: async (ctx, { status, amount, ...ref }) => {
		const lead = await findLead(ctx, ref);
		if (!lead) throw new Error("Lead introuvable.");
		const next = parseStatus(status);
		if (!next) throw new Error("Statut manquant.");
		await applyStatus(
			ctx,
			lead,
			next,
			amount !== undefined ? Math.round(amount * 100) : undefined,
			"api",
		);
		return { id: lead._id, status: next };
	},
});

export const apiFindLeadInternal = internalQuery({
	args: {
		leadId: optionalString,
		email: optionalString,
		phone: optionalString,
	},
	handler: async (ctx, ref) => {
		const lead = await findLead(ctx, ref);
		return lead ? await leadPayload(ctx, lead) : null;
	},
});

export const apiListEventsInternal = internalQuery({
	args: {},
	handler: async (ctx) => {
		const events = await ctx.db.query("events").collect();
		return events
			.filter((e) => e.isActive)
			.map((e) => ({
				name: e.name,
				slug: e.slug,
				duration_minutes: e.durationMinutes,
				booking_url: `${SITE_URL}/book/${e.slug}`,
			}));
	},
});
