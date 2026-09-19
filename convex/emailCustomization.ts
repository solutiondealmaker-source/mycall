// emailCustomization.ts — textes personnalisés des emails prospects.
//
// Un texte vaut pour tous les événements, ou pour un seul. À l'envoi, le texte
// de l'événement l'emporte sur le texte général, qui l'emporte sur le texte
// par défaut.

import { v } from "convex/values";
import { internal } from "./_generated/api";
import type { Id } from "./_generated/dataModel";
import {
	action,
	internalQuery,
	mutation,
	type QueryCtx,
	query,
} from "./_generated/server";
import { getAuthenticatedUser, requireAdmin } from "./lib/auth";
import { renderProspectEmail, sampleEmailData } from "./lib/prospectEmail";

const KIND = v.union(
	v.literal("confirmation"),
	v.literal("reminder"),
	v.literal("reschedule"),
	v.literal("cancellation"),
);

const SITE_URL = (
	process.env.APP_BASE_URL ??
	process.env.SITE_URL ??
	"http://localhost:3000"
).replace(/\/$/, "");

async function findTemplate(
	ctx: QueryCtx,
	kind: "confirmation" | "reminder" | "reschedule" | "cancellation",
	eventId: Id<"events"> | undefined,
) {
	const rows = await ctx.db
		.query("emailTemplates")
		.withIndex("by_kind", (q) => q.eq("kind", kind))
		.collect();
	return rows.find((r) => r.eventId === eventId) ?? null;
}

export const listTemplates = query({
	args: {},
	handler: async (ctx) => {
		await requireAdmin(ctx);
		const rows = await ctx.db.query("emailTemplates").collect();
		return rows.map((r) => ({
			_id: r._id,
			kind: r.kind,
			eventId: r.eventId ?? null,
			subject: r.subject,
			heading: r.heading,
			body: r.body,
			enabled: r.enabled,
			updatedAt: r.updatedAt,
		}));
	},
});

export const saveTemplate = mutation({
	args: {
		kind: KIND,
		eventId: v.optional(v.id("events")),
		subject: v.string(),
		heading: v.string(),
		body: v.string(),
		enabled: v.boolean(),
	},
	handler: async (ctx, args) => {
		const userId = await requireAdmin(ctx);
		const subject = args.subject.trim().slice(0, 200);
		if (!subject) throw new Error("Le sujet est obligatoire.");
		if (!args.body.trim()) throw new Error("Le message est obligatoire.");
		if (args.eventId && !(await ctx.db.get(args.eventId))) {
			throw new Error("Événement introuvable.");
		}

		const patch = {
			subject,
			heading: args.heading.trim().slice(0, 200),
			body: args.body.slice(0, 10_000),
			enabled: args.enabled,
			updatedAt: Date.now(),
			updatedByUserId: userId,
		};
		const existing = await findTemplate(ctx, args.kind, args.eventId);
		if (existing) {
			await ctx.db.patch(existing._id, patch);
			return existing._id;
		}
		return await ctx.db.insert("emailTemplates", {
			kind: args.kind,
			eventId: args.eventId,
			...patch,
		});
	},
});

// Revenir au texte par défaut (ou au texte général, pour un événement).
export const deleteTemplate = mutation({
	args: { kind: KIND, eventId: v.optional(v.id("events")) },
	handler: async (ctx, { kind, eventId }) => {
		await requireAdmin(ctx);
		const existing = await findTemplate(ctx, kind, eventId);
		if (existing) await ctx.db.delete(existing._id);
		return { ok: true };
	},
});

// Texte à utiliser pour un envoi réel.
export const resolveTemplateInternal = internalQuery({
	args: { kind: KIND, eventId: v.id("events") },
	handler: async (ctx, { kind, eventId }) => {
		const rows = await ctx.db
			.query("emailTemplates")
			.withIndex("by_kind", (q) => q.eq("kind", kind))
			.collect();
		const chosen =
			rows.find((r) => r.eventId === eventId && r.enabled) ??
			rows.find((r) => r.eventId === undefined && r.enabled);
		return chosen
			? { subject: chosen.subject, heading: chosen.heading, body: chosen.body }
			: null;
	},
});

const CONTENT = {
	kind: KIND,
	subject: v.string(),
	heading: v.string(),
	body: v.string(),
};

// Aperçu : le texte en cours d'édition, rendu avec des données fictives.
export const previewTemplate = query({
	args: { ...CONTENT, useDefault: v.optional(v.boolean()) },
	handler: async (ctx, { kind, subject, heading, body, useDefault }) => {
		await requireAdmin(ctx);
		return renderProspectEmail(
			kind,
			sampleEmailData(SITE_URL),
			useDefault ? null : { subject, heading, body },
		);
	},
});

export const adminEmailInternal = internalQuery({
	args: {},
	handler: async (ctx) => {
		await requireAdmin(ctx);
		const user = await getAuthenticatedUser(ctx);
		return user.email ?? null;
	},
});

export const sendTestTemplate = action({
	args: { ...CONTENT, useDefault: v.optional(v.boolean()) },
	handler: async (
		ctx,
		args,
	): Promise<{ ok: boolean; to: string; error?: string }> => {
		const to = await ctx.runQuery(
			internal.emailCustomization.adminEmailInternal,
			{},
		);
		if (!to) throw new Error("Ton compte n'a pas d'adresse email.");
		const rendered = renderProspectEmail(
			args.kind,
			sampleEmailData(SITE_URL),
			args.useDefault
				? null
				: { subject: args.subject, heading: args.heading, body: args.body },
		);
		const res = await ctx.runAction(internal.emails.sendRawEmail, {
			to,
			subject: `[Test] ${rendered.subject}`,
			html: rendered.html,
		});
		return { ok: res.ok, to, error: res.error };
	},
});
