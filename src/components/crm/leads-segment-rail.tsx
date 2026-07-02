"use client";

import { useQuery } from "convex/react";
import { AnimatePresence, motion } from "framer-motion";
import {
	Award,
	ChevronLeft,
	ChevronRight,
	Clock,
	Flame,
	PhoneIncoming,
	Star,
	Users,
	XCircle,
} from "lucide-react";
import { useEffect, useState } from "react";
import { cn } from "@/lib/utils";
import { api } from "../../../convex/_generated/api";

const STORAGE_KEY = "iclone:crm:rail:collapsed:v1";

export type LeadSegment =
	| "all"
	| "potentiel"
	| "qualifie"
	| "rdv_reserve"
	| "tenu"
	| "gagne"
	| "perdu"
	| "follow_up"
	| "new_24h"
	| "nurturing"
	| "hot"
	| "stalled";

interface LeadsSegmentRailProps {
	active: LeadSegment;
	onChange: (segment: LeadSegment) => void;
}

const STAGE_ITEMS: {
	id: LeadSegment;
	label: string;
	icon: React.ElementType;
	color?: string;
}[] = [
	{ id: "potentiel", label: "Potentiel", icon: Star },
	{ id: "qualifie", label: "Qualifié", icon: ChevronRight },
	{ id: "rdv_reserve", label: "RDV réservé", icon: PhoneIncoming },
	{ id: "tenu", label: "Tenu", icon: Clock },
	{ id: "gagne", label: "Gagné", icon: Award, color: "text-[var(--success)]" },
	{
		id: "perdu",
		label: "Perdu",
		icon: XCircle,
		color: "text-[var(--destructive)]",
	},
	{
		id: "follow_up",
		label: "Follow-up",
		icon: Clock,
		color: "text-[var(--warning)]",
	},
];

const SMART_VIEWS: {
	id: LeadSegment;
	label: string;
	icon: React.ElementType;
}[] = [
	{ id: "new_24h", label: "Nouveaux < 24h", icon: Star },
	{ id: "nurturing", label: "Nurturing < 30j", icon: Clock },
	{ id: "hot", label: "Hot Opportunities", icon: Flame },
	{ id: "stalled", label: "Stalled Leads", icon: XCircle },
];

export function LeadsSegmentRail({ active, onChange }: LeadsSegmentRailProps) {
	const [collapsed, setCollapsed] = useState(false);
	const counts = useQuery(api.leads.countByStatus, {});

	useEffect(() => {
		try {
			const stored = localStorage.getItem(STORAGE_KEY);
			if (stored !== null) setCollapsed(stored === "true");
		} catch {}
	}, []);

	function toggleCollapse() {
		const next = !collapsed;
		setCollapsed(next);
		try {
			localStorage.setItem(STORAGE_KEY, String(next));
		} catch {}
	}

	function countFor(id: LeadSegment): number | undefined {
		if (!counts) return undefined;
		const map: Partial<Record<LeadSegment, string>> = {
			all: "total",
			potentiel: "potentiel",
			qualifie: "qualifie",
			rdv_reserve: "rdv_reserve",
			tenu: "tenu",
			gagne: "gagne",
			perdu: "perdu",
			follow_up: "follow_up",
		};
		const key = map[id];
		return key ? (counts[key] as number | undefined) : undefined;
	}

	return (
		<motion.aside
			animate={{ width: collapsed ? 56 : 260 }}
			transition={{ duration: 0.25, ease: [0.16, 1, 0.3, 1] }}
			className="relative flex flex-col shrink-0 border-r border-[var(--border)] bg-[var(--surface)] overflow-hidden"
		>
			<div className="flex flex-col gap-0.5 p-3 flex-1 overflow-y-auto overflow-x-hidden pt-4">
				{/* All */}
				<RailItem
					id="all"
					label="Tous les contacts"
					icon={Users}
					active={active === "all"}
					collapsed={collapsed}
					count={countFor("all")}
					onClick={() => onChange("all")}
				/>

				{/* Divider + label */}
				<SectionLabel collapsed={collapsed} label="Étapes contact" />

				{STAGE_ITEMS.map((item) => (
					<RailItem
						key={item.id}
						id={item.id}
						label={item.label}
						icon={item.icon}
						active={active === item.id}
						collapsed={collapsed}
						count={countFor(item.id)}
						onClick={() => onChange(item.id)}
						iconColor={item.color}
					/>
				))}

				<SectionLabel collapsed={collapsed} label="Vues intelligentes" />

				{SMART_VIEWS.map((item) => (
					<RailItem
						key={item.id}
						id={item.id}
						label={item.label}
						icon={item.icon}
						active={active === item.id}
						collapsed={collapsed}
						count={undefined}
						onClick={() => onChange(item.id)}
					/>
				))}
			</div>

			{/* Toggle collapse button */}
			<button
				type="button"
				onClick={toggleCollapse}
				className={cn(
					"flex items-center justify-center shrink-0",
					"h-10 w-full border-t border-[var(--border)]",
					"text-[var(--ink-muted)] hover:text-[var(--brand)] hover:bg-[var(--brand-soft)]",
					"transition-colors duration-150",
				)}
				aria-label={collapsed ? "Expand sidebar" : "Collapse sidebar"}
			>
				{collapsed ? (
					<ChevronRight className="w-4 h-4" />
				) : (
					<ChevronLeft className="w-4 h-4" />
				)}
			</button>
		</motion.aside>
	);
}

