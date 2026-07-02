"use client";

import { useQuery } from "convex/react";
import {
	Area,
	AreaChart,
	CartesianGrid,
	ResponsiveContainer,
	Tooltip,
	XAxis,
	YAxis,
} from "recharts";
import { api } from "../../../convex/_generated/api";
import type { Id } from "../../../convex/_generated/dataModel";
import { MiniKpi, WidgetEmpty, WidgetShell } from "./widget-shell";

// ─── Formatter ────────────────────────────────────────────────────────────────

function formatEur(cents: number): string {
	const amount = cents / 100;
	if (amount >= 1_000_000) return `${(amount / 1_000_000).toFixed(1)}M€`;
	if (amount >= 1_000) return `${(amount / 1_000).toFixed(1)}k€`;
	return `${amount.toLocaleString("fr-FR")}€`;
}

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
				{formatEur(payload[0].value)}
			</p>
		</div>
	);
}

// ─── Component ────────────────────────────────────────────────────────────────

interface RevenueWidgetProps {
	eventIds: Id<"events">[];
	startMs: number;
	endMs: number;
}

export function RevenueWidget({
	eventIds,
	startMs,
	endMs,
}: RevenueWidgetProps) {
	const data = useQuery(api.analytics.getRevenueStats, {
		eventIds: eventIds.length > 0 ? eventIds : undefined,
		startMs,
		endMs,
	});

	return (
		<WidgetShell
			title="Revenue généré"
			description="Montant total des ventes enregistrées sur la période."
			footer={
				data ? (
					<div className="grid grid-cols-3 gap-4">
						<MiniKpi
							label="Revenue total"
							value={formatEur(data.totalAmountCents)}
						/>
						<MiniKpi label="Ventes gagnées" value={data.count} />
						<MiniKpi
							label="Panier moyen"
							value={formatEur(data.avgDealSizeCents)}
						/>
					</div>
				) : undefined
			}
		>
			{data === undefined ? (
				<div className="h-48 rounded-lg animate-shimmer" />
			) : data.byMonth.length === 0 ? (
				<WidgetEmpty message="Aucun revenu enregistré sur cette période" />
			) : (
				<ResponsiveContainer width="100%" height={200}>
					<AreaChart
						data={data.byMonth}
						margin={{ top: 4, right: 4, bottom: 0, left: -10 }}
					>
						<defs>
							<linearGradient id="revenueGrad" x1="0" y1="0" x2="0" y2="1">
								<stop offset="0%" stopColor="var(--brand)" stopOpacity={0.18} />
								<stop offset="100%" stopColor="var(--brand)" stopOpacity={0} />
							</linearGradient>
						</defs>
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
						/>
						<YAxis
							tickFormatter={(v) => formatEur(v)}
							tick={{
								fontSize: 11,
								fill: "var(--ink-ghost)",
								fontFamily: "var(--font-body)",
							}}
							axisLine={false}
							tickLine={false}
						/>
						<Tooltip content={<CustomTooltip />} />
						<Area
							type="monotone"
							dataKey="amountCents"
							stroke="var(--brand)"
							strokeWidth={2}
							fill="url(#revenueGrad)"
							dot={false}
							activeDot={{
								r: 4,
								fill: "var(--brand)",
								stroke: "var(--surface)",
								strokeWidth: 2,
							}}
						/>
					</AreaChart>
				</ResponsiveContainer>
			)}
		</WidgetShell>
	);
}
