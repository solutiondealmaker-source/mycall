"use client";

import { motion } from "framer-motion";
import {
	Ban,
	CheckCircle,
	Clock,
	Mail,
	MessageSquare,
	Settings,
	Users,
} from "lucide-react";
import { cn } from "@/lib/utils";
import type { EventSectionKey } from "@/types/events";

interface SectionDef {
	key: EventSectionKey;
	label: string;
	icon: React.ElementType;
}

const SECTIONS: SectionDef[] = [
	{ key: "details", label: "Détails", icon: Settings },
	{ key: "hosts", label: "Hôtes", icon: Users },
	{ key: "schedule", label: "Horaires et limites", icon: Clock },
	{ key: "questions", label: "Questions des invités", icon: MessageSquare },
	{ key: "disqualification", label: "Disqualification", icon: Ban },
	{ key: "invitation", label: "Invitation Google Calendar", icon: Mail },
	{ key: "confirmation", label: "Page de confirmation", icon: CheckCircle },
];

interface EventSidebarNavProps {
	activeSection: EventSectionKey;
	onSectionChange: (section: EventSectionKey) => void;
}

export function EventSidebarNav({
	activeSection,
	onSectionChange,
}: EventSidebarNavProps) {
	return (
		<aside
			className={cn(
				"w-[240px] shrink-0",
				"border-r border-[var(--border)]",
				"py-4 px-3",
				"flex flex-col gap-0.5",
				"overflow-y-auto",
			)}
		>
			<p className="px-3 mb-2 text-[10px] font-semibold uppercase tracking-widest text-[var(--ink-ghost)] font-[family-name:var(--font-body)]">
				Configuration
			</p>

			{SECTIONS.map((section) => {
				const Icon = section.icon;
				const isActive = activeSection === section.key;

				return (
					<motion.button
						key={section.key}
						onClick={() => onSectionChange(section.key)}
						whileTap={{ scale: 0.98 }}
						transition={{ duration: 0.1 }}
						className={cn(
							"relative flex items-center gap-2.5",
							"h-9 px-3 rounded-[var(--radius-sm)]",
							"text-sm font-medium transition-colors duration-150 cursor-pointer w-full text-left",
							"group focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--brand)]",
							isActive
								? [
										"border-l-[3px] border-[var(--brand)] pl-[9px]",
										"bg-[var(--brand-soft)] text-[var(--brand)] font-semibold",
									]
								: [
										"border-l-[3px] border-transparent",
										"text-[var(--ink-muted)]",
										"hover:bg-[var(--surface-raised)] hover:text-[var(--ink)]",
									],
						)}
						aria-current={isActive ? "page" : undefined}
					>
						<Icon
							className={cn(
								"w-4 h-4 shrink-0 transition-colors duration-150",
								isActive
									? "text-[var(--brand)]"
									: "text-[var(--ink-ghost)] group-hover:text-[var(--ink-muted)]",
							)}
							strokeWidth={isActive ? 2 : 1.5}
						/>
						<span className="flex-1 truncate font-[family-name:var(--font-body)]">
							{section.label}
						</span>
					</motion.button>
				);
			})}
		</aside>
	);
}
