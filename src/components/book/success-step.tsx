"use client";

import { motion, type Variants } from "framer-motion";
import { CalendarCheck2 } from "lucide-react";
import { useEffect, useState } from "react";
import { cn } from "@/lib/utils";
import type { BookingResult } from "@/types/book";
import type { EventDoc } from "@/types/events";

interface SuccessStepProps {
	event: EventDoc;
	result: BookingResult;
}

const containerVariants: Variants = {
	hidden: {},
	show: {
		transition: { staggerChildren: 0.02 },
	},
};

const itemVariants: Variants = {
	hidden: { opacity: 0, y: 12 },
	show: {
		opacity: 1,
		y: 0,
		transition: { duration: 0.15, ease: "easeOut" },
	},
};

function formatBookingDate(ms: number): string {
	return new Intl.DateTimeFormat("fr-FR", {
		weekday: "long",
		day: "numeric",
		month: "long",
		year: "numeric",
		hour: "2-digit",
		minute: "2-digit",
	}).format(new Date(ms));
}

export function SuccessStep({ event, result }: SuccessStepProps) {
	const [countdown, setCountdown] = useState(4);
	const redirectUrl = event.confirmationRedirectUrl;

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

	const dateLabel = formatBookingDate(result.startTime);

	return (
		<motion.div
			className="p-8 md:p-12 flex flex-col items-center text-center gap-6"
			variants={containerVariants}
			initial="hidden"
			animate="show"
		>
			{/* Success icon — bounce entrance */}
			<motion.div
				initial={{ scale: 0, opacity: 0 }}
				animate={{ scale: 1, opacity: 1 }}
				transition={{ duration: 0.15, ease: [0.34, 1.56, 0.64, 1], delay: 0.1 }}
				className="w-16 h-16 rounded-full bg-[var(--success-soft)] flex items-center justify-center"
			>
				<CalendarCheck2 className="w-8 h-8 text-[var(--success)]" />
			</motion.div>

			{/* Title */}
			<motion.div variants={itemVariants} className="space-y-2">
				<h2
					className="text-2xl md:text-3xl font-bold text-[var(--ink)] tracking-tight"
					style={{ fontFamily: "var(--font-display)" }}
				>
					{event.confirmationTitle ?? "Votre rendez-vous est confirmé."}
				</h2>
				{event.confirmationMessage && (
					<p className="text-sm text-[var(--ink-muted)] max-w-md">
						{event.confirmationMessage}
					</p>
				)}
			</motion.div>

			{/* Date recap card */}
			<motion.div
				variants={itemVariants}
				className={cn(
					"w-full max-w-sm rounded-[var(--radius-lg)] border border-[var(--border)]",
					"bg-[var(--surface-raised)] px-5 py-4 text-sm text-[var(--ink-muted)] space-y-1",
				)}
			>
				<p className="font-semibold text-[var(--ink)] capitalize">
					{dateLabel}
				</p>
				<p>Durée : {event.durationMinutes} minutes</p>
				{result.hostName && (
					<p>
						Avec : <span className="text-[var(--ink)]">{result.hostName}</span>
					</p>
				)}
			</motion.div>

			{event.location === "googleMeet" && (
				<motion.div variants={itemVariants} className="w-full max-w-sm">
					<div
						className={cn(
							"rounded-[var(--radius-lg)] border border-[var(--brand)]/20",
							"bg-[var(--brand-soft)] px-5 py-4 space-y-2",
						)}
					>
						<p className="text-xs text-[var(--brand)] font-semibold uppercase tracking-wider">
							Google Meet
						</p>
						{result.googleMeetUrl ? (
							<a
								href={result.googleMeetUrl}
								target="_blank"
								rel="noreferrer noopener"
								className="block text-sm font-mono text-[var(--brand)] hover:underline break-all"
							>
								{result.googleMeetUrl}
							</a>
						) : (
							<p className="text-xs text-[var(--ink-muted)]">
								Le lien de connexion te sera envoyé par email avant le
								rendez-vous.
							</p>
						)}
					</div>
				</motion.div>
			)}

			{/* Redirect countdown */}
			{redirectUrl && countdown > 0 && (
				<motion.p
					variants={itemVariants}
					className="text-xs text-[var(--ink-ghost)]"
				>
					Redirection automatique dans {countdown}s...
				</motion.p>
			)}

			{/* Hint — reschedule/cancel via Google Calendar invite */}
			<motion.p
				variants={itemVariants}
				className="text-xs text-[var(--ink-ghost)] text-center max-w-sm"
			>
				Pour replanifier ou annuler, utilise les liens dans l'invitation Google
				Calendar que tu viens de recevoir.
			</motion.p>
		</motion.div>
	);
}
