"use client";

import { useAuthActions } from "@convex-dev/auth/react";
import { useQuery } from "convex/react";
import { AnimatePresence, motion } from "framer-motion";
import {
	BarChart3,
	Calendar,
	CalendarDays,
	ChevronDown,
	LayoutDashboard,
	LogOut,
	PanelLeftClose,
	PanelLeftOpen,
	Settings,
	Users,
} from "lucide-react";
import Image from "next/image";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { api } from "@/../convex/_generated/api";
import { AvatarCircle } from "@/components/dashboard/avatar-circle";
import {
	DropdownMenu,
	DropdownMenuContent,
	DropdownMenuItem,
	DropdownMenuSeparator,
	DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Separator } from "@/components/ui/separator";
import { cn } from "@/lib/utils";

// ─── Nav items ────────────────────────────────────────────────────────────────

const NAV_ITEMS = [
	{ label: "Dashboard", href: "/dashboard", icon: LayoutDashboard },
	{ label: "Événements", href: "/events", icon: Calendar },
	{ label: "CRM", href: "/crm", icon: Users },
	{ label: "Calendrier", href: "/settings/calendar", icon: CalendarDays },
	{ label: "Analytics", href: "/analytics", icon: BarChart3 },
] as const;

const NAV_BOTTOM = [
	{ label: "Paramètres", href: "/settings", icon: Settings },
] as const;

// ─── Constants ─────────────────────────────────────────────────────────────────

const STORAGE_KEY = "iclone:sidebar:collapsed:v1";
const SIDEBAR_EXPANDED = 260;
const SIDEBAR_COLLAPSED = 64;

// ─── NavItem ───────────────────────────────────────────────────────────────────

interface NavItemProps {
	href: string;
	icon: React.ElementType;
	label: string;
	isActive: boolean;
	collapsed: boolean;
}

function NavItem({
	href,
	icon: Icon,
	label,
	isActive,
	collapsed,
}: NavItemProps) {
	return (
		<Link
			href={href}
			className={cn(
				"relative flex items-center gap-2.5 rounded-[var(--radius-sm)]",
				"h-9 px-3",
				"text-sm font-medium transition-colors duration-150",
				"group focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--brand)]",
				isActive
					? [
							"border-l-[3px] border-[var(--brand)] pl-[9px]",
							"bg-[var(--brand-soft)] text-[var(--brand)] font-semibold",
						]
					: [
							"text-[var(--ink-muted)]",
							"hover:bg-[var(--brand-soft)]/50 hover:text-[var(--ink)]",
						],
				collapsed && "justify-center px-0",
			)}
		>
			<Icon
				className={cn(
					"w-4 h-4 shrink-0",
					isActive ? "text-[var(--brand)]" : "text-current",
				)}
				strokeWidth={isActive ? 2 : 1.75}
			/>
			<AnimatePresence initial={false}>
				{!collapsed && (
					<motion.span
						key="label"
						initial={{ opacity: 0, width: 0 }}
						animate={{ opacity: 1, width: "auto" }}
						exit={{ opacity: 0, width: 0 }}
						transition={{ duration: 0.2, ease: [0.16, 1, 0.3, 1] }}
						className="overflow-hidden whitespace-nowrap"
					>
						{label}
					</motion.span>
				)}
			</AnimatePresence>
		</Link>
	);
}

// ─── Main Sidebar ─────────────────────────────────────────────────────────────

