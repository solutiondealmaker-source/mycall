// fathom.ts — enregistrements d'appels Fathom reliés au CRM.
//
// Chaque membre connecte son propre compte : une clé Fathom ne voit que les
// enregistrements de son propriétaire et ceux qu'on lui partage. À la
// connexion, un webhook est créé chez Fathom ; chaque appel terminé arrive
// alors avec son résumé, ses actions à mener et sa transcription.
//
// L'appel est rattaché au lead dont l'email figure parmi les invités, et au
// rendez-vous de ce lead le plus proche de l'heure de l'appel (3 h d'écart au
// plus). Sans correspondance, il reste en attente dans Intégrations, où on
// peut le rattacher à la main.

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
	query,
} from "./_generated/server";
import { _applyAutoPhase, getLeadScope, ownsLead } from "./leads";
import { requireAdmin } from "./lib/auth";
import { normalizeEmail } from "./lib/leadMatch";
import { emitEvent } from "./lib/outbound";

const API = "https://api.fathom.ai/external/v1";
const MATCH_WINDOW_MS = 3 * 60 * 60 * 1000;
const TRANSCRIPT_MAX = 200_000;
const SUMMARY_IN_NOTE = 1_500;

// ============================================================
// API Fathom
// ============================================================

class FathomError extends Error {
	constructor(
		readonly status: number,
		message: string,
	) {
		super(message);
	}
}

async function fathom<T>(
	apiKey: string,
	method: "GET" | "POST" | "DELETE",
	path: string,
	body?: unknown,
): Promise<T> {
	for (let attempt = 0; ; attempt++) {
		const res = await fetch(`${API}${path}`, {
			method,
			headers: {
				"X-Api-Key": apiKey,
				Accept: "application/json",
				...(body !== undefined && { "Content-Type": "application/json" }),
			},
			body: body !== undefined ? JSON.stringify(body) : undefined,
		});
		if (res.status === 429 && attempt < 4) {
			const wait = Number(res.headers.get("retry-after"));
			await new Promise((r) =>
				setTimeout(
					r,
					Number.isFinite(wait) && wait > 0
						? wait * 1000
						: 2000 * (attempt + 1),
				),
			);
			continue;
		}
		if (res.status === 204) return undefined as T;
		const text = await res.text();
		if (!res.ok) {
			if (res.status === 401 || res.status === 403) {
				throw new FathomError(
					res.status,
					"Clé Fathom refusée : vérifie qu'elle est complète et toujours active.",
				);
			}
			throw new FathomError(
				res.status,
				`Fathom a répondu ${res.status} : ${text.slice(0, 200)}`,
			);
		}
		return (text ? JSON.parse(text) : undefined) as T;
	}
}

// Réunion telle que renvoyée par l'API (liste ou webhook).
interface FathomMeeting {
	recording_id?: number | string;
	title?: string;
	meeting_title?: string;
	url?: string;
	share_url?: string;
	created_at?: string;
	scheduled_start_time?: string;
	recording_start_time?: string;
	recording_end_time?: string;
	recorded_by?: { name?: string; email?: string };
	calendar_invitees?: Array<{
		name?: string;
		email?: string;
		is_external?: boolean;
	}>;
	default_summary?: { markdown_formatted?: string } | null;
	action_items?: Array<{
		description?: string;
		completed?: boolean;
		assignee?: { name?: string; email?: string } | null;
	}> | null;
	transcript?: Array<{
		speaker?: { display_name?: string };
		text?: string;
		timestamp?: string;
	}> | null;
}

const recordingValidator = v.object({
	recordingId: v.string(),
	title: v.string(),
	url: v.optional(v.string()),
	shareUrl: v.optional(v.string()),
	startedAt: v.optional(v.number()),
	scheduledAt: v.optional(v.number()),
	endedAt: v.optional(v.number()),
	recordedByName: v.optional(v.string()),
	recordedByEmail: v.optional(v.string()),
	inviteeEmails: v.array(v.string()),
	summaryMarkdown: v.optional(v.string()),
	actionItems: v.array(
		v.object({
			description: v.string(),
			completed: v.optional(v.boolean()),
			assignee: v.optional(v.string()),
		}),
	),
	transcript: v.optional(v.string()),
});

type Recording = typeof recordingValidator.type;

const time = (s: string | undefined) => {
	const t = s ? Date.parse(s) : Number.NaN;
	return Number.isFinite(t) ? t : undefined;
};

