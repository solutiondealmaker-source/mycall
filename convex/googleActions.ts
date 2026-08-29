"use node";
// convex/googleActions.ts
// Phase 9 — Google Calendar OAuth + Calendar API.
//
// Tous les appels utilisent fetch nu (pas de googleapis SDK) pour garder le bundle léger.
// Le refresh token est automatique quand l'access token expire dans < 60s.
//
// Schéma d'appels :
//   OAuth flow          → handleOAuthCallback (internalAction)
//   Token access        → getAccessTokenForAccount / refreshAccountToken (helpers)
//   Booking event       → createGoogleEventAndReturnInternal → finalizeBookingInternal
//   Webhook push        → runIncrementalSyncForChannel (scheduled via http.ts)
//   Full resync         → runFullSyncForAccount
//   Channel lifecycle   → subscribeCalendarWatchForAccount / stopChannelInternal
//   Crons               → renewExpiringChannels / dailyResyncAllCalendars

import { v } from "convex/values";
import { internal } from "./_generated/api";
import type { Id } from "./_generated/dataModel";
import { action, internalAction } from "./_generated/server";

// ============================================================
// CONSTANTS
// ============================================================

const GOOGLE_TOKEN_URL = "https://oauth2.googleapis.com/token";
const GOOGLE_CAL_BASE = "https://www.googleapis.com/calendar/v3";

// ============================================================
// TYPES
// ============================================================

type GoogleTokenResponse = {
	access_token: string;
	refresh_token?: string;
	expires_in: number;
	scope: string;
	token_type: string;
	id_token?: string;
};

type GoogleEvent = {
	id?: string;
	status?: string;
	summary?: string;
	transparency?: string;
	start?: { dateTime?: string; date?: string; timeZone?: string };
	end?: { dateTime?: string; date?: string; timeZone?: string };
};

type GoogleWatchResponse = {
	id?: string;
	resourceId?: string;
	expiration?: string; // ms-since-epoch as string
};

// ============================================================
// HELPERS — env + utils
// ============================================================

function getEnv(name: string): string {
	const value = process.env[name];
	if (!value) throw new Error(`Missing env var ${name}`);
	return value;
}

function convexSiteUrl(): string {
	const direct = process.env.CONVEX_SITE_URL;
	if (direct) return direct;
	const cloud = process.env.CONVEX_CLOUD_URL ?? "";
	return cloud.replace(".convex.cloud", ".convex.site");
}

function decodeJwtSub(idToken?: string): { email?: string; sub?: string } {
	if (!idToken) return {};
	try {
		const parts = idToken.split(".");
		const payload = parts[1];
		if (!payload) return {};
		const json = JSON.parse(
			Buffer.from(
				payload.replace(/-/g, "+").replace(/_/g, "/"),
				"base64",
			).toString("utf-8"),
		);
		return {
			email: json.email as string | undefined,
			sub: json.sub as string | undefined,
		};
	} catch {
		return {};
	}
}

function isRetriableGoogleError(statusOrMessage: number | string): boolean {
	if (typeof statusOrMessage === "number") {
		return statusOrMessage === 429 || statusOrMessage >= 500;
	}
	const msg = statusOrMessage.toLowerCase();
	return (
		msg.includes("timeout") ||
		msg.includes("econnreset") ||
		msg.includes("network") ||
		msg.includes("fetch failed") ||
		msg.includes("abort")
	);
}

async function sleep(ms: number): Promise<void> {
	await new Promise((resolve) => setTimeout(resolve, ms));
}

function eventToBlock(
	e: GoogleEvent,
	userId: Id<"users">,
	accountId: Id<"userGoogleAccounts">,
	calendarId: string,
): null | {
	userId: Id<"users">;
	accountId: Id<"userGoogleAccounts">;
	calendarId: string;
	googleEventId: string;
	start: number;
	end: number;
	transparency?: string;
} {
	if (!e.id) return null;
	const startRaw = e.start?.dateTime ?? e.start?.date;
	const endRaw = e.end?.dateTime ?? e.end?.date;
	if (!startRaw || !endRaw) return null;
	const start = Date.parse(startRaw);
	const end = Date.parse(endRaw);
	if (Number.isNaN(start) || Number.isNaN(end)) return null;
	return {
		userId,
		accountId,
		calendarId,
		googleEventId: e.id,
		start,
		end,
		transparency: e.transparency,
	};
}

// ============================================================
// TOKEN MANAGEMENT
// ============================================================

type ActionCtx = {
	runQuery: Function;
	runMutation: Function;
	runAction: Function;
	scheduler: { runAfter: Function };
};

