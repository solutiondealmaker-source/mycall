// Expéditeur des emails envoyés aux prospects.
//
// Par défaut tout part de RESEND_FROM_EMAIL. Un membre peut avoir sa propre
// adresse d'envoi : les emails d'un rendez-vous partent alors de l'adresse de
// son hôte, et les réponses du prospect lui reviennent directement.
//
// Resend n'accepte que les adresses d'un domaine vérifié : une adresse d'envoi
// doit donc appartenir au même domaine que RESEND_FROM_EMAIL. Sans adresse
// dédiée, l'email de connexion du membre est utilisé s'il est sur ce domaine.

import { BRAND_NAME } from "./emailTemplates";

export function defaultFrom(): string {
	return process.env.RESEND_FROM_EMAIL ?? "onboarding@resend.dev";
}

// "Nom <a@b.fr>" → "a@b.fr"
export function extractAddress(from: string): string {
	const m = /<([^>]+)>/.exec(from);
	return (m ? m[1] : from).trim().toLowerCase();
}

export function senderDomain(): string | null {
	const address = extractAddress(defaultFrom());
	const at = address.lastIndexOf("@");
	return at > 0 ? address.slice(at + 1) : null;
}

export function isValidEmail(email: string): boolean {
	return /^[^@\s<>",]+@[^@\s<>",]+\.[^@\s<>",]+$/.test(email);
}

export function isOnSenderDomain(email: string): boolean {
	const domain = senderDomain();
	return (
		domain !== null &&
		isValidEmail(email) &&
		email.toLowerCase().endsWith(`@${domain}`)
	);
}

export interface Sender {
	from: string;
	replyTo: string;
}

// Adresse d'envoi effective d'un membre, ou null s'il n'en a pas.
export function senderAddressFor(
	user: { email?: string; senderEmail?: string } | null,
): string | null {
	if (!user) return null;
	if (user.senderEmail && isOnSenderDomain(user.senderEmail)) {
		return user.senderEmail.toLowerCase();
	}
	if (user.email && isOnSenderDomain(user.email)) {
		return user.email.toLowerCase();
	}
	return null;
}

// En-têtes From / Reply-To pour un membre. Le nom affiché garde la marque :
// « Julie · Ton Coach IDEL ».
export function senderFor(
	user: { name?: string; email?: string; senderEmail?: string } | null,
): Sender | null {
	const address = senderAddressFor(user);
	if (!address) return null;
	const name = user?.name?.replace(/[<>",]/g, "").trim();
	const display = name ? `${name} · ${BRAND_NAME}` : BRAND_NAME;
	return { from: `${display} <${address}>`, replyTo: address };
}
