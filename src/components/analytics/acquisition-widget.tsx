"use client";

import { useQuery } from "convex/react";
import { useState } from "react";
import { cn } from "@/lib/utils";
import { api } from "../../../convex/_generated/api";
import type { Id } from "../../../convex/_generated/dataModel";
import { WidgetEmpty, WidgetShell } from "./widget-shell";

type Dimension = "source" | "medium" | "campaign" | "content";

const DIMENSIONS: { value: Dimension; label: string }[] = [
	{ value: "source", label: "Source" },
	{ value: "campaign", label: "Campagne" },
	{ value: "content", label: "Publicité" },
	{ value: "medium", label: "Support" },
];

function formatEur(cents: number): string {
	const amount = cents / 100;
	if (amount >= 1_000) return `${(amount / 1_000).toFixed(1)}k€`;
	return `${Math.round(amount).toLocaleString("fr-FR")}€`;
}

interface AcquisitionWidgetProps {
	eventIds: Id<"events">[];
	startMs: number;
	endMs: number;
}

export function AcquisitionWidget({
	eventIds,
	startMs,
	endMs,
}: AcquisitionWidgetProps) {
	const [dimension, setDimension] = useState<Dimension>("source");
	const data = useQuery(api.analytics.getAcquisitionStats, {
		dimension,
		eventIds: eventIds.length > 0 ? eventIds : undefined,
		startMs,
		endMs,
	});

	return (
		<WidgetShell
			title="Acquisition"
			description="Ce que rapporte chaque origine : des leads, des appels tenus, des ventes."
			actions={
				<div className="flex gap-1">
					{DIMENSIONS.map((d) => (
						<button
							key={d.value}
							type="button"
							onClick={() => setDimension(d.value)}
							className={cn(
								"px-2.5 py-1 rounded-[var(--radius-sm)] text-xs font-medium transition-colors",
								dimension === d.value
									? "bg-[var(--brand-soft)] text-[var(--brand)]"
									: "text-[var(--ink-muted)] hover:bg-[var(--surface-raised)]",
							)}
						>
							{d.label}
						</button>
					))}
				</div>
			}
		>
			{data === undefined ? (
				<div className="h-48 rounded-lg animate-shimmer" />
			) : data.rows.length === 0 ? (
				<WidgetEmpty message="Aucun lead sur cette période" />
			) : (
				<div className="overflow-x-auto -mx-1">
					<table className="w-full text-sm border-collapse">
						<thead>
							<tr className="text-xs uppercase tracking-wider text-[var(--ink-ghost)]">
								<th className="text-left font-medium py-2 pr-3">
									{DIMENSIONS.find((d) => d.value === dimension)?.label}
								</th>
								<th className="text-right font-medium py-2 px-2">Leads</th>
								<th className="text-right font-medium py-2 px-2">RDV</th>
								<th className="text-right font-medium py-2 px-2">Tenus</th>
								<th className="text-right font-medium py-2 px-2">Présence</th>
								<th className="text-right font-medium py-2 px-2">Ventes</th>
								<th className="text-right font-medium py-2 px-2">Closing</th>
								<th className="text-right font-medium py-2 pl-2">CA</th>
							</tr>
						</thead>
						<tbody>
							{data.rows.map((r) => (
								<tr
									key={r.key}
									className="border-t border-[var(--border)] hover:bg-[var(--surface-raised)] transition-colors"
								>
									<td
										className="py-2 pr-3 text-[var(--ink)] max-w-[200px] truncate"
										title={r.key}
									>
										{r.key}
									</td>
									<td className="py-2 px-2 text-right text-[var(--ink-muted)]">
										{r.leads}
									</td>
									<td className="py-2 px-2 text-right text-[var(--ink-muted)]">
										{r.bookings}
									</td>
									<td className="py-2 px-2 text-right text-[var(--ink-muted)]">
										{r.held}
									</td>
									<td className="py-2 px-2 text-right text-[var(--ink-muted)]">
										{r.held + r.noShow > 0 ? `${r.showUpRate}%` : "—"}
									</td>
									<td className="py-2 px-2 text-right text-[var(--ink)] font-medium">
										{r.won}
									</td>
									<td className="py-2 px-2 text-right text-[var(--ink-muted)]">
										{r.held > 0 ? `${r.closeRate}%` : "—"}
									</td>
									<td className="py-2 pl-2 text-right text-[var(--ink)] font-semibold">
										{formatEur(r.revenueCents)}
									</td>
								</tr>
							))}
							<tr className="border-t-2 border-[var(--border)] font-semibold text-[var(--ink)]">
								<td className="py-2 pr-3">Total</td>
								<td className="py-2 px-2 text-right">{data.totals.leads}</td>
								<td className="py-2 px-2 text-right">{data.totals.bookings}</td>
								<td className="py-2 px-2 text-right">{data.totals.held}</td>
								<td className="py-2 px-2 text-right">
									{data.totals.held + data.totals.noShow > 0
										? `${data.totals.showUpRate}%`
										: "—"}
								</td>
								<td className="py-2 px-2 text-right">{data.totals.won}</td>
								<td className="py-2 px-2 text-right">
									{data.totals.held > 0 ? `${data.totals.closeRate}%` : "—"}
								</td>
								<td className="py-2 pl-2 text-right">
									{formatEur(data.totals.revenueCents)}
								</td>
							</tr>
						</tbody>
					</table>
					<p className="text-xs text-[var(--ink-ghost)] mt-3">
						L'origine vient des paramètres <code>utm_</code> du lien de
						réservation. Sans eux, le lead est compté dans « Non renseigné ».
					</p>
				</div>
			)}
		</WidgetShell>
	);
}