async function refreshAccountToken(
	ctx: Pick<ActionCtx, "runQuery" | "runMutation">,
	accountId: Id<"userGoogleAccounts">,
): Promise<string> {
	const acc = await ctx.runQuery(
		internal.googleAccount.getAccountByIdInternal,
		{ accountId },
	);
	if (!acc) throw new Error("Google non connecté");

	const clientId = getEnv("GOOGLE_CLIENT_ID");
	const clientSecret = getEnv("GOOGLE_CLIENT_SECRET");

	const res = await fetch(GOOGLE_TOKEN_URL, {
		method: "POST",
		headers: { "Content-Type": "application/x-www-form-urlencoded" },
		body: new URLSearchParams({
			client_id: clientId,
			client_secret: clientSecret,
			refresh_token: acc.refreshToken,
			grant_type: "refresh_token",
		}),
	});
	if (!res.ok) {
		const err = await res.text();
		// `invalid_grant` = refresh token révoqué/expiré : la reconnexion est la
		// seule issue. On le marque pour que l'UI puisse alerter l'utilisateur
		// au lieu de continuer à afficher "Connecté" avec une synchro morte.
		if (err.includes("invalid_grant")) {
			await ctx.runMutation(internal.googleAccount.markAccountInvalidInternal, {
				accountId,
				reason: "invalid_grant",
			});
		}
		throw new Error(`Google refresh failed: ${err}`);
	}
	const tok = (await res.json()) as GoogleTokenResponse;
	const expiry = Date.now() + tok.expires_in * 1000;
	await ctx.runMutation(internal.googleAccount.patchAccountTokensInternal, {
		accountId,
		accessToken: tok.access_token,
		tokenExpiryMs: expiry,
	});
	return tok.access_token;
}

// Seuil 60s : utilise le token en cache si encore valide, sinon refresh.
async function getAccessTokenForAccount(
	ctx: Pick<ActionCtx, "runQuery" | "runMutation">,
	accountId: Id<"userGoogleAccounts">,
): Promise<string> {
	const acc = await ctx.runQuery(
		internal.googleAccount.getAccountByIdInternal,
		{ accountId },
	);
	if (!acc) throw new Error("Google non connecté");
	if (acc.tokenExpiryMs > Date.now() + 60 * 1000) return acc.accessToken;
	return await refreshAccountToken(ctx, accountId);
}

// ============================================================
// CALENDAR LIST (helper interne + action publique)
// ============================================================

type CalendarEntry = {
	id: string;
	summary: string;
	primary?: boolean;
	timeZone?: string;
	accessRole?: string;
};

async function listCalendarsWithToken(
	accessToken: string,
): Promise<CalendarEntry[]> {
	const res = await fetch(`${GOOGLE_CAL_BASE}/users/me/calendarList`, {
		headers: { Authorization: `Bearer ${accessToken}` },
	});
	if (!res.ok)
		throw new Error(`Google calendarList failed: ${await res.text()}`);
	const data = (await res.json()) as { items?: CalendarEntry[] };
	return data.items ?? [];
}

// Liste les calendriers de tous les comptes connectés de l'appelant.
export const listCalendarsAcrossMyAccounts = action({
	args: {},
	handler: async (
		ctx,
		_args,
	): Promise<
		Array<{
			accountId: Id<"userGoogleAccounts">;
			accountEmail: string;
			calendarId: string;
			summary: string;
			primary?: boolean;
		}>
	> => {
		// Récupérer le userId via la query auth
		const me = await ctx.runQuery(
			internal.googleHelpers.getCurrentUserInternal,
			{},
		);
		if (!me) throw new Error("Non authentifié");
		const accounts = await ctx.runQuery(
			internal.googleAccount.listAccountsForUserInternal,
			{
				userId: me._id,
			},
		);
		const out: Array<{
			accountId: Id<"userGoogleAccounts">;
			accountEmail: string;
			calendarId: string;
			summary: string;
			primary?: boolean;
		}> = [];
		for (const a of accounts) {
			try {
				const token = await getAccessTokenForAccount(ctx, a._id);
				const cals = await listCalendarsWithToken(token);
				for (const c of cals) {
					out.push({
						accountId: a._id,
						accountEmail: a.googleEmail,
						calendarId: c.id,
						summary: c.summary,
						primary: c.primary,
					});
				}
			} catch (e) {
				console.warn(
					`[listCalendarsAcrossMyAccounts] account=${a.googleEmail} failed: ${e instanceof Error ? e.message : e}`,
				);
			}
		}
		return out;
	},
});

// ============================================================
// OAUTH CALLBACK HANDLER
// ============================================================

