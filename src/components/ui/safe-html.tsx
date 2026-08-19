"use client";

import { useEffect, useState } from "react";

/**
 * Rend du HTML admin-saisi après assainissement DOMPurify.
 *
 * L'assainissement se fait UNIQUEMENT dans le navigateur : `dompurify` est
 * importé dynamiquement dans un effet. On évite ainsi `isomorphic-dompurify`,
 * qui tire jsdom côté serveur et casse le rendu SSR sur Vercel
 * (ERR_REQUIRE_ESM → 500 sur /book/[slug]).
 *
 * Tant que l'assainissement n'a pas eu lieu, rien n'est injecté : aucun HTML
 * non assaini n'est jamais rendu.
 */
export function SafeHtml({
	html,
	className,
}: {
	html: string;
	className?: string;
}) {
	const [clean, setClean] = useState<string | null>(null);

	useEffect(() => {
		let cancelled = false;
		import("dompurify")
			.then((mod) => {
				const DOMPurify = mod.default ?? mod;
				if (!cancelled) setClean(DOMPurify.sanitize(html));
			})
			.catch(() => {
				// En cas d'échec de chargement, on n'affiche rien plutôt que du HTML brut.
				if (!cancelled) setClean("");
			});
		return () => {
			cancelled = true;
		};
	}, [html]);

	if (clean === null) return <div className={className} />;
	// biome-ignore lint/security/noDangerouslySetInnerHtml: assaini via DOMPurify ci-dessus
	return (
		<div className={className} dangerouslySetInnerHTML={{ __html: clean }} />
	);
}
