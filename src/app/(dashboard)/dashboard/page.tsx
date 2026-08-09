"use client";

import { useQuery } from "convex/react";
import { Eye, PhoneCall, TrendingUp, Users } from "lucide-react";
import { api } from "@/../convex/_generated/api";
import {
	AnimatedKpiGrid,
	AnimatedKpiItem,
	KpiCard,
} from "@/components/dashboard/kpi-card";
import { PageHeader } from "@/components/dashboard/page-header";
import { SetupChecklist } from "@/components/dashboard/setup-checklist";

// Rôles qui voient les stats globales (aligné sur isAdminUser côté serveur).
const ADMIN_ROLES = new Set(["admin", "ceo", "ops", "head_of_sales"]);
const MS_PER_DAY = 24 * 60 * 60 * 1000;

export default function DashboardPage() {
	const me = useQuery(api.users.getMyProfile);
	const isAdmin =
		!!me && (me.isAdmin === true || ADMIN_ROLES.has(me.role ?? ""));

	const now = Date.now();
	// getFunnelStats est réservé aux admins → "skip" pour les autres (pas d'erreur).
	const funnel = useQuery(
		api.analytics.getFunnelStats,
		isAdmin ? { startMs: now - 30 * MS_PER_DAY, endMs: now } : "skip",
	);

	const loading = isAdmin && funnel === undefined;
	const fmt = (n: number) => n.toLocaleString("fr-FR");

	const kpis = [
		{
			label: "Vues page",
			value: funnel ? fmt(funnel.pageViews) : "—",
			icon: Eye,
		},
		{
			label: "Contacts capturés",
			value: funnel ? fmt(funnel.contacts) : "—",
			icon: Users,
		},
		{
			label: "Appels créés",
			value: funnel ? fmt(funnel.calls) : "—",
			icon: PhoneCall,
		},
		{
			label: "Taux conversion",
			value: funnel ? `${funnel.contactsToCallsPct}%` : "—",
			icon: TrendingUp,
		},
	] as const;

	return (
		<div className="animate-fade-in">
			<PageHeader
				title={<>Bonjour 👋</>}
				description="Aperçu de ton activité — 30 derniers jours"
			/>

			<SetupChecklist />

			{isAdmin ? (
				<AnimatedKpiGrid>
					{kpis.map((kpi) => (
						<AnimatedKpiItem key={kpi.label}>
							<KpiCard
								label={kpi.label}
								value={loading ? "…" : kpi.value}
								icon={kpi.icon}
							/>
						</AnimatedKpiItem>
					))}
				</AnimatedKpiGrid>
			) : (
				<p className="text-sm text-[var(--ink-muted)]">
					Bienvenue. Retrouve tes leads assignés dans le CRM.
				</p>
			)}

			{/* Widgets à venir */}
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
