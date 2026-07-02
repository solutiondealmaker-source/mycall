"use client";

import { useQuery } from "convex/react";
import { api } from "../../../convex/_generated/api";
import type { Id } from "../../../convex/_generated/dataModel";
import { MiniKpi, WidgetEmpty, WidgetShell } from "./widget-shell";

// ─── BarList ──────────────────────────────────────────────────────────────────

function BarListItem({
	label,
	count,
	total,
	color,
}: {
	label: string;
	count: number;
	total: number;
	color?: string | null;
}) {
	const pct = total > 0 ? (count / total) * 100 : 0;
	const barColor = color ?? "var(--brand)";

	return (
		<div className="flex items-center gap-3 group">
			<div className="flex-1 relative">
				<div className="h-7 bg-[var(--surface-raised)] rounded-md overflow-hidden">
					<div
						className="absolute inset-y-0 left-0 rounded-md transition-all duration-500"
						style={{ width: `${pct}%`, background: barColor, opacity: 0.15 }}
					/>
					<div className="absolute inset-y-0 left-0 right-0 flex items-center px-3">
						<span className="text-xs font-medium text-[var(--ink)] truncate">
							{label}
						</span>
					</div>
				</div>
			</div>
			<span className="text-sm font-semibold text-[var(--ink)] w-8 text-right shrink-0">
				{count}
			</span>
		</div>
	);
}

// ─── Component ────────────────────────────────────────────────────────────────

interface LossReason {
	id: Id<"lossReasons">;
	name: string;
	label: string;
	color?: string | null;
	count: number;
}

interface LossReasonWidgetProps {
	eventIds: Id<"events">[];
	startMs: number;
	endMs: number;
}

export function LossReasonWidget({
	eventIds,
	startMs,
	endMs,
}: LossReasonWidgetProps) {
	const data = useQuery(api.analytics.getLossReasonStats, {
		eventIds: eventIds.length > 0 ? eventIds : undefined,
		startMs,
		endMs,
	});

	return (
		<WidgetShell
			title="Raison de la vente non réalisée"
			description="Affiche une répartition des raisons de non-vente."
			footer={
				data ? (
					<div className="grid grid-cols-4 gap-4">
						<MiniKpi
							label="Follow-Up"
							value={data.breakdown.followUp}
							dot="#F59E0B"
						/>
						<MiniKpi
							label="Non-présentation"
							value={data.breakdown.noShow}
							dot="#94A3B8"
						/>
						<MiniKpi
							label="Annulé"
							value={data.breakdown.cancelled}
							dot="#FB7185"
						/>
						<MiniKpi
							label="Autre"
							value={data.breakdown.other}
							dot="var(--border-strong)"
						/>
					</div>
				) : undefined
			}
		>
			{data === undefined ? (
				<div className="flex flex-col gap-2">
					{[1, 2, 3, 4].map((i) => (
						<div key={i} className="h-7 rounded-md animate-shimmer" />
					))}
				</div>
			) : data.reasons.length === 0 ? (
				<WidgetEmpty message="Aucune vente non réalisée sur cette période" />
			) : (
				<div className="flex flex-col gap-1.5">
					{(data.reasons as LossReason[]).slice(0, 8).map((r) => (
						<BarListItem
							key={r.id}
							label={r.label}
							count={r.count}
							total={data.total}
							color={r.color}
						/>
					))}
				</div>
			)}
		</WidgetShell>
	);
}
