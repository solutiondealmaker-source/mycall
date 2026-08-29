import { ConvexAuthNextjsServerProvider } from "@convex-dev/auth/nextjs/server";
import type { Metadata } from "next";
import { Manrope, Outfit } from "next/font/google";
import { TooltipProvider } from "@/components/ui/tooltip";
import { BRAND_NAME } from "@/lib/brand";
import "./globals.css";
import { Providers } from "./providers";

const outfit = Outfit({
	variable: "--font-display",
	subsets: ["latin"],
	weight: ["400", "500", "600", "700", "800"],
});

const manrope = Manrope({
	variable: "--font-body",
	subsets: ["latin"],
	weight: ["400", "500", "600", "700"],
});

export const metadata: Metadata = {
	title: `${BRAND_NAME} — Booking & CRM`,
	description: "Plateforme de booking et CRM pour closers.",
};

export default function RootLayout({
	children,
}: Readonly<{
	children: React.ReactNode;
}>) {
	return (
		<ConvexAuthNextjsServerProvider>
			<html
				lang="fr"
				className={`${outfit.variable} ${manrope.variable} h-full antialiased`}
			>
				<body className="min-h-full bg-[var(--background)] text-[var(--ink)]">
					<Providers>
						<TooltipProvider delayDuration={300}>{children}</TooltipProvider>
					</Providers>
				</body>
			</html>
		</ConvexAuthNextjsServerProvider>
	);
}
