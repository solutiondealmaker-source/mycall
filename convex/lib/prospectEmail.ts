// Rendu des emails prospects : sujet et HTML, avec ou sans texte
// personnalisé. Partagé par l'envoi réel et par l'aperçu de l'éditeur, pour
// que l'aperçu montre exactement ce qui partira.

import {
	DEFAULT_CONTENT,
	type EmailKind,
	fillVariables,
	type TemplateValues,
} from "./emailContent";
import {
	BRAND_NAME,
	bookingConfirmationTemplate,
	cancellationTemplate,
	reminderTemplate,
	rescheduleTemplate,
	textToHtml,
} from "./emailTemplates";

export interface ProspectEmailData {
	firstName: string;
	lastName: string;
	eventName: string;
	dateTime: string;
	oldDateTime?: string;
	hostName: string | null;
	meetUrl?: string | null;
	cancelUrl: string;
	rescheduleUrl: string | null;
	bookingUrl: string;
	reason?: string | null;
	googleCalUrl?: string;
	outlookCalUrl?: string;
}

export interface EmailTemplateContent {
	subject: string;
	heading: string;
	body: string;
}

export function templateValues(d: ProspectEmailData): TemplateValues {
	return {
		prenom: d.firstName,
		nom: d.lastName,
		evenement: d.eventName,
		date: d.dateTime,
		ancienne_date: d.oldDateTime ?? null,
		closer: d.hostName,
		lien_meet: d.meetUrl ?? null,
		lien_reservation: d.bookingUrl,
		lien_replanification: d.rescheduleUrl,
		lien_annulation: d.cancelUrl,
		motif: d.reason ?? null,
		entreprise: BRAND_NAME,
	};
}

export function renderProspectEmail(
	kind: EmailKind,
	d: ProspectEmailData,
	template: EmailTemplateContent | null,
): { subject: string; html: string } {
	const values = templateValues(d);
	const subject = fillVariables(
		template?.subject.trim() || DEFAULT_CONTENT[kind].subject,
		values,
	)
		.replace(/\s+/g, " ")
		.trim();
	const custom = template
		? {
				heading: fillVariables(template.heading, values).trim(),
				bodyHtml: textToHtml(fillVariables(template.body, values)),
			}
		: undefined;

	switch (kind) {
		case "confirmation":
			return {
				subject,
				html: bookingConfirmationTemplate({
					prospectName: `${d.firstName} ${d.lastName}`.trim(),
					prospectFirstName: d.firstName,
					eventName: d.eventName,
					dateTime: d.dateTime,
					hostName: d.hostName,
					meetUrl: d.meetUrl,
					cancelUrl: d.cancelUrl,
					rescheduleUrl: d.rescheduleUrl ?? d.cancelUrl,
					googleCalUrl: d.googleCalUrl,
					outlookCalUrl: d.outlookCalUrl,
					custom,
				}),
			};
		case "reminder":
			return {
				subject,
				html: reminderTemplate({
					prospectFirstName: d.firstName,
					eventName: d.eventName,
					dateTime: d.dateTime,
					hostName: d.hostName,
					meetUrl: d.meetUrl,
					cancelUrl: d.cancelUrl,
					custom,
				}),
			};
		case "reschedule":
			return {
				subject,
				html: rescheduleTemplate({
					prospectFirstName: d.firstName,
					eventName: d.eventName,
					oldDateTime: d.oldDateTime ?? "",
					newDateTime: d.dateTime,
					hostName: d.hostName,
					meetUrl: d.meetUrl,
					cancelUrl: d.cancelUrl,
					custom,
				}),
			};
		case "cancellation":
			return {
				subject,
				html: cancellationTemplate({
					prospectFirstName: d.firstName,
					eventName: d.eventName,
					dateTime: d.dateTime,
					reason: d.reason,
					rescheduleUrl: d.rescheduleUrl,
					custom,
				}),
			};
	}
}

// Données fictives de l'aperçu et de l'email de test.
export function sampleEmailData(siteUrl: string): ProspectEmailData {
	const start = Date.now() + 2 * 86_400_000;
	const fmt = (ms: number) =>
		new Intl.DateTimeFormat("fr-FR", {
			weekday: "long",
			day: "numeric",
			month: "long",
			year: "numeric",
			hour: "2-digit",
			minute: "2-digit",
			timeZone: "Europe/Paris",
		}).format(new Date(ms));
	return {
		firstName: "Camille",
		lastName: "Martin",
		eventName: "Appel découverte",
		dateTime: fmt(start),
		oldDateTime: fmt(start - 86_400_000),
		hostName: "Alex Dupont",
		meetUrl: "https://meet.google.com/abc-defg-hij",
		cancelUrl: `${siteUrl}/book/manage/exemple`,
		rescheduleUrl: `${siteUrl}/book/reschedule/exemple`,
		bookingUrl: `${siteUrl}/book/appel-decouverte`,
		reason: "Empêchement de dernière minute",
		googleCalUrl: "https://calendar.google.com/",
		outlookCalUrl: "https://outlook.live.com/",
	};
}
