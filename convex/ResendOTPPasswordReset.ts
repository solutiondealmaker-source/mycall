import Resend from "@auth/core/providers/resend";

/**
 * Provider OTP pour la réinitialisation de mot de passe.
 * Envoie un code à 6 chiffres par email via l'API REST Resend (fetch —
 * fonctionne quel que soit le runtime, pas de dépendance Node).
 *
 * Branché sur `Password({ reset: ResendOTPPasswordReset })` dans auth.ts.
 */
export const ResendOTPPasswordReset = Resend({
	id: "resend-otp-password-reset",
	apiKey: process.env.RESEND_API_KEY,
	maxAge: 60 * 15, // code valable 15 minutes
	async generateVerificationToken() {
		const bytes = new Uint8Array(6);
		crypto.getRandomValues(bytes);
		return Array.from(bytes, (b) => (b % 10).toString()).join("");
	},
	async sendVerificationRequest({ identifier: email, provider, token }) {
		const res = await fetch("https://api.resend.com/emails", {
			method: "POST",
			headers: {
				Authorization: `Bearer ${provider.apiKey}`,
				"Content-Type": "application/json",
			},
			body: JSON.stringify({
				from: process.env.RESEND_FROM_EMAIL ?? "onboarding@resend.dev",
				to: [email],
				subject: "Réinitialisation de votre mot de passe Mycall",
				text:
					`Votre code de réinitialisation Mycall : ${token}\n\n` +
					`Ce code expire dans 15 minutes. Si vous n'êtes pas à l'origine ` +
					`de cette demande, ignorez cet email.`,
			}),
		});
		if (!res.ok) {
			throw new Error(`Resend error ${res.status}: ${await res.text()}`);
		}
	},
});