export const handleOAuthCallback = internalAction({
	args: {
		userId: v.id("users"),
		code: v.string(),
		redirectUri: v.string(),
	},
	handler: async (ctx, { userId, code, redirectUri }) => {
		const clientId = getEnv("GOOGLE_CLIENT_ID");
		const clientSecret = getEnv("GOOGLE_CLIENT_SECRET");

		const tokenRes = await fetch(GOOGLE_TOKEN_URL, {
			method: "POST",
			headers: { "Content-Type": "application/x-www-form-urlencoded" },
			body: new URLSearchParams({
				code,
				client_id: clientId,
				client_secret: clientSecret,
				redirect_uri: redirectUri,
				grant_type: "authorization_code",
			}),
		});

		if (!tokenRes.ok) {
			const err = await tokenRes.text();
			throw new Error(`Google token exchange failed: ${err}`);
		}

		const tokens = (await tokenRes.json()) as GoogleTokenResponse;
		const { email, sub } = decodeJwtSub(tokens.id_token);

		// G2 — Guard critique : refresh_token absent si l'utilisateur n'a pas accordé
		// l'accès avec prompt=consent. Erreur explicite.
		if (!tokens.refresh_token) {
			throw new Error(
				"Google n'a pas renvoyé de refresh_token. Révoque l'accès dans ton compte Google puis reconnecte.",
			);
		}
		if (!sub) {
			throw new Error(
				"Google n'a pas renvoyé d'identifiant de compte. Merci de réessayer.",
			);
		}

		const accountId: Id<"userGoogleAccounts"> = await ctx.runMutation(
			internal.googleAccount.upsertAccountInternal,
			{
				userId,
				googleSub: sub,
				googleEmail: email ?? "unknown",
				accessToken: tokens.access_token,
				refreshToken: tokens.refresh_token,
				tokenExpiryMs: Date.now() + tokens.expires_in * 1000,
				scope: tokens.scope,
			},
		);

		// Premier compte → writer auto + conflict-check + souscription watch
		try {
			const cals = await listCalendarsWithToken(tokens.access_token);
			const primary = cals.find((c) => c.primary) ?? cals[0];
			if (primary) {
				await ctx.runMutation(
					internal.userCalendarSettings.ensureWriterInternal,
					{
						userId,
						accountId,
						calendarId: primary.id,
						calendarSummary: primary.summary,
					},
				);
				await ctx.runMutation(
					internal.userCalendarSettings.addConflictCalendarInternal,
					{
						userId,
						accountId,
						calendarId: primary.id,
						calendarSummary: primary.summary,
					},
				);
				try {
					await ctx.runAction(
						internal.googleActions.subscribeCalendarWatchForAccount,
						{
							userId,
							accountId,
							calendarId: primary.id,
						},
					);
				} catch (e) {
					console.error(
						"[handleOAuthCallback] subscribe failed (non-fatal):",
						e,
					);
				}
			}
		} catch {
			/* non-fatal — l'utilisateur peut choisir son calendrier plus tard */
		}

		return { ok: true, accountId };
	},
});

// ============================================================
// GOOGLE CALENDAR EVENT CRUD — helper interne
// ============================================================

