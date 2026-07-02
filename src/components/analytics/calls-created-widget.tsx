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
import { WidgetEmpty, WidgetShell, WidgetSkeleton } from "./widget-shell";

// ─── Types ────────────────────────────────────────────────────────────────────

type Granularity = "day" | "week" | "month" | "quarter" | "year";

const GRANULARITY_OPTIONS: { label: string; value: Granularity }[] = [
	{ label: "Jour", value: "day" },
	{ label: "Semaine", value: "week" },
	{ label: "Mois", value: "month" },
	{ label: "Trimestre", value: "quarter" },
	{ label: "Année", value: "year" },
];

// ─── Custom Tooltip ───────────────────────────────────────────────────────────

function CustomTooltip({
	active,
	payload,
	label,
}: {
	active?: boolean;
	payload?: { value: number }[];
	label?: string;
}) {
	if (!active || !payload?.[0]) return null;
	return (
		<div className="bg-[var(--surface)] border border-[var(--border)] rounded-lg px-3 py-2 shadow-[var(--shadow-float)] text-sm">
			<p className="text-[var(--ink-muted)] text-xs mb-0.5">{label}</p>
			<p className="text-[var(--ink)] font-semibold font-[family-name:var(--font-display)]">
				{payload[0].value} appels
			</p>
		</div>
	);
}

// ─── Component ────────────────────────────────────────────────────────────────

interface CallsCreatedWidgetProps {
	eventIds: Id<"events">[];
	startMs: number;
	endMs: number;
}

export function CallsCreatedWidget({
	eventIds,
	startMs,
	endMs,
}: CallsCreatedWidgetProps) {
	const [gran, setGran] = useState<Granularity>("week");

	const data = useQuery(api.analytics.getCallsCreatedByPeriod, {
		eventIds: eventIds.length > 0 ? eventIds : undefined,
		startMs,
		endMs,
		granularity: gran,
	});

	return (
		<WidgetShell
			title="Appels créés"
			description="Affiche le nombre d'appels créés pendant une période donnée."
			actions={
				<div className="flex items-center gap-0.5 bg-[var(--surface-raised)] rounded-[var(--radius-sm)] p-0.5">
					{GRANULARITY_OPTIONS.map((opt) => (
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
		>
			{data === undefined ? (
				<div className="h-48 rounded-lg animate-shimmer" />
			) : data.length === 0 ? (
				<WidgetEmpty />
			) : (
				<ResponsiveContainer width="100%" height={220}>
					<BarChart
						data={data}
						margin={{ top: 4, right: 4, bottom: 0, left: -20 }}
						barCategoryGap="35%"
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
							dataKey="count"
							fill="var(--brand)"
							radius={[4, 4, 0, 0]}
							maxBarSize={48}
						/>
					</BarChart>
				</ResponsiveContainer>
			)}
		</WidgetShell>
	);
}
