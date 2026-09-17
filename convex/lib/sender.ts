// Expéditeur des emails envoyés aux prospects.
//
// L'adresse par défaut est celle du fournisseur choisi dans Intégrations
// (Resend ou Brevo du client) ; à défaut, RESEND_FROM_EMAIL. Un membre peut
// avoir sa propre adresse d'envoi : les emails d'un rendez-vous partent alors
// de l'adresse de son hôte, et les réponses du prospect lui reviennent
// directement.
//
// Les fournisseurs n'acceptent que les adresses d'un domaine vérifié : une
// adresse d'envoi doit donc appartenir au même domaine que l'adresse par
// défaut. Sans adresse dédiée, l'email de connexion du membre est utilisé s'il
// est sur ce domaine.

import { BRAND_NAME } from "./emailTemplates";

export function envDefaultFrom(): string {
	return process.env.RESEND_FROM_EMAIL ?? "onboarding@resend.dev";
}

// Adresse par défaut effective, selon les réglages d'intégration.
export function defaultFrom(
	settings?: {
		emailProvider?: string;
		emailFromAddress?: string;
		emailFromName?: string;
	} | null,
): string {
	if (settings?.emailProvider && settings.emailFromAddress) {
		const name = (settings.emailFromName ?? BRAND_NAME)
			.replace(/[<>",]/g, "")
			.trim();
		return name
			? `${name} <${settings.emailFromAddress}>`
			: settings.emailFromAddress;
	}
	return envDefaultFrom();
}

// "Nom <a@b.fr>" → "a@b.fr"
export function extractAddress(from: string): string {
	const m = /<([^>]+)>/.exec(from);
	return (m ? m[1] : from).trim().toLowerCase();
}

// "Nom <a@b.fr>" → "Nom"
export function extractName(from: string): string | null {
	const m = /^\s*"?([^"<]*?)"?\s*</.exec(from);
	return m?.[1]?.trim() || null;
}

export function senderDomain(from: string = defaultFrom()): string | null {
	const address = extractAddress(from);
	const at = address.lastIndexOf("@");
	return at > 0 ? address.slice(at + 1) : null;
}

export function isValidEmail(email: string): boolean {
	return /^[^@\s<>",]+@[^@\s<>",]+\.[^@\s<>",]+$/.test(email);
}

export function isOnSenderDomain(
	email: string,
	from: string = defaultFrom(),
): boolean {
	const domain = senderDomain(from);
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
	from: string = defaultFrom(),
): string | null {
	if (!user) return null;
	if (user.senderEmail && isOnSenderDomain(user.senderEmail, from)) {
		return user.senderEmail.toLowerCase();
	}
	if (user.email && isOnSenderDomain(user.email, from)) {
		return user.email.toLowerCase();
	}
	return null;
}

// En-têtes From / Reply-To pour un membre. Le nom affiché garde la marque :
// « Julie · Ton Coach IDEL ».
export function senderFor(
	user: { name?: string; email?: string; senderEmail?: string } | null,
	from: string = defaultFrom(),
): Sender | null {
	const address = senderAddressFor(user, from);
	if (!address) return null;
	const name = user?.name?.replace(/[<>",]/g, "").trim();
	const display = name ? `${name} · ${BRAND_NAME}` : BRAND_NAME;
	return { from: `${display} <${address}>`, replyTo: address };
}
