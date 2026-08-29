// Génération d'un fichier .ics (RFC 5545) joint aux emails de confirmation.
//
// Depuis qu'on ne laisse plus Google inviter le prospect — l'invitation partait
// au nom du compte Google connecté, que le prospect ne reconnaît pas — c'est ce
// fichier qui lui permet d'ajouter le rendez-vous à son agenda en un clic,
// quel que soit son fournisseur.
//
// METHOD:PUBLISH et non REQUEST : on ne demande pas de réponse (accepter /
// refuser), l'organisateur reste l'agenda Google côté hôte. C'est une pièce
// jointe informative, pas une invitation concurrente.

export interface IcsArgs {
	uid: string;
	startMs: number;
	endMs: number;
	title: string;
	description?: string;
	location?: string;
	organizerName: string;
}

// Format UTC compact exigé par la RFC : 20260830T100000Z
function toIcsDate(ms: number): string {
	return `${new Date(ms).toISOString().replace(/[-:]/g, "").split(".")[0]}Z`;
}

// Échappe les caractères que la RFC réserve, sinon une virgule dans un titre
// coupe le champ en deux et le fichier devient illisible.
function esc(input: string): string {
	return input
		.replace(/\\/g, "\\\\")
		.replace(/;/g, "\\;")
		.replace(/,/g, "\\,")
		.replace(/\r?\n/g, "\\n");
}

// Les lignes de plus de 75 octets doivent être repliées, la suite préfixée d'un
// espace. Outlook rejette le fichier autrement.
function fold(line: string): string {
	if (line.length <= 75) return line;
	const parts: string[] = [line.slice(0, 75)];
	let rest = line.slice(75);
	while (rest.length > 74) {
		parts.push(` ${rest.slice(0, 74)}`);
		rest = rest.slice(74);
	}
	if (rest) parts.push(` ${rest}`);
	return parts.join("\r\n");
}

export function buildIcs(args: IcsArgs): string {
	const { uid, startMs, endMs, title, description, location, organizerName } =
		args;

	const lines = [
		"BEGIN:VCALENDAR",
		"VERSION:2.0",
		`PRODID:-//${esc(organizerName)}//Booking//FR`,
		"CALSCALE:GREGORIAN",
		"METHOD:PUBLISH",
		"BEGIN:VEVENT",
		`UID:${uid}`,
		`DTSTAMP:${toIcsDate(Date.now())}`,
		`DTSTART:${toIcsDate(startMs)}`,
		`DTEND:${toIcsDate(endMs)}`,
		`SUMMARY:${esc(title)}`,
		description ? `DESCRIPTION:${esc(description)}` : "",
		location ? `LOCATION:${esc(location)}` : "",
		"STATUS:CONFIRMED",
		// Rappel 30 min avant, côté agenda du prospect.
		"BEGIN:VALARM",
		"TRIGGER:-PT30M",
		"ACTION:DISPLAY",
		`DESCRIPTION:${esc(title)}`,
		"END:VALARM",
		"END:VEVENT",
		"END:VCALENDAR",
	].filter(Boolean);

	return `${lines.map(fold).join("\r\n")}\r\n`;
}
