"use client";

import { useQuery } from "convex/react";
import { useState } from "react";
import {
	Bar,
	BarChart,
	CartesianGrid,
	ResponsiveContainer,
	Tooltip,
	XAxis,
	YAxis,
} from "recharts";
import { cn } from "@/lib/utils";
import { api } from "../../../convex/_generated/api";
import type { Id } from "../../../convex/_generated/dataModel";
import { MiniKpi, WidgetEmpty, WidgetShell } from "./widget-shell";

// ─── Config ───────────────────────────────────────────────────────────────────

type Granularity = "day" | "week" | "month" | "quarter" | "year";

const GRAN_OPTIONS: { label: string; value: Granularity }[] = [
	{ label: "Jour", value: "day" },
	{ label: "Semaine", value: "week" },
	{ label: "Mois", value: "month" },
	{ label: "Trimestre", value: "quarter" },
	{ label: "Année", value: "year" },
];

const OUTCOME_COLORS = {
	won: "#10B981",
	lost: "#F43F5E",
	followUp: "#F59E0B",
	pending: "#94A3B8",
} as const;

// ─── Custom Tooltip ───────────────────────────────────────────────────────────

function CustomTooltip({
	active,
	payload,
	label,
}: {
	active?: boolean;
	payload?: { name: string; value: number; fill: string }[];
	label?: string;
}) {
	if (!active || !payload?.length) return null;
	return (
		<div className="bg-[var(--surface)] border border-[var(--border)] rounded-lg px-3 py-2 shadow-[var(--shadow-float)] text-sm">
			<p className="text-[var(--ink-muted)] text-xs mb-2">{label}</p>
			{payload.map((p) => (
				<div key={p.name} className="flex items-center gap-2 text-xs">
					<span
						className="w-2 h-2 rounded-full shrink-0"
						style={{ background: p.fill }}
					/>
					<span className="text-[var(--ink-soft)]">{p.name}</span>
					<span className="ml-auto font-semibold text-[var(--ink)]">
						{p.value}
					</span>
				</div>
			))}
		</div>
	);
}

// ─── Component ────────────────────────────────────────────────────────────────

interface OutcomeWidgetProps {
	eventIds: Id<"events">[];
	startMs: number;
	endMs: number;
}

export function OutcomeWidget({
	eventIds,
	startMs,
	endMs,
}: OutcomeWidgetProps) {
	const [gran, setGran] = useState<Granularity>("week");

	const data = useQuery(api.analytics.getOutcomeStats, {
		eventIds: eventIds.length > 0 ? eventIds : undefined,
		startMs,
		endMs,
		granularity: gran,
	});

	return (
		<WidgetShell
			title="Résultats appel stratégique"
			description="Affiche le nombre d'appels stratégiques convertis en ventes réalisées ou en ventes non réalisées."
			actions={
				<div className="flex items-center gap-0.5 bg-[var(--surface-raised)] rounded-[var(--radius-sm)] p-0.5">
					{GRAN_OPTIONS.map((opt) => (
						<button
							key={opt.value}
							type="button"
							onClick={() => setGran(opt.value)}
							className={cn(
								"px-2.5 py-1 rounded-[4px] text-xs font-medium transition-all duration-150",
								gran === opt.value
									? "bg-[var(--surface)] text-[var(--brand)] shadow-sm"
									: "text-[var(--ink-muted)] hover:text-[var(--ink)]",
							)}
						>
							{opt.label}
						</button>
					))}
				</div>
			}
			footer={
				data ? (
					<div className="grid grid-cols-4 gap-4">
						<MiniKpi label="Total planifié" value={data.totalPlanned} />
						<MiniKpi label="Ventes" value={data.won} dot={OUTCOME_COLORS.won} />
						<MiniKpi
							label="Non réalisé"
							value={data.lost}
							dot={OUTCOME_COLORS.lost}
						/>
						<MiniKpi
							label="En attente"
							value={data.pending + data.followUp}
							dot={OUTCOME_COLORS.pending}
						/>
					</div>
				) : undefined
			}
		>
			{data === undefined ? (
				<div className="h-48 rounded-lg animate-shimmer" />
			) : data.timeline.length === 0 ? (
				<WidgetEmpty />
			) : (
				<ResponsiveContainer width="100%" height={200}>
					<BarChart
						data={data.timeline}
						margin={{ top: 4, right: 4, bottom: 0, left: -20 }}
						barCategoryGap="30%"
					>
						<CartesianGrid
							vertical={false}
							stroke="var(--border)"
							strokeDasharray="3 3"
						/>
						<XAxis
							dataKey="period"
							tick={{
								fontSize: 11,
								fill: "var(--ink-ghost)",
								fontFamily: "var(--font-body)",
							}}
							axisLine={false}
							tickLine={false}
							interval="preserveStartEnd"
						/>
						<YAxis
							tick={{
								fontSize: 11,
								fill: "var(--ink-ghost)",
								fontFamily: "var(--font-body)",
							}}
							axisLine={false}
							tickLine={false}
							allowDecimals={false}
						/>
						<Tooltip
							content={<CustomTooltip />}
							cursor={{ fill: "var(--brand-soft)" }}
						/>
						<Bar
							dataKey="won"
							name="Ventes"
							fill={OUTCOME_COLORS.won}
							radius={[2, 2, 0, 0]}
							maxBarSize={36}
							stackId="a"
						/>
						<Bar
							dataKey="lost"
							name="Non réalisé"
							fill={OUTCOME_COLORS.lost}
							radius={[0, 0, 0, 0]}
							maxBarSize={36}
							stackId="a"
						/>
						<Bar
							dataKey="followUp"
							name="Suivi"
							fill={OUTCOME_COLORS.followUp}
							radius={[0, 0, 0, 0]}
							maxBarSize={36}
							stackId="a"
						/>
						<Bar
							dataKey="pending"
							name="En attente"
							fill={OUTCOME_COLORS.pending}
							radius={[2, 2, 0, 0]}
							maxBarSize={36}
							stackId="a"
						/>
					</BarChart>
				</ResponsiveContainer>
			)}
		</WidgetShell>
	);
}
