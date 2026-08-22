"use client";

import { useMutation, useQuery } from "convex/react";
import { motion } from "framer-motion";
import { Download, Loader2, Trash2, UserCog, X } from "lucide-react";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { api } from "@/../convex/_generated/api";
import type { Id } from "@/../convex/_generated/dataModel";
import { Button } from "@/components/ui/button";
import {
	Dialog,
	DialogContent,
	DialogDescription,
	DialogFooter,
	DialogHeader,
	DialogTitle,
} from "@/components/ui/dialog";
import { cn } from "@/lib/utils";

// Rôles autorisés à supprimer (aligné sur isAdminUser côté serveur).
const ADMIN_ROLES = new Set(["admin", "ceo", "ops", "head_of_sales"]);

interface LeadsBulkActionsBarProps {
	selectedCount: number;
	onClearSelection: () => void;
	selectedIds?: Set<string>;
}

export function LeadsBulkActionsBar({
	selectedCount,
	onClearSelection,
	selectedIds,
}: LeadsBulkActionsBarProps) {
	const me = useQuery(api.users.getMyProfile);
	const isAdmin =
		!!me && (me.isAdmin === true || ADMIN_ROLES.has(me.role ?? ""));

	const removeMany = useMutation(api.leads.removeMany);
	const assignMany = useMutation(api.leads.assignMany);
	const users = useQuery(api.leads.listUsers, {});
	const [confirmOpen, setConfirmOpen] = useState(false);
	const [deleting, setDeleting] = useState(false);
	const [assignOpen, setAssignOpen] = useState(false);
	const [assignTo, setAssignTo] = useState("");
	const [assigning, setAssigning] = useState(false);
	const [exporting, setExporting] = useState(false);

	const ids = Array.from(selectedIds ?? []) as Id<"leads">[];

	// L'export lit les données à la demande (query "on-demand" via le client).
	const exportRows = useQuery(
		api.leads.exportByIds,
		exporting && ids.length > 0 ? { ids } : "skip",
	);

	// Dès que les données arrivent, on déclenche le téléchargement.
	useEffect(() => {
		if (!exporting || exportRows === undefined) return;
		try {
			if (exportRows.length === 0) {
				toast.error("Aucune donnée exportable");
				return;
			}
			const headers = Object.keys(exportRows[0] as Record<string, unknown>);
			const escape = (v: unknown) => {
				const s = String(v ?? "");
				return /[",;\n]/.test(s) ? `"${s.replaceAll('"', '""')}"` : s;
			};
			const csv = [
				headers.join(";"),
				...exportRows.map((r) =>
					headers
						.map((h) => escape((r as Record<string, unknown>)[h]))
						.join(";"),
				),
			].join("\n");

			// BOM UTF-8 pour qu'Excel affiche correctement les accents.
			const blob = new Blob([`﻿${csv}`], {
				type: "text/csv;charset=utf-8;",
			});
			const url = URL.createObjectURL(blob);
			const a = document.createElement("a");
			a.href = url;
			a.download = `leads-${new Date().toISOString().slice(0, 10)}.csv`;
			a.click();
			URL.revokeObjectURL(url);
			toast.success(`${exportRows.length} lead(s) exporté(s)`);
		} finally {
			setExporting(false);
		}
	}, [exporting, exportRows]);

	function handleExport() {
		if (ids.length === 0) return;
		setExporting(true);
	}

	async function handleAssign() {
		setAssigning(true);
		try {
			const res = await assignMany({
				ids,
				closerUserId: assignTo ? (assignTo as Id<"users">) : undefined,
			});
			toast.success(`${res.updated} lead(s) réassigné(s)`);
			setAssignOpen(false);
			onClearSelection();
		} catch (err) {
			toast.error(
				err instanceof Error ? err.message : "Assignation impossible",
			);
		} finally {
			setAssigning(false);
		}
	}

	async function handleDelete() {
		if (!selectedIds || selectedIds.size === 0) return;
		setDeleting(true);
		try {
			const res = await removeMany({
				ids: Array.from(selectedIds) as Id<"leads">[],
			});
			toast.success(
				`${res.deleted} lead${res.deleted > 1 ? "s" : ""} supprimé${res.deleted > 1 ? "s" : ""}` +
					(res.bookings > 0
						? ` (+ ${res.bookings} rendez-vous associé${res.bookings > 1 ? "s" : ""})`
						: ""),
			);
			setConfirmOpen(false);
			onClearSelection();
		} catch (err) {
			toast.error(
				err instanceof Error ? err.message : "Suppression impossible",
			);
		} finally {
			setDeleting(false);
		}
	}

	// Pas d'AnimatePresence/exit : une animation de sortie qui ne se termine pas
	// laisserait la barre affichée en permanence.
	if (selectedCount === 0) return null;

	return (
		<>
			<motion.div
				initial={{ opacity: 0, y: 16, scale: 0.97 }}
				animate={{ opacity: 1, y: 0, scale: 1 }}
				transition={{ duration: 0.15, ease: [0.16, 1, 0.3, 1] }}
				className={cn(
					"fixed bottom-6 left-1/2 -translate-x-1/2 z-50",
					"surface-glass rounded-[var(--radius-lg)]",
					"shadow-[var(--shadow-pop)]",
					"flex items-center gap-3 px-4 py-2.5",
				)}
			>
				{/* Count label */}
				<span className="text-sm font-medium text-[var(--ink)] whitespace-nowrap">
					<span className="text-[var(--brand)] font-semibold">
						{selectedCount}
					</span>{" "}
					contact{selectedCount > 1 ? "s" : ""} sélectionné
					{selectedCount > 1 ? "s" : ""}
				</span>

				<div className="w-px h-4 bg-[var(--border)]" />

				{/* Actions */}
				<div className="flex items-center gap-1.5">
					{isAdmin && (
						<Button
							variant="ghost"
							size="sm"
							onClick={() => setAssignOpen(true)}
							className="gap-1.5 h-7 text-xs"
							title="Assigner un closer"
						>
							<UserCog className="w-3.5 h-3.5" />
							Assigner
						</Button>
					)}
					<Button
						variant="ghost"
						size="sm"
						onClick={handleExport}
						disabled={exporting}
						className="gap-1.5 h-7 text-xs"
						title="Exporter la sélection en CSV"
					>
						{exporting ? (
							<Loader2 className="w-3.5 h-3.5 animate-spin" />
						) : (
							<Download className="w-3.5 h-3.5" />
						)}
						Exporter
					</Button>

					{isAdmin && (
						<Button
							variant="ghost"
							size="sm"
							onClick={() => setConfirmOpen(true)}
							className="gap-1.5 h-7 text-xs text-[var(--destructive)] hover:text-[var(--destructive)] hover:bg-[var(--destructive-soft)]"
							title="Supprimer définitivement"
						>
							<Trash2 className="w-3.5 h-3.5" />
							Supprimer
						</Button>
					)}
				</div>

				<div className="w-px h-4 bg-[var(--border)]" />

				{/* Cancel */}
				<Button
					variant="ghost"
					size="sm"
					onClick={onClearSelection}
					className="h-7 w-7 p-0 text-[var(--ink-muted)] hover:text-[var(--destructive)]"
				>
					<X className="w-3.5 h-3.5" />
				</Button>
			</motion.div>

			{/* Assignation groupée */}
			<Dialog open={assignOpen} onOpenChange={setAssignOpen}>
				<DialogContent className="max-w-md">
					<DialogHeader>
						<DialogTitle>
							Assigner {selectedCount} lead{selectedCount > 1 ? "s" : ""}
						</DialogTitle>
						<DialogDescription>
							Choisis le closer responsable de ces contacts.
						</DialogDescription>
					</DialogHeader>
					<select
						value={assignTo}
						onChange={(e) => setAssignTo(e.target.value)}
						className={cn(
							"w-full h-10 px-3 text-sm rounded-[var(--radius-md)]",
							"border border-[var(--border-strong)] bg-[var(--surface)] text-[var(--ink)]",
							"focus:outline-none focus:ring-2 focus:ring-[var(--brand)]/20",
						)}
					>
						<option value="">— Aucun closer —</option>
						{users?.map((u) => (
							<option key={u._id} value={u._id}>
								{u.name ?? u.email}
							</option>
						))}
					</select>
					<DialogFooter>
						<Button
							variant="ghost"
							onClick={() => setAssignOpen(false)}
							disabled={assigning}
						>
							Annuler
						</Button>
						<Button onClick={handleAssign} disabled={assigning}>
							{assigning ? (
								<Loader2 className="w-4 h-4 animate-spin" />
							) : (
								"Assigner"
							)}
						</Button>
					</DialogFooter>
				</DialogContent>
			</Dialog>

			<Dialog open={confirmOpen} onOpenChange={setConfirmOpen}>
				<DialogContent className="max-w-md">
					<DialogHeader>
						<DialogTitle>
							Supprimer {selectedCount} lead{selectedCount > 1 ? "s" : ""} ?
						</DialogTitle>
						<DialogDescription>
							Cette action est <strong>irréversible</strong>. Les fiches
							sélectionnées seront supprimées, ainsi que leurs rendez-vous,
							notes et relances associés.
						</DialogDescription>
					</DialogHeader>
					<DialogFooter>
						<Button
							variant="ghost"
							onClick={() => setConfirmOpen(false)}
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
