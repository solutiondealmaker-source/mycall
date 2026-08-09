"use client";

import { useQuery } from "convex/react";
import {
	CalendarClock,
	Eye,
	Flame,
	type LucideIcon,
	PhoneCall,
	TrendingUp,
	Users,
} from "lucide-react";
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

const STATUS_LABEL: Record<string, string> = {
	potentiel: "Potentiel",
	qualifie: "Qualifié",
	rdv_reserve: "RDV réservé",
	tenu: "Tenu",
	gagne: "Gagné",
	perdu: "Perdu",
	follow_up: "Follow-up",
};

function fmtDateTime(ms: number): string {
	return new Intl.DateTimeFormat("fr-FR", {
		weekday: "short",
		day: "numeric",
		month: "short",
		hour: "2-digit",
		minute: "2-digit",
	}).format(new Date(ms));
}

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

			<div className="grid grid-cols-1 lg:grid-cols-2 gap-5 mt-8">
				<RecentBookingsWidget />
				<RecentLeadsWidget />
			</div>
		</div>
	);
}

// ─── Widgets ────────────────────────────────────────────────────────────────

function WidgetShell({
	title,
	icon: Icon,
	children,
}: {
	title: string;
	icon: LucideIcon;
	children: React.ReactNode;
}) {
	return (
		<div className="card-premium flex flex-col gap-3">
			<div className="flex items-center gap-2">
				<Icon className="w-4 h-4 text-[var(--brand)]" strokeWidth={1.75} />
				<h2 className="text-base font-semibold font-[family-name:var(--font-display)] text-[var(--ink)] tracking-[-0.01em]">
					{title}
				</h2>
			</div>
			{children}
		</div>
	);
}

function WidgetState({ label }: { label: string }) {
	return (
		<div className="py-8 text-center text-sm text-[var(--ink-ghost)]">
			{label}
		</div>
	);
}

function RecentBookingsWidget() {
	const bookings = useQuery(api.bookings.listUpcoming, { limit: 5 });
	return (
		<WidgetShell title="Prochains rendez-vous" icon={CalendarClock}>
			{bookings === undefined ? (
				<WidgetState label="Chargement…" />
			) : bookings.length === 0 ? (
				<WidgetState label="Aucun rendez-vous à venir" />
			) : (
				<ul className="flex flex-col divide-y divide-[var(--border)]">
					{bookings.map((b) => (
						<li
							key={b._id}
							className="flex items-center justify-between gap-3 py-2.5"
						>
							<div className="min-w-0">
								<p className="text-sm font-medium text-[var(--ink)] truncate">
									{b.prospectName}
								</p>
								<p className="text-xs text-[var(--ink-muted)] truncate">
									/book/{b.eventSlug}
								</p>
							</div>
							<span className="text-xs text-[var(--ink-muted)] shrink-0 capitalize">
								{fmtDateTime(b.startTime)}
							</span>
						</li>
					))}
				</ul>
			)}
		</WidgetShell>
	);
}

function RecentLeadsWidget() {
	const leads = useQuery(api.leads.listRecent, { limit: 5 });
	return (
		<WidgetShell title="Leads récents" icon={Flame}>
			{leads === undefined ? (
				<WidgetState label="Chargement…" />
			) : leads.length === 0 ? (
				<WidgetState label="Aucun lead pour l'instant" />
			) : (
				<ul className="flex flex-col divide-y divide-[var(--border)]">
					{leads.map((l) => {
						const name =
							`${l.firstName ?? ""} ${l.lastName ?? ""}`.trim() ||
							l.phone ||
							"Lead";
						return (
							<li
								key={l._id}
								className="flex items-center justify-between gap-3 py-2.5"
							>
								<p className="text-sm font-medium text-[var(--ink)] truncate">
									{name}
								</p>
								<span className="text-xs px-2 py-0.5 rounded-full bg-[var(--brand-soft)] text-[var(--brand)] shrink-0">
									{STATUS_LABEL[l.status] ?? l.status}
								</span>
							</li>
						);
					})}
				</ul>
			)}
		</WidgetShell>
	);
}
