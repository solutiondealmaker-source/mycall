"use client";

/**
 * src/app/providers.tsx
 *
 * Providers React client wrappant toute l'application :
 *   - ConvexAuthNextjsProvider : auth context + ConvexProvider intégré
 */

import { ConvexAuthNextjsProvider } from "@convex-dev/auth/nextjs";
import { ConvexReactClient } from "convex/react";
import type { ReactNode } from "react";
import { Toaster } from "@/components/ui/sonner";

const convex = new ConvexReactClient(process.env.NEXT_PUBLIC_CONVEX_URL ?? "");

interface ProvidersProps {
	children: ReactNode;
}

export function Providers({ children }: ProvidersProps) {
	return (
		<ConvexAuthNextjsProvider client={convex}>
			{children}
			<Toaster position="bottom-right" richColors />
		</ConvexAuthNextjsProvider>
	);
}
