// Intégration Stripe — configuration + génération de liens de paiement.
//
// La clé secrète est stockée dans `integrationSettings` (Convex chiffre au
// repos) et n'est jamais renvoyée au client : les queries exposent seulement
// un aperçu masqué. Toutes les fonctions sont réservées à l'administration.
//
// On génère un *Payment Link* (et non une Checkout Session) : il n'expire pas,
// ce qui convient à un lien envoyé à un prospect par email ou message.

import { v } from "convex/values";
import { internal } from "./_generated/api";
import {
	action,
	internalMutation,
	internalQuery,
	mutation,
	query,
} from "./_generated/server";
import { requireAdmin } from "./lib/auth";

const STRIPE_API = "https://api.stripe.com/v1";

// ============================================================
// CONFIGURATION
// ============================================================

// Aperçu masqué : "sk_test_…4242" — jamais la clé complète.
function maskKey(key?: string): string | null {
	if (!key) return null;
	const prefix = key.startsWith("sk_live") ? "sk_live" : "sk_test";
	return `${prefix}…${key.slice(-4)}`;
}

export const getSettings = query({
	args: {},
	handler: async (ctx) => {
		await requireAdmin(ctx);
		const s = await ctx.db
			.query("integrationSettings")
			.withIndex("by_singleton", (q) => q.eq("singleton", "default"))
			.first();
		return {
			stripeConfigured: Boolean(s?.stripeSecretKey),
			stripeEnabled: s?.stripeEnabled ?? false,
			stripeKeyPreview: maskKey(s?.stripeSecretKey),
			stripeMode: s?.stripeSecretKey?.startsWith("sk_live")
				? ("live" as const)
				: ("test" as const),
			stripeCurrency: s?.stripeCurrency ?? "eur",
			stripeWebhookConfigured: Boolean(s?.stripeWebhookSecret),
			updatedAt: s?.updatedAt ?? null,
		};
	},
});