async function createGoogleEventForBooking(
	ctx: Pick<ActionCtx, "runQuery" | "runMutation">,
	bookingId: Id<"bookings">,
): Promise<{
	googleEventId: string;
	googleMeetUrl: string | null;
	googleCalendarId: string;
	googleAccountId: Id<"userGoogleAccounts">;
} | null> {
	const booking = await ctx.runQuery(
		internal.googleHelpers.getBookingInternal,
		{ id: bookingId },
	);
	if (!booking) return null;

	// Résolution du writer account
	let writerAccountId: Id<"userGoogleAccounts">;
	let writerCalendarId: string;
	if (booking.googleAccountId && booking.googleCalendarId) {
		writerAccountId = booking.googleAccountId;
		writerCalendarId = booking.googleCalendarId;
	} else {
		const writer = await ctx.runQuery(
			internal.googleAccount.getWriterAccountForUserInternal,
			{ userId: booking.hostId },
		);
		if (!writer || !writer.writerCalendarId) return null;
		writerAccountId = writer._id;
		writerCalendarId = writer.writerCalendarId;
	}

	const token = await getAccessTokenForAccount(ctx, writerAccountId);
	const calendarId = encodeURIComponent(writerCalendarId);

	const event = await ctx.runQuery(internal.googleHelpers.getEventInternal, {
		id: booking.eventId,
	});
	if (!event) return null;

	const siteUrl = (
		process.env.APP_BASE_URL ??
		process.env.SITE_URL ??
		"http://localhost:3002"
	).replace(/\/$/, "");
	const startDate = new Date(booking.startTime);
	const dateStr = new Intl.DateTimeFormat("fr-FR", {
		weekday: "long",
		day: "numeric",
		month: "long",
		year: "numeric",
		timeZone: event.timezone,
	}).format(startDate);
	const timeStr = new Intl.DateTimeFormat("fr-FR", {
		hour: "2-digit",
		minute: "2-digit",
		timeZone: event.timezone,
	}).format(startDate);

	// Description structurée
	const greeting = event.calendarGreeting
		? `${event.calendarGreeting}\n\n`
		: "";
	const body =
		event.calendarBody ??
		`Rendez-vous : ${event.name}\nDate : ${dateStr} à ${timeStr}\nNom : ${booking.prospectName}\nTél : ${booking.prospectPhone}\n`;
	const signature = event.calendarSignature
		? `\n${event.calendarSignature}`
		: "";
	const cancelUrl = `${siteUrl}/book/manage/${booking.cancelToken}`;
	const rescheduleUrl = `${siteUrl}/book/reschedule/${booking.rescheduleToken}`;
	const description = `${greeting}${body}${signature}\n\nAnnuler : ${cancelUrl}\nReplanifier : ${rescheduleUrl}`;

	const isGoogleMeet = event.location !== "custom";

	const eventPayload: Record<string, unknown> = {
		summary: `${event.name} — ${booking.prospectName}`,
		description,
		start: {
			dateTime: new Date(booking.startTime).toISOString(),
			timeZone: event.timezone,
		},
		end: {
			dateTime: new Date(booking.endTime).toISOString(),
			timeZone: event.timezone,
		},
		attendees: booking.prospectEmail
			? [{ email: booking.prospectEmail, displayName: booking.prospectName }]
			: [],
		reminders: { useDefault: true },
	};

	if (isGoogleMeet) {
		// conferenceDataVersion=1 est requis pour que Google génère le lien Meet.
		//
		// sendUpdates=none est délibéré : c'est notre email de marque qui prévient
		// le prospect. Avec "all", Google envoie l'invitation au nom du compte
		// Google connecté — une adresse que le prospect ne reconnaît pas, que Gmail
		// étiquette « expéditeur inconnu », et qui n'est donc pas ajoutée
		// automatiquement à son agenda. Le prospect reste participant de
		// l'événement : il garde son accès au Meet, il n'est simplement pas
		// notifié par Google.
		eventPayload.conferenceData = {
			createRequest: {
				requestId: `iclone-${bookingId}`, // clé idempotency 24h
				conferenceSolutionKey: { type: "hangoutsMeet" },
			},
		};
	} else if (event.customLocation) {
		eventPayload.location = event.customLocation;
	}

	const url = isGoogleMeet
		? `${GOOGLE_CAL_BASE}/calendars/${calendarId}/events?conferenceDataVersion=1&sendUpdates=none`
		: `${GOOGLE_CAL_BASE}/calendars/${calendarId}/events?sendUpdates=none`;

	const res = await fetch(url, {
		method: "POST",
		headers: {
			Authorization: `Bearer ${token}`,
			"Content-Type": "application/json",
		},
		body: JSON.stringify(eventPayload),
	});

	if (!res.ok) {
		const body = await res.text();
		throw new Error(`Google API http ${res.status}: ${body.slice(0, 300)}`);
	}

	const data = (await res.json()) as {
		id: string;
		hangoutLink?: string;
		conferenceData?: {
			entryPoints?: { entryPointType?: string; uri?: string }[];
		};
	};

	const meetUrl =
		data.hangoutLink ??
		data.conferenceData?.entryPoints?.find((e) => e.entryPointType === "video")
			?.uri ??
		null;

	return {
		googleEventId: data.id,
		googleMeetUrl: meetUrl,
		googleCalendarId: writerCalendarId,
		googleAccountId: writerAccountId,
	};
}

// ============================================================
// GOOGLE CALENDAR EVENT CRUD — actions publiques (internal)
// ============================================================

// Action transactionnelle : crée l'event et retourne les métadonnées Google.
// Appelée par createBookingChecked avec retries. Le caller est responsable
// d'appeler finalizeBookingInternal (succès) ou rollbackBookingInternal (échec).
export const createGoogleEventAndReturnInternal = internalAction({
	args: { bookingId: v.id("bookings") },
	handler: async (
		ctx,
		{ bookingId },
	): Promise<{
		googleEventId: string;
		googleMeetUrl: string | null;
		googleCalendarId: string;
		googleAccountId: Id<"userGoogleAccounts">;
	} | null> => {
		return await createGoogleEventForBooking(ctx, bookingId);
	},
});

// Met à jour l'event Google après un reschedule (sans changement d'hôte).
export const updateGoogleEventForBooking = internalAction({
	args: { bookingId: v.id("bookings") },
	handler: async (ctx, { bookingId }) => {
		const booking = await ctx.runQuery(
			internal.googleHelpers.getBookingInternal,
			{
				id: bookingId,
			},
		);
		if (!booking?.googleEventId || !booking.googleCalendarId) {
			// Pas d'event existant → créer
			await ctx.runAction(
				internal.googleActions.createGoogleEventAndReturnInternal,
				{
					bookingId,
				},
			);
			return;
		}
		const token = booking.googleAccountId
			? await getAccessTokenForAccount(ctx, booking.googleAccountId)
			: null;
		if (!token) return;

		const event = await ctx.runQuery(internal.googleHelpers.getEventInternal, {
			id: booking.eventId,
		});
		const tz = event?.timezone ?? booking.timezone;
		const calendarId = encodeURIComponent(booking.googleCalendarId);

		const res = await fetch(
			`${GOOGLE_CAL_BASE}/calendars/${calendarId}/events/${booking.googleEventId}?sendUpdates=none`,
			{
				method: "PATCH",
				headers: {
					Authorization: `Bearer ${token}`,
					"Content-Type": "application/json",
				},
				body: JSON.stringify({
					start: {
						dateTime: new Date(booking.startTime).toISOString(),
						timeZone: tz,
					},
					end: {
						dateTime: new Date(booking.endTime).toISOString(),
						timeZone: tz,
					},
				}),
			},
		);
		if (!res.ok) {
			console.error(
				`[updateGoogleEventForBooking] http ${res.status}: ${(await res.text()).slice(0, 200)}`,
			);
		}
	},
});

