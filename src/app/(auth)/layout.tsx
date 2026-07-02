/**
 * src/app/(auth)/layout.tsx
 *
 * Layout partagé pour les pages d'authentification (login, signup).
 *
 * Design :
 *   - Fond cream avec mesh blobs subtils animés
 *   - Ligne accent brand en haut
 *   - Centrage vertical + horizontal
 *   - Grain texture optionnel via .grain
 */

import type { ReactNode } from "react";

interface AuthLayoutProps {
	children: ReactNode;
}

export default function AuthLayout({ children }: AuthLayoutProps) {
	return (
		<div className="relative min-h-screen flex items-center justify-center bg-[var(--cream)] overflow-hidden grain">
			{/* Ligne accent top — signature Endosia */}
			<div className="top-accent-line" />

			{/* Mesh blobs de fond */}
			<div
				className="mesh-blob mesh-blob-a animate-blob-a"
				aria-hidden="true"
			/>
			<div
				className="mesh-blob mesh-blob-b animate-blob-b"
				aria-hidden="true"
			/>
			<div
				className="mesh-blob mesh-blob-c animate-blob-c"
				aria-hidden="true"
			/>

			{/* Contenu — z-index au-dessus des blobs */}
			<div className="relative z-10 w-full px-4 py-8">{children}</div>
		</div>
	);
}
