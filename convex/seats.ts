// seats.ts — nombre de comptes autorisés sur l'instance.
//
// Le plafond vit dans la variable d'environnement SEAT_LIMIT de la base Convex,
// pas en base de données : l'administrateur du client ne peut donc pas se
// l'augmenter lui-même depuis l'application. Seul l'éditeur, qui a la main sur
// le déploiement Convex, le modifie.
//
// Tout compte occupe un siège, quel que soit son rôle. Une invitation en
// attente réserve le sien : sans ça, inviter cinq personnes d'un coup ferait
// sauter le plafond au moment où elles acceptent.

import type { MutationCtx, QueryCtx } from "./_generated/server";
import { query } from "./_generated/server";
import { requireAdmin } from "./lib/auth";

// Variable absente = aucun plafond. Une instance déjà livrée ne doit pas se
// retrouver bloquée par un déploiement : le plafond est posé explicitement,
// instance par instance, par le script d'onboarding.
//
// 0 ou une valeur absurde vaut également « pas de limite » : mieux vaut une
// instance qui laisse inviter qu'une instance bloquée par une faute de frappe.
export function seatLimit(): number | null {
	const raw = process.env.SEAT_LIMIT?.trim();
	if (raw === undefined || raw === "") return null;
	if (/^(illimité|illimite|unlimited|none|0)$/i.test(raw)) return null;
	const n = Number(raw);
	if (!Number.isFinite(n) || n < 1) return null;
	return Math.floor(n);
}

export async function seatUsage(ctx: QueryCtx | MutationCtx) {
	const members = (await ctx.db.query("users").collect()).length;
	const pending = (await ctx.db.query("invitations").collect()).filter(
		(i) => !i.acceptedAt && !i.revokedAt && i.expiresAt > Date.now(),
	).length;
	const limit = seatLimit();
	const used = members + pending;
	return {
		limit,
		used,
		members,
		pending,
		remaining: limit === null ? null : Math.max(0, limit - used),
		full: limit !== null && used >= limit,
	};
}

// Affiché sur la page Équipe, au-dessus de la liste des membres.
export const getSeatUsage = query({
	args: {},
	handler: async (ctx) => {
		await requireAdmin(ctx);
		return await seatUsage(ctx);
	},
});
