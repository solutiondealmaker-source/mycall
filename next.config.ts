import type { NextConfig } from "next";

const nextConfig: NextConfig = {
	output: "standalone",
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
