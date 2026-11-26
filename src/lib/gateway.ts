// gateway.ts — annuaire des instances clientes, pour la passerelle.
//
// Chaque client Mycall a sa propre base, donc sa propre adresse et sa propre
// clé : aucune clé ne peut lire les données d'un autre client, et c'est
// voulu. La passerelle évite à un outil externe d'avoir à gérer cette liste :
// il s'adresse à une seule porte, qui sait vers quelle instance aiguiller.
//
// L'annuaire vit dans une variable d'environnement, pas en base de données :
// il contient les clés de tous les clients, et une variable chiffrée chez
// l'hébergeur est le moindre risque. Il n'est lisible que par le serveur.

export interface GatewayClient {
	slug: string;
	name: string;
	/** Adresse de l'API de l'instance, jusqu'à /api/v1 inclus. */
	url: string;
	/** Clé d'API créée dans cette instance. Ne sort jamais de la passerelle. */
	key: string;
}

export interface ParsedRegistry {
	clients: GatewayClient[];
	error: string | null;
}

export function gatewayEnabled(): boolean {
	return process.env.GATEWAY_ENABLED === "true";
}

// Les instances sont déclarées sous forme de tableau JSON :
// [{"slug":"client-a","name":"Client A","url":"https://xxx.convex.site/api/v1","key":"mc_..."}]
export function readRegistry(): ParsedRegistry {
	const raw = process.env.MYCALL_CLIENTS?.trim();
	if (!raw)
		return { clients: [], error: "MYCALL_CLIENTS n'est pas renseignée." };
	try {
		const parsed = JSON.parse(raw);
		if (!Array.isArray(parsed)) {
			return { clients: [], error: "MYCALL_CLIENTS doit être un tableau." };
		}
		const clients: GatewayClient[] = [];
		for (const entry of parsed) {
			if (!entry?.slug || !entry?.url || !entry?.key) {
				return {
					clients: [],
					error: "Chaque instance doit porter slug, url et key.",
				};
			}
			clients.push({
				slug: String(entry.slug),
				name: String(entry.name ?? entry.slug),
				url: String(entry.url).replace(/\/+$/, ""),
				key: String(entry.key),
			});
		}
		return { clients, error: null };
	} catch {
		return { clients: [], error: "MYCALL_CLIENTS n'est pas du JSON valide." };
	}
}

export function findClient(slug: string): GatewayClient | null {
	return readRegistry().clients.find((c) => c.slug === slug) ?? null;
}

// Comparaison à durée constante : comparer deux clés avec === laisse fuir,
// par le temps de réponse, le nombre de caractères devinés.
function constantTimeEqual(a: string, b: string): boolean {
	if (a.length !== b.length) return false;
	let diff = 0;
	for (let i = 0; i < a.length; i++) {
		diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
	}
	return diff === 0;
}

// Clé présentée par l'outil externe. Plusieurs clés sont acceptées, séparées
// par des virgules : de quoi en donner une par partenaire, et en révoquer une
// sans couper les autres.
export function authorized(request: Request): boolean {
	const expected = (process.env.GATEWAY_API_KEY ?? "")
		.split(",")
		.map((k) => k.trim())
		.filter(Boolean);
	if (expected.length === 0) return false;

	const header = request.headers.get("authorization") ?? "";
	const presented = (
		/^Bearer\s+(.+)$/i.exec(header)?.[1] ??
		request.headers.get("x-api-key") ??
		""
	).trim();
	if (!presented) return false;
	return expected.some((k) => constantTimeEqual(k, presented));
}
