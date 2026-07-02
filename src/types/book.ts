/**
 * Types partagés pour le flow de booking public.
 */

import type { Id } from "../../convex/_generated/dataModel";
import type { EventDoc, EventQuestion } from "./events";

// Données collectées pendant le flow
export interface BookSessionData {
	firstName: string;
	lastName: string;
	phone: string;
	email: string;
	formAnswers: Record<string, string | string[]>;
}

// Résultat retourné par createBookingChecked
export interface BookingResult {
	bookingId: Id<"bookings">;
	hostId: Id<"users">;
	hostName: string | null;
	hostEmail: string | null;
	startTime: number;
	endTime: number;
	cancelToken: string;
	rescheduleToken: string;
	googleMeetUrl?: string | null;
}

// Props passées à BookClient
export interface BookClientProps {
	event: EventDoc;
	questions: EventQuestion[];
	slug: string;
}
