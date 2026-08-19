import type { NextConfig } from "next";

const nextConfig: NextConfig = {
	// `standalone` sert au self-host Docker. Sur Vercel il est contre-indiqué :
	// il casse le tracing des dépendances des routes SSR (ex: /book/[slug] → 500).
	// Vercel définit VERCEL=1 → on ne l'active que hors Vercel.
	...(process.env.VERCEL ? {} : { output: "standalone" as const }),
	// Épingle la racine du workspace (I5). Sans ça, Turbopack infère une mauvaise
	// racine dès qu'un lockfile parasite traîne au-dessus du projet
	// (ex: ~/package-lock.json), ce qui casse le file-tracing du build standalone.
	// process.cwd() = dossier du projet (les commandes `next` tournent toujours
	// depuis la racine via les scripts package.json et le WORKDIR Docker).
	turbopack: {
		root: process.cwd(),
	},
};

export default nextConfig;
