"use client";

import { useQuery } from "convex/react";
import { CheckCircle2, Clock, TrendingUp, Users } from "lucide-react";
import {
	AnimatedKpiGrid,
	AnimatedKpiItem,
	KpiCard,
} from "@/components/dashboard/kpi-card";
import { api } from "../../../convex/_generated/api";

export function LeadsKpiStrip() {
	const counts = useQuery(api.leads.countByStatus, {});

	const kpis = [
		{
			label: "Total contacts",
			value: counts === undefined ? "—" : String(counts.total ?? 0),
			icon: Users,
		},
		{
			label: "Nouveaux 7 jours",
			value: counts === undefined ? "—" : String(counts.new7d ?? 0),
			icon: Clock,
			delta:
				counts !== undefined && counts.total > 0
					? `+${Math.round(((counts.new7d ?? 0) / counts.total) * 100)}%`
					: undefined,
			deltaPositive: true,
		},
		{
			label: "En négociation",
			value:
				counts === undefined
					? "—"
					: String((counts.tenu ?? 0) + (counts.follow_up ?? 0)),
			icon: TrendingUp,
		},
		{
			label: "Gagnés ce mois",
			value: counts === undefined ? "—" : String(counts.gagneThisMonth ?? 0),
			icon: CheckCircle2,
		},
	] as const;

	return (
		<AnimatedKpiGrid className="mb-6">
			{kpis.map((kpi) => (
				<AnimatedKpiItem key={kpi.label}>
					<KpiCard
						label={kpi.label}
						value={kpi.value}
						icon={kpi.icon}
						delta={"delta" in kpi ? kpi.delta : undefined}
						deltaPositive={
							"deltaPositive" in kpi ? kpi.deltaPositive : undefined
						}
					/>
				</AnimatedKpiItem>
			))}
		</AnimatedKpiGrid>
	);
}