// Supprime l'event Google lors d'une annulation.
export const deleteGoogleEventForBooking = internalAction({
	args: { bookingId: v.id("bookings") },
	handler: async (ctx, { bookingId }) => {
		const booking = await ctx.runQuery(
			internal.googleHelpers.getBookingInternal,
			{
				id: bookingId,
			},
		);
		if (!booking?.googleEventId || !booking.googleCalendarId) return;
		const token = booking.googleAccountId
			? await getAccessTokenForAccount(ctx, booking.googleAccountId)
			: null;
		if (!token) return;
		const calendarId = encodeURIComponent(booking.googleCalendarId);
		const res = await fetch(
			`${GOOGLE_CAL_BASE}/calendars/${calendarId}/events/${booking.googleEventId}?sendUpdates=none`,
			{
				method: "DELETE",
				headers: { Authorization: `Bearer ${token}` },
			},
		);
		if (!res.ok && res.status !== 404 && res.status !== 410) {
			console.error(
				`[deleteGoogleEventForBooking] http ${res.status}: ${(await res.text()).slice(0, 200)}`,
			);
		}
	},
});

// ============================================================
// PUSH NOTIFICATIONS — watch channels + incremental sync
// ============================================================

// Souscrit (ou re-souscrit) un (account, calendar) à Google push.
// Lance un full sync initial. Idempotent — remplace tout channel existant.
export const subscribeCalendarWatchForAccount = internalAction({
	args: {
		userId: v.id("users"),
		accountId: v.id("userGoogleAccounts"),
		calendarId: v.string(),
	},
	handler: async (
		ctx,
		{ userId, accountId, calendarId: targetCalId },
	): Promise<{ ok: boolean; reason?: string }> => {
		const acc = await ctx.runQuery(
			internal.googleAccount.getAccountByIdInternal,
			{ accountId },
		);
		if (!acc || acc.userId !== userId)
			return { ok: false, reason: "account_not_found" };

		// Stopper tout channel existant pour ce (user, calendar) avant d'en créer un nouveau
		const existing = await ctx.runQuery(
			internal.googleCalendarChannels.getChannelsForUserInternal,
			{ userId },
		);
		for (const ch of existing) {
			if (ch.calendarId === targetCalId) {
				try {
					await ctx.runAction(internal.googleActions.stopChannelInternal, {
						channelId: ch.channelId,
						resourceId: ch.resourceId,
					});
				} catch {
					/* channel peut déjà être mort côté Google */
				}
				await ctx.runMutation(
					internal.googleCalendarChannels.deleteChannelInternal,
					{
						id: ch._id,
					},
				);
			}
		}

		const token = await getAccessTokenForAccount(ctx, accountId);
		const encCal = encodeURIComponent(targetCalId);
		const channelId = crypto.randomUUID();
		const channelToken = crypto.randomUUID().replace(/-/g, "");
		const address = `${convexSiteUrl()}/webhooks/google-calendar`;

		const res = await fetch(
			`${GOOGLE_CAL_BASE}/calendars/${encCal}/events/watch`,
			{
				method: "POST",
				headers: {
					Authorization: `Bearer ${token}`,
					"Content-Type": "application/json",
				},
				body: JSON.stringify({
					id: channelId,
					type: "web_hook",
					address,
					token: channelToken,
					params: { ttl: "2592000" }, // 30 jours max
				}),
			},
		);

		if (!res.ok) {
			const err = await res.text();
			console.error(
				`[subscribeCalendarWatchForAccount] user=${userId} cal=${targetCalId} failed: ${err.slice(0, 300)}`,
			);
			return { ok: false, reason: `http_${res.status}` };
		}

		const body = (await res.json()) as GoogleWatchResponse;
		if (!body.resourceId || !body.id) {
			return { ok: false, reason: "invalid_response" };
		}
		const expirationMs = body.expiration
			? Number(body.expiration)
			: Date.now() + 30 * 24 * 60 * 60 * 1000;

		await ctx.runMutation(
			internal.googleCalendarChannels.upsertChannelInternal,
			{
				userId,
				accountId,
				calendarId: targetCalId,
				channelId,
				resourceId: body.resourceId,
				token: channelToken,
				expirationMs,
			},
		);

		// Full sync immédiat pour peupler le cache
		await ctx.runAction(internal.googleActions.runFullSyncForAccount, {
			userId,
			accountId,
			calendarId: targetCalId,
			channelId,
		});

		return { ok: true };
	},
});