// Réduit une réunion Fathom à ce qu'on conserve. La transcription est bornée :
// un document Convex ne peut pas dépasser 1 Mo.
export function normalizeMeeting(m: FathomMeeting): Recording | null {
	const recordingId = m.recording_id ?? m.url;
	if (recordingId === undefined || recordingId === null) return null;
	const transcript = (m.transcript ?? [])
		.map(
			(t) =>
				`[${t.timestamp ?? ""}] ${t.speaker?.display_name ?? "?"} : ${t.text ?? ""}`,
		)
		.join("\n");
	return {
		recordingId: String(recordingId),
		title: (m.title || m.meeting_title || "Appel").slice(0, 300),
		url: m.url,
		shareUrl: m.share_url,
		startedAt: time(m.recording_start_time) ?? time(m.created_at),
		scheduledAt: time(m.scheduled_start_time),
		endedAt: time(m.recording_end_time),
		recordedByName: m.recorded_by?.name,
		recordedByEmail: m.recorded_by?.email?.toLowerCase(),
		inviteeEmails: (m.calendar_invitees ?? [])
			.map((i) => i.email?.trim().toLowerCase())
			.filter((e): e is string => Boolean(e)),
		summaryMarkdown: m.default_summary?.markdown_formatted || undefined,
		actionItems: (m.action_items ?? [])
			.filter((a) => a.description)
			.map((a) => ({
				description: String(a.description),
				completed: a.completed,
				assignee: a.assignee?.name ?? a.assignee?.email,
			})),
		transcript: transcript ? transcript.slice(0, TRANSCRIPT_MAX) : undefined,
	};
}

// ============================================================
// Rattachement
// ============================================================

async function findMatch(
	ctx: MutationCtx,
	rec: Recording,
): Promise<{
	leadId?: Id<"leads">;
	bookingId?: Id<"bookings">;
	matchedBy?: "booking" | "email";
}> {
	const members = new Set(
		(await ctx.db.query("users").collect())
			.map((u) => u.email?.toLowerCase())
			.filter(Boolean),
	);
	const emails = rec.inviteeEmails.filter(
		(e) => !members.has(e) && e !== rec.recordedByEmail,
	);
	const when = rec.scheduledAt ?? rec.startedAt;

	let fallback: Id<"leads"> | undefined;
	for (const email of emails) {
		const norm = normalizeEmail(email);
		if (!norm) continue;
		const lead = await ctx.db
			.query("leads")
			.withIndex("by_emailNormalized", (q) => q.eq("emailNormalized", norm))
			.first();
		if (!lead) continue;
		fallback ??= lead._id;
		if (when === undefined) continue;
		const bookings = await ctx.db
			.query("bookings")
			.withIndex("by_leadId_startTime", (q) => q.eq("leadId", lead._id))
			.collect();
		const closest = bookings
			.filter((b) => b.status !== "cancelled")
			.map((b) => ({ b, gap: Math.abs(b.startTime - when) }))
			.filter((x) => x.gap <= MATCH_WINDOW_MS)
			.sort((a, b) => a.gap - b.gap)[0];
		if (closest) {
			return {
				leadId: lead._id,
				bookingId: closest.b._id,
				matchedBy: "booking",
			};
		}
	}
	return fallback ? { leadId: fallback, matchedBy: "email" } : {};
}

function noteBody(rec: Recording): string {
	const when = rec.startedAt
		? new Date(rec.startedAt).toLocaleString("fr-FR", {
				timeZone: "Europe/Paris",
				dateStyle: "long",
				timeStyle: "short",
			})
		: null;
	const summary = rec.summaryMarkdown
		? `\n\nRésumé :\n${rec.summaryMarkdown.length > SUMMARY_IN_NOTE ? `${rec.summaryMarkdown.slice(0, SUMMARY_IN_NOTE)}…` : rec.summaryMarkdown}`
		: "";
	const actions = rec.actionItems.length
		? `\n\nÀ faire :\n${rec.actionItems.map((a) => `• ${a.description}`).join("\n")}`
		: "";
	const link = rec.shareUrl ?? rec.url;
	return `🎥 Appel enregistré sur Fathom — « ${rec.title} »${when ? ` le ${when}` : ""}.${link ? `\n${link}` : ""}${summary}${actions}`;
}

