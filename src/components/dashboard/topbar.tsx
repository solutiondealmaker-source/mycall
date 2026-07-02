"use client";

import { useQuery } from "convex/react";
import { Bell, Command, Search } from "lucide-react";
import { usePathname } from "next/navigation";
import { useState } from "react";
import { api } from "@/../convex/_generated/api";
import { AvatarCircle } from "@/components/dashboard/avatar-circle";
import {
	Breadcrumb,
	BreadcrumbItem,
	BreadcrumbLink,
	BreadcrumbList,
	BreadcrumbPage,
	BreadcrumbSeparator,
} from "@/components/ui/breadcrumb";
import {
	Dialog,
	DialogContent,
	DialogHeader,
	DialogTitle,
} from "@/components/ui/dialog";
import {
	DropdownMenu,
	DropdownMenuContent,
	DropdownMenuItem,
	DropdownMenuSeparator,
	DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { cn } from "@/lib/utils";

// ─── Breadcrumb helpers ────────────────────────────────────────────────────────

const SEGMENT_LABELS: Record<string, string> = {
	dashboard: "Dashboard",
	evenements: "Événements",
	crm: "CRM",
	calendrier: "Calendrier",
	analytics: "Analytics",
	parametres: "Paramètres",
	nouveau: "Nouveau",
	new: "Nouveau",
};

function getLabel(segment: string): string {
	return (
		SEGMENT_LABELS[segment] ??
		segment.charAt(0).toUpperCase() + segment.slice(1)
	);
}

function useBreadcrumbs() {
	const pathname = usePathname();
	// Split & filter empty segments + "(dashboard)" route groups
	const segments = pathname
		.split("/")
		.filter(Boolean)
		.filter((s) => !s.startsWith("("));

	return segments.map((segment, index) => ({
		label: getLabel(segment),
		href: `/${segments.slice(0, index + 1).join("/")}`,
		isLast: index === segments.length - 1,
	}));
}

// ─── Topbar ────────────────────────────────────────────────────────────────────

export function Topbar() {
	const [commandOpen, setCommandOpen] = useState(false);
	const crumbs = useBreadcrumbs();
	const profile = useQuery(api.users.getMyProfile);

	const user = {
		name: profile?.name ?? profile?.email ?? "User",
		email: profile?.email ?? "",
	};

	return (
		<>
			<header
				className={cn(
					"sticky top-0 z-30",
					"h-28 flex items-center justify-between",
					"px-6 gap-4",
					"bg-[var(--surface)]/80 backdrop-blur-xl",
					"border-b border-[var(--border)]",
				)}
			>
				{/* ── Left : breadcrumb ── */}
				<Breadcrumb>
					<BreadcrumbList className="text-sm">
						{crumbs.map((crumb, i) => (
							<span
								key={crumb.href}
								className="inline-flex items-center gap-1.5"
							>
								{i > 0 && (
									<BreadcrumbSeparator className="text-[var(--ink-ghost)]" />
								)}
								<BreadcrumbItem>
									{crumb.isLast ? (
										<BreadcrumbPage className="text-[var(--ink)] font-medium">
											{crumb.label}
										</BreadcrumbPage>
									) : (
										<BreadcrumbLink
											href={crumb.href}
											className={cn(
												"text-[var(--ink-muted)] transition-colors duration-150",
												"hover:text-[var(--ink)]",
											)}
										>
											{crumb.label}
										</BreadcrumbLink>
									)}
								</BreadcrumbItem>
							</span>
						))}
					</BreadcrumbList>
				</Breadcrumb>

				{/* ── Right : search + bell + user ── */}
				<div className="flex items-center gap-2">
					{/* Search trigger */}
					<button
						type="button"
						onClick={() => setCommandOpen(true)}
						className={cn(
							"flex items-center gap-2 h-8 px-3",
							"rounded-[var(--radius-sm)]",
							"bg-[var(--surface-raised)] border border-[var(--border)]",
							"text-[var(--ink-muted)] text-xs",
							"transition-all duration-150",
							"hover:border-[var(--brand)]/30 hover:text-[var(--ink)]",
							"focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--brand)]",
							"min-w-[160px]",
						)}
					>
						<Search className="w-3.5 h-3.5 shrink-0" />
						<span className="flex-1 text-left">Rechercher...</span>
						<kbd
							className={cn(
								"inline-flex items-center gap-0.5",
								"px-1.5 py-0.5 text-[10px] font-medium",
								"bg-[var(--surface-muted)] border border-[var(--border)]",
								"rounded text-[var(--ink-ghost)] font-mono",
							)}
						>
							<Command className="w-2.5 h-2.5" />K
						</kbd>
					</button>

					{/* Bell — placeholder V1 */}
					<button
						type="button"
						className={cn(
							"flex items-center justify-center w-8 h-8",
							"rounded-[var(--radius-sm)]",
							"text-[var(--ink-muted)] transition-colors duration-150",
							"hover:bg-[var(--surface-raised)] hover:text-[var(--ink)]",
							"focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--brand)]",
						)}
						aria-label="Notifications"
					>
						<Bell className="w-4 h-4" />
					</button>

					{/* User dropdown */}
					<DropdownMenu>
						<DropdownMenuTrigger
							className={cn(
								"rounded-full focus-visible:outline-none",
								"focus-visible:ring-2 focus-visible:ring-[var(--brand)]",
								"focus-visible:ring-offset-2",
							)}
						>
							<AvatarCircle name={user.name} size="sm" />
						</DropdownMenuTrigger>
						<DropdownMenuContent align="end" className="w-52">
							<div className="px-2 py-1.5">
								<p className="text-xs font-semibold text-[var(--ink)] truncate">
									{user.name}
								</p>
								<p className="text-[11px] text-[var(--ink-muted)] truncate">
									{user.email}
								</p>
							</div>
							<DropdownMenuSeparator />
							<DropdownMenuItem className="cursor-pointer">
								Profil
							</DropdownMenuItem>
							<DropdownMenuItem className="cursor-pointer">
								Paramètres
							</DropdownMenuItem>
							<DropdownMenuSeparator />
							<DropdownMenuItem
								className="text-[var(--destructive)] focus:text-[var(--destructive)] cursor-pointer"
								onClick={() => {
									// TODO: Better Auth signOut
								}}
							>
								Se déconnecter
							</DropdownMenuItem>
						</DropdownMenuContent>
					</DropdownMenu>
				</div>
			</header>

			{/* ── Command palette dialog — UI V1, search non fonctionnel ── */}
			<Dialog open={commandOpen} onOpenChange={setCommandOpen}>
				<DialogContent className="max-w-lg p-0 overflow-hidden">
					<DialogHeader className="sr-only">
						<DialogTitle>Recherche globale</DialogTitle>
					</DialogHeader>
					<div className="flex items-center border-b border-[var(--border)] px-4">
						<Search className="w-4 h-4 text-[var(--ink-muted)] shrink-0" />
						<input
							type="text"
							placeholder="Rechercher un événement, lead, contact..."
							className={cn(
								"flex-1 h-12 px-3 text-sm bg-transparent outline-none",
								"text-[var(--ink)] placeholder:text-[var(--ink-ghost)]",
							)}
							autoFocus
						/>
					</div>
					<div className="p-4 text-center">
						<p className="text-xs text-[var(--ink-ghost)]">
							La recherche globale sera disponible en V1.5
						</p>
					</div>
				</DialogContent>
			</Dialog>
		</>
	);
}
