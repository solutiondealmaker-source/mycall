// emailSettings.ts — fournisseur d'envoi des emails.
//
// Par défaut, une instance envoie via le compte Resend configuré à son
// installation. Le client peut raccorder son propre compte Resend ou Brevo :
// ses emails partent alors de son compte, avec ses statistiques et sa
// réputation d'expéditeur.

import { v } from "convex/values";
import { internal } from "./_generated/api";
import {
	action,
	internalMutation,
	internalQuery,
	mutation,
	query,
} from "./_generated/server";
import { getAuthenticatedUser, requireAdmin } from "./lib/auth";
import { defaultFrom, envDefaultFrom, isValidEmail } from "./lib/sender";

const PROVIDER = v.union(v.literal("resend"), v.literal("brevo"));

async function settingsRow(ctx: {
	db: import("./_generated/server").QueryCtx["db"];
}) {
	return await ctx.db
		.query("integrationSettings")
		.withIndex("by_singleton", (q) => q.eq("singleton", "default"))
		.first();
}

export const getEmailConfigInternal = internalQuery({
	args: {},
	handler: async (ctx) => {
		const s = await settingsRow(ctx);
		if (s?.emailProvider && s.emailApiKey && s.emailFromAddress) {
			return {
				provider: s.emailProvider,
				apiKey: s.emailApiKey,
				from: defaultFrom(s),
			};
		}
		return {
			provider: "resend" as const,
			apiKey: process.env.RESEND_API_KEY ?? null,
			from: envDefaultFrom(),
		};
	},
});

export const getEmailSettings = query({
	args: {},
	handler: async (ctx) => {
		await requireAdmin(ctx);
		const s = await settingsRow(ctx);
		const custom = Boolean(s?.emailProvider && s.emailApiKey);
		return {
			provider: custom ? (s?.emailProvider ?? null) : null,
			keyPreview:
				custom && s?.emailApiKey ? `••••${s.emailApiKey.slice(-4)}` : null,
			fromAddress: custom ? (s?.emailFromAddress ?? null) : null,
			fromName: custom ? (s?.emailFromName ?? null) : null,
			defaultFrom: envDefaultFrom(),
			defaultAvailable: Boolean(process.env.RESEND_API_KEY),
		};
	},
});

export const assertAdminInternal = internalQuery({
	args: {},
	handler: async (ctx) => {
		const userId = await requireAdmin(ctx);
		const user = await getAuthenticatedUser(ctx);
		return { userId, email: user.email ?? null };
	},
});

export const saveInternal = internalMutation({
	args: {
		userId: v.id("users"),
		provider: PROVIDER,
		apiKey: v.string(),
		fromAddress: v.string(),
		fromName: v.optional(v.string()),
	},
	handler: async (ctx, args) => {
		const patch = {
			emailProvider: args.provider,
			emailApiKey: args.apiKey,
			emailFromAddress: args.fromAddress,
			emailFromName: args.fromName,
			updatedAt: Date.now(),
			updatedByUserId: args.userId,
		};
		const existing = await settingsRow(ctx);
		if (existing) await ctx.db.patch(existing._id, patch);
		else
			await ctx.db.insert("integrationSettings", {
				singleton: "default",
				...patch,
			});
	},
});

// Vérifie la clé auprès du fournisseur avant de l'enregistrer.
async function verifyKey(
	provider: "resend" | "brevo",
	apiKey: string,
): Promise<void> {
	if (provider === "brevo") {
		const res = await fetch("https://api.brevo.com/v3/account", {
			headers: { "api-key": apiKey, Accept: "application/json" },
		});
		if (res.status === 401 || res.status === 403) {
			throw new Error(
				"Clé Brevo refusée : utilise une clé API v3 (Paramètres → SMTP & API → Clés API).",
			);
		}
		if (!res.ok) throw new Error(`Brevo a répondu ${res.status}.`);
		return;
	}
	const res = await fetch("https://api.resend.com/domains", {
		headers: { Authorization: `Bearer ${apiKey}` },
	});
	if (res.ok) return;
	const body = (await res.json().catch(() => ({}))) as {
		name?: string;
		message?: string;
	};
	// Une clé limitée à l'envoi ne peut pas lister les domaines : elle reste
	// valable pour ce qu'on en fait.
	if (body.name === "restricted_api_key") return;
	// Resend répond 400 « API key is invalid » à une clé mal formée, 401 à une
	// clé révoquée.
	const refused =
		res.status === 401 ||
		res.status === 403 ||
		/api key/i.test(body.message ?? "");
	throw new Error(
		refused
			? "Clé Resend refusée : vérifie qu'elle est complète et active."
			: `Resend a répondu ${res.status}${body.message ? ` (${body.message})` : ""}.`,
	);
}

export const saveEmailProvider = action({
	args: {
		provider: PROVIDER,
		apiKey: v.optional(v.string()),
		fromAddress: v.string(),
		fromName: v.optional(v.string()),
	},
	handler: async (ctx, args) => {
		const { userId } = await ctx.runQuery(
			internal.emailSettings.assertAdminInternal,
			{},
		);
		const fromAddress = args.fromAddress.trim().toLowerCase();
		if (!isValidEmail(fromAddress)) {
			throw new Error("Adresse d'expédition invalide.");
		}

		// Sans nouvelle clé, on garde celle déjà enregistrée pour ce fournisseur.
		let apiKey = args.apiKey?.trim();
		if (!apiKey) {
			const current = await ctx.runQuery(
				internal.emailSettings.currentKeyInternal,
				{ provider: args.provider },
			);
			if (!current) throw new Error("Colle la clé API du fournisseur.");
			apiKey = current;
		}
		await verifyKey(args.provider, apiKey);

		await ctx.runMutation(internal.emailSettings.saveInternal, {
			userId,
			provider: args.provider,
			apiKey,
			fromAddress,
			fromName: args.fromName?.trim() || undefined,
		});
		return { ok: true };
	},
});

export const currentKeyInternal = internalQuery({
	args: { provider: PROVIDER },
	handler: async (ctx, { provider }) => {
		const s = await settingsRow(ctx);
		return s?.emailProvider === provider ? (s.emailApiKey ?? null) : null;
	},
});

export const resetEmailProvider = mutation({
	args: {},
	handler: async (ctx) => {
		const userId = await requireAdmin(ctx);
		const existing = await settingsRow(ctx);
		if (!existing) return { ok: true };
		await ctx.db.patch(existing._id, {
			emailProvider: undefined,
			emailApiKey: undefined,
			emailFromAddress: undefined,
			emailFromName: undefined,
			updatedAt: Date.now(),
			updatedByUserId: userId,
		});
		return { ok: true };
	},
});

export const sendTest = action({
	args: {},
	handler: async (
		ctx,
	): Promise<{ ok: boolean; error?: string; to: string }> => {
		const { email } = await ctx.runQuery(
			internal.emailSettings.assertAdminInternal,
			{},
		);
		if (!email) throw new Error("Ton compte n'a pas d'adresse email.");
		const res = await ctx.runAction(internal.emails.sendTestEmail, {
			to: email,
		});
		return { ok: res.ok, error: res.error, to: email };
	},
});
