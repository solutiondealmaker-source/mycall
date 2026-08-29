"use client";

import { useQuery } from "convex/react";
import { motion } from "framer-motion";
import {
	Bell,
	CheckCircle,
	Clock,
	Mail,
	RefreshCw,
	User,
	XCircle,
} from "lucide-react";
import { api } from "@/../convex/_generated/api";
import type { Doc } from "@/../convex/_generated/dataModel";
import { PageHeader } from "@/components/dashboard/page-header";
import { cn } from "@/lib/utils";

// ─── Template catalogue ───────────────────────────────────────────────────────

const TEMPLATES = [
	{
		id: "email_confirmation",
		label: "Confirmation prospect",
		description:
			"Envoyée au prospect dès qu'un créneau est confirmé. Skippée si Google Calendar a déjà envoyé une invitation Meet.",
		icon: CheckCircle,
		variables: [
			"prospectFirstName",
			"eventName",
			"dateTime",
			"hostName",
			"meetUrl (optionnel)",
			"cancelUrl",
			"rescheduleUrl",
		],
	},
	{
		id: "email_host_notif",
		label: "Notification hôte",
		description:
			"Envoyée au closer/host à chaque nouveau booking. Inclut les réponses du formulaire de qualification.",
		icon: User,
		variables: [
			"hostName",
			"prospectName",
			"prospectEmail",
			"prospectPhone",
			"eventName",
			"dateTime",
			"meetUrl (optionnel)",
			"customAnswers (tableau)",
		],
	},
	{
		id: "email_reminder",
		label: "Rappel H-2",
		description:
			"Envoyé au prospect ~2h avant le rendez-vous. Idempotent — un seul envoi garanti via reminderSentAt.",
		icon: Clock,
		variables: [
			"prospectFirstName",
			"eventName",
			"dateTime",
			"hostName",
			"meetUrl (optionnel)",
			"cancelUrl",
		],
	},
	{
		id: "email_cancellation",
		label: "Annulation",
		description:
			"Envoyée au prospect quand un booking passe en statut cancelled (via token ou par l'admin).",
		icon: XCircle,
		variables: [
			"prospectFirstName",
			"eventName",
			"dateTime",
			"reason (optionnel)",
			"rescheduleUrl (si allowReschedule=true)",
		],
	},
	{
		id: "email_reschedule",
		label: "Replanification",
		description:
			"Envoyée au prospect après un reschedule. Affiche l'ancien et le nouveau créneau côte-à-côte.",
		icon: RefreshCw,
		variables: [
			"prospectFirstName",
			"eventName",
			"oldDateTime",
			"newDateTime",
			"hostName",
			"meetUrl (optionnel)",
			"cancelUrl",
		],
	},
] as const;

// ─── Badge statut ─────────────────────────────────────────────────────────────

function StatusBadge({ status }: { status: "sent" | "failed" }) {
	return (
		<span
			className={cn(
				"inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium",
				status === "sent"
					? "bg-emerald-500/10 text-emerald-400 ring-1 ring-emerald-500/20"
					: "bg-red-500/10 text-red-400 ring-1 ring-red-500/20",
			)}
		>
			{status === "sent" ? (
				<CheckCircle className="w-3 h-3" />
			) : (
				<XCircle className="w-3 h-3" />
			)}
			{status === "sent" ? "Envoyé" : "Échec"}
		</span>
	);
}

// ─── Type label ───────────────────────────────────────────────────────────────

const TYPE_LABELS: Record<string, string> = {
	email_confirmation: "Confirmation",
	email_reminder: "Rappel H-2",
	email_host_notif: "Notif hôte",
	email_cancellation: "Annulation",
	email_reschedule: "Replanification",
};

// ─── Composant principal ──────────────────────────────────────────────────────

