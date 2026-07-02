"use client";

import { AnimatePresence, motion } from "framer-motion";
import { Archive, Download, UserCog, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

interface LeadsBulkActionsBarProps {
	selectedCount: number;
	onClearSelection: () => void;
}

export function LeadsBulkActionsBar({
	selectedCount,
	onClearSelection,
}: LeadsBulkActionsBarProps) {
	return (
		<AnimatePresence>
			{selectedCount > 0 && (
				<motion.div
					initial={{ opacity: 0, y: 16, scale: 0.97 }}
					animate={{ opacity: 1, y: 0, scale: 1 }}
					exit={{ opacity: 0, y: 16, scale: 0.97 }}
					transition={{ duration: 0.2, ease: [0.16, 1, 0.3, 1] }}
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
						<Button
							variant="ghost"
							size="sm"
							className="gap-1.5 h-7 text-xs"
							title="Assigner un closer (Phase 11)"
						>
							<UserCog className="w-3.5 h-3.5" />
							Assigner
						</Button>
						<Button
							variant="ghost"
							size="sm"
							className="gap-1.5 h-7 text-xs"
							title="Archiver (Phase 11)"
						>
							<Archive className="w-3.5 h-3.5" />
							Archiver
						</Button>
						<Button
							variant="ghost"
							size="sm"
							className="gap-1.5 h-7 text-xs"
							title="Exporter CSV (Phase 11)"
						>
							<Download className="w-3.5 h-3.5" />
							Exporter
						</Button>
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
			)}
		</AnimatePresence>
	);
}