// Marque « tenu » le rendez-vous d'un appel enregistré, si l'option est
// active et que rien n'a encore été renseigné.
async function markHeld(ctx: MutationCtx, bookingId: Id<"bookings">) {
	const booking = await ctx.db.get(bookingId);
	if (!booking?.leadId || booking.tenue !== "planifie") return;
	await ctx.db.patch(bookingId, { tenue: "tenu", status: "completed" });
	await ctx.runMutation(internal.sequences.enrollByTriggerInternal, {
		trigger: "after_held" as const,
		leadId: booking.leadId,
		bookingId,
		anchorAt: Date.now(),
	});
	await _applyAutoPhase(ctx, booking.leadId);
	await emitEvent(ctx, "booking.outcome_updated", {
		bookingId,
		leadId: booking.leadId,
		data: { attendance: "tenu", outcome: booking.issue, amount: null },
	});
}

async function attach(
	ctx: MutationCtx,
	recordingDocId: Id<"callRecordings">,
	match: {
		leadId?: Id<"leads">;
		bookingId?: Id<"bookings">;
		matchedBy?: "booking" | "email" | "manual";
	},
	authorUserId: Id<"users">,
) {
	const rec = await ctx.db.get(recordingDocId);
	if (!rec || !match.leadId) return;
	await ctx.db.patch(recordingDocId, {
		leadId: match.leadId,
		bookingId: match.bookingId,
		matchedBy: match.matchedBy,
	});
	await ctx.db.insert("leadNotes", {
		leadId: match.leadId,
		authorUserId,
		createdAt: Date.now(),
		body: noteBody({
			...rec,
			actionItems: rec.actionItems ?? [],
			scheduledAt: undefined,
		}),
	});
	await ctx.db.patch(match.leadId, { lastInteractionAt: Date.now() });

	const settings = await ctx.db
		.query("integrationSettings")
		.withIndex("by_singleton", (q) => q.eq("singleton", "default"))
		.first();
	if (match.bookingId && settings?.fathomAutoHeld) {
		await markHeld(ctx, match.bookingId);
	}
}

export const ingestInternal = internalMutation({
	args: {
		connectionId: v.id("fathomConnections"),
		recording: recordingValidator,
	},
	handler: async (ctx, { connectionId, recording }) => {
		const connection = await ctx.db.get(connectionId);
		if (!connection) return { status: "no_connection" as const };
		await ctx.db.patch(connectionId, {
			lastReceivedAt: Date.now(),
			lastError: undefined,
			...(!connection.accountEmail &&
				recording.recordedByEmail && {
					accountEmail: recording.recordedByEmail,
				}),
		});

		const { scheduledAt: _s, ...stored } = recording;
		const existing = await ctx.db
			.query("callRecordings")
			.withIndex("by_recordingId", (q) =>
				q.eq("recordingId", recording.recordingId),
			)
			.first();
		// Déjà reçu (import puis webhook, ou renvoi) : on complète sans refaire
		// de note.
		if (existing) {
			await ctx.db.patch(existing._id, {
				...stored,
				summaryMarkdown: stored.summaryMarkdown ?? existing.summaryMarkdown,
				transcript: stored.transcript ?? existing.transcript,
				actionItems: stored.actionItems.length
					? stored.actionItems
					: existing.actionItems,
			});
			return { status: "updated" as const };
		}

		const id = await ctx.db.insert("callRecordings", {
			source: "fathom",
			connectionId,
			...stored,
			createdAt: Date.now(),
		});
		const match = await findMatch(ctx, recording);
		if (match.leadId) {
			await attach(
				ctx,
				id,
				match,
				connection.userId ?? connection.createdByUserId,
			);
			return { status: match.matchedBy ?? ("email" as const) };
		}
		return { status: "unmatched" as const };
	},
});

// ============================================================
// Connexions
// ============================================================

export const assertAdminInternal = internalQuery({
	args: {},
	handler: async (ctx) => await requireAdmin(ctx),
});

