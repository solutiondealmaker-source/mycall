import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

interface PageHeaderProps {
	title: ReactNode;
	description?: string;
	actions?: ReactNode;
	className?: string;
}

/**
 * PageHeader — Server Component.
 * Réutilisable sur toutes les pages dashboard.
 */
export function PageHeader({
	title,
	description,
	actions,
	className,
}: PageHeaderProps) {
	return (
		<div
			className={cn("flex items-start justify-between gap-4 mb-8", className)}
		>
			<div className="min-w-0">
				<h1
					className={cn(
						"font-[family-name:var(--font-display)]",
						"text-[28px] font-semibold leading-[1.2] tracking-[-0.03em]",
						"text-[var(--ink)]",
					)}
				>
					{title}
				</h1>
				{description && (
					<p className="mt-1 text-sm text-[var(--ink-muted)] leading-relaxed">
						{description}
					</p>
				)}
			</div>
			{actions && (
				<div className="flex items-center gap-2 shrink-0 mt-0.5">{actions}</div>
			)}
		</div>
	);
}
