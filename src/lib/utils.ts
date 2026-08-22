import { type ClassValue, clsx } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
	return twMerge(clsx(inputs));
}

/**
 * URL publique d'une page de réservation.
 *
 * Utilise le domaine canonique (`NEXT_PUBLIC_APP_URL`) plutôt que
 * `window.location.origin` : sans ça, un lien copié depuis l'URL technique
 * Vercel (*.vercel.app) porte ce domaine au lieu du domaine de marque.
 * Fallback sur l'origine courante si la variable n'est pas définie.
 */
export function publicBookingUrl(slug: string): string {
	const base = (
		process.env.NEXT_PUBLIC_APP_URL ||
		(typeof window !== "undefined" ? window.location.origin : "")
	).replace(/\/$/, "");
	return `${base}/book/${slug}`;
}

/**
 * Formate un timestamp (ms) en durée relative.
 * Ex : "il y a 2h", "il y a 3j", "à l'instant"
 */
export function formatRelativeDate(ms: number): string {
	const diff = Date.now() - ms;
	const seconds = Math.floor(diff / 1000);
	const minutes = Math.floor(seconds / 60);
	const hours = Math.floor(minutes / 60);
	const days = Math.floor(hours / 24);

	if (seconds < 60) return "à l'instant";
	if (minutes < 60) return `il y a ${minutes}min`;
	if (hours < 24) return `il y a ${hours}h`;
	if (days < 7) return `il y a ${days}j`;

	return new Intl.DateTimeFormat("fr-FR", {
		day: "numeric",
		month: "short",
	}).format(new Date(ms));
}

/**
 * Formate un montant en centimes vers EUR.
 * Ex : formatEUR(9900) → "99,00 €"
 */
export function formatEUR(cents: number): string {
	return new Intl.NumberFormat("fr-FR", {
		style: "currency",
		currency: "EUR",
		minimumFractionDigits: 0,
		maximumFractionDigits: 2,
	}).format(cents / 100);
}
