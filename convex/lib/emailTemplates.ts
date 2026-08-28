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

const BRAND_NAME = process.env.BRAND_NAME?.trim() || "Mycall";
const BRAND_TAGLINE =
	process.env.BRAND_TAGLINE?.trim() ??
	"La plateforme de booking pour les équipes commerciales";
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
