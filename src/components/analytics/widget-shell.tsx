"use client";

import { InfoIcon } from "lucide-react";
import type { ReactNode } from "react";
import {
	Tooltip,
	TooltipContent,
	TooltipTrigger,
} from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";

interface WidgetShellProps {
	title: string;
	description?: string;
	actions?: ReactNode;
	children: ReactNode;
	footer?: ReactNode;
	className?: string;
	/** Full height fill — useful for charts that need to grow */
	stretch?: boolean;
}

export function WidgetShell({
	title,
	description,
	actions,
	children,
	footer,
	className,
	stretch,
}: WidgetShellProps) {
	return (
		<div
			className={cn(
				"card-premium flex flex-col",
				stretch && "h-full",
				className,
			)}
		>
			{/* Header */}
			<div className="flex items-start justify-between gap-3 mb-5">
				<div className="flex items-center gap-2 min-w-0">
					<h2
						className={cn(
							"font-[family-name:var(--font-display)] text-[18px] font-semibold",
							"text-[var(--ink)] tracking-[-0.02em] leading-tight",
						)}
					>
						{title}
					</h2>
					{description && (
						<Tooltip>
							<TooltipTrigger asChild>
								<button
									type="button"
									className="shrink-0 text-[var(--ink-ghost)] hover:text-[var(--ink-muted)] transition-colors"
								>
									<InfoIcon className="w-3.5 h-3.5" />
								</button>
							</TooltipTrigger>
							<TooltipContent
								className="max-w-[240px] text-xs leading-relaxed"
								side="top"
							>
								{description}
							</TooltipContent>
						</Tooltip>
					)}
				</div>
				{actions && (
					<div className="shrink-0 flex items-center gap-1.5">{actions}</div>
				)}
			</div>

			{/* Body */}
			<div className={cn("flex-1 min-h-0", stretch && "min-h-[200px]")}>
				{children}
			</div>

			{/* Footer */}
			{footer && (
				<div className="mt-5 pt-4 border-t border-[var(--border)]">
					{footer}
				</div>
			)}
		</div>
	);
}

// ─── Mini KPI row ─────────────────────────────────────────────────────────────

interface MiniKpiProps {
	label: string;
	value: string | number;
	dot?: string; // CSS color string for the dot
}

export function MiniKpi({ label, value, dot }: MiniKpiProps) {
	return (
		<div className="flex flex-col gap-0.5">
			<div className="flex items-center gap-1.5">
				{dot && (
					<span
						className="w-2 h-2 rounded-full shrink-0"
						style={{ background: dot }}
					/>
				)}
				<span className="text-[22px] font-[family-name:var(--font-display)] font-bold text-[var(--ink)] leading-none tracking-[-0.02em]">
					{value}
				</span>
			</div>
			<span className="text-[11px] font-medium text-[var(--ink-muted)] uppercase tracking-wide leading-tight">
				{label}
			</span>
		</div>
	);
}

// ─── Widget Skeleton ───────────────────────────────────────────────────────────

export function WidgetSkeleton({ className }: { className?: string }) {
	return (
		<div className={cn("card-premium flex flex-col gap-4", className)}>
			<div className="flex items-center justify-between">
				<div className="h-5 w-36 rounded-md animate-shimmer" />
				<div className="h-7 w-48 rounded-md animate-shimmer" />
			</div>
			<div className="h-48 rounded-lg animate-shimmer" />
			<div className="flex gap-6 pt-2 border-t border-[var(--border)]">
				{[1, 2, 3, 4].map((i) => (
					<div key={i} className="flex flex-col gap-1.5">
						<div className="h-6 w-10 rounded animate-shimmer" />
						<div className="h-3 w-16 rounded animate-shimmer" />
					</div>
				))}
			</div>
		</div>
	);
}

// ─── Empty State ───────────────────────────────────────────────────────────────

export function WidgetEmpty({ message }: { message?: string }) {
	return (
		<div className="flex flex-col items-center justify-center py-12 gap-3">
			<div className="w-10 h-10 rounded-full bg-[var(--surface-raised)] flex items-center justify-center">
				<div className="w-4 h-4 rounded-sm bg-[var(--border-strong)]" />
			</div>
			<p className="text-sm text-[var(--ink-ghost)] text-center max-w-[200px] leading-relaxed">
				{message ?? "Aucune donnée pour cette période"}
			</p>
		</div>
	);
}
