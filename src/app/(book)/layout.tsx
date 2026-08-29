import type { ReactNode } from "react";
import { BRAND_NAME } from "@/lib/brand";

export default function BookLayout({ children }: { children: ReactNode }) {
	return (
		<div className="relative min-h-screen bg-[var(--cream)] overflow-x-hidden flex flex-col">
			<div className="top-accent-line" aria-hidden="true" />

			<div
				className="pointer-events-none fixed inset-0 overflow-hidden"
				aria-hidden="true"
			>
				<div className="mesh-blob mesh-blob-a animate-blob-a" />
				<div className="mesh-blob mesh-blob-b animate-blob-b" />
				<div className="mesh-blob mesh-blob-c animate-blob-c" />
			</div>

			<main className="relative z-10 flex-1 flex items-center justify-center w-full px-4 sm:px-6 md:px-8 py-6 md:py-10">
				<div className="w-full max-w-[920px]">{children}</div>
			</main>

			{/* Mention de marque, sans lien : la page est publique et vue par des
			    prospects — on ne les envoie pas hors du parcours de réservation. */}
			<footer className="relative z-10 shrink-0 pb-6 md:pb-8 text-center">
				<p className="text-xs text-[var(--ink-ghost)]">
					Propulsé par{" "}
					<span className="font-[family-name:var(--font-display)] font-semibold">
						{BRAND_NAME}
					</span>
				</p>
			</footer>
		</div>
	);
}
