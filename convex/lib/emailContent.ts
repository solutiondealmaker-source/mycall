// Textes personnalisables des emails envoyés aux prospects.
//
// Partagé avec l'interface : liste des emails, variables proposées et textes
// par défaut (ceux envoyés tant que rien n'est personnalisé).
//
// Seuls le sujet, le titre et le message d'introduction se personnalisent.
// Les informations dont le prospect a besoin (date, lien de visio, ajout à
// l'agenda, annulation) restent ajoutées automatiquement : un texte réécrit
// ne peut jamais produire un email incomplet.

export const EMAIL_KINDS = [
	{
		kind: "confirmation",
		label: "Confirmation de rendez-vous",
		description: "Envoyé dès la réservation.",
		automatic: [
			"l'événement, la date et l'hôte",
			"le lien de visio",
			"les boutons d'ajout à l'agenda et le fichier .ics",
			"les liens pour reprogrammer ou annuler",
		],
	},
	{
		kind: "reminder",
		label: "Rappel (2 h avant)",
		description: "Envoyé environ 2 heures avant le rendez-vous.",
		automatic: [
			"l'événement, la date et l'hôte",
			"le bouton pour rejoindre la visio",
			"le lien pour annuler",
		],
	},
	{
		kind: "reschedule",
		label: "Replanification",
		description: "Envoyé quand le rendez-vous change de date.",
		automatic: [
			"l'ancien et le nouveau créneau",
			"le lien de visio",
			"le fichier .ics mis à jour",
			"le lien pour annuler",
		],
	},
	{
		kind: "cancellation",
		label: "Annulation",
		description: "Envoyé quand le rendez-vous est annulé.",
		automatic: [
			"l'événement et la date annulés",
			"le motif s'il a été renseigné",
			"le bouton pour reprendre rendez-vous",
		],
	},
] as const;

export type EmailKind = (typeof EMAIL_KINDS)[number]["kind"];

export const TEMPLATE_VARIABLES = [
	{ key: "prenom", label: "Prénom du prospect" },
	{ key: "nom", label: "Nom du prospect" },
	{ key: "evenement", label: "Nom de l'événement" },
	{ key: "date", label: "Date et heure du rendez-vous" },
	{ key: "ancienne_date", label: "Ancienne date (replanification)" },
	{ key: "closer", label: "Nom du closer / hôte" },
	{ key: "lien_meet", label: "Lien de la visio" },
	{ key: "lien_reservation", label: "Lien de réservation de l'événement" },
	{ key: "lien_replanification", label: "Lien pour reprogrammer" },
	{ key: "lien_annulation", label: "Lien pour annuler" },
	{ key: "motif", label: "Motif d'annulation" },
	{ key: "entreprise", label: "Nom de ton activité" },
] as const;

export type TemplateValues = Partial<
	Record<(typeof TEMPLATE_VARIABLES)[number]["key"], string | null>
>;

export const DEFAULT_CONTENT: Record<
	EmailKind,
	{ subject: string; heading: string; body: string }
> = {
	confirmation: {
		subject: "Confirmation — {{evenement}} le {{date}}",
		heading: "Rendez-vous confirmé",
		body: "Bonjour {{prenom}}, votre rendez-vous est bien enregistré.",
	},
	reminder: {
		subject: "Rappel — votre rendez-vous dans 2h ({{evenement}})",
		heading: "Rappel — dans 2 heures",
		body: "Bonjour {{prenom}}, votre rendez-vous approche.",
	},
	reschedule: {
		subject: "Replanification — {{evenement}} le {{date}}",
		heading: "Rendez-vous replanifié",
		body: "Bonjour {{prenom}}, votre rendez-vous a été déplacé.",
	},
	cancellation: {
		subject: "Annulation — {{evenement}}",
		heading: "Rendez-vous annulé",
		body: "Bonjour {{prenom}}, votre rendez-vous a bien été annulé.",
	},
};

// Remplace {{variable}} (casse et espaces libres). Une variable connue mais
// sans valeur disparaît ; une variable inconnue est laissée telle quelle, pour
// qu'une faute de frappe se voie dans l'aperçu plutôt que de s'effacer.
export function fillVariables(text: string, values: TemplateValues): string {
	const known = new Set<string>(TEMPLATE_VARIABLES.map((v) => v.key));
	return text.replace(/\{\{\s*([a-zA-Z_]+)\s*\}\}/g, (match, raw: string) => {
		const key = raw.toLowerCase();
		if (!known.has(key)) return match;
		return values[key as keyof TemplateValues] ?? "";
	});
}
