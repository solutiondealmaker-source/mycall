"use client";

import { useMutation, useQuery } from "convex/react";
import { motion } from "framer-motion";
import { CalendarX2, Loader2 } from "lucide-react";
import { use, useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { api } from "../../../../../../convex/_generated/api";

interface PageProps {
	params: Promise<{ token: string }>;
}

export default function CancelPage({ params }: PageProps) {
	const { token } = use(params);
	const booking = useQuery(api.bookings.getByCancelToken, { token });
	const cancelByToken = useMutation(api.bookings.cancelByToken);

	const [reason, setReason] = useState("");
	const [isCancelling, setIsCancelling] = useState(false);
	const [cancelled, setCancelled] = useState(false);

	// Loading
	if (booking === undefined) {
		return (
			<div className="flex items-center justify-center py-24 gap-3 text-[var(--ink-muted)]">
				<Loader2 className="w-5 h-5 animate-spin" />
				<span className="text-sm">Chargement...</span>
			</div>
		);
	}

	// Invalid token
	if (booking === null) {
		return (
			<InvalidState
				title="Lien invalide"
				description="Ce lien d'annulation est invalide ou a expiré."
			/>
		);
	}

	// Already cancelled
	if (booking.status === "cancelled" || cancelled) {
		return (
			<SuccessState
				icon={<CalendarX2 className="w-8 h-8 text-[var(--ink-ghost)]" />}
				title="Rendez-vous annulé"
				description="Cette réservation a bien été annulée."
			/>
		);
	}

	async function handleCancel() {
		setIsCancelling(true);
		try {
			await cancelByToken({ token, reason: reason.trim() || undefined });
			setCancelled(true);
		} catch (err) {
			const msg = err instanceof Error ? err.message : "Erreur inattendue";
			toast.error(msg);
		} finally {
			setIsCancelling(false);
		}
	}

	const dateLabel = new Intl.DateTimeFormat("fr-FR", {
		weekday: "long",
		day: "numeric",
		month: "long",
		year: "numeric",
		hour: "2-digit",
		minute: "2-digit",
	}).format(new Date(booking.startTime));

	return (
		<motion.div
			initial={{ opacity: 0, y: 12 }}
			animate={{ opacity: 1, y: 0 }}
			transition={{ duration: 0.15, ease: [0.16, 1, 0.3, 1] }}
			className="max-w-md mx-auto"
		>
			<div className="card-premium shadow-[var(--shadow-float)] p-8 space-y-6">
				{/* Header */}
				<div className="space-y-2">
					<div className="w-12 h-12 rounded-full bg-[var(--destructive-soft)] flex items-center justify-center">
						<CalendarX2 className="w-5 h-5 text-[var(--destructive)]" />
					</div>
					<h1
						className="text-xl font-bold text-[var(--ink)] tracking-tight"
						style={{ fontFamily: "var(--font-display)" }}
					>
						Annuler votre rendez-vous
					</h1>
					<p className="text-sm text-[var(--ink-muted)]">
						Votre rendez-vous du{" "}
						<span className="font-medium text-[var(--ink)] capitalize">
							{dateLabel}
						</span>{" "}
						sera annulé.
					</p>
				</div>

				{/* Reason textarea */}
				<div className="space-y-1.5">
					<label
						htmlFor="reason"
						className="block text-xs font-semibold uppercase tracking-wider text-[var(--ink-muted)]"
					>
						Raison (optionnel)
					</label>
					<textarea
						id="reason"
						value={reason}
						onChange={(e) => setReason(e.target.value)}
						placeholder="Expliquez pourquoi vous souhaitez annuler..."
						rows={3}
						className={cn(
							"w-full px-3 py-2 text-sm rounded-[var(--radius-md)] border resize-none",
							"bg-[var(--surface)] text-[var(--ink)] placeholder:text-[var(--ink-ghost)]",
							"border-[var(--border-strong)]",
							"focus:outline-none focus:ring-2 focus:ring-[var(--brand)]/20 focus:border-[var(--brand)]",
							"transition-all duration-150",
						)}
					/>
				</div>

				{/* CTA */}
				<div className="flex gap-3">
					<Button
						variant="ghost"
						className="flex-1"
						onClick={() => window.history.back()}
					>
						Retour
					</Button>
					<Button
						variant="destructive"
						className="flex-1 font-semibold"
						onClick={handleCancel}
						disabled={isCancelling}
					>
						{isCancelling ? (
							<>
								<Loader2 className="w-4 h-4 animate-spin mr-2" />
								Annulation...
							</>
						) : (
							"Annuler le RDV"
						)}
					</Button>
				</div>
			</div>
		</motion.div>
	);
}

// ─── Sub-states ───────────────────────────────────────────────────────────────

function InvalidState({
	title,
	description,
}: {
	title: string;
	description: string;
}) {
	return (
		<div className="max-w-md mx-auto text-center py-16">
			<p
				className="text-xl font-bold text-[var(--ink)] mb-2"
				style={{ fontFamily: "var(--font-display)" }}
			>
				{title}
			</p>
			<p className="text-sm text-[var(--ink-muted)]">{description}</p>
		</div>
	);
}

function SuccessState({
	icon,
	title,
	description,
}: {
	icon: React.ReactNode;
	title: string;
	description: string;
}) {
	return (
		<motion.div
			initial={{ opacity: 0, scale: 0.97 }}
			animate={{ opacity: 1, scale: 1 }}
			className="max-w-md mx-auto text-center py-16 flex flex-col items-center gap-4"
		>
			<div className="w-14 h-14 rounded-full bg-[var(--surface-muted)] flex items-center justify-center">
				{icon}
			</div>
			<p
				className="text-xl font-bold text-[var(--ink)]"
				style={{ fontFamily: "var(--font-display)" }}
			>
				{title}
			</p>
			<p className="text-sm text-[var(--ink-muted)]">{description}</p>
		</motion.div>
	);
}
