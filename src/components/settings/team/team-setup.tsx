"use client";

import { useQuery } from "convex/react";
import {
	AlertTriangle,
	CheckCircle2,
	ChevronDown,
	Settings2,
} from "lucide-react";
import { useState } from "react";
import { api } from "@/../convex/_generated/api";
import { cn } from "@/lib/utils";

type Row = {
	userId: string;
	name: string | null;
	email: string | null;
	role: string | null;
	accounts: { email: string; invalid: boolean }[];
	writerCalendar: string | null;
	conflictCalendars: string[];
	availabilityDays: number;
	availabilityHours: number;
	eventCount: number;
};

// Ce qui empêche un membre de recevoir des rendez-vous, par ordre de gravité.
function problems(r: Row): string[] {
	const out: string[] = [];
	if (r.accounts.length === 0) out.push("aucun agenda Google connecté");
	if (r.accounts.some((a) => a.invalid))
		out.push("connexion Google expirée — à reconnecter");
	if (r.availabilityDays === 0) out.push("aucune disponibilité définie");
	if (r.accounts.length > 0 && r.conflictCalendars.length === 0)
		out.push("aucun agenda vérifié : risque de double réservation");
	return out;
}

// Vue d'ensemble de la configuration de l'équipe. Un closer sans agenda ou sans
// disponibilité ne reçoit aucun rendez-vous, et rien ne le signalait jusqu'ici.
export function TeamSetup() {
	const rows = useQuery(api.users.getTeamSetup, {}) as Row[] | undefined;
	const [open, setOpen] = useState(false);
	if (!rows || rows.length === 0) return null;

	const faulty = rows.filter((r) => problems(r).length > 0).length;

	return (
		<div className="card-premium p-0 overflow-hidden mb-6">
			<button
				type="button"
				onClick={() => setOpen((o) => !o)}
				className="w-full flex items-center gap-3 px-5 py-4 text-left hover:bg-[var(--surface-raised)] transition-colors"
			>
				<Settings2 className="w-4 h-4 text-[var(--brand)] shrink-0" />
				<div className="flex-1 min-w-0">
					<p className="text-sm font-semibold text-[var(--ink)]">
						Configuration de l'équipe
					</p>
					<p className="text-xs text-[var(--ink-muted)]">
						{faulty === 0
							? "Tous les membres peuvent recevoir des rendez-vous."
							: `${faulty} membre(s) ne peuvent pas recevoir de rendez-vous.`}
					</p>
				</div>
				{faulty > 0 && (
					<AlertTriangle className="w-4 h-4 text-[var(--warning)] shrink-0" />
				)}
				<ChevronDown
					className={cn(
						"w-4 h-4 text-[var(--ink-ghost)] transition-transform shrink-0",
						open && "rotate-180",
					)}
				/>
			</button>

			{open && (
				<ul className="border-t border-[var(--border)] divide-y divide-[var(--border)]">
					{rows.map((r) => {
						const issues = problems(r);
						return (
							<li key={r.userId} className="px-5 py-3 space-y-1.5">
								<div className="flex items-center gap-2">
									{issues.length === 0 ? (
										<CheckCircle2 className="w-4 h-4 text-[var(--success)] shrink-0" />
									) : (
										<AlertTriangle className="w-4 h-4 text-[var(--warning)] shrink-0" />
									)}
									<span className="text-sm font-medium text-[var(--ink)] truncate">
										{r.name ?? r.email}
									</span>
									<span className="text-xs text-[var(--ink-ghost)] truncate">
										{r.email}
									</span>
								</div>

								<dl className="grid sm:grid-cols-3 gap-x-4 gap-y-1 text-xs pl-6">
									<div>
										<dt className="text-[var(--ink-ghost)]">Comptes Google</dt>
										<dd className="text-[var(--ink-muted)]">
											{r.accounts.length === 0
												? "—"
												: r.accounts
														.map(
															(a) =>
																`${a.email}${a.invalid ? " (expiré)" : ""}`,
														)
														.join(", ")}
										</dd>
									</div>
									<div>
										<dt className="text-[var(--ink-ghost)]">
											Agendas vérifiés
										</dt>
										<dd className="text-[var(--ink-muted)]">
											{r.conflictCalendars.length === 0
												? "—"
												: r.conflictCalendars.join(", ")}
										</dd>
									</div>
									<div>
										<dt className="text-[var(--ink-ghost)]">Disponibilités</dt>
										<dd className="text-[var(--ink-muted)]">
											{r.availabilityDays === 0
												? "—"
												: `${r.availabilityDays} jour(s) · ${r.availabilityHours} h/semaine`}
											{r.eventCount > 0 && ` · ${r.eventCount} événement(s)`}
										</dd>
									</div>
								</dl>

								{issues.length > 0 && (
									<p className="text-xs text-[var(--warning)] pl-6">
										{issues.join(" · ")}
									</p>
								)}
							</li>
						);
					})}
				</ul>
			)}
		</div>
	);
}