export const listConnections = query({
	args: {},
	handler: async (ctx) => {
		await requireAdmin(ctx);
		const rows = await ctx.db.query("fathomConnections").collect();
		const out = [];
		for (const c of rows.sort((a, b) => a.createdAt - b.createdAt)) {
			const member = c.userId ? await ctx.db.get(c.userId) : null;
			out.push({
				_id: c._id,
				label: c.label,
				memberName: member?.name ?? member?.email ?? null,
				accountEmail: c.accountEmail ?? null,
				keyPreview: `••••${c.apiKey.slice(-4)}`,
				webhookActive: Boolean(c.webhookId),
				createdAt: c.createdAt,
				lastReceivedAt: c.lastReceivedAt ?? null,
				lastError: c.lastError ?? null,
			});
		}
		const settings = await ctx.db
			.query("integrationSettings")
			.withIndex("by_singleton", (q) => q.eq("singleton", "default"))
			.first();
		return { connections: out, autoHeld: settings?.fathomAutoHeld ?? false };
	},
});

export const insertConnectionInternal = internalMutation({
	args: {
		label: v.string(),
		userId: v.optional(v.id("users")),
		apiKey: v.string(),
		createdByUserId: v.id("users"),
	},
	handler: async (ctx, args) =>
		await ctx.db.insert("fathomConnections", {
			...args,
			createdAt: Date.now(),
		}),
});

export const setWebhookInternal = internalMutation({
	args: {
		connectionId: v.id("fathomConnections"),
		webhookId: v.string(),
		webhookSecret: v.string(),
	},
	handler: async (ctx, { connectionId, webhookId, webhookSecret }) => {
		await ctx.db.patch(connectionId, { webhookId, webhookSecret });
	},
});

export const deleteConnectionInternal = internalMutation({
	args: { connectionId: v.id("fathomConnections") },
	handler: async (ctx, { connectionId }) => {
		await ctx.db.delete(connectionId);
	},
});

export const getConnectionInternal = internalQuery({
	args: { connectionId: v.id("fathomConnections") },
	handler: async (ctx, { connectionId }) => await ctx.db.get(connectionId),
});

export const setErrorInternal = internalMutation({
	args: { connectionId: v.id("fathomConnections"), error: v.string() },
	handler: async (ctx, { connectionId, error }) => {
		if (await ctx.db.get(connectionId)) {
			await ctx.db.patch(connectionId, { lastError: error.slice(0, 300) });
		}
	},
});

interface FathomWebhook {
	id: string | number;
	secret: string;
}

export const connect = action({
	args: {
		label: v.string(),
		apiKey: v.string(),
		userId: v.optional(v.id("users")),
	},
	handler: async (ctx, args): Promise<{ ok: true }> => {
		const adminId = await ctx.runQuery(internal.fathom.assertAdminInternal, {});
		const apiKey = args.apiKey.trim();
		if (apiKey.length < 16)
			throw new Error("Cette clé Fathom semble incomplète.");
		const siteUrl = process.env.CONVEX_SITE_URL;
		if (!siteUrl) throw new Error("Adresse de l'instance introuvable.");

		// Lecture minimale pour valider la clé avant de l'enregistrer.
		await fathom(
			apiKey,
			"GET",
			`/meetings?created_after=${encodeURIComponent(new Date().toISOString())}`,
		);

		const connectionId = await ctx.runMutation(
			internal.fathom.insertConnectionInternal,
			{
				label: args.label.trim() || "Fathom",
				userId: args.userId,
				apiKey,
				createdByUserId: adminId,
			},
		);

		const body = (triggeredFor: string[]) => ({
			destination_url: `${siteUrl}/webhooks/fathom/${connectionId}`,
			triggered_for: triggeredFor,
			include_summary: true,
			include_action_items: true,
			include_transcript: true,
		});
		try {
			let hook: FathomWebhook;
			try {
				hook = await fathom<FathomWebhook>(
					apiKey,
					"POST",
					"/webhooks",
					body(["my_recordings", "shared_external_recordings"]),
				);
			} catch (err) {
				// Selon l'offre Fathom, seuls ses propres enregistrements sont
				// accessibles : on se rabat dessus.
				if (!(err instanceof FathomError) || err.status >= 500) throw err;
				hook = await fathom<FathomWebhook>(
					apiKey,
					"POST",
					"/webhooks",
					body(["my_recordings"]),
				);
			}
			await ctx.runMutation(internal.fathom.setWebhookInternal, {
				connectionId,
				webhookId: String(hook.id),
				webhookSecret: hook.secret,
			});
		} catch (err) {
			await ctx.runMutation(internal.fathom.deleteConnectionInternal, {
				connectionId,
			});
			throw new Error(
				`Impossible de créer le webhook chez Fathom : ${err instanceof Error ? err.message : String(err)}`,
			);
		}
		return { ok: true };
	},
});

