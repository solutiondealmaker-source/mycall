"use client";

import { useAction, useMutation, useQuery } from "convex/react";
import { AnimatePresence, motion } from "framer-motion";
import {
	Calendar,
	Copy,
	CreditCard,
	Loader2,
	Phone,
	Plus,
	StickyNote,
	Trash2,
} from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { toast } from "sonner";
import { AddFollowUpDialog } from "@/components/crm/add-follow-up-dialog";
import { BookForLeadDialog } from "@/components/crm/book-for-lead-dialog";
import { AvatarCircle } from "@/components/dashboard/avatar-circle";
import { Button } from "@/components/ui/button";
import {
	Dialog,
	DialogContent,
	DialogDescription,
	DialogFooter,
	DialogHeader,
	DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { canAdminister } from "@/lib/roles";
import { cn, formatRelativeDate } from "@/lib/utils";
import { api } from "../../../convex/_generated/api";
import type { Doc, Id } from "../../../convex/_generated/dataModel";
import { LeadActivityStream } from "./lead-activity-stream";
import { LeadPipelineStepper } from "./lead-pipeline-stepper";
import { LeadStatusBadge } from "./lead-status-badge";
import { OutcomeModal } from "./outcome-modal";

type TabId = "parcours" | "appels" | "relances" | "notes";

const TABS: { id: TabId; label: string }[] = [
	{ id: "parcours", label: "Parcours" },
	{ id: "appels", label: "Appels" },
	{ id: "relances", label: "Relances" },
	{ id: "notes", label: "Notes" },
];

interface LeadDetailProps {
	leadId: Id<"leads">;
}

export function LeadDetail({ leadId }: LeadDetailProps) {
	const lead = useQuery(api.leads.getById, { id: leadId });
	const users = useQuery(api.leads.listUsers, {});
	const updateLead = useMutation(api.leads.update);
	const removeLead = useMutation(api.leads.remove);
	const me = useQuery(api.users.getMyProfile);
	const isAdmin = canAdminister(me);
	const router = useRouter();
	const [activeTab, setActiveTab] = useState<TabId>("parcours");
	const [confirmDelete, setConfirmDelete] = useState(false);
	const [deleting, setDeleting] = useState(false);

	// Stripe — lien de paiement (visible seulement si configuré et actif)
	const stripeSettings = useQuery(
		api.stripe.getSettings,
		isAdmin ? {} : "skip",
	);
	const stripeReady = Boolean(
		stripeSettings?.stripeConfigured && stripeSettings?.stripeEnabled,
	);
	const createPaymentLink = useAction(api.stripe.createPaymentLink);
	const [payOpen, setPayOpen] = useState(false);
	const [payAmount, setPayAmount] = useState("");
	const [payLabel, setPayLabel] = useState("");
	const [payCount, setPayCount] = useState<number>(1);
	const [payLoading, setPayLoading] = useState(false);
	const [payUrl, setPayUrl] = useState<string | null>(null);

	async function handleCreatePaymentLink() {
		const euros = Number.parseFloat(payAmount.replace(",", "."));
		if (!Number.isFinite(euros) || euros < 1) {
			toast.error("Montant invalide (minimum 1 €)");
			return;
		}
		setPayLoading(true);
		try {
			const res = await createPaymentLink({
				leadId,
				amountCents: Math.round(euros * 100),
				label: payLabel.trim() || undefined,
				installments: payCount,
			});
			setPayUrl(res.url);
			toast.success("Lien de paiement généré");
		} catch (err) {
			toast.error(err instanceof Error ? err.message : "Génération impossible");
		} finally {
			setPayLoading(false);
		}
	}
	const [outcomeBookingId, setOutcomeBookingId] =
		useState<Id<"bookings"> | null>(null);

	async function handleDelete() {
		setDeleting(true);
		try {
			const res = await removeLead({ id: leadId });
			toast.success(
				"Lead supprimé" +
					(res.bookings > 0
						? ` (+ ${res.bookings} rendez-vous associé${res.bookings > 1 ? "s" : ""})`
						: ""),
			);
			router.push("/crm");
		} catch (err) {
			toast.error(
				err instanceof Error ? err.message : "Suppression impossible",
			);
			setDeleting(false);
		}
	}

	if (lead === undefined) {
		return <LeadDetailSkeleton />;
	}
	if (lead === null) {
		return (
			<div className="flex items-center justify-center h-64 text-[var(--ink-muted)]">
				Lead introuvable
			</div>
		);
	}

	const fullName =
		`${lead.firstName ?? ""} ${lead.lastName ?? ""}`.trim() || "Sans nom";

	type LeadStatus = NonNullable<typeof lead>["status"];

	async function handleStatusChange(newStatus: LeadStatus) {
		try {
			await updateLead({ id: leadId, status: newStatus });
			toast.success("Statut mis à jour");
		} catch {
			toast.error("Erreur lors de la mise à jour");
		}
	}

	function copyUrl() {
		navigator.clipboard.writeText(window.location.href).then(() => {
			toast.success("URL copiée");
		});
	}

	return (
		<>
			<div className="flex min-h-0 h-full">
				{/* ── Sidebar gauche ────────────────────────────────────────────────── */}
				<aside className="w-[320px] shrink-0 border-r border-[var(--border)] bg-[var(--surface)] flex flex-col gap-0 overflow-y-auto sticky top-0 h-full">
					{/* Header */}
					<div className="p-6 pb-4 border-b border-[var(--border)]">
						<div className="flex items-start gap-3 mb-4">
							<AvatarCircle name={fullName} size="lg" />
							<div className="flex-1 min-w-0">
								<h2 className="text-base font-[family-name:var(--font-display)] font-bold text-[var(--ink)] truncate">
									{fullName}
								</h2>
								<p className="text-xs text-[var(--ink-muted)] truncate mt-0.5">
									{lead.email ?? "—"}
								</p>
								<div className="mt-2">
									<LeadStatusBadge status={lead.status} />
								</div>
							</div>
						</div>

						{/* Pipeline stepper */}
						<LeadPipelineStepper status={lead.status} />

						{/* Copy URL */}
						<button
							type="button"
							onClick={copyUrl}
							className="mt-3 flex items-center gap-1.5 text-xs text-[var(--ink-muted)] hover:text-[var(--brand)] transition-colors"
						>
							<Copy className="w-3 h-3" />
							Copier le lien
						</button>
					</div>

					{/* Actions rapides */}
					<div className="p-4 border-b border-[var(--border)] space-y-1">
						<p className="text-[11px] font-semibold text-[var(--ink-ghost)] uppercase tracking-widest mb-2">
							Actions rapides
						</p>
						<Button
							variant="outline"
							size="sm"
							className="w-full justify-start gap-2 text-xs h-8"
							asChild
						>
							<a href={lead.phone ? `tel:${lead.phone}` : "#"}>
								<Phone className="w-3.5 h-3.5" />
								{lead.phone ?? "Appeler"}
							</a>
						</Button>
						<Button
							variant="outline"
							size="sm"
							className="w-full justify-start gap-2 text-xs h-8"
							onClick={() => setActiveTab("notes")}
						>
							<StickyNote className="w-3.5 h-3.5" />
							Ajouter une note
						</Button>
						{stripeReady && (
							<Button
								variant="outline"
								size="sm"
								className="w-full justify-start gap-2 text-xs h-8"
								onClick={() => setPayOpen(true)}
								title="Générer un lien de paiement Stripe"
							>
								<CreditCard className="w-3.5 h-3.5" />
								Lien de paiement
							</Button>
						)}
					</div>

					{/* Attribution */}
					<div className="p-4 border-b border-[var(--border)] space-y-3">
						<p className="text-[11px] font-semibold text-[var(--ink-ghost)] uppercase tracking-widest">
							Attribution
						</p>

						<div>
							<label
								htmlFor="lead-status"
								className="text-xs text-[var(--ink-muted)] block mb-1"
							>
								Statut
							</label>
							<select
								id="lead-status"
								value={lead.status}
								onChange={(e) =>
									handleStatusChange(e.target.value as (typeof lead)["status"])
								}
								className={cn(
									"w-full h-8 px-2.5 text-xs rounded-[var(--radius-sm)]",
									"border border-[var(--border)] bg-[var(--surface-raised)]",
									"text-[var(--ink)] focus:outline-none focus:ring-1 focus:ring-[var(--brand)]",
								)}
							>
								{(
									[
										"potentiel",
										"qualifie",
										"rdv_reserve",
										"tenu",
										"gagne",
										"perdu",
										"follow_up",
									] as const
								).map((s) => (
									<option key={s} value={s}>
										{s}
									</option>
								))}
							</select>
						</div>

						<div>
							<label
								htmlFor="lead-closer"
								className="text-xs text-[var(--ink-muted)] block mb-1"
							>
								Closer
							</label>
							<select
								id="lead-closer"
								value={lead.closerUserId ?? ""}
								onChange={async (e) => {
									try {
										await updateLead({
											id: leadId,
											closerUserId: e.target.value
												? (e.target.value as Id<"users">)
												: undefined,
										});
									} catch {
										toast.error("Erreur");
									}
								}}
								className={cn(
									"w-full h-8 px-2.5 text-xs rounded-[var(--radius-sm)]",
									"border border-[var(--border)] bg-[var(--surface-raised)]",
									"text-[var(--ink)] focus:outline-none focus:ring-1 focus:ring-[var(--brand)]",
								)}
							>
								<option value="">Non assigné</option>
								{users?.map((u) => (
									<option key={u._id} value={u._id}>
										{u.name ?? u.email}
									</option>
								))}
							</select>
						</div>

						<div>
							<label
								htmlFor="lead-setter"
								className="text-xs text-[var(--ink-muted)] block mb-1"
							>
								Setter
							</label>
							<select
								id="lead-setter"
								value={lead.setterUserId ?? ""}
								onChange={async (e) => {
									try {
										await updateLead({
											id: leadId,
											setterUserId: e.target.value
												? (e.target.value as Id<"users">)
												: undefined,
										});
									} catch {
										toast.error("Erreur");
									}
								}}
								className={cn(
									"w-full h-8 px-2.5 text-xs rounded-[var(--radius-sm)]",
									"border border-[var(--border)] bg-[var(--surface-raised)]",
									"text-[var(--ink)] focus:outline-none focus:ring-1 focus:ring-[var(--brand)]",
								)}
							>
								<option value="">Non assigné</option>
								{users?.map((u) => (
									<option key={u._id} value={u._id}>
										{u.name ?? u.email}
									</option>
								))}
							</select>
						</div>
					</div>

					{/* Détails source */}
					<div className="p-4 space-y-2">
						<p className="text-[11px] font-semibold text-[var(--ink-ghost)] uppercase tracking-widest mb-2">
							Source
						</p>
						{lead.tagSource && (
							<p className="text-xs text-[var(--ink-muted)]">
								<span className="text-[var(--ink-ghost)]">Source : </span>
								{lead.tagSource}
							</p>
						)}
						{/* Provenance de campagne (?utm_* sur le lien de réservation) */}
						{(
							[
								["Campagne", lead.utmSource],
								["Support", lead.utmMedium],
								["Nom campagne", lead.utmCampaign],
								["Mot-clé", lead.utmTerm],
								["Contenu", lead.utmContent],
							] as const
						).map(([label, value]) =>
							value ? (
								<p key={label} className="text-xs text-[var(--ink-muted)]">
									<span className="text-[var(--ink-ghost)]">{label} : </span>
									{value}
								</p>
							) : null,
						)}
						{lead.lastInteractionAt && (
							<p className="text-xs text-[var(--ink-muted)]">
								<span className="text-[var(--ink-ghost)]">
									Dernière activité :{" "}
								</span>
								{formatRelativeDate(lead.lastInteractionAt)}
							</p>
						)}
						{lead.montantContracte && (
							<p className="text-xs text-[var(--ink-muted)]">
								<span className="text-[var(--ink-ghost)]">Montant : </span>
								<span className="text-[var(--success)] font-medium">
									{(lead.montantContracte / 100).toFixed(0)} €
								</span>
							</p>
						)}
					</div>

					{/* Zone dangereuse — admin/direction uniquement */}
					{isAdmin && (
						<div className="mt-auto p-6 pt-4 border-t border-[var(--border)]">
							<Button
								variant="ghost"
								size="sm"
								onClick={() => setConfirmDelete(true)}
								className="w-full gap-1.5 text-xs text-[var(--destructive)] hover:text-[var(--destructive)] hover:bg-[var(--destructive-soft)]"
							>
								<Trash2 className="w-3.5 h-3.5" />
								Supprimer ce lead
							</Button>
						</div>
					)}
				</aside>

				{/* ── Main ──────────────────────────────────────────────────────────── */}
				<div className="flex-1 flex flex-col min-w-0 min-h-0">
					{/* Animated tabs */}
					<div className="px-6 pt-5 pb-0 border-b border-[var(--border)] bg-[var(--surface)]">
						<div className="inline-flex items-center rounded-xl border border-[var(--border)] bg-[var(--surface-raised)] p-1 shadow-sm gap-0.5">
							{TABS.map((tab) => (
								<button
									key={tab.id}
									type="button"
									onClick={() => setActiveTab(tab.id)}
									className={cn(
										"relative px-3 py-1.5 text-sm rounded-lg transition-colors duration-150 font-medium",
										activeTab === tab.id
											? "text-[var(--ink)]"
											: "text-[var(--ink-muted)] hover:text-[var(--ink)]",
									)}
								>
									{activeTab === tab.id && (
										<motion.div
											layoutId="lead-tab-indicator"
											className="absolute inset-0 rounded-lg bg-[var(--surface)] shadow-sm"
											transition={{
												type: "spring",
												stiffness: 500,
												damping: 35,
											}}
										/>
									)}
									<span className="relative z-10">{tab.label}</span>
								</button>
							))}
						</div>
					</div>

					{/* Tab content */}
					<div className="flex-1 overflow-y-auto">
						<AnimatePresence mode="wait">
							<motion.div
								key={activeTab}
								initial={{ opacity: 0, y: 4 }}
								animate={{ opacity: 1, y: 0 }}
								exit={{ opacity: 0 }}
								transition={{ duration: 0.15 }}
								className="h-full"
							>
								{activeTab === "parcours" && (
									<LeadActivityStream leadId={leadId} />
								)}
								{activeTab === "appels" && (
									<AppelsTab
										lead={lead}
										leadId={leadId}
										onRecordOutcome={(id) => setOutcomeBookingId(id)}
									/>
								)}
								{activeTab === "relances" && <RelancesTab leadId={leadId} />}
								{activeTab === "notes" && <NotesTab leadId={leadId} />}
							</motion.div>
						</AnimatePresence>
					</div>
				</div>
			</div>

			{/* Outcome modal */}
			<OutcomeModal
				bookingId={outcomeBookingId}
				open={outcomeBookingId !== null}
				onOpenChange={(o) => {
					if (!o) setOutcomeBookingId(null);
				}}
			/>

			{/* Lien de paiement Stripe */}
			<Dialog
				open={payOpen}
				onOpenChange={(o) => {
					setPayOpen(o);
					if (!o) {
						setPayUrl(null);
						setPayAmount("");
						setPayLabel("");
					}
				}}
			>
				<DialogContent className="max-w-md">
					<DialogHeader>
						<DialogTitle>Lien de paiement</DialogTitle>
						<DialogDescription>
							Génère un lien Stripe à envoyer à {fullName}. Le lien n'expire
							pas.
						</DialogDescription>
					</DialogHeader>

					{payUrl ? (
						<div className="space-y-3">
							<div className="rounded-[var(--radius-md)] border border-[var(--border)] bg-[var(--surface-raised)] p-3">
								<p className="text-xs text-[var(--ink-muted)] break-all">
									{payUrl}
								</p>
							</div>
							<Button
								className="w-full"
								onClick={() => {
									navigator.clipboard.writeText(payUrl);
									toast.success("Lien copié");
								}}
							>
								Copier le lien
							</Button>
							<p className="text-xs text-[var(--ink-ghost)]">
								Le lien a été ajouté aux notes du lead.
							</p>
						</div>
					) : (
						<div className="space-y-3">
							<div className="grid grid-cols-[1fr_120px] gap-3">
								<div className="space-y-1.5">
									<Label htmlFor="pay-amount" className="text-xs">
										{payCount > 1 ? "Montant par mois (€)" : "Montant (€)"}
									</Label>
									<Input
										id="pay-amount"
										inputMode="decimal"
										value={payAmount}
										onChange={(e) => setPayAmount(e.target.value)}
										placeholder="1500"
										className="h-10"
									/>
								</div>
								<div className="space-y-1.5">
									<Label htmlFor="pay-count" className="text-xs">
										En combien de fois
									</Label>
									<Select
										value={String(payCount)}
										onValueChange={(v) => setPayCount(Number(v))}
									>
										<SelectTrigger id="pay-count" className="h-10 w-full">
											<SelectValue />
										</SelectTrigger>
										<SelectContent>
											{[1, 2, 3, 4, 6, 10, 12].map((n) => (
												<SelectItem key={n} value={String(n)}>
													{n === 1 ? "1 fois" : `${n} fois`}
												</SelectItem>
											))}
										</SelectContent>
									</Select>
								</div>
							</div>

							{payCount > 1 && (
								<p className="text-xs text-[var(--ink-muted)] leading-relaxed rounded-[var(--radius-sm)] bg-[var(--surface-raised)] px-3 py-2">
									Prélèvement mensuel automatique.{" "}
									<strong className="text-[var(--ink)]">
										Total&nbsp;:{" "}
										{payAmount.trim()
											? `${(Number.parseFloat(payAmount.replace(",", ".")) * payCount || 0).toFixed(2)} €`
											: "—"}
									</strong>{" "}
									sur {payCount} mois. Le dernier prélèvement clôt l'abonnement
									automatiquement.
								</p>
							)}
							<div className="space-y-1.5">
								<Label htmlFor="pay-label" className="text-xs">
									Intitulé (optionnel)
								</Label>
								<Input
									id="pay-label"
									value={payLabel}
									onChange={(e) => setPayLabel(e.target.value)}
									placeholder="Accompagnement 3 mois"
									className="h-10"
								/>
							</div>
							<Button
								className="w-full"
								onClick={handleCreatePaymentLink}
								disabled={payLoading || !payAmount.trim()}
								style={{ background: "var(--grad-brand)" }}
							>
								{payLoading ? (
									<Loader2 className="w-4 h-4 animate-spin" />
								) : (
									"Générer le lien"
								)}
							</Button>
						</div>
					)}
				</DialogContent>
			</Dialog>

			{/* Confirmation de suppression */}
			<Dialog open={confirmDelete} onOpenChange={setConfirmDelete}>
				<DialogContent className="max-w-md">
					<DialogHeader>
						<DialogTitle>Supprimer {fullName} ?</DialogTitle>
						<DialogDescription>
							Cette action est <strong>irréversible</strong>. La fiche sera
							supprimée, ainsi que ses rendez-vous, notes et relances associés.
						</DialogDescription>
					</DialogHeader>
					<DialogFooter>
						<Button
							variant="ghost"
							onClick={() => setConfirmDelete(false)}
							disabled={deleting}
						>
							Annuler
						</Button>
						<Button
							variant="destructive"
							onClick={handleDelete}
							disabled={deleting}
						>
							{deleting ? (
								<Loader2 className="w-4 h-4 animate-spin" />
							) : (
								"Supprimer définitivement"
							)}
						</Button>
					</DialogFooter>
				</DialogContent>
			</Dialog>
		</>
	);
}

// ─── Relances tab ─────────────────────────────────────────────────────────────

const FOLLOWUP_STATUS: Record<string, { label: string; className: string }> = {
	pending: {
		label: "À faire",
		className: "bg-[var(--warning-soft)] text-[var(--warning)]",
	},
	done: {
		label: "Faite",
		className: "bg-[var(--success-soft)] text-[var(--success)]",
	},
	missed: {
		label: "Manquée",
		className: "bg-[var(--destructive-soft)] text-[var(--destructive)]",
	},
	cancelled: {
		label: "Annulée",
		className: "bg-[var(--surface-muted)] text-[var(--ink-ghost)]",
	},
};

const CHANNEL_LABEL: Record<string, string> = {
	call: "Appel",
	sms: "SMS",
	email: "Email",
	other: "Autre",
};

function RelancesTab({ leadId }: { leadId: Id<"leads"> }) {
	const followUps = useQuery(api.leads.listFollowUpsByLead, { leadId });
	const complete = useMutation(api.leads.completeFollowUp);
	const cancel = useMutation(api.leads.cancelFollowUp);

	if (followUps === undefined) {
		return <p className="text-sm text-[var(--ink-ghost)]">Chargement…</p>;
	}
	if (followUps.length === 0) {
		return (
			<div className="py-10 flex flex-col items-center gap-4 text-center">
				<div>
					<p className="text-sm text-[var(--ink-muted)]">
						Aucune relance planifiée
					</p>
					<p className="text-xs text-[var(--ink-ghost)] mt-1">
						Planifie-la ici, ou enregistre l'issue d'un appel en « Follow-up ».
					</p>
				</div>
				<AddFollowUpDialog leadId={leadId} />
			</div>
		);
	}

	return (
		<>
			<div className="flex justify-end pb-3">
				<AddFollowUpDialog leadId={leadId} />
			</div>
			<ul className="flex flex-col divide-y divide-[var(--border)]">
				{followUps.map((f) => {
					const st = FOLLOWUP_STATUS[f.status] ?? FOLLOWUP_STATUS.pending;
					const overdue = f.status === "pending" && f.dueAt < Date.now();
					return (
						<li
							key={f._id}
							className="py-3 flex items-start justify-between gap-3"
						>
							<div className="min-w-0">
								<div className="flex items-center gap-2 flex-wrap">
									<span
										className={cn(
											"text-[11px] font-medium px-2 py-0.5 rounded-full",
											st.className,
										)}
									>
										{st.label}
									</span>
									<span className="text-xs text-[var(--ink-muted)]">
										{CHANNEL_LABEL[f.channel] ?? f.channel}
									</span>
									<span
										className={cn(
											"text-xs",
											overdue
												? "text-[var(--destructive)] font-medium"
												: "text-[var(--ink-muted)]",
										)}
									>
										{new Intl.DateTimeFormat("fr-FR", {
											day: "numeric",
											month: "short",
											hour: "2-digit",
											minute: "2-digit",
										}).format(new Date(f.dueAt))}
										{overdue ? " — en retard" : ""}
									</span>
								</div>
								<p className="text-sm text-[var(--ink)] mt-1">{f.reason}</p>
								{f.note && (
									<p className="text-xs text-[var(--ink-muted)] mt-0.5">
										{f.note}
									</p>
								)}
								{f.closerName && (
									<p className="text-[11px] text-[var(--ink-ghost)] mt-0.5">
										{f.closerName}
									</p>
								)}
							</div>

							{f.status === "pending" && (
								<div className="flex gap-1.5 shrink-0">
									<Button
										variant="outline"
										size="sm"
										className="h-7 text-xs"
										onClick={async () => {
											try {
												await complete({ followUpId: f._id });
												toast.success("Relance marquée faite");
											} catch (err) {
												toast.error(
													err instanceof Error ? err.message : "Erreur",
												);
											}
										}}
									>
										Faite
									</Button>
									<Button
										variant="ghost"
										size="sm"
										className="h-7 text-xs text-[var(--ink-muted)]"
										onClick={async () => {
											try {
												await cancel({ followUpId: f._id });
												toast.success("Relance annulée");
											} catch (err) {
												toast.error(
													err instanceof Error ? err.message : "Erreur",
												);
											}
										}}
									>
										Annuler
									</Button>
								</div>
							)}
						</li>
					);
				})}
			</ul>
		</>
	);
}

// ─── Appels tab ───────────────────────────────────────────────────────────────

function AppelsTab({
	lead,
	leadId,
	onRecordOutcome,
}: {
	lead: Doc<"leads">;
	leadId: Id<"leads">;
	onRecordOutcome: (id: Id<"bookings">) => void;
}) {
	const bookings = useQuery(api.bookings.listByLead, { leadId });

	if (bookings === undefined) {
		return (
			<div className="p-6 space-y-3">
				{Array.from({ length: 3 }).map((_, i) => (
					<Skeleton
						key={i}
						className="h-14 w-full rounded-[var(--radius-md)]"
					/>
				))}
			</div>
		);
	}
	if (bookings.length === 0) {
		return (
			<div className="flex flex-col items-center justify-center py-16 gap-4">
				<Calendar className="w-8 h-8 text-[var(--ink-ghost)]" />
				<p className="text-sm text-[var(--ink-muted)]">
					Aucun appel pour l'instant
				</p>
				<BookForLeadDialog lead={lead} />
			</div>
		);
	}

	return (
		<div className="p-6 space-y-2">
			<div className="flex justify-end pb-1">
				<BookForLeadDialog lead={lead} />
			</div>
			{(bookings as Doc<"bookings">[]).map((b) => (
				<div
					key={b._id}
					className="flex items-center gap-4 p-3 rounded-[var(--radius-md)] border border-[var(--border)] hover:bg-[var(--surface-raised)] transition-colors"
				>
					<div className="flex-1 min-w-0">
						<p className="text-sm font-medium text-[var(--ink)] truncate">
							{new Intl.DateTimeFormat("fr-FR", {
								day: "numeric",
								month: "short",
								hour: "2-digit",
								minute: "2-digit",
							}).format(new Date(b.startTime))}
						</p>
						<p className="text-xs text-[var(--ink-muted)]">
							{b.eventSlug} · {b.tenue}
							{b.issue !== "en_attente" && ` · ${b.issue}`}
						</p>
					</div>
					<Button
						variant="outline"
						size="sm"
						className="text-xs h-7 shrink-0"
						onClick={() => onRecordOutcome(b._id)}
					>
						Résultat
					</Button>
				</div>
			))}
		</div>
	);
}

// ─── Notes tab ────────────────────────────────────────────────────────────────

function NotesTab({ leadId }: { leadId: Id<"leads"> }) {
	const notes = useQuery(api.leads.listNotesByLead, { leadId });
	const addNote = useMutation(api.leads.addNote);
	const deleteNote = useMutation(api.leads.deleteNote);
	const [body, setBody] = useState("");
	const [saving, setSaving] = useState(false);

	async function handleAdd() {
		if (!body.trim()) return;
		setSaving(true);
		try {
			await addNote({ leadId, body });
			setBody("");
			toast.success("Note ajoutée");
		} catch {
			toast.error("Erreur lors de l'ajout");
		} finally {
			setSaving(false);
		}
	}

	return (
		<div className="p-6 space-y-4">
			{/* Add note */}
			<div className="space-y-2">
				<textarea
					rows={3}
					placeholder="Ajouter une note..."
					value={body}
					onChange={(e) => setBody(e.target.value)}
					className={cn(
						"w-full px-3 py-2.5 text-sm rounded-[var(--radius-md)] resize-none",
						"border border-[var(--border)] bg-[var(--surface-raised)]",
						"text-[var(--ink)] placeholder:text-[var(--ink-ghost)]",
						"focus:outline-none focus:ring-2 focus:ring-[var(--brand-glow)] focus:border-[var(--brand)]",
					)}
				/>
				<div className="flex justify-end">
					<Button
						size="sm"
						className="gap-1.5"
						disabled={!body.trim() || saving}
						onClick={handleAdd}
					>
						<Plus className="w-3.5 h-3.5" />
						Ajouter
					</Button>
				</div>
			</div>

			{/* Notes list */}
			{notes === undefined ? (
				<div className="space-y-2">
					{Array.from({ length: 2 }).map((_, i) => (
						<Skeleton key={i} className="h-16 w-full rounded" />
					))}
				</div>
			) : notes.length === 0 ? (
				<p className="text-sm text-[var(--ink-muted)] text-center py-8">
					Aucune note
				</p>
			) : (
				<div className="space-y-2">
					{notes.map((note) => (
						<div
							key={note._id}
							className="p-3 rounded-[var(--radius-md)] border border-[var(--border)] bg-[var(--surface-raised)] group"
						>
							<p className="text-sm text-[var(--ink)] whitespace-pre-wrap">
								{note.body}
							</p>
							<div className="flex items-center justify-between mt-2">
								<span className="text-[11px] text-[var(--ink-ghost)]">
									{note.authorName} · {formatRelativeDate(note.createdAt)}
								</span>
								<button
									type="button"
									onClick={() =>
										deleteNote({ noteId: note._id }).catch(() =>
											toast.error("Erreur"),
										)
									}
									className="opacity-0 group-hover:opacity-100 transition-opacity p-1 hover:text-[var(--destructive)] text-[var(--ink-muted)]"
								>
									<Trash2 className="w-3 h-3" />
								</button>
							</div>
						</div>
					))}
				</div>
			)}
		</div>
	);
}

// ─── Skeleton ─────────────────────────────────────────────────────────────────

function LeadDetailSkeleton() {
	return (
		<div className="flex h-full">
			<div className="w-[320px] border-r border-[var(--border)] p-6 space-y-4">
				<div className="flex gap-3">
					<Skeleton className="w-12 h-12 rounded-full" />
					<div className="space-y-2 flex-1">
						<Skeleton className="h-4 w-36 rounded" />
						<Skeleton className="h-3 w-48 rounded" />
					</div>
				</div>
				<Skeleton className="h-8 w-full rounded" />
				<div className="space-y-2">
					<Skeleton className="h-8 w-full rounded" />
					<Skeleton className="h-8 w-full rounded" />
				</div>
			</div>
			<div className="flex-1 p-6 space-y-4">
				<Skeleton className="h-10 w-72 rounded-xl" />
				<div className="space-y-3">
					{Array.from({ length: 5 }).map((_, i) => (
						<div key={i} className="flex gap-3">
							<Skeleton className="w-7 h-7 rounded-full" />
							<div className="space-y-1.5 flex-1">
								<Skeleton className="h-3.5 w-40 rounded" />
								<Skeleton className="h-3 w-24 rounded" />
							</div>
						</div>
					))}
				</div>
			</div>
		</div>
	);
}