// Arrêt d'un channel côté Google (idempotent, erreurs swallowed par le caller)
export const stopChannelInternal = internalAction({
	args: { channelId: v.string(), resourceId: v.string() },
	handler: async (ctx, { channelId, resourceId }): Promise<void> => {
		const ch = await ctx.runQuery(
			internal.googleCalendarChannels.getChannelByIdInternal,
			{
				channelId,
			},
		);
		if (!ch) return;
		const token = ch.accountId
			? await getAccessTokenForAccount(ctx, ch.accountId)
			: null;
		if (!token) return;
		const res = await fetch(`${GOOGLE_CAL_BASE}/channels/stop`, {
			method: "POST",
			headers: {
				Authorization: `Bearer ${token}`,
				"Content-Type": "application/json",
			},
			body: JSON.stringify({ id: channelId, resourceId }),
		});
		if (!res.ok && res.status !== 404) {
			console.error(
				`[stopChannelInternal] ${res.status}: ${(await res.text()).slice(0, 200)}`,
			);
		}
	},
});

// Désouscrit tous les channels d'un compte + purge busy blocks + settings + compte row.
export const unsubscribeAccountForUser = internalAction({
	args: {
		userId: v.id("users"),
		accountId: v.id("userGoogleAccounts"),
	},
	handler: async (ctx, { userId, accountId }): Promise<void> => {
		const channels = await ctx.runQuery(
			internal.googleCalendarChannels.getChannelsForUserInternal,
			{ userId },
		);
		type Channel = (typeof channels)[number];
		const ownChannels = channels.filter(
			(c: Channel) => c.accountId === accountId,
		);
		for (const ch of ownChannels) {
			try {
				await ctx.runAction(internal.googleActions.stopChannelInternal, {
					channelId: ch.channelId,
					resourceId: ch.resourceId,
				});
			} catch {
				/* ignore */
			}
			await ctx.runMutation(
				internal.googleCalendarChannels.deleteChannelInternal,
				{
					id: ch._id,
				},
			);
		}
		// Purge des busy blocks par compte (paginé)
		let safety = 0;
		while (safety++ < 50) {
			const r = await ctx.runMutation(
				internal.googleCalendarChannels.deleteBlocksForAccountInternal,
				{ userId, accountId, limit: 500 },
			);
			if (r.remaining === 0) break;
		}
		// Purge des références writer + conflict dans userCalendarSettings
		await ctx.runMutation(
			internal.userCalendarSettings.purgeAccountReferencesInternal,
			{
				userId,
				accountId,
			},
		);
		// Suppression de la row compte
		await ctx.runMutation(internal.googleAccount.deleteAccountInternal, {
			accountId,
		});
	},
});

// ============================================================
// FULL SYNC
// ============================================================

export const runFullSyncForAccount = internalAction({
	args: {
		userId: v.id("users"),
		accountId: v.id("userGoogleAccounts"),
		calendarId: v.string(),
		channelId: v.string(),
	},
	handler: async (
		ctx,
		{ userId, accountId, calendarId, channelId },
	): Promise<void> => {
		const token = await getAccessTokenForAccount(ctx, accountId);
		const encCal = encodeURIComponent(calendarId);
		const timeMin = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();

		let pageToken: string | undefined;
		let nextSyncToken: string | undefined;
		const allBlocks: Array<{
			userId: Id<"users">;
			accountId: Id<"userGoogleAccounts">;
			calendarId: string;
			googleEventId: string;
			start: number;
			end: number;
			transparency?: string;
		}> = [];

		do {
			const params = new URLSearchParams({
				singleEvents: "true",
				showDeleted: "false",
				maxResults: "250",
				timeMin,
			});
			if (pageToken) params.set("pageToken", pageToken);

			const res = await fetch(
				`${GOOGLE_CAL_BASE}/calendars/${encCal}/events?${params}`,
				{
					headers: { Authorization: `Bearer ${token}` },
				},
			);
			if (!res.ok) {
				console.error(
					`[runFullSync] http ${res.status}: ${(await res.text()).slice(0, 200)}`,
				);
				return;
			}
			const data = (await res.json()) as {
				items?: GoogleEvent[];
				nextPageToken?: string;
				nextSyncToken?: string;
			};
			for (const e of data.items ?? []) {
				const b = eventToBlock(e, userId, accountId, calendarId);
				if (b) allBlocks.push(b);
			}
			pageToken = data.nextPageToken;
			nextSyncToken = data.nextSyncToken;
		} while (pageToken);

		// Vider le cache pour ce (user, calendar) puis re-remplir
		{
			let pageSafety = 0;
			while (pageSafety++ < 50) {
				const r = await ctx.runMutation(
					internal.googleCalendarChannels.deleteBlocksForUserInternal,
					{ userId, calendarId, limit: 500 },
				);
				if (r.remaining === 0) break;
			}
		}
		const CHUNK = 100;
		for (let i = 0; i < allBlocks.length; i += CHUNK) {
			await ctx.runMutation(
				internal.googleCalendarChannels.upsertBusyBlocksInternal,
				{
					blocks: allBlocks.slice(i, i + CHUNK),
				},
			);
		}
		if (nextSyncToken) {
			await ctx.runMutation(
				internal.googleCalendarChannels.updateSyncTokenInternal,
				{
					channelId,
					syncToken: nextSyncToken,
				},
			);
		}
	},
});