// ─── Sub-components ────────────────────────────────────────────────────────────

function RailItem({
	id,
	label,
	icon: Icon,
	active,
	collapsed,
	count,
	onClick,
	iconColor,
}: {
	id: LeadSegment;
	label: string;
	icon: React.ElementType;
	active: boolean;
	collapsed: boolean;
	count: number | undefined;
	onClick: () => void;
	iconColor?: string;
}) {
	return (
		<button
			type="button"
			onClick={onClick}
			title={collapsed ? label : undefined}
			className={cn(
				"flex items-center gap-2.5 h-8 rounded-[var(--radius-sm)] px-2.5",
				"text-sm font-medium transition-all duration-150 w-full text-left",
				"relative overflow-hidden",
				active
					? "bg-[var(--brand-soft)] text-[var(--brand)] border-l-[3px] border-[var(--brand)] pl-[7px]"
					: "text-[var(--ink-muted)] hover:bg-[var(--surface-raised)] hover:text-[var(--ink)] border-l-[3px] border-transparent",
			)}
		>
			<Icon
				className={cn(
					"w-4 h-4 shrink-0",
					active ? "text-[var(--brand)]" : (iconColor ?? ""),
				)}
			/>
			<AnimatePresence>
				{!collapsed && (
					<motion.span
						initial={{ opacity: 0, width: 0 }}
						animate={{ opacity: 1, width: "auto" }}
						exit={{ opacity: 0, width: 0 }}
						transition={{ duration: 0.2, ease: [0.16, 1, 0.3, 1] }}
						className="flex-1 truncate"
					>
						{label}
					</motion.span>
				)}
			</AnimatePresence>
			{!collapsed && count !== undefined && (
				<span className="text-xs bg-[var(--surface-muted)] text-[var(--ink-muted)] rounded-full px-1.5 py-0.5 ml-auto shrink-0 leading-none">
					{count}
				</span>
			)}
		</button>
	);
}

function SectionLabel({
	collapsed,
	label,
}: {
	collapsed: boolean;
	label: string;
}) {
	return (
		<div className="px-2.5 pt-4 pb-1 overflow-hidden">
			<AnimatePresence>
				{!collapsed ? (
					<motion.p
						initial={{ opacity: 0 }}
						animate={{ opacity: 1 }}
						exit={{ opacity: 0 }}
						transition={{ duration: 0.15 }}
						className="text-[11px] font-semibold text-[var(--ink-ghost)] uppercase tracking-widest"
					>
						{label}
					</motion.p>
				) : (
					<div className="w-4 h-px bg-[var(--border)] mx-auto" />
				)}
			</AnimatePresence>
		</div>
	);
}
