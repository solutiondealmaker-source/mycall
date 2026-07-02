"use client";

import { useQuery } from "convex/react";
import { Cell, Pie, PieChart, ResponsiveContainer, Tooltip } from "recharts";
import { api } from "../../../convex/_generated/api";
import type { Id } from "../../../convex/_generated/dataModel";
import { MiniKpi, WidgetEmpty, WidgetShell } from "./widget-shell";

// ─── Config ───────────────────────────────────────────────────────────────────

const SHOWUP_COLORS = {
	tenu: "#10B981",
	noShow: "#94A3B8",
	annule: "#F43F5E",
	planifie: "#60A5FA",
};

// ─── Custom Tooltip ───────────────────────────────────────────────────────────

function CustomTooltip({
	active,
	payload,
}: {
	active?: boolean;
	payload?: { name: string; value: number; payload: { fill: string } }[];
}) {
	if (!active || !payload?.[0]) return null;
	const p = payload[0];
	return (
		<div className="bg-[var(--surface)] border border-[var(--border)] rounded-lg px-3 py-2 shadow-[var(--shadow-float)] text-sm">
			<div className="flex items-center gap-2">
				<span
					className="w-2 h-2 rounded-full shrink-0"
					style={{ background: p.payload.fill }}
				/>
				<span className="text-[var(--ink-soft)] text-xs">{p.name}</span>
				<span className="ml-auto font-semibold text-[var(--ink)]">
					{p.value}
				</span>
			</div>
		</div>
	);
}

// ─── Custom Label ─────────────────────────────────────────────────────────────

// ─── Component ────────────────────────────────────────────────────────────────

interface ShowUpWidgetProps {
	eventIds: Id<"events">[];
	startMs: number;
	endMs: number;
}

export function ShowUpWidget({ eventIds, startMs, endMs }: ShowUpWidgetProps) {
	const data = useQuery(api.analytics.getShowUpStats, {
		eventIds: eventIds.length > 0 ? eventIds : undefined,
		startMs,
		endMs,
	});

	const pieData = data
		? [
				{ name: "Tenu", value: data.tenu, fill: SHOWUP_COLORS.tenu },
				{ name: "No-show", value: data.noShow, fill: SHOWUP_COLORS.noShow },
				{ name: "Annulé", value: data.annule, fill: SHOWUP_COLORS.annule },
				{
					name: "Planifié",
					value: data.planifie,
					fill: SHOWUP_COLORS.planifie,
				},
			].filter((d) => d.value > 0)
		: [];

	return (
		<WidgetShell
			title="Taux de show-up"
			description="Ratio d'appels tenus par rapport au nombre d'appels planifiés."
			footer={
				data ? (
					<div className="grid grid-cols-4 gap-4">
						<MiniKpi label="Tenu" value={data.tenu} dot={SHOWUP_COLORS.tenu} />
						<MiniKpi
							label="No-show"
							value={data.noShow}
							dot={SHOWUP_COLORS.noShow}
						/>
						<MiniKpi
							label="Annulé"
							value={data.annule}
							dot={SHOWUP_COLORS.annule}
						/>
						<MiniKpi
							label="Planifié"
							value={data.planifie}
							dot={SHOWUP_COLORS.planifie}
						/>
					</div>
				) : undefined
			}
		>
			{data === undefined ? (
				<div className="h-48 rounded-lg animate-shimmer" />
			) : data.total === 0 ? (
				<WidgetEmpty message="Aucun appel planifié sur cette période" />
			) : (
				<div className="flex items-center gap-6">
					{/* Donut */}
					<div className="shrink-0">
						<ResponsiveContainer width={160} height={160}>
							<PieChart>
								<Pie
									data={pieData}
									cx={75}
									cy={75}
									innerRadius={48}
									outerRadius={72}
									dataKey="value"
									strokeWidth={0}
									paddingAngle={2}
								>
									{pieData.map((entry, index) => (
										<Cell key={index} fill={entry.fill} />
									))}
								</Pie>
								<Tooltip content={<CustomTooltip />} />
								{/* Center label via foreignObject approach */}
							</PieChart>
						</ResponsiveContainer>
					</div>

					{/* Legend */}
					<div className="flex flex-col gap-2 flex-1">
						{[
							{ label: "Tenu", value: data.tenu, color: SHOWUP_COLORS.tenu },
							{
								label: "No-show",
								value: data.noShow,
								color: SHOWUP_COLORS.noShow,
							},
							{
								label: "Annulé",
								value: data.annule,
								color: SHOWUP_COLORS.annule,
							},
							{
								label: "Planifié",
								value: data.planifie,
								color: SHOWUP_COLORS.planifie,
							},
						].map((item) => {
							const pct =
								data.total > 0
									? Math.round((item.value / data.total) * 100)
									: 0;
							return (
								<div
									key={item.label}
									className="flex items-center gap-2 text-sm"
								>
									<span
										className="w-2.5 h-2.5 rounded-full shrink-0"
										style={{ background: item.color }}
									/>
									<span className="text-[var(--ink-soft)] flex-1">
										{item.label}
									</span>
									<span className="text-[var(--ink-muted)] text-xs">
										{pct}%
									</span>
									<span className="font-semibold text-[var(--ink)] w-8 text-right">
										{item.value}
									</span>
								</div>
							);
						})}
					</div>
				</div>
			)}
		</WidgetShell>
	);
}