// ============================================================
// INCREMENTAL SYNC — called from webhook handler
// ============================================================

export const runIncrementalSyncForChannel = internalAction({
	args: { channelId: v.string() },
	handler: async (ctx, { channelId }): Promise<void> => {
		const ch = await ctx.runQuery(
			internal.googleCalendarChannels.getChannelByIdInternal,
			{
				channelId,
			},
		);
		if (!ch) return;

		// Pas de syncToken → full sync
		if (!ch.syncToken) {
			if (ch.accountId) {
				await ctx.runAction(internal.googleActions.runFullSyncForAccount, {
					userId: ch.userId,
					accountId: ch.accountId,
					calendarId: ch.calendarId,
					channelId,
				});
			}
			return;
		}

		const token = ch.accountId
			? await getAccessTokenForAccount(ctx, ch.accountId)
			: null;
		if (!token) return;

		const encCal = encodeURIComponent(ch.calendarId);
		let pageToken: string | undefined;
		let nextSyncToken: string | undefined;
		type BlockInput = {
			userId: Id<"users">;
			accountId: Id<"userGoogleAccounts">;
			calendarId: string;
			googleEventId: string;
			start: number;
			end: number;
			transparency?: string;
		};
		const toUpsert: BlockInput[] = [];
		const toDelete: string[] = [];

		do {
			const params = new URLSearchParams({
				singleEvents: "true",
				showDeleted: "true",
				maxResults: "250",
			});
			// G6 — Pagination : syncToken seulement sur la première page
			if (pageToken) {
				params.set("pageToken", pageToken);
			} else {
				params.set("syncToken", ch.syncToken);
			}

			const res = await fetch(
				`${GOOGLE_CAL_BASE}/calendars/${encCal}/events?${params}`,
				{
					headers: { Authorization: `Bearer ${token}` },
				},
			);

			// G4 — 410 Gone → syncToken expiré → full resync
			if (res.status === 410) {
				console.warn(
					`[runIncrementalSync] 410 Gone channel=${channelId}, full-resyncing`,
				);
				if (ch.accountId) {
					await ctx.runAction(internal.googleActions.runFullSyncForAccount, {
						userId: ch.userId,
						accountId: ch.accountId,
						calendarId: ch.calendarId,
						channelId,
					});
				}
				return;
			}

			if (!res.ok) {
				console.error(
					`[runIncrementalSync] http ${res.status}: ${(await res.text()).slice(0, 200)}`,
				);
				return;
			}

			const data = (await res.json()) as {
				items?: GoogleEvent[];
				nextPageToken?: string;
				nextSyncToken?: string;
			};

			for (const e of data.items ?? []) {
				if (!e.id) continue;
				if (e.status === "cancelled") {
					toDelete.push(e.id);
					continue;
				}
				const b = eventToBlock(e, ch.userId, ch.accountId!, ch.calendarId);
				if (b) toUpsert.push(b);
			}

			pageToken = data.nextPageToken;
			nextSyncToken = data.nextSyncToken;
		} while (pageToken);

		// Batch : purge busy blocks + annulation bookings liés aux events supprimés
		if (toDelete.length > 0) {
			const CHUNK = 100;
			for (let i = 0; i < toDelete.length; i += CHUNK) {
				const slice = toDelete.slice(i, i + CHUNK);
				await ctx.runMutation(
					internal.googleCalendarChannels.deleteBusyBlocksByEventIdsInternal,
					{ googleEventIds: slice },
				);
				await ctx.runMutation(
					internal.googleCalendarChannels
						.cancelBookingsByGoogleEventIdsInternal,
					{ googleEventIds: slice },
				);
			}
		}
		if (toUpsert.length > 0) {
			const CHUNK = 100;
			for (let i = 0; i < toUpsert.length; i += CHUNK) {
				await ctx.runMutation(
					internal.googleCalendarChannels.upsertBusyBlocksInternal,
					{
						blocks: toUpsert.slice(i, i + CHUNK),
					},
				);
			}
		}
		if (nextSyncToken) {
			await ctx.runMutation(
				internal.googleCalendarChannels.updateSyncTokenInternal,
				{
					channelId,
					syncToken: nextSyncToken,
				},
			);
		}
	},
});

// ============================================================
// CRON HANDLERS
// ============================================================

