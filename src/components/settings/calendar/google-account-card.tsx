"use client";

import { useMutation } from "convex/react";
import { motion } from "framer-motion";
import { Calendar, Check, Loader2, Trash2, Unlink } from "lucide-react";
import { useState } from "react";
import { cn } from "@/lib/utils";
import { api } from "../../../../convex/_generated/api";
import type { Id } from "../../../../convex/_generated/dataModel";

interface GoogleAccountCardProps {
	accountId: Id<"userGoogleAccounts">;
	email: string;
	connectedAt: number;
	isWriter: boolean;
	writerCalendarSummary?: string | null;
	onDisconnect?: () => void;
}

export function GoogleAccountCard({
	accountId,
	email,
	connectedAt,
	isWriter,
	writerCalendarSummary,
	onDisconnect,
}: GoogleAccountCardProps) {
	const [confirming, setConfirming] = useState(false);
	const [disconnecting, setDisconnecting] = useState(false);
	const disconnect = useMutation(api.googleAccount.disconnectAccount);

	const handleDisconnect = async () => {
		if (!confirming) {
			setConfirming(true);
			return;
		}
		setDisconnecting(true);
		try {
			await disconnect({ accountId });
			onDisconnect?.();
		} catch (e) {
			console.error(e);
		} finally {
			setDisconnecting(false);
			setConfirming(false);
		}
	};

	const connectedDate = new Intl.DateTimeFormat("fr-FR", {
		day: "numeric",
		month: "short",
		year: "numeric",
	}).format(new Date(connectedAt));

	return (
		<motion.div
			layout
			initial={{ opacity: 0, y: 8 }}
			animate={{ opacity: 1, y: 0 }}
			exit={{ opacity: 0, scale: 0.96 }}
			transition={{ duration: 0.15, ease: [0.16, 1, 0.3, 1] }}
			className={cn(
				"card-premium flex items-center justify-between gap-4 p-4",
				isWriter && "ring-1 ring-[var(--brand-glow)] bg-[var(--brand-soft)]",
			)}
		>
			<div className="flex items-center gap-3 min-w-0">
				{/* Avatar Google favicon */}
				<div className="w-9 h-9 rounded-full bg-white flex items-center justify-center ring-1 ring-[var(--border)] shrink-0">
					<img
						src="https://www.google.com/favicon.ico"
						alt=""
						width={18}
						height={18}
						className="rounded-sm"
					/>
				</div>

				<div className="min-w-0">
					<p className="text-sm font-medium text-[var(--ink)] truncate">
						{email}
					</p>
					<div className="flex items-center gap-2 mt-0.5">
						{isWriter && (
							<span className="inline-flex items-center gap-1 text-xs font-medium text-[var(--brand)] bg-[var(--brand-soft)] px-1.5 py-0.5 rounded-full">
								<Check className="w-3 h-3" />
								Writer
							</span>
						)}
						{writerCalendarSummary && (
							<span className="flex items-center gap-1 text-xs text-[var(--ink-muted)]">
								<Calendar className="w-3 h-3" />
								{writerCalendarSummary}
							</span>
						)}
						<span className="text-xs text-[var(--ink-ghost)]">
							Connecté le {connectedDate}
						</span>
					</div>
				</div>
			</div>

			{/* Disconnect button */}
			<button
				type="button"
				onClick={handleDisconnect}
				disabled={disconnecting}
				className={cn(
					"inline-flex items-center gap-1.5 px-3 py-1.5 rounded-[var(--radius-sm)]",
					"text-xs font-medium transition-colors shrink-0",
					confirming
						? "bg-[var(--destructive-soft)] text-[var(--destructive)] hover:bg-[var(--destructive)] hover:text-white"
						: "bg-[var(--surface-muted)] text-[var(--ink-muted)] hover:bg-[var(--surface-raised)] hover:text-[var(--destructive)]",
				)}
			>
				{disconnecting ? (
					<Loader2 className="w-3.5 h-3.5 animate-spin" />
				) : confirming ? (
					<Trash2 className="w-3.5 h-3.5" />
				) : (
					<Unlink className="w-3.5 h-3.5" />
				)}
				{confirming ? "Confirmer" : "Déconnecter"}
			</button>
		</motion.div>
	);
}
