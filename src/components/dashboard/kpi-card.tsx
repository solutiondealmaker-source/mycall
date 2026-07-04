"use client";

import { motion } from "framer-motion";
import type { LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";

interface KpiCardProps {
	label: string;
	value: string | number;
	icon: LucideIcon;
	/** Delta optionnel : "+12%" ou "-3%" */
	delta?: string;
	deltaPositive?: boolean;
	className?: string;
}

export function KpiCard({
	label,
	value,
	icon: Icon,
	delta,
	deltaPositive,
	className,
}: KpiCardProps) {
	return (
		<div className={cn("card-premium flex flex-col gap-4", className)}>
			{/* Icon + delta row */}
			<div className="flex items-start justify-between">
				{/* Icon carré */}
				<div
					className={cn(
						"flex items-center justify-center",
						"w-10 h-10 rounded-[var(--radius-sm)]",
						"bg-[var(--brand-soft)]",
						"ring-1 ring-[var(--brand-glow)]",
					)}
				>
					<Icon className="w-5 h-5 text-[var(--brand)]" strokeWidth={1.75} />
				</div>

				{/* Delta badge */}
				{delta && (
					<span
						className={cn(
							"text-xs font-medium px-2 py-0.5 rounded-full",
							deltaPositive
								? "bg-[var(--success-soft)] text-[var(--success)]"
								: "bg-[var(--destructive-soft)] text-[var(--destructive)]",
						)}
					>
						{delta}
					</span>
				)}
			</div>

			{/* Value */}
			<div>
				<div
					className={cn(
						"font-[family-name:var(--font-display)]",
						"text-[32px] font-semibold leading-none tracking-[-0.02em]",
						"text-[var(--ink)]",
					)}
				>
					{value}
				</div>
				<p className="mt-1.5 text-xs font-medium uppercase tracking-wide text-[var(--ink-muted)]">
					{label}
				</p>
			</div>
		</div>
	);
}

/**
 * Wrapper animé pour stagger des KPI cards en grille.
 */
export const kpiCardVariants = {
	hidden: { opacity: 0, y: 12 },
	visible: { opacity: 1, y: 0 },
};

export const kpiGridVariants = {
	hidden: {},
	visible: {
		transition: {
			staggerChildren: 0.02,
		},
	},
};

interface AnimatedKpiGridProps {
	children: React.ReactNode;
	className?: string;
}

export function AnimatedKpiGrid({ children, className }: AnimatedKpiGridProps) {
	return (
		<motion.div
			variants={kpiGridVariants}
			initial="hidden"
			animate="visible"
			className={cn(
				"grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-5",
				className,
			)}
		>
			{children}
		</motion.div>
	);
}

export function AnimatedKpiItem({ children }: { children: React.ReactNode }) {
	return (
		<motion.div
			variants={kpiCardVariants}
			transition={{ duration: 0.15, ease: [0.16, 1, 0.3, 1] }}
		>
			{children}
		</motion.div>
	);
}