export default function NotificationsSettingsPage() {
	const logs = useQuery(api.emailsInternal.listRecentLogs);

	const containerVariants = {
		hidden: {},
		show: { transition: { staggerChildren: 0.02 } },
	};

	const itemVariants = {
		hidden: { opacity: 0, y: 10 },
		show: { opacity: 1, y: 0, transition: { duration: 0.15 } },
	};

	return (
		<div className="animate-fade-in">
			<PageHeader
				title="Notifications email"
				description="Les 5 emails envoyés automatiquement par l'outil, et les informations que chacun reprend."
			/>

			{/* Templates grid */}
			<motion.div
				variants={containerVariants}
				initial="hidden"
				animate="show"
				className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4 mb-10"
			>
				{TEMPLATES.map((tpl) => {
					const Icon = tpl.icon;
					return (
						<motion.div
							key={tpl.id}
							variants={itemVariants}
							className="card-premium flex flex-col gap-3"
						>
							{/* Header */}
							<div className="flex items-center gap-3">
								<div className="flex items-center justify-center w-9 h-9 rounded-[var(--radius-sm)] bg-[var(--brand-soft)] ring-1 ring-[var(--brand-glow)] shrink-0">
									<Icon
										className="w-4 h-4 text-[var(--brand)]"
										strokeWidth={1.75}
									/>
								</div>
								<div className="min-w-0">
									<p className="text-sm font-semibold text-[var(--ink)] truncate">
										{tpl.label}
									</p>
									<p className="text-[11px] text-emerald-400 font-medium">
										Actif
									</p>
								</div>
							</div>

							{/* Description */}
							<p className="text-xs text-[var(--ink-muted)] leading-relaxed">
								{tpl.description}
							</p>

							{/* Variables */}
							<div>
								<p className="text-[10px] font-semibold text-[var(--ink-subtle)] uppercase tracking-wider mb-1.5">
									Variables disponibles
								</p>
								<div className="flex flex-wrap gap-1">
									{tpl.variables.map((v) => (
										<span
											key={v}
											className="px-1.5 py-0.5 rounded text-[10px] font-mono bg-[var(--surface-2)] text-[var(--ink-muted)] ring-1 ring-[var(--border)]"
										>
											{v}
										</span>
									))}
								</div>
							</div>
						</motion.div>
					);
				})}
			</motion.div>

			{/* Logs table */}
			<section>
				<div className="flex items-center gap-2 mb-4">
					<Mail className="w-4 h-4 text-[var(--brand)]" />
					<h2 className="text-base font-semibold text-[var(--ink)]">
						50 derniers emails envoyés
					</h2>
				</div>

				<div className="card-premium overflow-hidden p-0">
					{logs === undefined ? (
						<div className="flex items-center justify-center h-32 text-[var(--ink-muted)] text-sm">
							Chargement…
						</div>
					) : logs.length === 0 ? (
						<div className="flex flex-col items-center justify-center gap-2 h-32 text-[var(--ink-subtle)] text-sm">
							<Bell className="w-6 h-6 opacity-40" />
							Aucun email envoyé pour l&apos;instant
						</div>
					) : (
						<table className="w-full text-sm">
							<thead>
								<tr className="border-b border-[var(--border)] bg-[var(--surface-2)]">
									<th className="text-left px-4 py-3 text-xs font-semibold text-[var(--ink-subtle)] uppercase tracking-wider">
										Type
									</th>
									<th className="text-left px-4 py-3 text-xs font-semibold text-[var(--ink-subtle)] uppercase tracking-wider">
										Destinataire
									</th>
									<th className="text-left px-4 py-3 text-xs font-semibold text-[var(--ink-subtle)] uppercase tracking-wider">
										Statut
									</th>
									<th className="text-left px-4 py-3 text-xs font-semibold text-[var(--ink-subtle)] uppercase tracking-wider">
										Date
									</th>
									<th className="text-left px-4 py-3 text-xs font-semibold text-[var(--ink-subtle)] uppercase tracking-wider">
										Erreur
									</th>
								</tr>
							</thead>
							<tbody>
								{(logs as Doc<"notificationLogs">[]).map((log, i) => (
									<motion.tr
										key={log._id}
										initial={{ opacity: 0 }}
										animate={{ opacity: 1 }}
										transition={{ delay: i * 0.02 }}
										className="border-b border-[var(--border)] last:border-0 hover:bg-[var(--surface-2)] transition-colors"
									>
										<td className="px-4 py-3 text-[var(--ink-muted)] font-medium">
											{TYPE_LABELS[log.type] ?? log.type}
										</td>
										<td className="px-4 py-3 text-[var(--ink)] font-mono text-xs max-w-[200px] truncate">
											{log.recipient}
										</td>
										<td className="px-4 py-3">
											<StatusBadge status={log.status} />
										</td>
										<td className="px-4 py-3 text-[var(--ink-muted)] text-xs">
											{new Date(log.sentAt).toLocaleString("fr-FR", {
												day: "2-digit",
												month: "2-digit",
												year: "2-digit",
												hour: "2-digit",
												minute: "2-digit",
											})}
										</td>
										<td className="px-4 py-3 text-xs text-red-400 max-w-[180px] truncate">
											{log.error ?? "—"}
										</td>
									</motion.tr>
								))}
							</tbody>
						</table>
					)}
				</div>
			</section>
		</div>
	);
}
