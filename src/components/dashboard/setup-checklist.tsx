"use client";

import { useQuery } from "convex/react";
import { motion } from "framer-motion";
import {
	Calendar,
	CalendarPlus,
	Check,
	Clock,
	Mail,
	UserCheck,
	UserCircle,
	Users,
} from "lucide-react";
import Link from "next/link";
import { api } from "@/../convex/_generated/api";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

interface ChecklistItem {
	key:
		| "profileComplete"
		| "googleConnected"
		| "calendarConfigured"
		| "availabilityDefined"
		| "resendConfigured"
		| "eventCreated"
		| "hostAssigned";
	label: string;
	hint: string;
	icon: React.ElementType;
	href?: string;
	cta?: string;
}

const ITEMS: ChecklistItem[] = [
	{
		key: "profileComplete",
		label: "Compléter ton profil",
		hint: "Nom + fuseau horaire — affichés sur les pages de booking.",
		icon: UserCircle,
		href: "/settings/profile",
		cta: "Compléter",
	},
	{
		key: "googleConnected",
		label: "Connecter un compte Google",
		hint: "Pour synchroniser ton calendrier et générer des liens Google Meet.",
		icon: Calendar,
		href: "/settings/calendar",
		cta: "Connecter",
	},
	{
		key: "calendarConfigured",
		label: "Configurer ton calendrier writer",
		hint: "Choisir où sont créés les events Google et quels calendriers bloquent les créneaux.",
		icon: Calendar,
		href: "/settings/calendar",
		cta: "Configurer",
	},
	{
		key: "availabilityDefined",
		label: "Définir tes plages horaires",
		hint: "Tes disponibilités hebdomadaires servent de base au calcul des slots.",
		icon: Clock,
		href: "/settings/availability",
		cta: "Définir",
	},
	{
		key: "resendConfigured",
		label: "Configurer Resend (emails)",
		hint: "Définis RESEND_API_KEY côté Convex — sans ça, pas d'email de confirmation/rappel.",
		icon: Mail,
	},
	{
		key: "eventCreated",
		label: "Créer ton premier événement",
		hint: "Une page de booking publique à partager avec tes prospects.",
		icon: CalendarPlus,
		href: "/events/new",
		cta: "Créer",
	},
	{
		key: "hostAssigned",
		label: "Assigner un hôte à l'événement",
		hint: "Tu dois être hôte (ou y assigner quelqu'un) pour recevoir des bookings.",
		icon: Users,
		href: "/events",
		cta: "Ouvrir",
	},
];

export function SetupChecklist() {
	const status = useQuery(api.setupStatus.getSetupStatus, {});

	if (!status) return null;
	if (status.allComplete) return null;

	const completed = ITEMS.filter((i) => status[i.key]).length;
	const total = ITEMS.length;
	const pct = Math.round((completed / total) * 100);

	return (
		<motion.section
			initial={{ opacity: 0, y: 8 }}
			animate={{ opacity: 1, y: 0 }}
			transition={{ duration: 0.15, ease: [0.16, 1, 0.3, 1] }}
			className={cn(
				"mb-8 rounded-[var(--radius-lg)] border border-[var(--border)]",
				"bg-[var(--surface)] shadow-[var(--shadow-card)] overflow-hidden",
			)}
		>
			<div className="px-6 py-5 border-b border-[var(--border)] bg-[var(--surface-raised)]">
				<div className="flex items-center gap-3">
					<div className="w-8 h-8 rounded-full bg-[var(--brand-soft)] flex items-center justify-center">
						<UserCheck className="w-4 h-4 text-[var(--brand)]" />
					</div>
					<div className="flex-1 min-w-0">
						<h2
							className="text-sm font-semibold text-[var(--ink)]"
							style={{ fontFamily: "var(--font-display)" }}
						>
							Termine ta configuration
						</h2>
						<p className="text-xs text-[var(--ink-muted)] mt-0.5">
							{completed}/{total} étapes complétées — il reste{" "}
							{total - completed} étape{total - completed > 1 ? "s" : ""} pour
							commencer à recevoir des bookings.
						</p>
					</div>
					<div className="hidden sm:flex items-center gap-2 shrink-0">
						<div className="w-24 h-1.5 rounded-full bg-[var(--surface-muted)] overflow-hidden">
							<motion.div
								initial={{ width: 0 }}
								animate={{ width: `${pct}%` }}
								transition={{ duration: 0.15, ease: [0.16, 1, 0.3, 1] }}
								className="h-full bg-[var(--brand)]"
							/>
						</div>
						<span className="text-xs font-semibold text-[var(--brand)] tabular-nums">
							{pct}%
						</span>
					</div>
				</div>
			</div>

			<ul className="divide-y divide-[var(--border)]">
				{ITEMS.map((item) => {
					const done = status[item.key];
					const Icon = item.icon;
					return (
						<li
							key={item.key}
							className={cn(
								"flex items-center gap-4 px-6 py-3.5",
								"hover:bg-[var(--surface-raised)]/50 transition-colors",
							)}
						>
							<div
								className={cn(
									"w-6 h-6 rounded-full flex items-center justify-center shrink-0",
									done
										? "bg-[var(--success-soft)] text-[var(--success)]"
										: "border border-[var(--border)] bg-[var(--surface)]",
								)}
							>
								{done ? (
									<Check className="w-3.5 h-3.5" strokeWidth={3} />
								) : (
									<Icon className="w-3 h-3 text-[var(--ink-ghost)]" />
								)}
							</div>

							<div className="flex-1 min-w-0">
								<p
									className={cn(
										"text-sm font-medium",
										done
											? "text-[var(--ink-muted)] line-through"
											: "text-[var(--ink)]",
									)}
								>
									{item.label}
								</p>
								{!done && (
									<p className="text-xs text-[var(--ink-muted)] mt-0.5">
										{item.hint}
									</p>
								)}
							</div>

							{!done && item.href && item.cta && (
								<Button
									asChild
									variant="outline"
									size="sm"
									className="shrink-0 text-xs"
								>
									<Link href={item.href}>{item.cta}</Link>
								</Button>
							)}
							{!done && !item.href && (
								<span className="shrink-0 text-[10px] uppercase tracking-wider text-[var(--ink-ghost)] font-semibold">
									Manuel
								</span>
							)}
						</li>
					);
				})}
			</ul>
		</motion.section>
	);
}
