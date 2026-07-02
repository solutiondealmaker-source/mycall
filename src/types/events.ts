/**
 * Types partagés pour les entités événements côté frontend.
 * Ces types mirroient le schéma Convex (convex/schema.ts) pour le typage
 * des composants admin event config — sans dépendance aux _generated.
 */

export type EventLocation = "googleMeet" | "custom";
export type EventPriorityMode = "manual" | "round_robin";
export type EventRangeType = "rolling" | "indefinite";

export type EventQuestionType =
	| "email"
	| "short_text"
	| "long_text"
	| "single_select"
	| "multi_select"
	| "yes_no"
	| "number";

export interface EventQuestion {
	_id: string;
	eventId: string;
	order: number;
	type: EventQuestionType;
	label: string;
	required: boolean;
	options?: string[];
	disqualifyingValues?: string[];
}

export interface EventHost {
	_id: string;
	eventId: string;
	userId: string;
	priority: "high" | "medium" | "low";
	createdAt: number;
	// Données dénormalisées depuis users
	user?: {
		name?: string;
		email: string;
		image?: string;
	};
}

export interface DisqualificationRule {
	questionLabel: string;
	answers: string[];
}

export interface EventDoc {
	_id: string;
	_creationTime: number;

	name: string;
	slug: string;
	description?: string;

	// Durée & buffers
	durationMinutes: number;
	bufferBeforeMinutes?: number;
	bufferAfterMinutes?: number;
	slotIncrementMinutes?: number;

	// Présentation
	timeFormat?: "h12" | "h24";
	timezone: string;
	color?: string;

	// Fenêtre de disponibilité
	rangeType?: EventRangeType;
	rangeDays?: number;
	rescheduleRangeDays?: number;
	alwaysAvailableDays?: boolean | number[];
	minimumNoticeHours?: number;
	businessDaysOnly?: boolean;

	// Comportement booking
	allowReschedule: boolean;
	preventDoubleBooking?: boolean;
	rescheduleWithSameHost?: boolean;
	priorityMode: EventPriorityMode;

	// Disqualification
	disqualificationRules?: DisqualificationRule[];
	disqualificationMessage?: string;
	disqualificationRedirectUrl?: string;

	// Attribution setter
	setterId?: string;

	// Templates invitation Google Calendar
	calendarGreeting?: string;
	calendarBody?: string;
	calendarSignature?: string;

	// Page de confirmation
	confirmationTitle?: string;
	confirmationMessage?: string;
	confirmationRedirectUrl?: string;

	// Location
	location?: EventLocation;
	customLocation?: string;

	// Misc
	reservationTimerMinutes?: number;
	tagSource?: string;
	noteInterne?: string;
	isActive: boolean;
}

/** Patch partiel pour une mutation update d'event */
export type EventPatch = Partial<Omit<EventDoc, "_id" | "_creationTime">>;

/** Liste des sections de la sidebar nav */
export type EventSectionKey =
	| "details"
	| "hosts"
	| "schedule"
	| "questions"
	| "disqualification"
	| "invitation"
	| "confirmation";
