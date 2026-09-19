"use client";

import { useQuery } from "convex/react";
import { motion } from "framer-motion";
import { Bell, CheckCircle, Mail, XCircle } from "lucide-react";
import { api } from "@/../convex/_generated/api";
import type { Doc } from "@/../convex/_generated/dataModel";
import { PageHeader } from "@/components/dashboard/page-header";
import { EmailBrandingCard } from "@/components/settings/email-branding-card";
import { EmailTemplateEditor } from "@/components/settings/email-template-editor";
import { cn } from "@/lib/utils";

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
	email_invitation: "Invitation équipe",
	email_abandoned_lead: "Formulaire abandonné",
	email_sequence: "Séquence",
};

// ─── Composant principal ──────────────────────────────────────────────────────

export default function NotificationsSettingsPage() {
	const logs = useQuery(api.emailsInternal.listRecentLogs);

	return (
		<div className="animate-fade-in">
			<PageHeader
				title="Emails"
				description="Personnalise le texte des emails envoyés aux prospects, et consulte les derniers envois."
			/>

			<div className="mb-10">
				<EmailBrandingCard />
				<EmailTemplateEditor />
			</div>

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
