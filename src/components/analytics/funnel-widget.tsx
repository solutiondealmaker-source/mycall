"use client";

import { useQuery } from "convex/react";
import { motion } from "framer-motion";
import { api } from "../../../convex/_generated/api";
import type { Id } from "../../../convex/_generated/dataModel";
import { MiniKpi, WidgetShell, WidgetSkeleton } from "./widget-shell";

// ─── Colors ───────────────────────────────────────────────────────────────────

const FUNNEL_STEPS = [
	{ key: "pageViews", label: "Nombre de vues", shortLabel: "Vues" },
	{ key: "contacts", label: "Contacts", shortLabel: "Contacts" },
	{ key: "calls", label: "Appels créés", shortLabel: "Appels créés" },
] as const;

const STEP_COLORS = [
	"var(--brand)",
	"var(--brand-bright)",
	"var(--brand-light)",
];

// ─── Component ────────────────────────────────────────────────────────────────

interface FunnelWidgetProps {
	eventIds: Id<"events">[];
	startMs: number;
	endMs: number;
}

export function FunnelWidget({ eventIds, startMs, endMs }: FunnelWidgetProps) {
	const data = useQuery(api.analytics.getFunnelStats, {
		eventIds: eventIds.length > 0 ? eventIds : undefined,
		startMs,
		endMs,
	});

	if (data === undefined) return <WidgetSkeleton />;

	const values = [data.pageViews, data.contacts, data.calls];
	const maxVal = Math.max(...values, 1);

	return (
		<WidgetShell
			title="Funnel de réservation d'appel"
			description="Nombre de vues du calendrier, de contacts capturés, d'appels créés et leurs taux de conversion."
			footer={
				<div className="grid grid-cols-3 gap-4">
					<MiniKpi label="Vues page" value={data.pageViews} />
					<MiniKpi label="Contacts" value={data.contacts} />
					<MiniKpi label="Appels créés" value={data.calls} />
				</div>
			}
		>
			{/* Funnel bars */}
			<div className="flex flex-col gap-3">
				{FUNNEL_STEPS.map((step, i) => {
					const val = values[i] ?? 0;
					const pct = maxVal > 0 ? (val / maxVal) * 100 : 0;

					return (
						<div key={step.key} className="flex items-center gap-3">
							{/* Label */}
							<div className="w-28 shrink-0">
								<p className="text-xs font-medium text-[var(--ink-muted)] leading-tight">
									{step.label}
								</p>
							</div>

							{/* Bar */}
							<div className="flex-1 relative h-9 bg-[var(--surface-raised)] rounded-md overflow-hidden">
								<motion.div
									className="absolute inset-y-0 left-0 rounded-md"
									initial={{ width: 0 }}
									animate={{ width: `${pct}%` }}
									transition={{
										duration: 0.7,
										delay: i * 0.1,
										ease: [0.25, 0.46, 0.45, 0.94],
									}}
									style={{ background: STEP_COLORS[i] }}
								/>
								<div className="absolute inset-y-0 left-0 flex items-center px-3">
									<span className="relative z-10 text-sm font-semibold text-white drop-shadow-sm">
										{val > 0 ? val : ""}
									</span>
								</div>
							</div>

							{/* Conversion badge (skip first) */}
							{i > 0 && (
								<div className="w-20 shrink-0 text-right">
									<span className="text-sm font-semibold text-[var(--brand)]">
										{i === 1
											? `${data.viewsToContactsPct}%`
											: `${data.contactsToCallsPct}%`}
									</span>
									<p className="text-[10px] text-[var(--ink-ghost)] leading-tight mt-0.5">
										{i === 1 ? "conv. vues" : "conv. contacts"}
									</p>
								</div>
							)}
						</div>
					);
				})}
			</div>
		</WidgetShell>
	);
}
