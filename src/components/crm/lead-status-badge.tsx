import { cn } from "@/lib/utils";
import type { Doc } from "../../../convex/_generated/dataModel";

type LeadStatus = Doc<"leads">["status"];

const STATUS_CONFIG: Record<LeadStatus, { label: string; className: string }> =
	{
		potentiel: {
			label: "Potentiel",
			className: "bg-[var(--surface-muted)] text-[var(--ink-muted)]",
		},
		qualifie: {
			label: "Qualifié",
			className: "bg-[var(--brand-soft)] text-[var(--brand)]",
		},
		rdv_reserve: {
			label: "RDV réservé",
			className: "bg-[var(--brand-soft)] text-[var(--brand)]",
		},
		tenu: {
			label: "Tenu",
			className: "bg-[var(--warning-soft)] text-[var(--warning)]",
		},
		gagne: {
			label: "Gagné",
			className: "bg-[var(--success-soft)] text-[var(--success)]",
		},
		perdu: {
			label: "Perdu",
			className: "bg-[var(--destructive-soft)] text-[var(--destructive)]",
		},
		follow_up: {
			label: "Follow-up",
			className: "bg-[var(--warning-soft)] text-[var(--warning)]",
		},
	};

export function LeadStatusBadge({ status }: { status: LeadStatus }) {
	const config = STATUS_CONFIG[status];
	return (
		<span
			className={cn(
				"inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium whitespace-nowrap",
				config.className,
			)}
		>
			{config.label}
		</span>
	);
}
