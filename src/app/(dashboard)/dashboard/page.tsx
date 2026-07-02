"use client";

import { Eye, PhoneCall, TrendingUp, Users } from "lucide-react";
import {
	AnimatedKpiGrid,
	AnimatedKpiItem,
	KpiCard,
} from "@/components/dashboard/kpi-card";
import { PageHeader } from "@/components/dashboard/page-header";
import { SetupChecklist } from "@/components/dashboard/setup-checklist";

// ─── Données placeholder ───────────────────────────────────────────────────────

const KPI_DATA = [
	{
		label: "Vues page",
		value: "1 284",
		icon: Eye,
		delta: "+8%",
		deltaPositive: true,
	},
	{
		label: "Contacts capturés",
		value: "247",
		icon: Users,
		delta: "+14%",
		deltaPositive: true,
	},
	{
		label: "Appels créés",
		value: "98",
		icon: PhoneCall,
		delta: "+5%",
		deltaPositive: true,
	},
	{
		label: "Taux conversion",
		value: "38,4%",
		icon: TrendingUp,
		delta: "-1.2%",
		deltaPositive: false,
	},
] as const;

// ─── Composant ────────────────────────────────────────────────────────────────

export default function DashboardPage() {
	return (
		<div className="animate-fade-in">
			<PageHeader
				title={<>Bonjour 👋</>}
				description="Voici un aperçu de ton activité"
			/>

			<SetupChecklist />

			{/* KPI Grid animée */}
			<AnimatedKpiGrid>
				{KPI_DATA.map((kpi) => (
					<AnimatedKpiItem key={kpi.label}>
						<KpiCard
							label={kpi.label}
							value={kpi.value}
							icon={kpi.icon}
							delta={kpi.delta}
							deltaPositive={kpi.deltaPositive}
						/>
					</AnimatedKpiItem>
				))}
			</AnimatedKpiGrid>

			{/* Widgets placeholder */}
			<div className="grid grid-cols-1 lg:grid-cols-2 gap-5 mt-8">
				<PlaceholderWidget title="Bookings récents" />
				<PlaceholderWidget title="Leads chauds" />
			</div>
		</div>
	);
}

// ─── Widget placeholder ─────────────────────────────────────────────────────

function PlaceholderWidget({ title }: { title: string }) {
	return (
		<div className="card-premium flex flex-col gap-3">
			<div className="flex items-center justify-between">
				<h2 className="text-base font-semibold font-[family-name:var(--font-display)] text-[var(--ink)] tracking-[-0.01em]">
					{title}
				</h2>
				<span className="text-xs font-medium px-2 py-0.5 rounded-full bg-[var(--surface-muted)] text-[var(--ink-ghost)]">
					Bientôt
				</span>
			</div>
			<div className="flex flex-col items-center justify-center py-10 gap-3">
				<div className="w-8 h-8 rounded-full bg-[var(--surface-raised)] flex items-center justify-center">
					<div className="w-3 h-3 rounded-sm bg-[var(--border-strong)]" />
				</div>
				<p className="text-sm text-[var(--ink-ghost)]">
					Ce widget sera disponible prochainement
				</p>
			</div>
		</div>
	);
}
