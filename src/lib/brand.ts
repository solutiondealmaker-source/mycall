// Identité de l'instance, côté front.
//
// Une instance = un business. Le nom, le slogan et les logos sont donc lus dans
// l'environnement Vercel plutôt qu'écrits dans le code — sinon toutes les
// instances issues de ce dépôt afficheraient la même marque.
//
// Le pendant serveur vit dans convex/lib/emailTemplates.ts (BRAND_NAME,
// BRAND_TAGLINE, BRAND_COLOR), lu dans l'environnement Convex. Les deux jeux de
// variables doivent porter la même valeur sur une instance donnée.
//
// Next.js remplace `process.env.NEXT_PUBLIC_*` à la compilation : changer une de
// ces variables impose donc un redéploiement, pas seulement un redémarrage.

export const BRAND_NAME =
	process.env.NEXT_PUBLIC_BRAND_NAME?.trim() || "Mycall";

// Les logos livrés dans public/ sont ceux de Mycall : ils ne servent de défaut
// qu'à l'instance Mycall. Une instance cliente sans logo affiche un monogramme
// (voir BrandMark), jamais la marque d'un autre.
const IS_MYCALL = BRAND_NAME === "Mycall";

// Chemin du logo carré (icône d'onglet, barre latérale repliée, écrans de
// connexion). Les logos clients vivent dans public/brands/<client>/.
export const BRAND_LOGO_ICON: string | null =
	process.env.NEXT_PUBLIC_BRAND_LOGO_ICON?.trim() ||
	(IS_MYCALL ? "/logo-icon.png" : null);

// Chemin du logo complet avec le nom (barre latérale dépliée).
export const BRAND_LOGO_FULL: string | null =
	process.env.NEXT_PUBLIC_BRAND_LOGO_FULL?.trim() ||
	(IS_MYCALL ? "/logo.png" : null);
