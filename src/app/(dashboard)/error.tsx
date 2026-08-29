"use client";

// Filet de sécurité du tableau de bord.
//
// Les fonctions Convex lèvent une erreur quand l'appelant n'a pas les droits
// ("Réservé à l'administration"). Sans cette limite d'erreur, cette exception
// remonte jusqu'au rendu et casse la page entière : l'utilisateur voit un écran
// mort, sans indication de ce qui s'est passé.
//
// La barre latérale masque déjà les entrées interdites, mais une URL tapée à la
// main, un lien partagé ou un signet contournent ce filtre. C'est ce cas que
// cette page couvre.

import { AlertTriangle, ChevronLeft, Lock, RotateCw } from "lucide-react";
import Link from "next/link";
import { useEffect } from "react";
import { Button } from "@/components/ui/button";

// Message levé par requireAdmin / requireReadAll côté Convex.
const FORBIDDEN = "Réservé à l'administration";

export default function DashboardError({
	error,
	reset,
}: {
	error: Error & { digest?: string };
	reset: () => void;
}) {
	// Une erreur de droits est attendue et se lit dans l'écran ci-dessous ; toute
	// autre mérite d'atterrir dans la console pour être diagnostiquée.
	useEffect(() => {
		if (!error.message.includes(FORBIDDEN)) {
			console.error("[dashboard] erreur non gérée :", error);
		}
	}, [error]);

	const isForbidden = error.message.includes(FORBIDDEN);

	return (
		<div className="animate-fade-in max-w-xl">
			<div className="card-premium p-8 flex flex-col items-center text-center gap-4">
				<div className="w-12 h-12 rounded-full bg-[var(--surface-muted)] flex items-center justify-center">
					{isForbidden ? (
						<Lock className="w-5 h-5 text-[var(--ink-ghost)]" />
					) : (
						<AlertTriangle className="w-5 h-5 text-[var(--destructive)]" />
					)}
				</div>

				<div>
					<p className="text-sm font-medium text-[var(--ink)]">
						{isForbidden
							? "Cette page ne t'est pas accessible"
							: "Cette page n'a pas pu s'afficher"}
					</p>
					<p className="mt-1.5 text-sm text-[var(--ink-muted)] leading-relaxed">
						{isForbidden
							? "Ton rôle ne donne pas accès à cette section. Demande à un administrateur de ton équipe s'il s'agit d'une erreur."
							: "Une erreur est survenue pendant le chargement. Réessaie — si le problème persiste, préviens un administrateur."}
					</p>
				</div>

				<div className="flex items-center gap-2 pt-1">
					<Button variant="outline" size="sm" asChild className="gap-1.5">
						<Link href="/dashboard">
							<ChevronLeft className="w-4 h-4" />
							Retour au dashboard
						</Link>
					</Button>
					{!isForbidden && (
						<Button size="sm" onClick={reset} className="gap-1.5">
							<RotateCw className="w-4 h-4" />
							Réessayer
						</Button>
					)}
				</div>
			</div>
		</div>
	);
}
