// Événements transmis aux outils externes (Make, Zapier, systeme.io).
// Partagé avec l'interface : c'est la liste proposée à l'abonnement.

export const OUTBOUND_EVENTS = [
	{
		type: "lead.created",
		label: "Nouveau lead",
		description: "Un prospect est créé : formulaire, réservation ou API.",
	},
	{
		type: "lead.status_changed",
		label: "Changement de statut",
		description: "Le statut d'un lead change (RDV réservé, gagné, perdu…).",
	},
	{
		type: "booking.created",
		label: "Rendez-vous réservé",
		description: "Un prospect réserve un créneau.",
	},
	{
		type: "booking.rescheduled",
		label: "Rendez-vous déplacé",
		description: "Un rendez-vous change de date.",
	},
	{
		type: "booking.cancelled",
		label: "Rendez-vous annulé",
		description: "Un rendez-vous est annulé.",
	},
	{
		type: "booking.outcome_updated",
		label: "Issue du rendez-vous",
		description: "Présence ou résultat renseigné : tenu, absent, gagné, perdu.",
	},
	{
		type: "payment.succeeded",
		label: "Paiement reçu",
		description: "Un paiement Stripe est encaissé.",
	},
] as const;

export type OutboundEventType = (typeof OUTBOUND_EVENTS)[number]["type"];

export const OUTBOUND_EVENT_TYPES: readonly string[] = OUTBOUND_EVENTS.map(
	(e) => e.type,
);

export const LEAD_STATUS_LABELS: Record<string, string> = {
	potentiel: "Potentiel",
	qualifie: "Qualifié",
	rdv_reserve: "RDV réservé",
	tenu: "RDV tenu",
	gagne: "Gagné",
	perdu: "Perdu",
	follow_up: "Follow-up",
};
