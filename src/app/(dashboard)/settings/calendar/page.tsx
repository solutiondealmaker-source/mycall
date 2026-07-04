"use client";

import { useQuery } from "convex/react";
import { AnimatePresence, motion } from "framer-motion";
import {
	AlertCircle,
	Calendar,
	CheckCircle2,
	Link2,
	Shield,
	Wifi,
	WifiOff,
} from "lucide-react";
import { useSearchParams } from "next/navigation";
import { useEffect, useState } from "react";
import { PageHeader } from "@/components/dashboard/page-header";
import { AddGoogleButton } from "@/components/settings/calendar/add-google-button";
import { ConflictCheckList } from "@/components/settings/calendar/conflict-check-list";
import { GoogleAccountCard } from "@/components/settings/calendar/google-account-card";
import { WriterSelector } from "@/components/settings/calendar/writer-selector";
import { cn } from "@/lib/utils";
import { api } from "../../../../../convex/_generated/api";
import type { Id } from "../../../../../convex/_generated/dataModel";

// ─── Types ────────────────────────────────────────────────────────────────────

type AccountSummary = {
	_id: Id<"userGoogleAccounts">;
	googleEmail: string;
	connectedAt: number;
};

// ─── Toast simple ─────────────────────────────────────────────────────────────

function useGoogleToast() {
	const searchParams = useSearchParams();
	const [toast, setToast] = useState<{
		type: "success" | "error";
		message: string;
	} | null>(null);

	useEffect(() => {
		const google = searchParams.get("google");
		const reason = searchParams.get("reason");
		if (google === "connected") {
			setToast({
				type: "success",
				message: "Compte Google connecté avec succès !",
			});
		} else if (google === "error") {
			const msg =
				reason === "state"
					? "Lien expiré ou invalide. Merci de réessayer."
					: reason === "missing_code"
						? "Flux OAuth incomplet. Merci de réessayer."
						: reason
							? decodeURIComponent(reason).slice(0, 120)
							: "Erreur lors de la connexion Google.";
			setToast({ type: "error", message: msg });
		}
		if (google) {
			// Nettoyer les query params sans rechargement
			const url = new URL(window.location.href);
			url.searchParams.delete("google");
			url.searchParams.delete("reason");
			window.history.replaceState({}, "", url.toString());
		}
	}, [searchParams]);

	return { toast, clearToast: () => setToast(null) };
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function CalendarSettingsPage() {
	const accounts = useQuery(api.googleAccount.listAccountsForUser) as
		| AccountSummary[]
		| undefined;
	const settings = useQuery(api.userCalendarSettings.getMyCalendarSettings);
	const { toast, clearToast } = useGoogleToast();

	const isLoading = accounts === undefined || settings === undefined;
	const hasAccounts = (accounts?.length ?? 0) > 0;

	// Effacer le toast après 5s
	useEffect(() => {
		if (!toast) return;
		const t = setTimeout(clearToast, 5000);
		return () => clearTimeout(t);
	}, [toast, clearToast]);

	return (
		<div className="animate-fade-in max-w-2xl">
			<PageHeader
				title="Calendrier Google"
				description="Connectez vos comptes Google pour créer automatiquement des événements Google Meet lors des réservations."
				actions={<AddGoogleButton />}
			/>

			{/* Toast notification */}
			<AnimatePresence>
				{toast && (
					<motion.div
						initial={{ opacity: 0, y: -8 }}
						animate={{ opacity: 1, y: 0 }}
						exit={{ opacity: 0, y: -8 }}
						transition={{ duration: 0.2 }}
						className={cn(
							"flex items-start gap-3 px-4 py-3 rounded-[var(--radius-sm)] mb-6 text-sm",
							toast.type === "success"
								? "bg-[var(--success-soft)] text-[var(--success)] ring-1 ring-[var(--success)]"
								: "bg-[var(--destructive-soft)] text-[var(--destructive)] ring-1 ring-[var(--destructive)]",
						)}
					>
						{toast.type === "success" ? (
							<CheckCircle2 className="w-4 h-4 mt-0.5 shrink-0" />
						) : (
							<AlertCircle className="w-4 h-4 mt-0.5 shrink-0" />
						)}
						<p>{toast.message}</p>
					</motion.div>
				)}
			</AnimatePresence>

			{/* Loading skeleton */}
			{isLoading && (
				<div className="space-y-4">
					{[1, 2].map((i) => (
						<div
							key={i}
							className="h-16 rounded-[var(--radius)] bg-[var(--surface-raised)] animate-pulse"
						/>
					))}
				</div>
			)}

			{/* État vide */}
			{!isLoading && !hasAccounts && (
				<motion.div
					initial={{ opacity: 0, y: 8 }}
					animate={{ opacity: 1, y: 0 }}
					transition={{ duration: 0.15 }}
					className="card-premium flex flex-col items-center justify-center py-12 gap-4 text-center"
				>
					<div className="w-12 h-12 rounded-full bg-[var(--surface-muted)] flex items-center justify-center">
						<Calendar className="w-6 h-6 text-[var(--ink-ghost)]" />
					</div>
					<div>
						<p className="text-sm font-medium text-[var(--ink)]">
							Aucun compte Google connecté
						</p>
						<p className="mt-1 text-sm text-[var(--ink-muted)]">
							Connectez un compte Google pour créer des événements Calendar avec
							un lien Meet automatique.
						</p>
					</div>
					<AddGoogleButton />
				</motion.div>
			)}

			{/* Comptes connectés */}
			{!isLoading && hasAccounts && (
				<div className="space-y-6">
					{/* Liste des comptes */}
					<div className="space-y-3">
						<h2 className="text-xs font-semibold uppercase tracking-wide text-[var(--ink-muted)]">
							Comptes connectés
						</h2>
						<AnimatePresence mode="popLayout">
							{accounts?.map((acc) => (
								<GoogleAccountCard
									key={acc._id}
									accountId={acc._id}
									email={acc.googleEmail}
									connectedAt={acc.connectedAt}
									isWriter={acc._id === settings?.writerAccountId}
									writerCalendarSummary={
										acc._id === settings?.writerAccountId
											? settings?.writerCalendarSummary
											: null
									}
								/>
							))}
						</AnimatePresence>
					</div>

					{/* Configuration writer */}
					<div className="card-premium space-y-6">
						<div className="flex items-center gap-2 mb-4">
							<Link2 className="w-4 h-4 text-[var(--brand)]" />
							<h2 className="text-sm font-semibold text-[var(--ink)]">
								Configuration calendrier
							</h2>
						</div>

						<WriterSelector
							currentWriterAccountId={settings?.writerAccountId ?? null}
							currentWriterCalendarId={settings?.writerCalendarId ?? null}
							currentWriterCalendarSummary={
								settings?.writerCalendarSummary ?? null
							}
						/>

						<div className="h-px bg-[var(--border)]" />

						<ConflictCheckList
							conflictCheckCalendars={settings?.conflictCheckCalendars ?? []}
						/>
					</div>

					{/* Statut sync */}
					<div className="card-premium">
						<div className="flex items-center gap-2 mb-3">
							<Wifi className="w-4 h-4 text-[var(--brand)]" />
							<h2 className="text-sm font-semibold text-[var(--ink)]">
								Statut synchronisation
							</h2>
						</div>
						<div className="space-y-2 text-sm text-[var(--ink-muted)]">
							<div className="flex items-start gap-2">
								<CheckCircle2 className="w-4 h-4 text-[var(--success)] mt-0.5 shrink-0" />
								<p>
									Les busy blocks sont synchronisés automatiquement via push
									webhooks Google.
								</p>
							</div>
							<div className="flex items-start gap-2">
								<Shield className="w-4 h-4 text-[var(--brand)] mt-0.5 shrink-0" />
								<p>
									Un full-resync quotidien à 04h15 UTC corrige les éventuelles
									dérives.
								</p>
							</div>
							<div className="flex items-start gap-2">
								<WifiOff className="w-4 h-4 text-[var(--ink-ghost)] mt-0.5 shrink-0" />
								<p className="text-[var(--ink-ghost)]">
									Si votre channel expire, les créneaux ne seront plus bloqués
									automatiquement. Reconnectez le compte pour relancer la sync.
								</p>
							</div>
						</div>
					</div>
				</div>
			)}
		</div>
	);
}
