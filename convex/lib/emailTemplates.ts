// Templates des emails transactionnels, envoyés via Resend.
//
// Design : Inter / stack système, largeur max 600px, layout en tables (seul
// format fiable sur Outlook & consorts).
//
// Marque : lue dans l'environnement Convex, jamais écrite en dur. Chaque
// instance (un business = une instance) porte ainsi sa propre identité sans
// dupliquer une ligne de template.
//
// Sécurité : toute chaîne venant de l'utilisateur DOIT passer par escapeHtml()
// avant interpolation, sous peine d'injection HTML dans les emails hôte.

// ============================================================
// Marque — configurable par instance
// ============================================================

export const BRAND_NAME = process.env.BRAND_NAME?.trim() || "Mycall";
// Pas de slogan par défaut : un slogan non choisi vaut mieux absent que
// générique. Une instance qui en veut un le déclare. Ça évite aussi de devoir
// poser une valeur vide pour le supprimer — ce que la CLI Convex refuse.
const BRAND_TAGLINE = process.env.BRAND_TAGLINE?.trim() ?? "";
// Couleur d'accent : boutons, liens, logo. Doit rester sombre — le texte des
// boutons est blanc.
const BRAND_COLOR = normalizeHex(process.env.BRAND_COLOR) ?? "#192A3B";

