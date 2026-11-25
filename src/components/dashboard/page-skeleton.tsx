// Squelette affiché pendant que le code d'une page se charge.
//
// Les pages du tableau de bord sont des composants client : à la première
// visite, le navigateur doit télécharger leur JavaScript avant de peindre quoi
// que ce soit. Sans ce squelette, l'écran reste figé sur la page précédente et
// l'application paraît bloquée, alors qu'elle travaille.

export function PageSkeleton({ rows = 4 }: { rows?: number }) {
	return (
		<output
			className="block animate-fade-in"
			aria-label="Chargement de la page"
		>
			<div className="mb-8 space-y-2">
				<div className="h-7 w-48 rounded-[var(--radius-sm)] animate-shimmer" />
				<div className="h-4 w-72 rounded-[var(--radius-sm)] animate-shimmer" />
			</div>

			<div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
				{Array.from({ length: 4 }).map((_, i) => (
					<div
						key={`kpi-${i}`}
						className="h-24 rounded-[var(--radius-md)] animate-shimmer"
					/>
				))}
			</div>

			<div className="space-y-3">
				{Array.from({ length: rows }).map((_, i) => (
					<div
						key={`row-${i}`}
						className="h-16 rounded-[var(--radius-md)] animate-shimmer"
					/>
				))}
			</div>
		</output>
	);
}
