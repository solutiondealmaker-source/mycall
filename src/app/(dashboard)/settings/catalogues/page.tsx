"use client";

import { useMutation, useQuery } from "convex/react";
import { motion } from "framer-motion";
import {
	Archive,
	ChevronLeft,
	Loader2,
	Pencil,
	Plus,
	RotateCcw,
	Trash2,
} from "lucide-react";
import Link from "next/link";
import { useState } from "react";
import { toast } from "sonner";
import { api } from "@/../convex/_generated/api";
import type { Id } from "@/../convex/_generated/dataModel";
import { PageHeader } from "@/components/dashboard/page-header";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Separator } from "@/components/ui/separator";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";

// ─── Color palette ────────────────────────────────────────────────────────────

const COLOR_SWATCHES = [
	"#EF4444",
	"#F97316",
	"#EAB308",
	"#22C55E",
	"#06B6D4",
	"#3B82F6",
	"#8B5CF6",
	"#EC4899",
	"#64748B",
	"#0F172A",
];

// ─── Swatch picker ────────────────────────────────────────────────────────────

function ColorPicker({
	value,
	onChange,
}: {
	value: string;
	onChange: (c: string) => void;
}) {
	return (
		<div className="flex flex-wrap gap-1.5">
			{COLOR_SWATCHES.map((c) => (
				<button
					key={c}
					type="button"
					onClick={() => onChange(c)}
					style={{ background: c }}
					className={cn(
						"w-5 h-5 rounded-full transition-all duration-150",
						value === c
							? "ring-2 ring-offset-1 ring-[var(--ink)] scale-110"
							: "hover:scale-110",
					)}
					aria-label={c}
				/>
			))}
		</div>
	);
}

// ─── Inline add form ──────────────────────────────────────────────────────────

interface AddFormProps {
	onAdd: (label: string, color: string) => Promise<void>;
	placeholder?: string;
}

function AddForm({ onAdd, placeholder = "Nouveau..." }: AddFormProps) {
	const [label, setLabel] = useState("");
	const [color, setColor] = useState(COLOR_SWATCHES[5] ?? "#3B82F6");
	const [isAdding, setIsAdding] = useState(false);

	async function handleSubmit(e: React.FormEvent) {
		e.preventDefault();
		if (!label.trim()) return;
		setIsAdding(true);
		try {
			await onAdd(label.trim(), color);
			setLabel("");
		} finally {
			setIsAdding(false);
		}
	}

	return (
		<form onSubmit={handleSubmit} className="flex items-center gap-2 mt-3">
			<div
				className="w-4 h-4 rounded-full shrink-0 ring-1 ring-[var(--border)]"
				style={{ background: color }}
			/>
			<Input
				value={label}
				onChange={(e) => setLabel(e.target.value)}
				placeholder={placeholder}
				className="h-8 text-xs flex-1"
			/>
			<ColorPicker value={color} onChange={setColor} />
			<Button
				type="submit"
				size="sm"
				disabled={!label.trim() || isAdding}
				className="h-8 gap-1.5 text-xs bg-[var(--brand)] hover:bg-[var(--brand-bright)] text-white"
			>
				{isAdding ? (
					<Loader2 className="w-3.5 h-3.5 animate-spin" />
				) : (
					<Plus className="w-3.5 h-3.5" />
				)}
				Ajouter
			</Button>
		</form>
	);
}

// ─── Component ───────────────────────────────────────────────────────────────