// Accepte "#RGB", "#RRGGBB" ou sans dièse ; renvoie null si la valeur est
// inexploitable, pour retomber sur la couleur par défaut plutôt que de
// produire du CSS cassé dans un email déjà parti.
function normalizeHex(input: string | undefined): string | null {
	const raw = input?.trim().replace(/^#/, "");
	if (!raw) return null;
	if (/^[0-9a-fA-F]{3}$/.test(raw)) {
		const [r, g, b] = raw;
		return `#${r}${r}${g}${g}${b}${b}`.toUpperCase();
	}
	if (/^[0-9a-fA-F]{6}$/.test(raw)) return `#${raw.toUpperCase()}`;
	return null;
}

function hexToRgb(hex: string): [number, number, number] {
	const n = Number.parseInt(hex.slice(1), 16);
	return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

// Éclaircit une couleur vers le blanc — utilisé pour le dégradé d'en-tête,
// afin qu'il reste cohérent quelle que soit la couleur de marque choisie.
function lighten(hex: string, ratio: number): string {
	const [r, g, b] = hexToRgb(hex);
	const mix = (c: number) => Math.round(c + (255 - c) * ratio);
	return `#${[mix(r), mix(g), mix(b)]
		.map((c) => c.toString(16).padStart(2, "0"))
		.join("")
		.toUpperCase()}`;
}

function brandShadow(alpha: number): string {
	const [r, g, b] = hexToRgb(BRAND_COLOR);
	return `rgba(${r},${g},${b},${alpha})`;
}

// ============================================================
// Helpers
// ============================================================

export function escapeHtml(input: string | undefined | null): string {
	if (!input) return "";
	return String(input)
		.replace(/&/g, "&amp;")
		.replace(/</g, "&lt;")
		.replace(/>/g, "&gt;")
		.replace(/"/g, "&quot;")
		.replace(/'/g, "&#39;");
}

export function formatDateFR(ts: number, timezone: string): string {
	return new Intl.DateTimeFormat("fr-FR", {
		weekday: "long",
		day: "numeric",
		month: "long",
		year: "numeric",
		hour: "2-digit",
		minute: "2-digit",
		timeZone: timezone,
	}).format(new Date(ts));
}

// Base layout — shared chrome for all templates
function baseLayout(content: string): string {
	return `<!DOCTYPE html>
<html lang="fr">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width,initial-scale=1">
  <meta http-equiv="X-UA-Compatible" content="IE=edge">
  <title>${escapeHtml(BRAND_NAME)}</title>
</head>
<body style="margin:0;padding:0;background:#F4F6F8;font-family:'Inter',-apple-system,'Helvetica Neue',Arial,sans-serif">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#F4F6F8;min-height:100vh">
    <tr>
      <td align="center" style="padding:40px 16px 56px">
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:600px">

          <!-- Logo header -->
          <tr>
            <td align="center" style="padding:0 0 28px">
              <span style="display:inline-block;font-size:22px;font-weight:800;letter-spacing:-0.04em;color:${BRAND_COLOR}">
                ${escapeHtml(BRAND_NAME)}
              </span>
            </td>
          </tr>

          <!-- Card -->
          <tr>
            <td style="background:#FFFFFF;border-radius:20px;border:1px solid #E2E8F0;box-shadow:0 4px 24px ${brandShadow(0.08)},0 1px 4px ${brandShadow(0.06)};overflow:hidden">
              <!-- Bandeau de marque -->
              <div style="height:4px;background:linear-gradient(90deg,${BRAND_COLOR} 0%,${lighten(BRAND_COLOR, 0.25)} 50%,${lighten(BRAND_COLOR, 0.6)} 100%)"></div>
              <!-- Body -->
              <div style="padding:40px 40px 36px">
                ${content}
              </div>
            </td>
          </tr>

          <!-- Footer -->
          <tr>
            <td align="center" style="padding:28px 0 0">
              <p style="margin:0 0 4px;font-size:11px;color:#94A3B8;letter-spacing:0.12em;text-transform:uppercase">${escapeHtml(BRAND_NAME)}</p>
              ${BRAND_TAGLINE ? `<p style="margin:0;font-size:11px;color:#CBD5E1">${escapeHtml(BRAND_TAGLINE)}</p>` : ""}
            </td>
          </tr>

        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;
}

// Bouton principal, à la couleur de la marque
function ctaButton(label: string, url: string): string {
	return `
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin:28px 0 8px">
  <tr>
    <td align="center">
      <a href="${url}" style="display:inline-block;background:${BRAND_COLOR};color:#FFFFFF;padding:13px 32px;border-radius:10px;text-decoration:none;font-size:14px;font-weight:600;letter-spacing:0.01em;box-shadow:0 4px 14px ${brandShadow(0.35)}">${label}</a>
    </td>
  </tr>
</table>`;
}

// Lien secondaire / discret
function secondaryLink(label: string, url: string): string {
	return `<a href="${url}" style="color:${BRAND_COLOR};text-decoration:underline;font-size:13px;font-weight:500">${label}</a>`;
}

// Encadré d'information (date, événement, etc.)
function infoBlock(lines: string[]): string {
	return `
<div style="background:#F1F5F9;border:1px solid #E2E8F0;border-radius:12px;padding:20px 22px;margin:24px 0">
  ${lines.join("\n  ")}
</div>`;
}

// ============================================================
// 1. Booking confirmation — prospect
// ============================================================

export interface BookingConfirmationArgs {
	prospectName: string;
	prospectFirstName: string;
	eventName: string;
	dateTime: string; // pre-formatted
	hostName: string | null;
	meetUrl?: string | null;
	cancelUrl: string;
	rescheduleUrl: string;
	// Liens d'ajout à l'agenda. Le .ics joint couvre tous les clients, mais
	// demande d'ouvrir une pièce jointe ; ces liens font l'ajout en un clic.
	googleCalUrl?: string;
	outlookCalUrl?: string;
}

// Ligne « Ajouter à mon agenda ». Depuis que Google ne notifie plus le
// prospect, c'est le seul chemin qui met le rendez-vous dans son agenda —
// il mérite donc d'être visible, pas enterré dans une pièce jointe.
function addToCalendarBlock(
	googleCalUrl?: string,
	outlookCalUrl?: string,
): string {
	if (!googleCalUrl && !outlookCalUrl) return "";
	const links = [
		googleCalUrl ? secondaryLink("Google Agenda", googleCalUrl) : "",
		outlookCalUrl ? secondaryLink("Outlook", outlookCalUrl) : "",
	].filter(Boolean);

	return `
<div style="background:#F1F5F9;border:1px solid #E2E8F0;border-radius:12px;padding:14px 18px;margin:20px 0 0;text-align:center">
  <p style="margin:0 0 6px;font-size:13px;font-weight:600;color:#1E293B">Ajoutez ce rendez-vous à votre agenda</p>
  <p style="margin:0;font-size:13px;color:#64748B;line-height:1.7">
    ${links.join("&nbsp;&nbsp;·&nbsp;&nbsp;")}
  </p>
  <p style="margin:6px 0 0;font-size:11px;color:#94A3B8">Autre agenda&nbsp;: ouvrez le fichier joint à cet email.</p>
</div>`;
}

export function bookingConfirmationTemplate(
	args: BookingConfirmationArgs,
): string {
	const {
		prospectFirstName,
		eventName,
		dateTime,
		hostName,
		meetUrl,
		cancelUrl,
		rescheduleUrl,
		googleCalUrl,
		outlookCalUrl,
	} = args;

	const meetSection = meetUrl
		? `<p style="margin:16px 0 0;font-size:14px;color:#64748B;line-height:1.6">
        <strong style="color:#1E293B">Lien de réunion&nbsp;:</strong><br>
        <a href="${meetUrl}" style="color:${BRAND_COLOR};word-break:break-all">${meetUrl}</a>
      </p>`
		: `<p style="margin:16px 0 0;font-size:13px;color:#94A3B8;line-height:1.6">Le lien de réunion vous sera transmis avant le rendez-vous.</p>`;

	const hostLine = hostName
		? `<p style="margin:4px 0 0;font-size:13px;color:#64748B">Avec <strong style="color:#1E293B">${escapeHtml(hostName)}</strong></p>`
		: "";

	const content = `
<h1 style="margin:0 0 8px;font-size:24px;font-weight:700;color:#0F172A;letter-spacing:-0.02em">Rendez-vous confirmé</h1>
<p style="margin:0 0 28px;font-size:14px;color:#64748B;line-height:1.6">Bonjour ${escapeHtml(prospectFirstName)}, votre rendez-vous est bien enregistré.</p>

${infoBlock([
	`<p style="margin:0;font-size:16px;font-weight:600;color:#1E293B">${escapeHtml(eventName)}</p>`,
	hostLine,
	`<p style="margin:8px 0 0;font-size:14px;color:#475569">${escapeHtml(dateTime)}</p>`,
	meetSection,
])}

${ctaButton("Voir mes informations de rendez-vous", meetUrl ?? rescheduleUrl)}

${addToCalendarBlock(googleCalUrl, outlookCalUrl)}

<p style="margin:20px 0 0;font-size:13px;color:#94A3B8;line-height:1.7;text-align:center">
  Besoin de changer ? &nbsp;${secondaryLink("Reprogrammer", rescheduleUrl)}&nbsp;&nbsp;·&nbsp;&nbsp;${secondaryLink("Annuler", cancelUrl)}
</p>`;

	return baseLayout(content);
}

// ============================================================
// 2. Host notification — internal team member
// ============================================================

export interface HostNotificationArgs {
	hostName: string | null;
	prospectName: string;
	eventName: string;
	dateTime: string;
	meetUrl?: string | null;
	prospectEmail?: string | null;
	prospectPhone: string;
	customAnswers?: Record<string, string>;
	dashboardUrl: string;
}

export function hostNotificationTemplate(args: HostNotificationArgs): string {
	const {
		hostName,
		prospectName,
		eventName,
		dateTime,
		meetUrl,
		prospectEmail,
		prospectPhone,
		customAnswers,
		dashboardUrl,
	} = args;

	const greeting = hostName ? `Bonjour ${escapeHtml(hostName)},` : "Bonjour,";

	const meetSection = meetUrl
		? `<p style="margin:12px 0 0;font-size:13px;color:#64748B">
        <strong style="color:#1E293B">Meet&nbsp;:</strong>
        <a href="${meetUrl}" style="color:${BRAND_COLOR};margin-left:6px">${meetUrl}</a>
      </p>`
		: "";

	const answersSection =
		customAnswers && Object.keys(customAnswers).length > 0
			? `
<div style="margin:24px 0 0">
  <p style="margin:0 0 10px;font-size:13px;font-weight:600;color:#475569;text-transform:uppercase;letter-spacing:0.06em">Réponses du formulaire</p>
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border-collapse:collapse">
    ${Object.entries(customAnswers)
			.map(
				([q, a]) => `
    <tr>
      <td style="padding:8px 12px;font-size:13px;color:#64748B;vertical-align:top;width:40%;border-bottom:1px solid #E2E8F0">${escapeHtml(q)}</td>
      <td style="padding:8px 12px;font-size:13px;color:#1E293B;vertical-align:top;border-bottom:1px solid #E2E8F0">${escapeHtml(a)}</td>
    </tr>`,
			)
			.join("")}
  </table>
</div>`
			: "";

	const content = `
<h1 style="margin:0 0 8px;font-size:24px;font-weight:700;color:#0F172A;letter-spacing:-0.02em">Nouveau rendez-vous</h1>
<p style="margin:0 0 28px;font-size:14px;color:#64748B;line-height:1.6">${escapeHtml(greeting)} un prospect vient de réserver.</p>

${infoBlock([
	`<p style="margin:0;font-size:16px;font-weight:600;color:#1E293B">${escapeHtml(prospectName)}</p>`,
	prospectEmail
		? `<p style="margin:4px 0 0;font-size:13px;color:#64748B">${escapeHtml(prospectEmail)}</p>`
		: "",
	`<p style="margin:2px 0 0;font-size:13px;color:#64748B">${escapeHtml(prospectPhone)}</p>`,
	`<p style="margin:10px 0 0;font-size:14px;color:#475569"><strong style="color:#1E293B">${escapeHtml(eventName)}</strong> — ${escapeHtml(dateTime)}</p>`,
	meetSection,
])}

${answersSection}

${ctaButton(`Ouvrir dans ${BRAND_NAME}`, dashboardUrl)}`;

	return baseLayout(content);
}

// ============================================================
// 3. Reminder H-2 — prospect
// ============================================================

export interface ReminderArgs {
	prospectFirstName: string;
	eventName: string;
	dateTime: string;
	hostName: string | null;
	meetUrl?: string | null;
	cancelUrl: string;
}

export function reminderTemplate(args: ReminderArgs): string {
	const {
		prospectFirstName,
		eventName,
		dateTime,
		hostName,
		meetUrl,
		cancelUrl,
	} = args;

	const meetSection = meetUrl
		? ctaButton("Rejoindre la réunion", meetUrl)
		: `<p style="margin:20px 0;font-size:13px;color:#94A3B8;text-align:center">Le lien de réunion vous sera transmis avant le rendez-vous.</p>`;

	const hostLine = hostName
		? `<p style="margin:4px 0 0;font-size:13px;color:#64748B">Avec <strong style="color:#1E293B">${escapeHtml(hostName)}</strong></p>`
		: "";

	const content = `
<h1 style="margin:0 0 8px;font-size:24px;font-weight:700;color:#0F172A;letter-spacing:-0.02em">Rappel — dans 2 heures</h1>
<p style="margin:0 0 28px;font-size:14px;color:#64748B;line-height:1.6">Bonjour ${escapeHtml(prospectFirstName)}, votre rendez-vous approche.</p>

${infoBlock([
	`<p style="margin:0;font-size:16px;font-weight:600;color:#1E293B">${escapeHtml(eventName)}</p>`,
	hostLine,
	`<p style="margin:8px 0 0;font-size:14px;color:#475569">${escapeHtml(dateTime)}</p>`,
])}

${meetSection}

<p style="margin:16px 0 0;font-size:13px;color:#94A3B8;line-height:1.7;text-align:center">
  Vous ne pouvez plus venir ? &nbsp;${secondaryLink("Annuler le rendez-vous", cancelUrl)}
</p>`;

	return baseLayout(content);
}

// ============================================================
// 4. Cancellation — prospect
// ============================================================

export interface CancellationArgs {
	prospectFirstName: string;
	eventName: string;
	dateTime: string;
	reason?: string | null;
	rescheduleUrl?: string | null;
}

export function cancellationTemplate(args: CancellationArgs): string {
	const { prospectFirstName, eventName, dateTime, reason, rescheduleUrl } =
		args;

	const reasonLine = reason
		? `<p style="margin:10px 0 0;font-size:13px;color:#64748B;font-style:italic">Motif&nbsp;: ${escapeHtml(reason)}</p>`
		: "";

	const rescheduleSection = rescheduleUrl
		? ctaButton("Prendre un nouveau rendez-vous", rescheduleUrl)
		: "";

	const content = `
<h1 style="margin:0 0 8px;font-size:24px;font-weight:700;color:#0F172A;letter-spacing:-0.02em">Rendez-vous annulé</h1>
<p style="margin:0 0 28px;font-size:14px;color:#64748B;line-height:1.6">Bonjour ${escapeHtml(prospectFirstName)}, votre rendez-vous a bien été annulé.</p>

${infoBlock([
	`<p style="margin:0;font-size:15px;font-weight:600;color:#1E293B">${escapeHtml(eventName)}</p>`,
	`<p style="margin:6px 0 0;font-size:14px;color:#475569">${escapeHtml(dateTime)}</p>`,
	reasonLine,
])}

${rescheduleSection}

<p style="margin:24px 0 0;font-size:13px;color:#94A3B8;line-height:1.7;text-align:center">Si vous avez des questions, n'hésitez pas à nous contacter.</p>`;

	return baseLayout(content);
}

// ============================================================
// 5. Reschedule — prospect
// ============================================================

export interface RescheduleArgs {
	prospectFirstName: string;
	eventName: string;
	oldDateTime: string;
	newDateTime: string;
	hostName: string | null;
	meetUrl?: string | null;
	cancelUrl: string;
}

export function rescheduleTemplate(args: RescheduleArgs): string {
	const {
		prospectFirstName,
		eventName,
		oldDateTime,
		newDateTime,
		hostName,
		meetUrl,
		cancelUrl,
	} = args;

	const hostLine = hostName
		? `<p style="margin:4px 0 0;font-size:13px;color:#64748B">Avec <strong style="color:#1E293B">${escapeHtml(hostName)}</strong></p>`
		: "";

	const meetSection = meetUrl
		? `<p style="margin:12px 0 0;font-size:13px;color:#64748B">
        <strong style="color:#1E293B">Meet&nbsp;:</strong>
        <a href="${meetUrl}" style="color:${BRAND_COLOR};margin-left:6px">${meetUrl}</a>
      </p>`
		: "";

	const content = `
<h1 style="margin:0 0 8px;font-size:24px;font-weight:700;color:#0F172A;letter-spacing:-0.02em">Rendez-vous replanifié</h1>
<p style="margin:0 0 28px;font-size:14px;color:#64748B;line-height:1.6">Bonjour ${escapeHtml(prospectFirstName)}, votre rendez-vous a été déplacé.</p>

<div style="background:#FFF7ED;border:1px solid #FED7AA;border-radius:12px;padding:14px 18px;margin:0 0 16px">
  <p style="margin:0;font-size:12px;font-weight:600;color:#9A3412;text-transform:uppercase;letter-spacing:0.06em">Ancien créneau</p>
  <p style="margin:4px 0 0;font-size:14px;color:#7C2D12;text-decoration:line-through">${escapeHtml(oldDateTime)}</p>
</div>

${infoBlock([
	`<p style="margin:0;font-size:12px;font-weight:600;color:#1D4ED8;text-transform:uppercase;letter-spacing:0.06em">Nouveau créneau</p>`,
	`<p style="margin:4px 0 0;font-size:16px;font-weight:600;color:#1E293B">${escapeHtml(newDateTime)}</p>`,
	`<p style="margin:6px 0 0;font-size:14px;color:#475569">${escapeHtml(eventName)}</p>`,
	hostLine,
	meetSection,
])}

${ctaButton("Voir mon rendez-vous", meetUrl ?? cancelUrl)}

<p style="margin:20px 0 0;font-size:13px;color:#94A3B8;line-height:1.7;text-align:center">
  ${secondaryLink("Annuler le rendez-vous", cancelUrl)}
</p>`;

	return baseLayout(content);
}

// ============================================================
// 6. Invitation — nouveau membre de l'équipe
// ============================================================

export interface InvitationArgs {
	inviterName: string | null;
	roleLabel: string;
	roleDescription: string;
	signupUrl: string;
	expiresLabel: string;
}

export function invitationTemplate(args: InvitationArgs): string {
	const { inviterName, roleLabel, roleDescription, signupUrl, expiresLabel } =
		args;

	const invitedBy = inviterName
		? `${escapeHtml(inviterName)} vous invite à rejoindre`
		: "Vous êtes invité·e à rejoindre";

	const content = `
<h1 style="margin:0 0 8px;font-size:24px;font-weight:700;color:#0F172A;letter-spacing:-0.02em">Invitation à rejoindre ${escapeHtml(BRAND_NAME)}</h1>
<p style="margin:0 0 28px;font-size:14px;color:#64748B;line-height:1.6">${invitedBy} l'espace de travail ${escapeHtml(BRAND_NAME)}.</p>

${infoBlock([
	`<p style="margin:0;font-size:12px;font-weight:600;color:#475569;text-transform:uppercase;letter-spacing:0.06em">Votre rôle</p>`,
	`<p style="margin:6px 0 0;font-size:16px;font-weight:600;color:#1E293B">${escapeHtml(roleLabel)}</p>`,
	`<p style="margin:6px 0 0;font-size:13px;color:#64748B;line-height:1.6">${escapeHtml(roleDescription)}</p>`,
])}

${ctaButton("Créer mon compte", signupUrl)}

<p style="margin:20px 0 0;font-size:13px;color:#94A3B8;line-height:1.7;text-align:center">
  Créez votre compte avec <strong style="color:#475569">cette adresse email</strong> — l'invitation n'est valable que pour elle.<br>
  Elle expire le ${escapeHtml(expiresLabel)}.
</p>`;

	return baseLayout(content);
}

// ============================================================
// 7. Lead abandonné — alerte interne à l'équipe
// ============================================================

export interface AbandonedLeadArgs {
	prospectName: string;
	prospectPhone: string | null;
	prospectEmail: string | null;
	eventName: string;
	capturedAtLabel: string;
	crmUrl: string;
}

export function abandonedLeadTemplate(args: AbandonedLeadArgs): string {
	const {
		prospectName,
		prospectPhone,
		prospectEmail,
		eventName,
		capturedAtLabel,
		crmUrl,
	} = args;

	const contactLines = [
		prospectPhone
			? `<p style="margin:4px 0 0;font-size:14px;color:#475569">${escapeHtml(prospectPhone)}</p>`
			: "",
		prospectEmail
			? `<p style="margin:2px 0 0;font-size:13px;color:#64748B">${escapeHtml(prospectEmail)}</p>`
			: "",
	].filter(Boolean);

	const content = `
<h1 style="margin:0 0 8px;font-size:24px;font-weight:700;color:#0F172A;letter-spacing:-0.02em">Formulaire abandonné</h1>
<p style="margin:0 0 28px;font-size:14px;color:#64748B;line-height:1.6">Ce prospect a laissé ses coordonnées sans réserver de créneau. Il est encore chaud — un appel maintenant a toutes ses chances.</p>

${infoBlock([
	`<p style="margin:0;font-size:16px;font-weight:600;color:#1E293B">${escapeHtml(prospectName)}</p>`,
	...contactLines,
	`<p style="margin:10px 0 0;font-size:13px;color:#64748B"><strong style="color:#1E293B">${escapeHtml(eventName)}</strong> — ${escapeHtml(capturedAtLabel)}</p>`,
])}

${ctaButton("Ouvrir le CRM", crmUrl)}`;

	return baseLayout(content);
}

// ============================================================
// 8. Étape de séquence — nurturing
// ============================================================
//
// Contrairement aux autres, cet email est COMMERCIAL et non transactionnel :
// le lien de désabonnement y est obligatoire, pas décoratif.

export interface SequenceStepArgs {
	bodyText: string;
	unsubscribeUrl: string;
}

export function sequenceStepTemplate(args: SequenceStepArgs): string {
	const { bodyText, unsubscribeUrl } = args;

	// Le corps est saisi en texte simple dans l'éditeur : on échappe le HTML
	// (une apostrophe ou un chevron ne doit pas casser le rendu) puis on
	// reconstitue les paragraphes.
	const paragraphs = escapeHtml(bodyText)
		.split(/\n{2,}/)
		.map(
			(p) =>
				`<p style="margin:0 0 16px;font-size:15px;color:#334155;line-height:1.7">${p.replace(/\n/g, "<br>")}</p>`,
		)
		.join("\n");

	const content = `
${paragraphs}

<div style="margin:32px 0 0;padding:16px 0 0;border-top:1px solid #E2E8F0;text-align:center">
  <p style="margin:0;font-size:12px;color:#94A3B8;line-height:1.6">
    Vous recevez cet email suite à votre demande de rendez-vous.<br>
    <a href="${unsubscribeUrl}" style="color:#94A3B8;text-decoration:underline">Ne plus recevoir ces emails</a>
  </p>
</div>`;

	return baseLayout(content);
}
