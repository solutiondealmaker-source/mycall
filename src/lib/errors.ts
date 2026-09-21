import { ConvexError } from "convex/values";

// Texte lisible d'une erreur renvoyée par Convex.
//
// En production, Convex masque le message des erreurs ordinaires (« Server
// Error ») : seul le contenu d'une ConvexError arrive jusqu'au navigateur.
// En développement, le message complet est préfixé du nom de la fonction.
export function errorMessage(
	err: unknown,
	fallback = "Erreur inattendue",
): string {
	if (err instanceof ConvexError && typeof err.data === "string") {
		return err.data;
	}
	if (!(err instanceof Error)) return fallback;
	const uncaught = /Uncaught (?:Convex)?Error: ([^\n]+)/.exec(err.message);
	if (uncaught) return uncaught[1];
	if (/Server Error|\[CONVEX /.test(err.message)) return fallback;
	return err.message || fallback;
}
