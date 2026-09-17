// calendly.ts — import depuis Calendly : types d'événement avec leur formulaire,
// et historique des rendez-vous transformé en leads.
//
// Le client colle son jeton d'accès personnel Calendly dans Paramètres →
// Intégrations. Il est stocké comme la clé Stripe : jamais renvoyé au
// navigateur.
//
// Rien de ce qui est importé ne déclenche d'email : les événements arrivent
// inactifs, et les leads sont écrits directement, sans passer par la prise de
// rendez-vous ni par les séquences.

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
import { _findLeadByAnyKey } from "./leads";
import { requireAdmin } from "./lib/auth";
import { normalizeEmail, normalizePhone } from "./lib/leadMatch";

const API = "https://api.calendly.com";
const PAGE_SIZE = 50;
// Un import bloqué au-delà de ce délai est considéré comme interrompu.
const STALE_JOB_MS = 30 * 60 * 1000;

// ============================================================
// Client HTTP Calendly
// ============================================================

interface CalendlyQuestion {
	name: string;
	type: string; // string | text | phone_number | single_select | multi_select
	position: number;
	enabled: boolean;
	required: boolean;
	answer_choices?: string[] | null;
	include_other?: boolean;
}

interface CalendlyEventType {
	uri: string;
	name: string;
	active: boolean;
	slug?: string | null;
	duration: number;
	color?: string | null;
	description_plain?: string | null;
	custom_questions?: CalendlyQuestion[];
}

interface CalendlyMeeting {
	uri: string;
	name: string;
	status: string; // active | canceled
	start_time: string;
	event_type?: string | null;
	event_memberships?: Array<{ user_email?: string | null }>;
}

interface CalendlyInvitee {
	uri: string;
	email?: string | null;
	name?: string | null;
	first_name?: string | null;
	last_name?: string | null;
	status: string; // active | canceled
	text_reminder_number?: string | null;
	questions_and_answers?: Array<{
		question: string;
		answer: string;
		position: number;
	}>;
	no_show?: { uri: string } | null;
	tracking?: {
		utm_source?: string | null;
		utm_medium?: string | null;
		utm_campaign?: string | null;
		utm_term?: string | null;
		utm_content?: string | null;
	} | null;
}

interface Page<T> {
	collection: T[];
	pagination?: { next_page?: string | null };
}

