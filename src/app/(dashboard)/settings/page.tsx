"use client";

import { useQuery } from "convex/react";
import { motion, type Variants } from "framer-motion";
import {
	Bell,
	CalendarDays,
	ChevronRight,
	Clock,
	Plug,
	Tags,
	User,
	Users,
} from "lucide-react";
import Link from "next/link";
import { api } from "@/../convex/_generated/api";
import { PageHeader } from "@/components/dashboard/page-header";
import { canAdminister } from "@/lib/roles";
import { cn } from "@/lib/utils";

// ─── Nav cards data ─────────────────────────────────────────────────────────

const SETTINGS_CARDS = [
	{
		href: "/settings/profile",
		icon: User,
		title: "Profil",
		description: "Nom, fuseau horaire, avatar",
		adminOnly: false,
	},
	{
		href: "/settings/availability",
		icon: Clock,
		title: "Disponibilités",
		description: "Plages horaires hebdomadaires pour les bookings",
		adminOnly: false,
	},
	{
		href: "/settings/calendar",
		icon: CalendarDays,
		title: "Calendrier Google",
		description: "Connecte et synchronise tes calendriers",
		adminOnly: false,
	},
	{
		href: "/settings/notifications",
		icon: Bell,
		title: "Notifications",
		description: "Emails de confirmation, rappels, alertes",
		adminOnly: false,
	},
	{
		href: "/settings/team",
		icon: Users,
		title: "Équipe",
		description: "Membres, rôles et permissions",
		adminOnly: true,
	},
	{
		href: "/settings/catalogues",
		icon: Tags,
		title: "Catalogues",
		description: "Raisons de perte, sources de leads",
		adminOnly: true,
	},
	{
		href: "/settings/integrations",
		icon: Plug,
		title: "Intégrations",
		description: "Stripe — liens de paiement depuis le CRM",
		adminOnly: true,
	},
] as const;

// ─── Animation variants ──────────────────────────────────────────────────────

const containerVariants: Variants = {
	hidden: {},
	visible: {
		transition: { staggerChildren: 0.02 },
	},
};

const cardVariants: Variants = {
	hidden: { opacity: 0, y: 10 },
	visible: {
		opacity: 1,
		y: 0,
		transition: { duration: 0.15, ease: [0.16, 1, 0.3, 1] },
	},
};

// ─── Component ───────────────────────────────────────────────────────────────

export default function SettingsPage() {
	const profile = useQuery(api.users.getMyProfile);

	const isAdmin = canAdminister(profile);

	const visibleCards = SETTINGS_CARDS.filter((c) => !c.adminOnly || isAdmin);

	return (
		<div className="animate-fade-in">
			<PageHeader
				title="Paramètres"
				description="Configure ton profil, tes disponibilités et les préférences de ton équipe."
			/>

			<motion.div
				variants={containerVariants}
				initial="hidden"
				animate="visible"
				className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4"
			>
				{visibleCards.map((card) => {
					const Icon = card.icon;
					return (
						<motion.div key={card.href} variants={cardVariants}>
							<Link href={card.href} className="group block outline-none">
								<div
									className={cn(
										"card-premium flex items-start gap-4 p-5",
										"transition-all duration-200",
										"hover:border-[var(--brand)]/30 hover:shadow-[var(--shadow-float)]",
										"focus-visible:ring-2 focus-visible:ring-[var(--brand)]",
									)}
								>
									{/* Icon */}
									<div
										className={cn(
											"shrink-0 flex items-center justify-center",
											"w-10 h-10 rounded-[var(--radius-sm)]",
											"bg-[var(--brand-soft)] ring-1 ring-[var(--brand-glow)]",
											"transition-colors duration-200",
											"group-hover:bg-[var(--brand)] group-hover:ring-[var(--brand)]",
										)}
									>
										<Icon
											className={cn(
												"w-5 h-5 transition-colors duration-200",
												"text-[var(--brand)] group-hover:text-white",
											)}
											strokeWidth={1.75}
										/>
									</div>

									{/* Text */}
									<div className="flex-1 min-w-0">
										<p className="text-sm font-semibold text-[var(--ink)] font-[family-name:var(--font-display)] leading-tight">
											{card.title}
										</p>
										<p className="mt-0.5 text-xs text-[var(--ink-muted)] leading-relaxed">
											{card.description}
										</p>
									</div>

									{/* Chevron */}
									<ChevronRight
										className={cn(
											"w-4 h-4 shrink-0 mt-0.5",
											"text-[var(--ink-ghost)] transition-all duration-200",
											"group-hover:text-[var(--brand)] group-hover:translate-x-0.5",
										)}
									/>
								</div>
							</Link>
						</motion.div>
					);
				})}
			</motion.div>
		</div>
	);
}
