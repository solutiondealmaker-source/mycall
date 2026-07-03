/**
 * convex/auth.ts
 *
 * Convex Auth setup — Password (email + password) uniquement.
 *
 * Sécurité (remédiation audit H1 + H1b) : la CRÉATION de compte est gatée par
 * une allowlist d'emails (env Convex `SIGNUP_ALLOWED_EMAILS`, séparée par des
 * virgules). Allowlist vide/absente ⇒ inscription fermée (fail-closed). La
 * CONNEXION d'un compte existant n'est jamais impactée (early return).
 */

import { Password } from "@convex-dev/auth/providers/Password";
import { convexAuth } from "@convex-dev/auth/server";
import { ResendOTPPasswordReset } from "./ResendOTPPasswordReset";

// Emails autorisés à créer un compte. Lu à chaque tentative d'inscription.
function getSignupAllowlist(): Set<string> {
	return new Set(
		(process.env.SIGNUP_ALLOWED_EMAILS ?? "")
			.split(",")
			.map((e) => e.trim().toLowerCase())
			.filter(Boolean),
	);
}

// Password only. Google OAuth retiré sur demande user (Phase 9 : flow Google
// Calendar séparé sur convex.site, sans toucher au sign-in).
export const { auth, signIn, signOut, store, isAuthenticated } = convexAuth({
	providers: [Password({ reset: ResendOTPPasswordReset })],
	callbacks: {
		async createOrUpdateUser(ctx, args) {
			// Connexion d'un compte existant — jamais gatée.
			if (args.existingUserId) return args.existingUserId;

			const email =
				typeof args.profile.email === "string" ? args.profile.email : undefined;
			const normalizedEmail = email?.trim().toLowerCase();

			// Gating inscription (H1) : seuls les emails de l'allowlist peuvent
			// créer un compte. Ferme aussi la course à l'admin (H1b), un email hors
			// allowlist ne pouvant pas créer le tout premier compte.
			const allowlist = getSignupAllowlist();
			if (allowlist.size === 0) {
				throw new Error(
					"Inscription désactivée : SIGNUP_ALLOWED_EMAILS n'est pas défini sur le déploiement.",
				);
			}
			if (!normalizedEmail || !allowlist.has(normalizedEmail)) {
				throw new Error("Cette adresse n'est pas autorisée à créer un compte.");
			}

			// Premier user autorisé de ce déploiement = admin/owner.
			const anyUser = await ctx.db.query("users").first();
			const isFirstUser = anyUser === null;
			const name =
				typeof args.profile.name === "string"
					? (args.profile.name as string)
					: undefined;

			return await ctx.db.insert("users", {
				email,
				name,
				...(isFirstUser ? { isAdmin: true, role: "admin" as const } : {}),
			});
		},
	},
});