// Renouvelle les channels qui expirent dans les 48h.
// Jitter anti-spam, max 5 retries par channel.
export const renewExpiringChannels = internalAction({
	args: {},
	handler: async (
		ctx,
	): Promise<{ renewed: number; failed: number; expired: number }> => {
		const now = Date.now();
		const cutoff = now + 48 * 60 * 60 * 1000;
		const expiring = await ctx.runQuery(
			internal.googleCalendarChannels.listExpiringChannelsInternal,
			{ beforeMs: cutoff },
		);
		let renewed = 0;
		let failed = 0;
		let expired = 0;

		for (let i = 0; i < expiring.length; i++) {
			const ch = expiring[i];
			if (!ch) continue;

			// Abandonner si trop d'échecs consécutifs
			if (ch.renewAttempts >= 5) continue;

			// Jitter : 500 + random(750)ms entre chaque renewal
			if (i > 0) {
				const jitter = 500 + Math.floor(Math.random() * 750);
				await sleep(jitter);
			}

			try {
				if (ch.accountId) {
					await ctx.runAction(
						internal.googleActions.subscribeCalendarWatchForAccount,
						{
							userId: ch.userId,
							accountId: ch.accountId,
							calendarId: ch.calendarId,
						},
					);
				}
				await ctx.runMutation(
					internal.googleCalendarChannels.markRenewalSuccessInternal,
					{
						channelId: ch.channelId,
					},
				);
				renewed++;
			} catch (e) {
				const msg = e instanceof Error ? e.message : String(e);
				console.error(
					`[renewExpiringChannels] failed user=${ch.userId} channel=${ch.channelId}: ${msg}`,
				);
				await ctx.runMutation(
					internal.googleCalendarChannels.markRenewalFailureInternal,
					{
						channelId: ch.channelId,
						error: msg.slice(0, 300),
					},
				);
				// Channel déjà expiré → supprimer pour déclencher le fail-closed
				if (ch.expirationMs <= now) {
					await ctx.runMutation(
						internal.googleCalendarChannels.deleteChannelInternal,
						{
							id: ch._id,
						},
					);
					expired++;
				}
				failed++;
			}
		}

		// Retry dans 10 min si des channels ont échoué
		if (failed > 0) {
			await ctx.scheduler.runAfter(
				10 * 60 * 1000,
				internal.googleActions.retryFailedChannelRenewals,
				{},
			);
		}

		return { renewed, failed, expired };
	},
});

// Retry des channels en échec (appelé 10 min après renewExpiringChannels).
export const retryFailedChannelRenewals = internalAction({
	args: {},
	handler: async (ctx): Promise<{ retried: number }> => {
		const failing = await ctx.runQuery(
			internal.googleCalendarChannels.listChannelsNeedingRetryInternal,
			{},
		);
		let retried = 0;
		for (let i = 0; i < failing.length; i++) {
			const ch = failing[i];
			if (!ch) continue;
			if (ch.renewAttempts >= 5) continue; // abandon après 5 tentatives
			if (i > 0) await sleep(500 + Math.floor(Math.random() * 750));
			try {
				if (ch.accountId) {
					await ctx.runAction(
						internal.googleActions.subscribeCalendarWatchForAccount,
						{
							userId: ch.userId,
							accountId: ch.accountId,
							calendarId: ch.calendarId,
						},
					);
				}
				await ctx.runMutation(
					internal.googleCalendarChannels.markRenewalSuccessInternal,
					{
						channelId: ch.channelId,
					},
				);
				retried++;
			} catch (e) {
				const msg = e instanceof Error ? e.message : String(e);
				await ctx.runMutation(
					internal.googleCalendarChannels.markRenewalFailureInternal,
					{
						channelId: ch.channelId,
						error: msg.slice(0, 300),
					},
				);
			}
		}
		return { retried };
	},
});

// Full resync quotidien de tous les channels actifs.
// Tourne 15 min après renewExpiringChannels pour que les channels soient frais.
export const dailyResyncAllCalendars = internalAction({
	args: {},
	handler: async (ctx): Promise<{ resynced: number; failed: number }> => {
		const channels = await ctx.runQuery(
			internal.googleCalendarChannels.listAllChannelsInternal,
			{},
		);
		const now = Date.now();
		let resynced = 0;
		let failed = 0;

		for (let i = 0; i < channels.length; i++) {
			const ch = channels[i];
			if (!ch) continue;
			if (ch.expirationMs <= now) continue; // channel mort — renewExpiringChannels le gère
			if (!ch.accountId) continue; // skip legacy rows sans accountId

			if (i > 0) {
				const jitter = 750 + Math.floor(Math.random() * 750);
				await sleep(jitter);
			}

			try {
				await ctx.runAction(internal.googleActions.runFullSyncForAccount, {
					userId: ch.userId,
					accountId: ch.accountId,
					calendarId: ch.calendarId,
					channelId: ch.channelId,
				});
				resynced++;
			} catch (e) {
				const msg = e instanceof Error ? e.message : String(e);
				console.error(
					`[dailyResyncAllCalendars] failed user=${ch.userId} cal=${ch.calendarId}: ${msg.slice(0, 200)}`,
				);
				failed++;
			}
		}

		return { resynced, failed };
	},
});

// Note: getBookingInternal, getEventInternal, getCurrentUserInternal,
// and patchBookingGoogleFieldsMutation live in googleHelpers.ts
// (cannot be queries/mutations in a "use node" file).