export default function CataloguesPage() {
	const lossReasons = useQuery(api.catalogues.listLossReasons);
	const leadSources = useQuery(api.catalogues.listLeadSources);

	const createLossReason = useMutation(api.catalogues.createLossReason);
	const updateLossReason = useMutation(api.catalogues.updateLossReason);
	const archiveLossReason = useMutation(api.catalogues.archiveLossReason);

	const createLeadSource = useMutation(api.catalogues.createLeadSource);
	const _updateLeadSource = useMutation(api.catalogues.updateLeadSource);
	const deleteLeadSource = useMutation(api.catalogues.deleteLeadSource);

	const [showArchived, setShowArchived] = useState(false);
	const [editingLoss, setEditingLoss] = useState<Id<"lossReasons"> | null>(
		null,
	);
	const [editLabel, setEditLabel] = useState("");

	// ── Loss reasons handlers ─────────────────────────────────────────────────

	async function handleAddLossReason(label: string, color: string) {
		try {
			await createLossReason({ name: label, label, color });
			toast.success("Raison ajoutée");
		} catch (err) {
			toast.error(err instanceof Error ? err.message : "Erreur");
		}
	}

	async function handleSaveLossLabel(id: Id<"lossReasons">) {
		if (!editLabel.trim()) return;
		try {
			await updateLossReason({ id, label: editLabel.trim() });
			setEditingLoss(null);
			toast.success("Mis à jour");
		} catch (err) {
			toast.error(err instanceof Error ? err.message : "Erreur");
		}
	}

	async function handleToggleLossArchive(id: Id<"lossReasons">) {
		try {
			const result = await archiveLossReason({ id });
			toast.success(result.archived ? "Archivé" : "Restauré");
		} catch (err) {
			toast.error(err instanceof Error ? err.message : "Erreur");
		}
	}

	// ── Lead sources handlers ─────────────────────────────────────────────────

	async function handleAddLeadSource(name: string, color: string) {
		try {
			await createLeadSource({ name, color });
			toast.success("Source ajoutée");
		} catch (err) {
			toast.error(err instanceof Error ? err.message : "Erreur");
		}
	}

	async function handleDeleteLeadSource(id: Id<"leadSources">, name: string) {
		if (!window.confirm(`Supprimer la source "${name}" ?`)) return;
		try {
			await deleteLeadSource({ id });
			toast.success("Source supprimée");
		} catch (err) {
			toast.error(err instanceof Error ? err.message : "Erreur");
		}
	}

	const filteredLoss =
		lossReasons?.filter((r) => showArchived || !r.archived) ?? [];

	return (
		<div className="animate-fade-in max-w-4xl">
			<PageHeader
				title="Catalogues"
				description="Raisons de perte et sources de leads partagées sur tous les événements."
				actions={
					<Button variant="ghost" size="sm" asChild className="gap-1.5">
						<Link href="/settings">
							<ChevronLeft className="w-4 h-4" />
							Retour
						</Link>
					</Button>
				}
			/>

			<div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
				{/* ── Loss Reasons ── */}
				<motion.div
					initial={{ opacity: 0, y: 12 }}
					animate={{ opacity: 1, y: 0 }}
					transition={{ duration: 0.15, ease: [0.16, 1, 0.3, 1] }}
				>
					<div className="card-premium p-5">
						<div className="flex items-center justify-between mb-4">
							<h2 className="text-sm font-semibold text-[var(--ink)] font-[family-name:var(--font-display)] tracking-[-0.01em]">
								Raisons de perte
							</h2>
							<button
								type="button"
								onClick={() => setShowArchived((v) => !v)}
								className="text-[11px] text-[var(--ink-ghost)] hover:text-[var(--ink-muted)] transition-colors flex items-center gap-1"
							>
								<Archive className="w-3 h-3" />
								{showArchived ? "Masquer archivés" : "Voir archivés"}
							</button>
						</div>

						{lossReasons === undefined ? (
							<div className="space-y-2">
								{Array.from({ length: 4 }).map((_, i) => (
									<Skeleton
										key={i}
										className="h-9 rounded-[var(--radius-sm)]"
									/>
								))}
							</div>
						) : filteredLoss.length === 0 ? (
							<p className="text-xs text-[var(--ink-ghost)] py-4 text-center">
								Aucune raison de perte. Ajoutes-en une ci-dessous.
							</p>
						) : (
							<div className="space-y-1.5">
								{filteredLoss.map((r) => (
									<div
										key={r._id}
										className={cn(
											"flex items-center gap-2.5 px-3 py-2 rounded-[var(--radius-sm)]",
											"border border-[var(--border)] bg-[var(--surface-raised)]",
											"transition-all duration-150",
											r.archived && "opacity-50",
										)}
									>
										{/* Color swatch */}
										<div
											className="w-3 h-3 rounded-full shrink-0"
											style={{ background: r.color ?? "var(--ink-ghost)" }}
										/>

										{/* Label (editable inline) */}
										{editingLoss === r._id ? (
											<input
												value={editLabel}
												onChange={(e) => setEditLabel(e.target.value)}
												onKeyDown={(e) => {
													if (e.key === "Enter") handleSaveLossLabel(r._id);
													if (e.key === "Escape") setEditingLoss(null);
												}}
												onBlur={() => handleSaveLossLabel(r._id)}
												className="flex-1 text-xs bg-transparent border-b border-[var(--brand)] outline-none text-[var(--ink)] pb-0.5"
											/>
										) : (
											<span className="flex-1 text-xs font-medium text-[var(--ink)] truncate">
												{r.label}
											</span>
										)}

										{/* Usage count */}
										{r.usageCount > 0 && (
											<span className="text-[10px] text-[var(--ink-ghost)] shrink-0">
												×{r.usageCount}
											</span>
										)}

										{/* Actions */}
										{!r.archived && (
											<button
												type="button"
												onClick={() => {
													setEditingLoss(r._id);
													setEditLabel(r.label);
												}}
												className="text-[var(--ink-ghost)] hover:text-[var(--ink)] transition-colors"
												aria-label="Éditer"
											>
												<Pencil className="w-3 h-3" />
											</button>
										)}
										<button
											type="button"
											onClick={() => handleToggleLossArchive(r._id)}
											className={cn(
												"transition-colors",
												r.archived
													? "text-[var(--brand)] hover:text-[var(--brand-bright)]"
													: "text-[var(--ink-ghost)] hover:text-[var(--warning)]",
											)}
											aria-label={r.archived ? "Restaurer" : "Archiver"}
										>
											{r.archived ? (
												<RotateCcw className="w-3 h-3" />
											) : (
												<Archive className="w-3 h-3" />
											)}
										</button>
									</div>
								))}
							</div>
						)}

						<Separator className="my-4 bg-[var(--border)]" />
						<AddForm
							onAdd={handleAddLossReason}
							placeholder="Ex: Prix trop élevé"
						/>
					</div>
				</motion.div>

				{/* ── Lead Sources ── */}
				<motion.div
					initial={{ opacity: 0, y: 12 }}
					animate={{ opacity: 1, y: 0 }}
					transition={{ duration: 0.15, delay: 0.08, ease: [0.16, 1, 0.3, 1] }}
				>
					<div className="card-premium p-5">
						<h2 className="text-sm font-semibold text-[var(--ink)] font-[family-name:var(--font-display)] tracking-[-0.01em] mb-4">
							Sources de leads
						</h2>

						{leadSources === undefined ? (
							<div className="space-y-2">
								{Array.from({ length: 4 }).map((_, i) => (
									<Skeleton
										key={i}
										className="h-9 rounded-[var(--radius-sm)]"
									/>
								))}
							</div>
						) : leadSources.length === 0 ? (
							<p className="text-xs text-[var(--ink-ghost)] py-4 text-center">
								Aucune source. Ajoutes-en une ci-dessous.
							</p>
						) : (
							<div className="space-y-1.5">
								{leadSources.map((s) => (
									<div
										key={s._id}
										className={cn(
											"flex items-center gap-2.5 px-3 py-2 rounded-[var(--radius-sm)]",
											"border border-[var(--border)] bg-[var(--surface-raised)]",
											"transition-all duration-150",
										)}
									>
										{/* Color swatch */}
										<div
											className="w-3 h-3 rounded-full shrink-0"
											style={{ background: s.color ?? "var(--ink-ghost)" }}
										/>

										{/* Name */}
										<span className="flex-1 text-xs font-medium text-[var(--ink)] truncate">
											{s.name}
										</span>

										{/* Usage count */}
										{s.usageCount > 0 && (
											<span className="text-[10px] text-[var(--ink-ghost)] shrink-0">
												×{s.usageCount}
											</span>
										)}

										{/* Delete */}
										<button
											type="button"
											onClick={() => handleDeleteLeadSource(s._id, s.name)}
											className="text-[var(--ink-ghost)] hover:text-[var(--destructive)] transition-colors"
											aria-label="Supprimer"
										>
											<Trash2 className="w-3 h-3" />
										</button>
									</div>
								))}
							</div>
						)}

						<Separator className="my-4 bg-[var(--border)]" />
						<AddForm
							onAdd={handleAddLeadSource}
							placeholder="Ex: LinkedIn, YouTube..."
						/>
					</div>
				</motion.div>
			</div>
		</div>
	);
}