export const disconnect = action({
	args: { connectionId: v.id("fathomConnections") },
	handler: async (ctx, { connectionId }): Promise<{ ok: true }> => {
		await ctx.runQuery(internal.fathom.assertAdminInternal, {});
		const c = await ctx.runQuery(internal.fathom.getConnectionInternal, {
			connectionId,
		});
		if (!c) return { ok: true };
		if (c.webhookId) {
			try {
				await fathom(c.apiKey, "DELETE", `/webhooks/${c.webhookId}`);
			} catch (err) {
				// Clé révoquée ou webhook déjà supprimé : la déconnexion locale
				// suffit, Fathom n'aura plus où envoyer.
				console.warn(`[fathom] suppression du webhook : ${String(err)}`);
			}
		}
		await ctx.runMutation(internal.fathom.deleteConnectionInternal, {
			connectionId,
		});
		return { ok: true };
	},
});

export const setAutoHeld = mutation({
	args: { enabled: v.boolean() },
	handler: async (ctx, { enabled }) => {
		const userId = await requireAdmin(ctx);
		const existing = await ctx.db
			.query("integrationSettings")
			.withIndex("by_singleton", (q) => q.eq("singleton", "default"))
			.first();
		const patch = {
			fathomAutoHeld: enabled,
			updatedAt: Date.now(),
			updatedByUserId: userId,
		};
		if (existing) await ctx.db.patch(existing._id, patch);
		else
			await ctx.db.insert("integrationSettings", {
				singleton: "default",
				...patch,
			});
		return { ok: true };
	},
});

// Rattrape les enregistrements récents (avant la connexion, ou manqués).
export const importRecent = action({
	args: {
		connectionId: v.id("fathomConnections"),
		days: v.optional(v.number()),
	},
	handler: async (
		ctx,
		{ connectionId, days },
	): Promise<{
		seen: number;
		matched: number;
		unmatched: number;
		updated: number;
	}> => {
		await ctx.runQuery(internal.fathom.assertAdminInternal, {});
		const c = await ctx.runQuery(internal.fathom.getConnectionInternal, {
			connectionId,
		});
		if (!c) throw new Error("Connexion introuvable.");

		const since = new Date(
			Date.now() - Math.min(Math.max(days ?? 30, 1), 365) * 86_400_000,
		).toISOString();
		const result = { seen: 0, matched: 0, unmatched: 0, updated: 0 };
		let cursor: string | null | undefined;
		for (let page = 0; page < 40; page++) {
			const params = new URLSearchParams({
				created_after: since,
				include_summary: "true",
				include_action_items: "true",
				include_transcript: "true",
			});
			if (cursor) params.set("cursor", cursor);
			const res = await fathom<{
				items: FathomMeeting[];
				next_cursor?: string | null;
			}>(c.apiKey, "GET", `/meetings?${params}`);
			for (const m of res.items ?? []) {
				const rec = normalizeMeeting(m);
				if (!rec) continue;
				result.seen++;
				const { status } = await ctx.runMutation(
					internal.fathom.ingestInternal,
					{ connectionId, recording: rec },
				);
				if (status === "updated") result.updated++;
				else if (status === "unmatched") result.unmatched++;
				else if (status !== "no_connection") result.matched++;
			}
			cursor = res.next_cursor;
			if (!cursor) break;
		}
		return result;
	},
});

// Webhook reçu (http.ts) : déjà vérifié, on normalise et on enregistre.
export const receiveInternal = internalAction({
	args: { connectionId: v.id("fathomConnections"), body: v.string() },
	handler: async (ctx, { connectionId, body }) => {
		try {
			const parsed = JSON.parse(body) as FathomMeeting & {
				meeting?: FathomMeeting;
			};
			const rec = normalizeMeeting(parsed.meeting ?? parsed);
			if (!rec) throw new Error("Contenu de webhook sans enregistrement.");
			await ctx.runMutation(internal.fathom.ingestInternal, {
				connectionId,
				recording: rec,
			});
		} catch (err) {
			const msg = err instanceof Error ? err.message : String(err);
			console.error(`[fathom] webhook ${connectionId} : ${msg}`);
			await ctx.runMutation(internal.fathom.setErrorInternal, {
				connectionId,
				error: msg,
			});
		}
	},
});

// ============================================================
// Lecture
// ============================================================