export const setStripeKey = mutation({
	args: {
		secretKey: v.string(),
		currency: v.optional(v.string()),
	},
	handler: async (ctx, { secretKey, currency }) => {
		const userId = await requireAdmin(ctx);
		const key = secretKey.trim();
		if (!key.startsWith("sk_test_") && !key.startsWith("sk_live_")) {
			throw new Error(
				"Clé invalide : une clé secrète Stripe commence par sk_test_ ou sk_live_.",
			);
		}
		const existing = await ctx.db
			.query("integrationSettings")
			.withIndex("by_singleton", (q) => q.eq("singleton", "default"))
			.first();

		const patch = {
			stripeSecretKey: key,
			stripeEnabled: true,
			stripeCurrency: (currency ?? "eur").toLowerCase(),
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

export const setStripeEnabled = mutation({
	args: { enabled: v.boolean() },
	handler: async (ctx, { enabled }) => {
		const userId = await requireAdmin(ctx);
		const existing = await ctx.db
			.query("integrationSettings")
			.withIndex("by_singleton", (q) => q.eq("singleton", "default"))
			.first();
		if (!existing) throw new Error("Stripe n'est pas encore configuré.");
		await ctx.db.patch(existing._id, {
			stripeEnabled: enabled,
			updatedAt: Date.now(),
			updatedByUserId: userId,
		});
		return { ok: true };
	},
});

export const removeStripeKey = mutation({
	args: {},
	handler: async (ctx) => {
		const userId = await requireAdmin(ctx);
		const existing = await ctx.db
			.query("integrationSettings")
			.withIndex("by_singleton", (q) => q.eq("singleton", "default"))
			.first();
		if (!existing) return { ok: true };
		await ctx.db.patch(existing._id, {
			stripeSecretKey: undefined,
			stripeEnabled: false,
			updatedAt: Date.now(),
			updatedByUserId: userId,
		});
		return { ok: true };
	},
});

export const setWebhookSecret = mutation({
	args: { webhookSecret: v.string() },
	handler: async (ctx, { webhookSecret }) => {
		const userId = await requireAdmin(ctx);
		const secret = webhookSecret.trim();
		if (secret && !secret.startsWith("whsec_")) {
			throw new Error("Le secret de webhook Stripe commence par whsec_.");
		}
		const existing = await ctx.db
			.query("integrationSettings")
			.withIndex("by_singleton", (q) => q.eq("singleton", "default"))
			.first();
		if (!existing) throw new Error("Configure d'abord la clé secrète Stripe.");
		await ctx.db.patch(existing._id, {
			stripeWebhookSecret: secret || undefined,
			updatedAt: Date.now(),
			updatedByUserId: userId,
		});
		return { ok: true };
	},
});

// Secret de signature du webhook — lu par l'httpAction publique.
export const getWebhookSecretInternal = internalQuery({
	args: {},
	handler: async (ctx) => {
		const s = await ctx.db
			.query("integrationSettings")
			.withIndex("by_singleton", (q) => q.eq("singleton", "default"))
			.first();
		return s?.stripeWebhookSecret ?? null;
	},
});

// Applique un paiement réussi : lead gagné + montant + trace.
// Idempotent : un même paymentIntent ne peut pas créditer deux fois.
export const applyPaymentSucceededInternal = internalMutation({
	args: {
		leadId: v.string(),
		amountCents: v.number(),
		paymentIntentId: v.string(),
	},
	handler: async (ctx, { leadId, amountCents, paymentIntentId }) => {
		let lead: Awaited<ReturnType<typeof ctx.db.get>> = null;
		try {
			lead = await ctx.db.get(leadId as never);
		} catch {
			return { ok: false, reason: "invalid_lead_id" };
		}
		if (!lead) return { ok: false, reason: "lead_not_found" };

		// Idempotence : si une note porte déjà ce paymentIntent, on ne refait rien.
		const notes = await ctx.db
			.query("leadNotes")
			.withIndex("by_lead", (q) => q.eq("leadId", leadId as never))
			.collect();
		if (notes.some((n) => n.body.includes(paymentIntentId))) {
			return { ok: true, reason: "already_applied" };
		}

		const now = Date.now();
		await ctx.db.patch(leadId as never, {
			status: "gagne" as const,
			phase: "gagne",
			montantContracte: amountCents,
			convertedAt: now,
			lastInteractionAt: now,
		});

		// Le closer en priorité ; à défaut le setter — sans auteur, pas de note,
		// donc plus de garde d'idempotence sur les renvois Stripe.
		const authorId =
			(lead as { closerUserId?: unknown }).closerUserId ??
			(lead as { setterUserId?: unknown }).setterUserId;
		if (authorId) {
			await ctx.db.insert("leadNotes", {
				leadId: leadId as never,
				body: `✅ Paiement reçu — ${(amountCents / 100).toFixed(2)} € (Stripe ${paymentIntentId})`,
				authorUserId: authorId as never,
				createdAt: now,
			});
		}

		// Répercuter l'issue sur le rendez-vous. Indispensable : le chiffre
		// d'affaires d'Analytics se calcule sur les bookings gagnés
		// (analytics.ts → getRevenueStats), jamais sur les leads. Sans ce miroir,
		// un paiement encaissé laisserait le CA à 0.
		const bookings = await ctx.db
			.query("bookings")
			.withIndex("by_leadId_startTime", (q) => q.eq("leadId", leadId as never))
			.collect();
		if (bookings.length > 0) {
			// Le RDV le plus récent déjà passé ; à défaut, le plus récent tout court.
			const past = bookings.filter((b) => b.startTime <= now);
			const target = (past.length > 0 ? past : bookings).reduce((a, b) =>
				b.startTime > a.startTime ? b : a,
			);
			// On ne réécrit pas un RDV déjà marqué gagné : le montant saisi par le
			// closer fait foi et le CA le compte déjà.
			if (target.issue !== "gagne") {
				await ctx.db.patch(target._id, {
					issue: "gagne" as const,
					issueAmountCents: amountCents,
				});
			}
		}
		return { ok: true, reason: "applied" };
	},
});

// Lecture interne de la clé — réservée aux actions serveur.
export const getSecretKeyInternal = internalQuery({
	args: {},
	handler: async (ctx) => {
		const s = await ctx.db
			.query("integrationSettings")
			.withIndex("by_singleton", (q) => q.eq("singleton", "default"))
			.first();
		if (!s?.stripeSecretKey || !s.stripeEnabled) return null;
		return { key: s.stripeSecretKey, currency: s.stripeCurrency ?? "eur" };
	},
});

// Trace le lien généré dans la timeline du lead.
export const logPaymentLinkInternal = internalMutation({
	args: {
		leadId: v.id("leads"),
		url: v.string(),
		amountCents: v.number(),
		label: v.string(),
		userId: v.optional(v.id("users")),
	},
	handler: async (ctx, { leadId, url, amountCents, label, userId }) => {
		const lead = await ctx.db.get(leadId);
		if (!lead) return;
		await ctx.db.insert("leadNotes", {
			leadId,
			body: `💳 Lien de paiement généré — ${(amountCents / 100).toFixed(2)} € (${label})\n${url}`,
			authorUserId: userId ?? (lead.closerUserId as never),
			createdAt: Date.now(),
		});
		await ctx.db.patch(leadId, { lastInteractionAt: Date.now() });
	},
});

// ============================================================
// GÉNÉRATION DU LIEN DE PAIEMENT
// ============================================================

function formEncode(params: Record<string, string>): string {
	return Object.entries(params)
		.map(([k, val]) => `${encodeURIComponent(k)}=${encodeURIComponent(val)}`)
		.join("&");
}

async function stripePost(
	key: string,
	path: string,
	params: Record<string, string>,
): Promise<Record<string, unknown>> {
	const res = await fetch(`${STRIPE_API}${path}`, {
		method: "POST",
		headers: {
			Authorization: `Bearer ${key}`,
			"Content-Type": "application/x-www-form-urlencoded",
		},
		body: formEncode(params),
	});
	const body = (await res.json()) as Record<string, unknown>;
	if (!res.ok) {
		const err = body.error as { message?: string } | undefined;
		throw new Error(err?.message ?? `Stripe a répondu ${res.status}`);
	}
	return body;
}

export const createPaymentLink = action({
	args: {
		leadId: v.id("leads"),
		amountCents: v.number(),
		label: v.optional(v.string()),
	},
	handler: async (
		ctx,
		{ leadId, amountCents, label },
	): Promise<{ url: string }> => {
		const me = await ctx.runQuery(
			internal.googleHelpers.getCurrentUserInternal,
			{},
		);
		if (!me) throw new Error("Non authentifié");

		if (!Number.isFinite(amountCents) || amountCents < 100) {
			throw new Error("Montant invalide (minimum 1 €).");
		}
		if (amountCents > 100_000_00) {
			throw new Error("Montant trop élevé (maximum 100 000 €).");
		}

		const cfg = await ctx.runQuery(internal.stripe.getSecretKeyInternal, {});
		if (!cfg) {
			throw new Error(
				"Stripe n'est pas configuré ou est désactivé (Paramètres → Intégrations).",
			);
		}

		const name = (label ?? "Prestation").trim().slice(0, 120) || "Prestation";

		// 1. Prix ponctuel (produit créé à la volée)
		const price = await stripePost(cfg.key, "/prices", {
			currency: cfg.currency,
			unit_amount: String(Math.round(amountCents)),
			"product_data[name]": name,
		});

		// 2. Payment Link (n'expire pas).
		// `payment_intent_data[metadata]` est propagé au PaymentIntent créé lors
		// du paiement : c'est ce qui permet au webhook de retrouver le lead
		// (les metadata du lien lui-même n'arrivent pas dans l'événement).
		const link = await stripePost(cfg.key, "/payment_links", {
			"line_items[0][price]": String(price.id),
			"line_items[0][quantity]": "1",
			"metadata[leadId]": leadId,
			"payment_intent_data[metadata][leadId]": leadId,
		});

		const url = String(link.url ?? "");
		if (!url) throw new Error("Stripe n'a pas renvoyé de lien.");

		await ctx.runMutation(internal.stripe.logPaymentLinkInternal, {
			leadId,
			url,
			amountCents,
			label: name,
			userId: me._id,
		});

		return { url };
	},
});
