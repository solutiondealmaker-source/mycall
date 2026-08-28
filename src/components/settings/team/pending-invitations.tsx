"use client";

import { useMutation, useQuery } from "convex/react";
import { motion } from "framer-motion";
import { Loader2, Mail, RotateCw, X } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import { api } from "@/../convex/_generated/api";
import type { Id } from "@/../convex/_generated/dataModel";
import { Badge } from "@/components/ui/badge";
import { roleLabel } from "@/lib/roles";

function fmtDate(ms: number): string {
	return new Intl.DateTimeFormat("fr-FR", {
		day: "numeric",
		month: "short",
	}).format(new Date(ms));
}

export function PendingInvitations() {
	const invitations = useQuery(api.invitations.listPending);
	const revoke = useMutation(api.invitations.revoke);
	const resend = useMutation(api.invitations.resend);
	const [pending, setPending] = useState<string | null>(null);

	// Aucune invitation en attente : pas de bloc vide qui prend de la place.
	if (invitations === undefined || invitations.length === 0) return null;

	async function handleRevoke(id: Id<"invitations">, email: string) {
		if (!window.confirm(`Annuler l'invitation envoyée à ${email} ?`)) return;
		setPending(`revoke-${id}`);
		try {
			await revoke({ invitationId: id });
			toast.success("Invitation annulée");
		} catch (err) {
			toast.error(err instanceof Error ? err.message : "Erreur");
		} finally {
			setPending(null);
		}
	}

	async function handleResend(id: Id<"invitations">, email: string) {
		setPending(`resend-${id}`);
		try {
			await resend({ invitationId: id });
			toast.success(`Invitation renvoyée à ${email}`);
		} catch (err) {
			toast.error(err instanceof Error ? err.message : "Erreur");
		} finally {
			setPending(null);
		}
	}

	return (
		<motion.div
			initial={{ opacity: 0, y: 8 }}
			animate={{ opacity: 1, y: 0 }}
			transition={{ duration: 0.15 }}
			className="card-premium p-0 mb-6 overflow-hidden"
		>
			<div className="flex items-center gap-2 px-5 py-3 border-b border-[var(--border)] bg-[var(--surface-raised)]">
				<Mail className="w-4 h-4 text-[var(--brand)] shrink-0" />
				<h2 className="text-[11px] font-semibold text-[var(--ink-ghost)] uppercase tracking-wide">
					Invitations en attente ({invitations.length})
				</h2>
			</div>

			<div className="divide-y divide-[var(--border)]">
				{invitations.map((inv) => (
					<div
						key={inv._id}
						className="flex items-center justify-between gap-3 px-5 py-3"
					>
						<div className="min-w-0">
							<div className="flex items-center gap-2">
								<p className="text-sm font-medium text-[var(--ink)] truncate">
									{inv.email}
								</p>
								{inv.expired && (
									<Badge
										variant="secondary"
										className="text-[10px] px-1.5 h-4 border-0 bg-[var(--destructive-soft)] text-[var(--destructive)] shrink-0"
									>
										Expirée
									</Badge>
								)}
							</div>
							<p className="text-xs text-[var(--ink-ghost)]">
								{roleLabel(inv.role)} · envoyée le {fmtDate(inv.createdAt)}
								{!inv.expired && ` · expire le ${fmtDate(inv.expiresAt)}`}
							</p>
						</div>

						<div className="flex items-center gap-1 shrink-0">
							<button
								type="button"
								onClick={() => handleResend(inv._id, inv.email)}
								disabled={pending !== null}
								className="flex items-center justify-center w-7 h-7 rounded-[var(--radius-sm)] text-[var(--ink-ghost)] transition-colors duration-150 hover:text-[var(--brand)] hover:bg-[var(--brand-soft)] disabled:opacity-40"
								aria-label={`Renvoyer l'invitation à ${inv.email}`}
								title="Renvoyer"
							>
								{pending === `resend-${inv._id}` ? (
									<Loader2 className="w-3.5 h-3.5 animate-spin" />
								) : (
									<RotateCw className="w-3.5 h-3.5" />
								)}
							</button>
							<button
								type="button"
								onClick={() => handleRevoke(inv._id, inv.email)}
								disabled={pending !== null}
								className="flex items-center justify-center w-7 h-7 rounded-[var(--radius-sm)] text-[var(--ink-ghost)] transition-colors duration-150 hover:text-[var(--destructive)] hover:bg-[var(--destructive-soft)] disabled:opacity-40"
								aria-label={`Annuler l'invitation à ${inv.email}`}
								title="Annuler l'invitation"
							>
								{pending === `revoke-${inv._id}` ? (
									<Loader2 className="w-3.5 h-3.5 animate-spin" />
								) : (
									<X className="w-3.5 h-3.5" />
								)}
							</button>
						</div>
					</div>
				))}
			</div>
		</motion.div>
	);
}