export function Sidebar() {
	const pathname = usePathname();
	const router = useRouter();
	const { signOut } = useAuthActions();
	const profile = useQuery(api.users.getMyProfile);

	const displayName = profile?.name ?? profile?.email ?? "Utilisateur";
	const displayEmail = profile?.email ?? "";

	const [collapsed, setCollapsed] = useState<boolean>(() => {
		if (typeof window === "undefined") return false;
		return localStorage.getItem(STORAGE_KEY) === "true";
	});

	async function handleSignOut() {
		await signOut();
		router.push("/login");
		router.refresh();
	}

	// Persist collapse state
	useEffect(() => {
		localStorage.setItem(STORAGE_KEY, String(collapsed));
	}, [collapsed]);

	const isActive = (href: string) =>
		href === "/dashboard"
			? pathname === "/dashboard"
			: pathname.startsWith(href);

	return (
		<motion.aside
			animate={{ width: collapsed ? SIDEBAR_COLLAPSED : SIDEBAR_EXPANDED }}
			transition={{ type: "spring", stiffness: 500, damping: 35 }}
			className={cn(
				"relative flex flex-col h-screen",
				"bg-[var(--surface)] border-r border-[var(--border)]",
				"sticky top-0 shrink-0 overflow-hidden",
				"z-20",
			)}
		>
			{/* ── Logo zone ── */}
			<div
				className={cn(
					"flex items-center h-28 border-b border-[var(--border)] shrink-0",
					collapsed ? "justify-center px-0" : "px-5",
				)}
			>
				<Link
					href="/dashboard"
					className="flex items-center focus-visible:outline-none"
				>
					{collapsed ? (
						<Image
							src="/logo-icon.png"
							alt="Mycall"
							width={300}
							height={300}
							priority
							className="h-24 w-24"
						/>
					) : (
						<Image
							src="/logo.png"
							alt="Mycall"
							width={800}
							height={300}
							priority
							className="h-28 w-auto"
						/>
					)}
				</Link>
			</div>

			{/* ── Nav principal ── */}
			<nav className="flex flex-col gap-0.5 flex-1 overflow-y-auto overflow-x-hidden px-3 py-4">
				{NAV_ITEMS.map((item) => (
					<NavItem
						key={item.href}
						href={item.href}
						icon={item.icon}
						label={item.label}
						isActive={isActive(item.href)}
						collapsed={collapsed}
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
						collapsed={collapsed}
					/>
				))}
			</nav>

			{/* ── Footer : user card + collapse toggle ── */}
			<div className="shrink-0 border-t border-[var(--border)] p-3 flex flex-col gap-2">
				{/* User card */}
				<DropdownMenu>
					<DropdownMenuTrigger asChild>
						<button
							type="button"
							className={cn(
								"flex items-center gap-2.5 w-full rounded-[var(--radius-sm)]",
								"p-2 text-left transition-colors duration-150",
								"hover:bg-[var(--surface-raised)] focus-visible:outline-none",
								"focus-visible:ring-2 focus-visible:ring-[var(--brand)]",
								collapsed && "justify-center",
							)}
						>
							<AvatarCircle name={displayName} size="sm" />
							<AnimatePresence initial={false}>
								{!collapsed && (
									<motion.div
										key="user-info"
										initial={{ opacity: 0, width: 0 }}
										animate={{ opacity: 1, width: "auto" }}
										exit={{ opacity: 0, width: 0 }}
										transition={{ duration: 0.2, ease: [0.16, 1, 0.3, 1] }}
										className="flex-1 min-w-0 overflow-hidden"
									>
										<p className="text-xs font-semibold text-[var(--ink)] truncate leading-tight">
											{displayName}
										</p>
										<p className="text-[11px] text-[var(--ink-muted)] truncate leading-tight mt-0.5">
											{displayEmail}
										</p>
									</motion.div>
								)}
							</AnimatePresence>
							<AnimatePresence initial={false}>
								{!collapsed && (
									<motion.div
										key="chevron"
										initial={{ opacity: 0 }}
										animate={{ opacity: 1 }}
										exit={{ opacity: 0 }}
										transition={{ duration: 0.15 }}
									>
										<ChevronDown className="w-3.5 h-3.5 text-[var(--ink-ghost)] shrink-0" />
									</motion.div>
								)}
							</AnimatePresence>
						</button>
					</DropdownMenuTrigger>
					<DropdownMenuContent side="top" align="start" className="w-52">
						<div className="px-2 py-1.5">
							<p className="text-xs font-semibold text-[var(--ink)] truncate">
								{displayName}
							</p>
							<p className="text-[11px] text-[var(--ink-muted)] truncate">
								{displayEmail}
							</p>
						</div>
						<DropdownMenuSeparator />
						<DropdownMenuItem asChild>
							<button
								type="button"
								className="w-full flex items-center gap-2 cursor-pointer text-[var(--destructive)] focus:text-[var(--destructive)]"
								onClick={handleSignOut}
							>
								<LogOut className="w-3.5 h-3.5" />
								Se déconnecter
							</button>
						</DropdownMenuItem>
					</DropdownMenuContent>
				</DropdownMenu>

				{/* Collapse toggle */}
				<button
					type="button"
					onClick={() => setCollapsed((c) => !c)}
					className={cn(
						"flex items-center justify-center",
						"w-8 h-8 rounded-[var(--radius-sm)]",
						"text-[var(--ink-muted)] transition-colors duration-150",
						"hover:bg-[var(--surface-raised)] hover:text-[var(--ink)]",
						"focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--brand)]",
						collapsed ? "mx-auto" : "ml-auto",
					)}
					aria-label={collapsed ? "Étendre la sidebar" : "Réduire la sidebar"}
				>
					<motion.div
						animate={{ rotate: collapsed ? 180 : 0 }}
						transition={{ duration: 0.25, ease: [0.16, 1, 0.3, 1] }}
					>
						{collapsed ? (
							<PanelLeftOpen className="w-4 h-4" />
						) : (
							<PanelLeftClose className="w-4 h-4" />
						)}
					</motion.div>
				</button>
			</div>
		</motion.aside>
	);
}