function publicRecording(r: Doc<"callRecordings">) {
	return {
		_id: r._id,
		title: r.title,
		url: r.shareUrl ?? r.url ?? null,
		startedAt: r.startedAt ?? r.createdAt,
		endedAt: r.endedAt ?? null,
		recordedByName: r.recordedByName ?? null,
		summaryMarkdown: r.summaryMarkdown ?? null,
		actionItems: r.actionItems ?? [],
		hasTranscript: Boolean(r.transcript),
		bookingId: r.bookingId ?? null,
		matchedBy: r.matchedBy ?? null,
		inviteeEmails: r.inviteeEmails,
	};
}

export const listForLead = query({
	args: { leadId: v.id("leads") },
	handler: async (ctx, { leadId }) => {
		const { userId, seeAll } = await getLeadScope(ctx);
		const lead = await ctx.db.get(leadId);
		if (!lead || (!seeAll && !ownsLead(lead, userId))) return [];
		const rows = await ctx.db
			.query("callRecordings")
			.withIndex("by_leadId", (q) => q.eq("leadId", leadId))
			.collect();
		return rows
			.sort((a, b) => (b.startedAt ?? 0) - (a.startedAt ?? 0))
			.map(publicRecording);
	},
});

export const getTranscript = query({
	args: { recordingId: v.id("callRecordings") },
	handler: async (ctx, { recordingId }) => {
		const { userId, seeAll } = await getLeadScope(ctx);
		const rec = await ctx.db.get(recordingId);
		if (!rec?.leadId) return null;
		const lead = await ctx.db.get(rec.leadId);
		if (!lead || (!seeAll && !ownsLead(lead, userId))) return null;
		return rec.transcript ?? null;
	},
});

export const listUnmatched = query({
	args: {},
	handler: async (ctx) => {
		await requireAdmin(ctx);
		const rows = await ctx.db
			.query("callRecordings")
			.withIndex("by_createdAt")
			.order("desc")
			.take(200);
		return rows
			.filter((r) => !r.leadId)
			.slice(0, 30)
			.map(publicRecording);
	},
});

// Rattachement manuel d'un appel resté sans lead, par l'email du prospect.
export const attachManually = mutation({
	args: { recordingId: v.id("callRecordings"), email: v.string() },
	handler: async (ctx, { recordingId, email }) => {
		const adminId = await requireAdmin(ctx);
		const rec = await ctx.db.get(recordingId);
		if (!rec) throw new Error("Enregistrement introuvable.");
		if (rec.leadId) throw new Error("Cet appel est déjà rattaché.");
		const norm = normalizeEmail(email);
		const lead = norm
			? await ctx.db
					.query("leads")
					.withIndex("by_emailNormalized", (q) => q.eq("emailNormalized", norm))
					.first()
			: null;
		if (!lead) throw new Error(`Aucun lead avec l'email ${email}.`);

		let bookingId: Id<"bookings"> | undefined;
		if (rec.startedAt !== undefined) {
			const start = rec.startedAt;
			const bookings = await ctx.db
				.query("bookings")
				.withIndex("by_leadId_startTime", (q) => q.eq("leadId", lead._id))
				.collect();
			bookingId = bookings
				.filter((b) => b.status !== "cancelled")
				.map((b) => ({ b, gap: Math.abs(b.startTime - start) }))
				.filter((x) => x.gap <= MATCH_WINDOW_MS)
				.sort((a, b) => a.gap - b.gap)[0]?.b._id;
		}
		await attach(
			ctx,
			recordingId,
			{ leadId: lead._id, bookingId, matchedBy: "manual" },
			adminId,
		);
		return { ok: true, leadId: lead._id };
	},
});

export const deleteRecording = mutation({
	args: { recordingId: v.id("callRecordings") },
	handler: async (ctx, { recordingId }) => {
		await requireAdmin(ctx);
		await ctx.db.delete(recordingId);
		return { ok: true };
	},
});

// Signature d'un webhook Fathom (format Standard Webhooks) : HMAC SHA-256 de
// « id.timestamp.corps », avec la partie base64 du secret « whsec_… ».
export const getWebhookSecretInternal = internalQuery({
	args: { connectionId: v.string() },
	handler: async (ctx, { connectionId }) => {
		const id = ctx.db.normalizeId("fathomConnections", connectionId);
		if (!id) return null;
		const c = await ctx.db.get(id);
		return c?.webhookSecret ? { id, secret: c.webhookSecret } : null;
	},
});
