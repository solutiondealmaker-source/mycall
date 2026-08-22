/**
 * Capture des paramètres UTM sur la page de réservation publique.
 *
 * Les UTM arrivent dans l'URL (`?utm_source=linkedin&utm_campaign=...`) mais le
 * prospect navigue ensuite entre les étapes : on les mémorise donc en
 * sessionStorage dès le premier affichage, pour pouvoir les envoyer avec le
 * lead même si l'URL a changé entre-temps.
 *
 * Attribution "first touch" : la première source vue pour une session est
 * conservée (le serveur n'écrase pas des UTM déjà enregistrés sur un lead).
 */

export type UtmParams = {
	utmSource?: string;
	utmMedium?: string;
	utmCampaign?: string;
	utmTerm?: string;
	utmContent?: string;
};

const STORAGE_KEY = "mycall:utm";
const MAX_LEN = 200;

function clean(v: string | null): string | undefined {
	if (!v) return undefined;
	const t = v.trim().slice(0, MAX_LEN);
	return t || undefined;
}

/**
 * Lit les UTM de l'URL courante, les persiste pour la session, et retourne
 * ceux qui s'appliquent (URL courante, sinon ceux déjà mémorisés).
 * Retourne un objet vide côté serveur ou sans UTM.
 */
export function captureUtmParams(): UtmParams {
	if (typeof window === "undefined") return {};

	const sp = new URLSearchParams(window.location.search);
	const fromUrl: UtmParams = {
		utmSource: clean(sp.get("utm_source")),
		utmMedium: clean(sp.get("utm_medium")),
		utmCampaign: clean(sp.get("utm_campaign")),
		utmTerm: clean(sp.get("utm_term")),
		utmContent: clean(sp.get("utm_content")),
	};

	const hasAny = Object.values(fromUrl).some(Boolean);

	try {
		if (hasAny) {
			// Première source vue → on la fige pour la session.
			if (!sessionStorage.getItem(STORAGE_KEY)) {
				sessionStorage.setItem(STORAGE_KEY, JSON.stringify(fromUrl));
			}
			return fromUrl;
		}
		const stored = sessionStorage.getItem(STORAGE_KEY);
		return stored ? (JSON.parse(stored) as UtmParams) : {};
	} catch {
		// sessionStorage indisponible (mode privé strict) — on reste sur l'URL.
		return hasAny ? fromUrl : {};
	}
}
