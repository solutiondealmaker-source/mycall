"use client";

import { motion } from "framer-motion";
import { Ban } from "lucide-react";
import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";

interface DisqualificationOverlayProps {
	message?: string;
	redirectUrl?: string;
	onBack: () => void;
}

export function DisqualificationOverlay({
	message,
	redirectUrl,
	onBack,
}: DisqualificationOverlayProps) {
	const [countdown, setCountdown] = useState(2);

	useEffect(() => {
		if (!redirectUrl) return;
		const interval = setInterval(() => {
			setCountdown((c) => {
				if (c <= 1) {
					clearInterval(interval);
					window.location.href = redirectUrl;
					return 0;
				}
				return c - 1;
			});
		}, 1000);
		return () => clearInterval(interval);
	}, [redirectUrl]);

	return (
		<motion.div
			initial={{ opacity: 0, scale: 0.95 }}
			animate={{ opacity: 1, scale: 1 }}
			exit={{ opacity: 0, scale: 0.95 }}
			transition={{ duration: 0.15, ease: [0.16, 1, 0.3, 1] }}
			className="pointer-events-auto max-w-[360px] w-full rounded-2xl border border-[var(--destructive)]/30 bg-[var(--surface)] px-6 py-6 text-center shadow-[var(--shadow-pop)]"
			role="alertdialog"
			aria-modal="true"
			aria-label="Disqualification"
		>
			{/* Icon */}
			<div className="w-12 h-12 rounded-full bg-[var(--destructive-soft)] flex items-center justify-center mx-auto mb-4">
				<Ban className="w-5 h-5 text-[var(--destructive)]" />
			</div>

			{/* Message */}
			<p className="text-sm text-[var(--ink)] leading-relaxed mb-5">
				{message ??
					"Merci pour votre intérêt. Malheureusement, votre profil ne correspond pas à nos critères actuels."}
			</p>

			{/* Redirect countdown */}
			{redirectUrl && countdown > 0 && (
				<p className="text-xs text-[var(--ink-ghost)] mb-4">
					Redirection dans {countdown}s...
				</p>
			)}

			{/* Back button */}
			<Button variant="outline" size="sm" onClick={onBack} className="w-full">
				Modifier mes réponses
			</Button>
		</motion.div>
	);
}