class CalendlyError extends Error {
	constructor(
		readonly status: number,
		message: string,
	) {
		super(message);
	}
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function calendlyGet<T>(token: string, pathOrUrl: string): Promise<T> {
	const url = pathOrUrl.startsWith("http") ? pathOrUrl : `${API}${pathOrUrl}`;
	// Le jeton ne part jamais ailleurs que chez Calendly, même si une URL de
	// pagination renvoyée par l'API était altérée.
	if (!url.startsWith(`${API}/`)) {
		throw new CalendlyError(0, "Adresse Calendly inattendue");
	}

	for (let attempt = 0; ; attempt++) {
		const res = await fetch(url, {
			headers: {
				Authorization: `Bearer ${token}`,
				"Content-Type": "application/json",
			},
		});
		if (res.status === 429 && attempt < 5) {
			const retryAfter = Number(res.headers.get("retry-after"));
			await sleep(
				Number.isFinite(retryAfter) && retryAfter > 0
					? retryAfter * 1000
					: 2000 * (attempt + 1),
			);
			continue;
		}
		if (!res.ok) {
			if (res.status === 401) {
				throw new CalendlyError(
					401,
					"Jeton Calendly refusé : vérifie qu'il est complet et qu'il n'a pas été révoqué.",
				);
			}
			let detail = "";
			try {
				const body = (await res.json()) as { message?: string };
				detail = body.message ? ` (${body.message})` : "";
			} catch {
				// corps illisible — le code HTTP suffit
			}
			throw new CalendlyError(
				res.status,
				`Calendly a répondu ${res.status}${detail}`,
			);
		}
		return (await res.json()) as T;
	}
}

// Liste toutes les pages d'une collection.
async function listAll<T>(token: string, firstUrl: string): Promise<T[]> {
	const out: T[] = [];
	let next: string | null | undefined = firstUrl;
	while (next) {
		const page: Page<T> = await calendlyGet<Page<T>>(token, next);
		out.push(...page.collection);
		next = page.pagination?.next_page;
	}
	return out;
}

// Les comptes d'équipe voient tout via l'organisation ; un compte simple, ou
// un membre sans droits d'administration, seulement ses propres données.
async function scopedUrl(
	token: string,
	creds: { userUri: string; organizationUri?: string },
	path: string,
	extra: string,
): Promise<string> {
	if (creds.organizationUri) {
		const orgUrl = `${API}${path}?organization=${encodeURIComponent(creds.organizationUri)}&${extra}`;
		try {
			await calendlyGet(token, orgUrl.replace(/count=\d+/, "count=1"));
			return orgUrl;
		} catch (err) {
			if (!(err instanceof CalendlyError) || err.status !== 403) throw err;
		}
	}
	return `${API}${path}?user=${encodeURIComponent(creds.userUri)}&${extra}`;
}

function errorMessage(err: unknown): string {
	return err instanceof Error ? err.message : String(err);
}

// ============================================================
// Réglages
// ============================================================

async function getSettingsRow(ctx: { db: MutationCtx["db"] }) {
	return await ctx.db
		.query("integrationSettings")
		.withIndex("by_singleton", (q) => q.eq("singleton", "default"))
		.first();
}

export const getStatus = query({
	args: {},
	handler: async (ctx) => {
		await requireAdmin(ctx);
		const s = await ctx.db
			.query("integrationSettings")
			.withIndex("by_singleton", (q) => q.eq("singleton", "default"))
			.first();
		const job = await ctx.db
			.query("calendlyImportJobs")
			.withIndex("by_startedAt")
			.order("desc")
			.first();
		return {
			connected: Boolean(s?.calendlyToken),
			accountLabel: s?.calendlyAccountLabel ?? null,
			latestJob: job
				? {
						status: job.status,
						startedAt: job.startedAt,
						finishedAt: job.finishedAt ?? null,
						meetingsSeen: job.meetingsSeen,
						leadsCreated: job.leadsCreated,
						leadsUpdated: job.leadsUpdated,
						alreadyImported: job.alreadyImported,
						error: job.error ?? null,
					}
				: null,
		};
	},
});

export const assertAdminInternal = internalQuery({
	args: {},
	handler: async (ctx) => await requireAdmin(ctx),
});

export const getCredentialsInternal = internalQuery({
	args: {},
	handler: async (ctx) => {
		const s = await ctx.db
			.query("integrationSettings")
			.withIndex("by_singleton", (q) => q.eq("singleton", "default"))
			.first();
		if (!s?.calendlyToken || !s.calendlyUserUri) return null;
		return {
			token: s.calendlyToken,
			userUri: s.calendlyUserUri,
			organizationUri: s.calendlyOrganizationUri,
		};
	},
});

export const saveConnectionInternal = internalMutation({
	args: {
		userId: v.id("users"),
		token: v.string(),
		userUri: v.string(),
		organizationUri: v.optional(v.string()),
		accountLabel: v.string(),
	},
	handler: async (
		ctx,
		{ userId, token, userUri, organizationUri, accountLabel },
	) => {
		const patch = {
			calendlyToken: token,
			calendlyUserUri: userUri,
			calendlyOrganizationUri: organizationUri,
			calendlyAccountLabel: accountLabel,
			updatedAt: Date.now(),
			updatedByUserId: userId,
		};
		const existing = await getSettingsRow(ctx);
		if (existing) await ctx.db.patch(existing._id, patch);
		else
			await ctx.db.insert("integrationSettings", {
				singleton: "default",
				...patch,
			});
	},
});

// Vérifie le jeton auprès de Calendly avant de l'enregistrer.
export const connect = action({
	args: { token: v.string() },
	handler: async (ctx, { token }): Promise<{ accountLabel: string }> => {
		const userId = await ctx.runQuery(
			internal.calendly.assertAdminInternal,
			{},
		);
		const clean = token.trim();
		if (clean.length < 20)
			throw new Error("Ce jeton Calendly semble incomplet.");

		const me = await calendlyGet<{
			resource: {
				uri: string;
				name?: string;
				email?: string;
				current_organization?: string;
			};
		}>(clean, "/users/me");

		const accountLabel = me.resource.email
			? `${me.resource.name ?? ""} <${me.resource.email}>`.trim()
			: (me.resource.name ?? "Compte Calendly");

		await ctx.runMutation(internal.calendly.saveConnectionInternal, {
			userId,
			token: clean,
			userUri: me.resource.uri,
			organizationUri: me.resource.current_organization,
			accountLabel,
		});
		return { accountLabel };
	},
});

export const disconnect = mutation({
	args: {},
	handler: async (ctx) => {
		const userId = await requireAdmin(ctx);
		const existing = await getSettingsRow(ctx);
		if (!existing) return { ok: true };
		await ctx.db.patch(existing._id, {
			calendlyToken: undefined,
			calendlyUserUri: undefined,
			calendlyOrganizationUri: undefined,
			calendlyAccountLabel: undefined,
			updatedAt: Date.now(),
			updatedByUserId: userId,
		});
		return { ok: true };
	},
});

// ============================================================
// Types d'événement
// ============================================================

export const importedEventUrisInternal = internalQuery({
	args: {},
	handler: async (ctx) => {
		const events = await ctx.db.query("events").collect();
		return events.flatMap((e) => (e.calendlyUri ? [e.calendlyUri] : []));
	},
});

export const listEventTypes = action({
	args: {},
	handler: async (
		ctx,
	): Promise<
		Array<{
			uri: string;
			name: string;
			durationMinutes: number;
			active: boolean;
			questionCount: number;
			alreadyImported: boolean;
		}>
	> => {
		await ctx.runQuery(internal.calendly.assertAdminInternal, {});
		const creds = await ctx.runQuery(
			internal.calendly.getCredentialsInternal,
			{},
		);
		if (!creds) throw new Error("Calendly n'est pas connecté.");

		const url = await scopedUrl(
			creds.token,
			creds,
			"/event_types",
			"count=100",
		);
		const types = await listAll<CalendlyEventType>(creds.token, url);
		const imported = new Set(
			await ctx.runQuery(internal.calendly.importedEventUrisInternal, {}),
		);

		return types
			.map((t) => ({
				uri: t.uri,
				name: t.name,
				durationMinutes: t.duration,
				active: t.active,
				questionCount: (t.custom_questions ?? []).filter((q) => q.enabled)
					.length,
				alreadyImported: imported.has(t.uri),
			}))
			.sort(
				(a, b) =>
					Number(b.active) - Number(a.active) || a.name.localeCompare(b.name),
			);
	},
});

const QUESTION_TYPE = {
	string: "short_text",
	phone_number: "short_text",
	text: "long_text",
	single_select: "single_select",
	multi_select: "multi_select",
} as const;

function slugify(input: string): string {
	return (
		input
			.normalize("NFD")
			.replace(/[̀-ͯ]/g, "")
			.toLowerCase()
			.replace(/[^a-z0-9]+/g, "-")
			.replace(/^-+|-+$/g, "")
			.slice(0, 60) || "evenement"
	);
}

export const createEventFromCalendlyInternal = internalMutation({
	args: {
		userId: v.id("users"),
		uri: v.string(),
		name: v.string(),
		slug: v.optional(v.string()),
		durationMinutes: v.number(),
		color: v.optional(v.string()),
		description: v.optional(v.string()),
		questions: v.array(
			v.object({
				type: v.string(),
				label: v.string(),
				required: v.boolean(),
				options: v.optional(v.array(v.string())),
				includeOther: v.boolean(),
			}),
		),
	},
	handler: async (ctx, args): Promise<"created" | "exists"> => {
		const events = await ctx.db.query("events").collect();
		if (events.some((e) => e.calendlyUri === args.uri)) return "exists";

		const taken = new Set(events.map((e) => e.slug));
		const base = slugify(args.slug || args.name);
		let slug = base;
		for (let n = 2; taken.has(slug); n++) slug = `${base}-${n}`;

		const eventId = await ctx.db.insert("events", {
			name: args.name,
			slug,
			description: args.description || undefined,
			durationMinutes: args.durationMinutes,
			timezone: "Europe/Paris",
			priorityMode: "manual",
			allowReschedule: true,
			color:
				args.color && /^#[0-9a-f]{6}$/i.test(args.color)
					? args.color
					: undefined,
			tagSource: "calendly",
			calendlyUri: args.uri,
			// Inactif : à relire (disponibilités, hôtes) avant de le publier.
			isActive: false,
		});

		// La personne qui importe devient hôte : l'événement est utilisable dès
		// son activation, et d'autres hôtes s'ajoutent ensuite.
		await ctx.db.insert("eventHosts", {
			eventId,
			userId: args.userId,
			priority: "medium",
			createdAt: Date.now(),
		});

		let order = 0;
		for (const q of args.questions) {
			const type =
				QUESTION_TYPE[q.type as keyof typeof QUESTION_TYPE] ?? "short_text";
			const choices = (q.options ?? []).map((o) => o.trim()).filter(Boolean);
			const isSelect = type === "single_select" || type === "multi_select";
			await ctx.db.insert("eventQuestions", {
				eventId,
				order: order++,
				type,
				label: q.label,
				required: q.required,
				options: isSelect
					? q.includeOther && !choices.includes("Autre")
						? [...choices, "Autre"]
						: choices
					: undefined,
			});
		}
		return "created";
	},
});

export const importEventTypes = action({
	args: { uris: v.array(v.string()) },
	handler: async (
		ctx,
		{ uris },
	): Promise<{ created: string[]; existing: string[]; failed: string[] }> => {
		const userId = await ctx.runQuery(
			internal.calendly.assertAdminInternal,
			{},
		);
		const creds = await ctx.runQuery(
			internal.calendly.getCredentialsInternal,
			{},
		);
		if (!creds) throw new Error("Calendly n'est pas connecté.");

		const result = {
			created: [] as string[],
			existing: [] as string[],
			failed: [] as string[],
		};
		for (const uri of uris) {
			if (!uri.startsWith(`${API}/event_types/`)) {
				result.failed.push(uri);
				continue;
			}
			try {
				const { resource: t } = await calendlyGet<{
					resource: CalendlyEventType;
				}>(creds.token, uri);
				const questions = (t.custom_questions ?? [])
					.filter((q) => q.enabled)
					.sort((a, b) => a.position - b.position)
					.map((q) => ({
						type: q.type,
						label: q.name,
						required: q.required,
						options: q.answer_choices ?? undefined,
						includeOther: q.include_other === true,
					}));
				const status = await ctx.runMutation(
					internal.calendly.createEventFromCalendlyInternal,
					{
						userId,
						uri: t.uri,
						name: t.name,
						slug: t.slug ?? undefined,
						durationMinutes: t.duration,
						color: t.color ?? undefined,
						description: t.description_plain ?? undefined,
						questions,
					},
				);
				(status === "created" ? result.created : result.existing).push(t.name);
			} catch (err) {
				console.error(`[calendly] import ${uri} : ${errorMessage(err)}`);
				result.failed.push(uri);
			}
		}
		return result;
	},
});

// ============================================================
// Historique des rendez-vous → leads
// ============================================================

export const startHistoryImport = mutation({
	args: {},
	handler: async (ctx) => {
		const userId = await requireAdmin(ctx);
		const settings = await getSettingsRow(ctx);
		if (!settings?.calendlyToken)
			throw new Error("Calendly n'est pas connecté.");

		const running = await ctx.db
			.query("calendlyImportJobs")
			.withIndex("by_startedAt")
			.order("desc")
			.first();
		if (running?.status === "running") {
			if (Date.now() - running.startedAt < STALE_JOB_MS) {
				throw new Error("Un import est déjà en cours.");
			}
			await ctx.db.patch(running._id, {
				status: "failed",
				finishedAt: Date.now(),
				error: "Interrompu",
			});
		}

		const jobId = await ctx.db.insert("calendlyImportJobs", {
			status: "running",
			startedByUserId: userId,
			startedAt: Date.now(),
			meetingsSeen: 0,
			leadsCreated: 0,
			leadsUpdated: 0,
			alreadyImported: 0,
		});
		await ctx.scheduler.runAfter(0, internal.calendly.runHistoryPage, {
			jobId,
		});
		return { jobId };
	},
});

export const finishJobInternal = internalMutation({
	args: {
		jobId: v.id("calendlyImportJobs"),
		error: v.optional(v.string()),
	},
	handler: async (ctx, { jobId, error }) => {
		await ctx.db.patch(jobId, {
			status: error ? "failed" : "done",
			finishedAt: Date.now(),
			...(error && { error: error.slice(0, 300) }),
		});
	},
});

export const addMeetingsSeenInternal = internalMutation({
	args: { jobId: v.id("calendlyImportJobs"), count: v.number() },
	handler: async (ctx, { jobId, count }) => {
		const job = await ctx.db.get(jobId);
		if (job)
			await ctx.db.patch(jobId, { meetingsSeen: job.meetingsSeen + count });
	},
});

// Une page de rendez-vous par exécution, puis la suivante est planifiée :
// aucun import, même de plusieurs années, ne dépasse la durée d'une action.
export const runHistoryPage = internalAction({
	args: {
		jobId: v.id("calendlyImportJobs"),
		pageUrl: v.optional(v.string()),
	},
	handler: async (ctx, { jobId, pageUrl }) => {
		try {
			const creds = await ctx.runQuery(
				internal.calendly.getCredentialsInternal,
				{},
			);
			if (!creds)
				throw new Error("Calendly a été déconnecté pendant l'import.");

			const url =
				pageUrl ??
				(await scopedUrl(
					creds.token,
					creds,
					"/scheduled_events",
					`count=${PAGE_SIZE}&sort=start_time:asc`,
				));
			const page = await calendlyGet<Page<CalendlyMeeting>>(creds.token, url);

			for (const meeting of page.collection) {
				const invitees = await listAll<CalendlyInvitee>(
					creds.token,
					`${meeting.uri}/invitees?count=100`,
				);
				for (const invitee of invitees) {
					await ctx.runMutation(internal.calendly.importInviteeInternal, {
						jobId,
						meeting: {
							name: meeting.name,
							status: meeting.status,
							startMs: Date.parse(meeting.start_time),
							eventTypeUri: meeting.event_type ?? undefined,
							hostEmail:
								meeting.event_memberships?.[0]?.user_email ?? undefined,
						},
						invitee: {
							uri: invitee.uri,
							email: invitee.email ?? undefined,
							name: invitee.name ?? undefined,
							firstName: invitee.first_name ?? undefined,
							lastName: invitee.last_name ?? undefined,
							status: invitee.status,
							phone: invitee.text_reminder_number ?? undefined,
							noShow: Boolean(invitee.no_show),
							answers: (invitee.questions_and_answers ?? [])
								.sort((a, b) => a.position - b.position)
								.map((qa) => ({ question: qa.question, answer: qa.answer })),
							utmSource: invitee.tracking?.utm_source ?? undefined,
							utmMedium: invitee.tracking?.utm_medium ?? undefined,
							utmCampaign: invitee.tracking?.utm_campaign ?? undefined,
							utmTerm: invitee.tracking?.utm_term ?? undefined,
							utmContent: invitee.tracking?.utm_content ?? undefined,
						},
					});
				}
			}
			await ctx.runMutation(internal.calendly.addMeetingsSeenInternal, {
				jobId,
				count: page.collection.length,
			});

			const next = page.pagination?.next_page;
			if (next) {
				await ctx.scheduler.runAfter(0, internal.calendly.runHistoryPage, {
					jobId,
					pageUrl: next,
				});
			} else {
				await ctx.runMutation(internal.calendly.finishJobInternal, { jobId });
			}
		} catch (err) {
			console.error(`[calendly] import historique : ${errorMessage(err)}`);
			await ctx.runMutation(internal.calendly.finishJobInternal, {
				jobId,
				error: errorMessage(err),
			});
		}
	},
});

function splitName(full: string | undefined): {
	first?: string;
	last?: string;
} {
	const parts = (full ?? "").trim().split(/\s+/).filter(Boolean);
	if (parts.length === 0) return {};
	return { first: parts[0], last: parts.slice(1).join(" ") || undefined };
}

// Téléphone : le numéro de rappel SMS, sinon une réponse à une question de
// type téléphone.
function findPhone(
	phone: string | undefined,
	answers: Array<{ question: string; answer: string }>,
): string | undefined {
	if (phone?.trim()) return phone.trim();
	const qa = answers.find(
		(a) =>
			/t[ée]l[ée]phone|phone|portable|mobile|num[ée]ro/i.test(a.question) &&
			/\d{6,}/.test(a.answer.replace(/[\s.+()-]/g, "")),
	);
	return qa?.answer.trim();
}

export const importInviteeInternal = internalMutation({
	args: {
		jobId: v.id("calendlyImportJobs"),
		meeting: v.object({
			name: v.string(),
			status: v.string(),
			startMs: v.number(),
			eventTypeUri: v.optional(v.string()),
			hostEmail: v.optional(v.string()),
		}),
		invitee: v.object({
			uri: v.string(),
			email: v.optional(v.string()),
			name: v.optional(v.string()),
			firstName: v.optional(v.string()),
			lastName: v.optional(v.string()),
			status: v.string(),
			phone: v.optional(v.string()),
			noShow: v.boolean(),
			answers: v.array(v.object({ question: v.string(), answer: v.string() })),
			utmSource: v.optional(v.string()),
			utmMedium: v.optional(v.string()),
			utmCampaign: v.optional(v.string()),
			utmTerm: v.optional(v.string()),
			utmContent: v.optional(v.string()),
		}),
	},
	handler: async (ctx, { jobId, meeting, invitee }) => {
		const job = await ctx.db.get(jobId);
		if (!job) return;

		const seen = await ctx.db
			.query("calendlyImportedInvitees")
			.withIndex("by_inviteeUri", (q) => q.eq("inviteeUri", invitee.uri))
			.first();
		if (seen) {
			await ctx.db.patch(jobId, { alreadyImported: job.alreadyImported + 1 });
			return;
		}

		const now = Date.now();
		const events = await ctx.db.query("events").collect();
		const event: Doc<"events"> | undefined = meeting.eventTypeUri
			? events.find((e) => e.calendlyUri === meeting.eventTypeUri)
			: undefined;

		let hostId: Id<"users"> | undefined;
		if (meeting.hostEmail) {
			const host = await ctx.db
				.query("users")
				.withIndex("email", (q) =>
					q.eq("email", meeting.hostEmail?.toLowerCase()),
				)
				.first();
			hostId = host?._id;
		}

		const fallbackName = splitName(invitee.name);
		const firstName = invitee.firstName || fallbackName.first;
		const lastName = invitee.lastName || fallbackName.last;
		const phone = findPhone(invitee.phone, invitee.answers);
		const email = invitee.email?.trim().toLowerCase() || undefined;
		const formAnswers =
			invitee.answers.length > 0
				? JSON.stringify(
						Object.fromEntries(
							invitee.answers.map((a) => [a.question, a.answer]),
						),
					)
				: undefined;

		const canceled =
			meeting.status === "canceled" || invitee.status === "canceled";
		const outcome = canceled
			? { status: "potentiel" as const, label: "annulé" }
			: invitee.noShow
				? { status: "potentiel" as const, label: "absent (no-show)" }
				: meeting.startMs > now
					? { status: "rdv_reserve" as const, label: "à venir" }
					: { status: "tenu" as const, label: "passé" };

		const existing = await _findLeadByAnyKey(ctx, { phone, email });
		let leadId: Id<"leads">;
		if (existing) {
			// Un lead déjà suivi garde son statut et ses données : on complète
			// seulement ce qui manque.
			await ctx.db.patch(existing._id, {
				...(!existing.firstName && firstName && { firstName }),
				...(!existing.lastName && lastName && { lastName }),
				...(!existing.email &&
					email && {
						email,
						emailNormalized: normalizeEmail(email) || undefined,
					}),
				...(!existing.phone &&
					phone && {
						phone,
						phoneNormalized: normalizePhone(phone) || undefined,
					}),
				...(!existing.formAnswers && formAnswers && { formAnswers }),
				...(!existing.eventId &&
					event && { eventId: event._id, eventSlug: event.slug }),
				...(!existing.closerUserId && hostId && { closerUserId: hostId }),
			});
			leadId = existing._id;
			await ctx.db.patch(jobId, { leadsUpdated: job.leadsUpdated + 1 });
		} else {
			leadId = await ctx.db.insert("leads", {
				firstName,
				lastName,
				email,
				phone,
				emailNormalized: normalizeEmail(email) || undefined,
				phoneNormalized: normalizePhone(phone) || undefined,
				eventId: event?._id,
				eventSlug: event?.slug,
				formAnswers,
				status: outcome.status,
				phase: outcome.status,
				closerUserId: hostId,
				tagSource: "calendly",
				utmSource: invitee.utmSource,
				utmMedium: invitee.utmMedium,
				utmCampaign: invitee.utmCampaign,
				utmTerm: invitee.utmTerm,
				utmContent: invitee.utmContent,
				lastInteractionAt: now,
			});
			await ctx.db.patch(jobId, { leadsCreated: job.leadsCreated + 1 });
		}

		const when = new Date(meeting.startMs).toLocaleString("fr-FR", {
			timeZone: "Europe/Paris",
			dateStyle: "long",
			timeStyle: "short",
		});
		const answersText = invitee.answers
			.map((a) => `• ${a.question}\n  ${a.answer}`)
			.join("\n");
		await ctx.db.insert("leadNotes", {
			leadId,
			authorUserId: job.startedByUserId,
			createdAt: now,
			body: `Importé de Calendly — « ${meeting.name} » le ${when} (${outcome.label}).${
				answersText ? `\n\nRéponses au formulaire :\n${answersText}` : ""
			}`,
		});

		await ctx.db.insert("calendlyImportedInvitees", {
			inviteeUri: invitee.uri,
			leadId,
			importedAt: now,
		});
	},
});
