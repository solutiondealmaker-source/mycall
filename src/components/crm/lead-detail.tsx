"use client";

import { useMutation, useQuery } from "convex/react";
import { AnimatePresence, motion } from "framer-motion";
import {
	Calendar,
	Copy,
	Link2,
	Loader2,
	Phone,
	Plus,
	StickyNote,
	Trash2,
} from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { toast } from "sonner";
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
import { Skeleton } from "@/components/ui/skeleton";
import { cn, formatRelativeDate } from "@/lib/utils";
import { api } from "../../../convex/_generated/api";
import type { Doc, Id } from "../../../convex/_generated/dataModel";
import { LeadActivityStream } from "./lead-activity-stream";
import { LeadPipelineStepper } from "./lead-pipeline-stepper";
import { LeadStatusBadge } from "./lead-status-badge";
import { OutcomeModal } from "./outcome-modal";

type TabId = "parcours" | "appels" | "notes";

const TABS: { id: TabId; label: string }[] = [
	{ id: "parcours", label: "Parcours" },
	{ id: "appels", label: "Appels" },
	{ id: "notes", label: "Notes" },
];

// Rôles autorisés à supprimer (aligné sur isAdminUser côté serveur).
const ADMIN_ROLES = new Set(["admin", "ceo", "ops", "head_of_sales"]);

interface LeadDetailProps {
	leadId: Id<"leads">;
}

export function LeadDetail({ leadId }: LeadDetailProps) {
	const lead = useQuery(api.leads.getById, { id: leadId });
	const users = useQuery(api.leads.listUsers, {});
	const updateLead = useMutation(api.leads.update);
	const removeLead = useMutation(api.leads.remove);
	const me = useQuery(api.users.getMyProfile);
	const isAdmin =
		!!me && (me.isAdmin === true || ADMIN_ROLES.has(me.role ?? ""));
	const router = useRouter();
	const [activeTab, setActiveTab] = useState<TabId>("parcours");
	const [confirmDelete, setConfirmDelete] = useState(false);
	const [deleting, setDeleting] = useState(false);
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
						<Button
							variant="outline"
							size="sm"
							className="w-full justify-start gap-2 text-xs h-8"
							disabled
							title="Phase 11"
						>
							<Link2 className="w-3.5 h-3.5" />
							Transaction (Phase 11)
						</Button>
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
										leadId={leadId}
										onRecordOutcome={(id) => setOutcomeBookingId(id)}
									/>
								)}
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

// ─── Appels tab ───────────────────────────────────────────────────────────────

function AppelsTab({
	leadId,
	onRecordOutcome,
}: {
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
			<div className="flex flex-col items-center justify-center py-16 gap-2">
				<Calendar className="w-8 h-8 text-[var(--ink-ghost)]" />
				<p className="text-sm text-[var(--ink-muted)]">
					Aucun appel pour l'instant
				</p>
			</div>
		);
	}

	return (
		<div className="p-6 space-y-2">
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
