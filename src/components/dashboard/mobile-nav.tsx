"use client";

import { useAuthActions } from "@convex-dev/auth/react";
import { useQuery } from "convex/react";
import { LogOut, Menu } from "lucide-react";
import Image from "next/image";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { api } from "@/../convex/_generated/api";
import { BrandMark } from "@/components/brand-mark";
import { AvatarCircle } from "@/components/dashboard/avatar-circle";
import { NAV_BOTTOM, NAV_ITEMS, NavItem } from "@/components/dashboard/sidebar";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import {
	Sheet,
	SheetContent,
	SheetTitle,
	SheetTrigger,
} from "@/components/ui/sheet";
import { BRAND_LOGO_FULL, BRAND_NAME } from "@/lib/brand";
import { canReadAll, isIntegrationsOnly } from "@/lib/roles";

// Navigation du téléphone : la barre latérale fixe mange l'écran sous 768 px.
// Elle est donc masquée, et remplacée par une barre haute et un tiroir.
export function MobileNav() {
	const pathname = usePathname();
	const router = useRouter();
	const { signOut } = useAuthActions();
	const profile = useQuery(api.users.getMyProfile);
	const [open, setOpen] = useState(false);

	// Un changement de page ferme le tiroir : sans ça, il reste ouvert
	// par-dessus la page qu'on vient de demander.
	// biome-ignore lint/correctness/useExhaustiveDependencies: fermer au changement de route
	useEffect(() => {
		setOpen(false);
	}, [pathname]);

	const seesAll = canReadAll(profile);
	const integrationsOnly = isIntegrationsOnly(profile);
	const items = integrationsOnly
		? NAV_ITEMS.map((item) => ({ ...item, locked: item.href !== "/settings" }))
		: NAV_ITEMS.filter((item) => !item.readAll || seesAll);

	const isActive = (href: string) =>
		href === "/dashboard"
			? pathname === "/dashboard"
			: pathname.startsWith(href);

	async function handleSignOut() {
		await signOut();
		router.push("/login");
		router.refresh();
	}

	return (
		<header className="md:hidden sticky top-0 z-30 flex items-center gap-3 h-14 px-4 border-b border-[var(--border)] bg-[var(--surface)]/95 backdrop-blur-sm shrink-0">
			<Sheet open={open} onOpenChange={setOpen}>
				<SheetTrigger asChild>
					<button
						type="button"
						aria-label="Ouvrir le menu"
						className="flex items-center justify-center w-11 h-11 -ml-2 rounded-[var(--radius-sm)] text-[var(--ink)] hover:bg-[var(--surface-raised)] transition-colors"
					>
						<Menu className="w-5 h-5" strokeWidth={1.75} />
					</button>
				</SheetTrigger>

				<SheetContent side="left" className="w-[280px] p-0 flex flex-col">
					<SheetTitle className="sr-only">Navigation</SheetTitle>

					<div className="flex items-center h-20 px-5 border-b border-[var(--border)] shrink-0">
						{BRAND_LOGO_FULL ? (
							<Image
								src={BRAND_LOGO_FULL}
								alt={BRAND_NAME}
								width={800}
								height={300}
								className="h-16 w-auto"
							/>
						) : (
							<span className="flex items-center gap-2.5 min-w-0">
								<BrandMark className="h-8 w-8 shrink-0" />
								<span
									className="text-base font-semibold tracking-tight text-[var(--ink)] truncate"
									style={{ fontFamily: "var(--font-display)" }}
								>
									{BRAND_NAME}
								</span>
							</span>
						)}
					</div>

					<nav
						className="flex flex-col gap-0.5 flex-1 overflow-y-auto px-3 py-4"
						onClick={() => setOpen(false)}
						onKeyDown={(e) => {
							if (e.key === "Enter" || e.key === " ") setOpen(false);
						}}
					>
						{items.map((item) => (
							<NavItem
								key={item.href}
								href={item.href}
								icon={item.icon}
								label={item.label}
								isActive={isActive(item.href)}
								collapsed={false}
								locked={"locked" in item ? Boolean(item.locked) : false}
							/>
						))}

						<Separator className="my-3 bg-[var(--border)]" />

						{NAV_BOTTOM.map((item) => (
							<NavItem
								key={item.href}
								href={item.href}
								icon={item.icon}
								label={item.label}
								isActive={isActive(item.href)}
								collapsed={false}
							/>
						))}
					</nav>

					<div className="shrink-0 border-t border-[var(--border)] p-3 space-y-2">
						<div className="flex items-center gap-2.5 px-1 min-w-0">
							<AvatarCircle
								name={profile?.name ?? profile?.email ?? "?"}
								size="md"
							/>
							<div className="min-w-0">
								<p className="text-sm font-medium text-[var(--ink)] truncate">
									{profile?.name ?? profile?.email ?? "Utilisateur"}
								</p>
								<p className="text-xs text-[var(--ink-muted)] truncate">
									{profile?.email ?? ""}
								</p>
							</div>
						</div>
						<Button
							variant="ghost"
							onClick={handleSignOut}
							className="w-full justify-start gap-2 h-11 text-[var(--ink-muted)]"
						>
							<LogOut className="w-4 h-4" />
							Se déconnecter
						</Button>
					</div>
				</SheetContent>
			</Sheet>

			<Link href="/dashboard" className="flex items-center min-w-0">
				{BRAND_LOGO_FULL ? (
					<Image
						src={BRAND_LOGO_FULL}
						alt={BRAND_NAME}
						width={800}
						height={300}
						className="h-9 w-auto"
					/>
				) : (
					<span
						className="text-base font-semibold tracking-tight text-[var(--ink)] truncate"
						style={{ fontFamily: "var(--font-display)" }}
					>
						{BRAND_NAME}
					</span>
				)}
			</Link>
		</header>
	);
}
