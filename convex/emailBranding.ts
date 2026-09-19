// emailBranding.ts — apparence des emails : logo, couleur, signature.
//
// Le logo est stocké dans Convex et servi par son adresse publique : les
// clients mail chargent l'image à l'ouverture, sans pièce jointe.

import { v } from "convex/values";
import type { Id } from "./_generated/dataModel";
import {
	internalQuery,
	type MutationCtx,
	mutation,
	type QueryCtx,
	query,
} from "./_generated/server";
import { requireAdmin } from "./lib/auth";
import {
	BRAND_NAME,
	contrastWithWhite,
	DEFAULT_BRAND_COLOR,
	type EmailBrand,
	normalizeHex,
} from "./lib/emailTemplates";

const LOGO_TYPES = ["image/png", "image/jpeg", "image/gif", "image/webp"];
const LOGO_MAX_BYTES = 1_000_000;

async function settingsRow(ctx: QueryCtx) {
	return await ctx.db
		.query("integrationSettings")
		.withIndex("by_singleton", (q) => q.eq("singleton", "default"))
		.first();
}

// Marque à appliquer au rendu des emails.
export async function loadBrand(ctx: QueryCtx): Promise<Partial<EmailBrand>> {
	const s = await settingsRow(ctx);
	return {
		color: s?.emailBrandColor,
		tagline: s?.emailTagline,
		logoUrl: s?.emailLogoStorageId
			? await ctx.storage.getUrl(s.emailLogoStorageId)
			: null,
	};
}

export const getBrandInternal = internalQuery({
	args: {},
	handler: async (ctx) => await loadBrand(ctx),
});

export const getBranding = query({
	args: {},
	handler: async (ctx) => {
		await requireAdmin(ctx);
		const s = await settingsRow(ctx);
		return {
			name: BRAND_NAME,
			defaultColor: DEFAULT_BRAND_COLOR,
			color: s?.emailBrandColor ?? null,
			tagline: s?.emailTagline ?? null,
			logoUrl: s?.emailLogoStorageId
				? await ctx.storage.getUrl(s.emailLogoStorageId)
				: null,
		};
	},
});

export const generateLogoUploadUrl = mutation({
	args: {},
	handler: async (ctx) => {
		await requireAdmin(ctx);
		return await ctx.storage.generateUploadUrl();
	},
});

async function patchSettings(
	ctx: MutationCtx,
	userId: Id<"users">,
	patch: Record<string, unknown>,
) {
	const existing = await ctx.db
		.query("integrationSettings")
		.withIndex("by_singleton", (q) => q.eq("singleton", "default"))
		.first();
	const full = { ...patch, updatedAt: Date.now(), updatedByUserId: userId };
	if (existing) await ctx.db.patch(existing._id, full);
	else
		await ctx.db.insert("integrationSettings", {
			singleton: "default",
			...full,
		});
	return existing;
}

export const setLogo = mutation({
	args: { storageId: v.id("_storage") },
	handler: async (ctx, { storageId }) => {
		const userId = await requireAdmin(ctx);
		const file = await ctx.db.system.get(storageId);
		if (!file) throw new Error("Fichier introuvable.");
		if (!LOGO_TYPES.includes(file.contentType ?? "")) {
			await ctx.storage.delete(storageId);
			throw new Error(
				"Format non pris en charge : utilise un PNG, JPG, GIF ou WebP (le SVG ne s'affiche pas dans Gmail ni Outlook).",
			);
		}
		if (file.size > LOGO_MAX_BYTES) {
			await ctx.storage.delete(storageId);
			throw new Error("Logo trop lourd : 1 Mo maximum.");
		}
		const previous = await patchSettings(ctx, userId, {
			emailLogoStorageId: storageId,
		});
		// L'ancien logo n'est plus référencé nulle part.
		if (
			previous?.emailLogoStorageId &&
			previous.emailLogoStorageId !== storageId
		) {
			await ctx.storage.delete(previous.emailLogoStorageId);
		}
		return { ok: true };
	},
});

export const removeLogo = mutation({
	args: {},
	handler: async (ctx) => {
		const userId = await requireAdmin(ctx);
		const previous = await patchSettings(ctx, userId, {
			emailLogoStorageId: undefined,
		});
		if (previous?.emailLogoStorageId) {
			await ctx.storage.delete(previous.emailLogoStorageId);
		}
		return { ok: true };
	},
});

export const saveBranding = mutation({
	args: {
		color: v.union(v.string(), v.null()),
		tagline: v.union(v.string(), v.null()),
	},
	handler: async (ctx, { color, tagline }) => {
		const userId = await requireAdmin(ctx);
		let cleanColor: string | undefined;
		if (color?.trim()) {
			const hex = normalizeHex(color);
			if (!hex)
				throw new Error("Couleur invalide : utilise un code comme #1E3A5F.");
			const contrast = contrastWithWhite(hex) ?? 0;
			if (contrast < 3) {
				throw new Error(
					"Couleur trop claire : le texte blanc des boutons deviendrait illisible. Choisis une teinte plus foncée.",
				);
			}
			cleanColor = hex;
		}
		await patchSettings(ctx, userId, {
			emailBrandColor: cleanColor,
			emailTagline: tagline?.trim().slice(0, 120) || undefined,
		});
		return { ok: true };
	},
});
