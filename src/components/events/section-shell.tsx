"use client";

import { AnimatePresence, motion } from "framer-motion";
import type { LucideIcon } from "lucide-react";
import { CheckCircle2 } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

// ─── Props ────────────────────────────────────────────────────────────────────

interface SectionShellProps {
	/** Icône Lucide pour le header */
	icon: LucideIcon;
	/** Titre de la section */
	title: string;
	/** Description courte */
	description?: string;
	/** Contenu du formulaire */
	children: React.ReactNode;
	/** Callback de sauvegarde — reçoit un signal de reset dirty */
	onSave: () => Promise<void>;
	/** Contrôle externe du dirty state (optionnel — sinon géré par SectionShell via onChange) */
	isDirty?: boolean;
	/** Callback reset externe */
	onCancel?: () => void;
	className?: string;
}

// ─── Composant ────────────────────────────────────────────────────────────────

/**
 * SectionShell — wrapper universel pour chaque section de l'admin event config.
 * Header icon+titre+description + body + sticky bottom bar avec dirty tracking.
 */
export function SectionShell({
	icon: Icon,
	title,
	description,
	children,
	onSave,
	isDirty = false,
	onCancel,
	className,
}: SectionShellProps) {
	const [saving, setSaving] = useState(false);
	const [saveSuccess, setSaveSuccess] = useState(false);
	const saveSuccessTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

	// Cleanup timer on unmount
	useEffect(() => {
		return () => {
			if (saveSuccessTimer.current) clearTimeout(saveSuccessTimer.current);
		};
	}, []);

	const handleSave = useCallback(async () => {
		if (!isDirty || saving) return;
		setSaving(true);
		try {
			await onSave();
			setSaveSuccess(true);
			toast.success("Modifications enregistrées", {
				duration: 3000,
			});
			// Flash vert pendant 2s
			saveSuccessTimer.current = setTimeout(() => setSaveSuccess(false), 2000);
		} catch (err) {
			const message = err instanceof Error ? err.message : "Erreur inconnue";
			toast.error("Impossible d'enregistrer", {
				description: message,
				duration: 6000,
				action: {
					label: "Réessayer",
					onClick: handleSave,
				},
			});
		} finally {
			setSaving(false);
		}
	}, [isDirty, saving, onSave]);

	return (
		<div className={cn("flex flex-col h-full", className)}>
			{/* Header */}
			<div className="px-8 pt-8 pb-6 border-b border-[var(--border)] shrink-0">
				<div className="flex items-start gap-3.5">
					<div
						className={cn(
							"flex items-center justify-center shrink-0",
							"w-9 h-9 rounded-[var(--radius-sm)]",
							"bg-[var(--brand-soft)]",
							"ring-1 ring-[var(--brand-glow)]",
						)}
					>
						<Icon className="w-4 h-4 text-[var(--brand)]" strokeWidth={1.75} />
					</div>
					<div className="min-w-0">
						<h2 className="text-base font-semibold font-[family-name:var(--font-display)] text-[var(--ink)] tracking-[-0.01em]">
							{title}
						</h2>
						{description && (
							<p className="mt-0.5 text-xs text-[var(--ink-muted)] leading-relaxed">
								{description}
							</p>
						)}
					</div>
				</div>
			</div>

			{/* Body — scrollable */}
			<div className="flex-1 overflow-y-auto px-8 py-6">{children}</div>

			{/* Sticky bottom bar */}
			<div
				className={cn(
					"shrink-0 h-[60px]",
					"border-t border-[var(--border)]",
					"bg-[var(--surface)]/95 backdrop-blur-md",
					"px-8 flex items-center justify-end gap-3",
					"transition-all duration-200",
				)}
			>
				{/* Annuler */}
				<Button
					variant="ghost"
					size="sm"
					disabled={!isDirty || saving}
					onClick={onCancel}
					className="text-[var(--ink-muted)] hover:text-[var(--ink)]"
				>
					Annuler
				</Button>

				{/* Enregistrer */}
				<AnimatePresence mode="wait">
					{saveSuccess ? (
						<motion.div
							key="success"
							initial={{ opacity: 0, scale: 0.9 }}
							animate={{ opacity: 1, scale: 1 }}
							exit={{ opacity: 0, scale: 0.9 }}
							transition={{ duration: 0.2, ease: [0.16, 1, 0.3, 1] }}
						>
							<Button
								size="sm"
								disabled
								className="bg-[var(--success)] text-white hover:bg-[var(--success)] border-transparent min-w-[160px]"
							>
								<CheckCircle2 className="w-3.5 h-3.5 mr-1.5" />
								Enregistré
							</Button>
						</motion.div>
					) : (
						<motion.div
							key="save"
							initial={{ opacity: 0 }}
							animate={{ opacity: 1 }}
							exit={{ opacity: 0 }}
							transition={{ duration: 0.15 }}
						>
							<Button
								size="sm"
								disabled={!isDirty || saving}
								onClick={handleSave}
								className="min-w-[160px]"
							>
								{saving ? (
									<>
										<span className="w-3.5 h-3.5 mr-1.5 rounded-full border-2 border-white/30 border-t-white animate-spin" />
										Enregistrement...
									</>
								) : (
									"Enregistrer & Continuer"
								)}
							</Button>
						</motion.div>
					)}
				</AnimatePresence>
			</div>
		</div>
	);
}
