"use client";

import { useQuery } from "convex/react";
import { motion } from "framer-motion";
import type { LucideIcon } from "lucide-react";
import {
	Award,
	Bell,
	CalendarClock,
	CalendarPlus,
	CalendarX2,
	CheckCircle2,
	CircleArrowRight,
	Pencil,
	StickyNote,
	UserCog,
	UserX,
	XCircle,
} from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";
import { cn, formatRelativeDate } from "@/lib/utils";
import { api } from "../../../convex/_generated/api";
import type { Id } from "../../../convex/_generated/dataModel";

type ActivityType =
	| "created"
	| "cancelled"
	| "rescheduled"
	| "status_changed"
	| "outcome_recorded"
	| "host_changed"
	| "contact_updated"
	| "note_added"
	| "reminder_sent"
	| "no_show_marked"
	| "completed";

const EVENT_CONFIG: Record<
	ActivityType,
	{ icon: LucideIcon; color: string; label: string }
> = {
	created: {
		icon: CalendarPlus,
		color: "text-[var(--success)] bg-[var(--success-soft)]",
		label: "Réservation créée",
	},
	cancelled: {
		icon: CalendarX2,
		color: "text-[var(--destructive)] bg-[var(--destructive-soft)]",
		label: "Réservation annulée",
	},
	rescheduled: {
		icon: CalendarClock,
		color: "text-[var(--warning)] bg-[var(--warning-soft)]",
		label: "Réservation replanifiée",
	},
	status_changed: {
		icon: CircleArrowRight,
		color: "text-[var(--brand)] bg-[var(--brand-soft)]",
		label: "Statut modifié",
	},
	outcome_recorded: {
		icon: CheckCircle2,
		color: "text-[var(--success)] bg-[var(--success-soft)]",
		label: "Résultat enregistré",
	},
	host_changed: {
		icon: UserCog,
		color: "text-[var(--brand)] bg-[var(--brand-soft)]",
		label: "Closer modifié",
	},
	contact_updated: {
		icon: Pencil,
		color: "text-[var(--ink-muted)] bg-[var(--surface-muted)]",
		label: "Contact mis à jour",
	},
	note_added: {
		icon: StickyNote,
		color: "text-[var(--brand)] bg-[var(--brand-soft)]",
		label: "Note ajoutée",
	},
	reminder_sent: {
		icon: Bell,
		color: "text-[var(--brand)] bg-[var(--brand-soft)]",
		label: "Rappel envoyé",
	},
	no_show_marked: {
		icon: UserX,
		color: "text-[var(--destructive)] bg-[var(--destructive-soft)]",
		label: "No-show enregistré",
	},
	completed: {
		icon: Award,
		color: "text-[var(--success)] bg-[var(--success-soft)]",
		label: "Appel complété",
	},
};

function groupByDay(
	items: { createdAt: number; [key: string]: unknown }[],
): Map<string, typeof items> {
	const groups = new Map<string, typeof items>();
	for (const item of items) {
		const dateKey = new Intl.DateTimeFormat("fr-FR", {
			day: "numeric",
			month: "long",
			year: "numeric",
		}).format(new Date(item.createdAt));
		const group = groups.get(dateKey) ?? [];
		group.push(item);
		groups.set(dateKey, group);
	}
	return groups;
}

interface LeadActivityStreamProps {
	leadId: Id<"leads">;
}

const containerVariants = {
	hidden: {},
	show: {
		transition: {
			staggerChildren: 0.02,
		},
	},
};

const itemVariants = {
	hidden: { opacity: 0, y: 6 },
	show: {
		opacity: 1,
		y: 0,
		transition: {
			duration: 0.25,
			ease: [0.16, 1, 0.3, 1] as [number, number, number, number],
		},
	},
};

export function LeadActivityStream({ leadId }: LeadActivityStreamProps) {
	const activities = useQuery(api.leads.activityStream, { leadId });

	if (activities === undefined) {
		return (
			<div className="space-y-4 p-4">
				{Array.from({ length: 4 }).map((_, i) => (
					<div key={i} className="flex gap-3">
						<Skeleton className="w-7 h-7 rounded-full shrink-0" />
						<div className="space-y-1.5 flex-1">
							<Skeleton className="h-3.5 w-32 rounded" />
							<Skeleton className="h-3 w-20 rounded" />
						</div>
					</div>
				))}
			</div>
		);
	}

	if (activities.length === 0) {
		return (
			<div className="flex flex-col items-center justify-center py-12 gap-2">
				<CalendarPlus className="w-8 h-8 text-[var(--ink-ghost)]" />
				<p className="text-sm text-[var(--ink-muted)]">
					Aucune activité pour l'instant
				</p>
			</div>
		);
	}

	const grouped = groupByDay(activities);

	return (
		<div className="px-4 py-4">
			{Array.from(grouped.entries()).map(([dateLabel, items]) => (
				<div key={dateLabel} className="mb-6">
					{/* Day divider */}
					<div className="flex items-center gap-3 mb-4">
						<div className="flex-1 h-px bg-[var(--border)]" />
						<span className="text-[11px] font-semibold text-[var(--ink-ghost)] uppercase tracking-widest whitespace-nowrap">
							{dateLabel}
						</span>
						<div className="flex-1 h-px bg-[var(--border)]" />
					</div>

					{/* Timeline items */}
					<motion.div
						variants={containerVariants}
						initial="hidden"
						animate="show"
						className="relative pl-8"
					>
						{/* Vertical line */}
						<div className="absolute left-[15px] top-4 bottom-0 w-px bg-[var(--border)]" />

						{items.map((item) => {
							const type = item.type as ActivityType;
							const config = EVENT_CONFIG[type];
							if (!config) return null;
							const Icon = config.icon;

							return (
								<motion.div
									key={item.id as string}
									variants={itemVariants}
									className="relative flex gap-3 pb-5"
								>
									{/* Icon dot */}
									<div
										className={cn(
											"absolute left-[-26px] flex items-center justify-center",
											"w-7 h-7 rounded-full shrink-0",
											config.color,
										)}
									>
										<Icon className="w-3.5 h-3.5" />
									</div>

									{/* Content */}
									<div className="flex-1 min-w-0 pt-0.5">
										<p className="text-sm font-medium text-[var(--ink)]">
											{config.label}
											{(item.actorName as string | undefined) && (
												<span className="text-[var(--ink-muted)] font-normal">
													{" "}
													par{" "}
													<span className="font-medium text-[var(--ink)]">
														{item.actorName as string}
													</span>
												</span>
											)}
										</p>
										{(item.body as string | undefined) && (
											<p className="text-xs text-[var(--ink-muted)] mt-0.5 line-clamp-2">
												{item.body as string}
											</p>
										)}
										{(item.bookingSlug as string | undefined) && (
											<p className="text-xs text-[var(--ink-ghost)] mt-0.5">
												Événement :{" "}
												<span className="font-mono">
													{item.bookingSlug as string}
												</span>
											</p>
										)}
										<p className="text-[11px] text-[var(--ink-ghost)] mt-1">
											{formatRelativeDate(item.createdAt)}
										</p>
									</div>
								</motion.div>
							);
						})}
					</motion.div>
				</div>
			))}
		</div>
	);
}
