"use client";

import { useMutation, useQuery } from "convex/react";
import { AnimatePresence, motion } from "framer-motion";
import {
	CalendarCheck2,
	ChevronLeft,
	ChevronRight,
	Clock,
	Globe,
	Loader2,
} from "lucide-react";
import { use, useCallback, useMemo, useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { api } from "../../../../../../convex/_generated/api";

interface PageProps {
	params: Promise<{ token: string }>;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

const MONTH_NAMES = [
	"Janvier",
	"Février",
	"Mars",
	"Avril",
	"Mai",
	"Juin",
	"Juillet",
	"Août",
	"Septembre",
	"Octobre",
	"Novembre",
	"Décembre",
];
const DOW_LABELS = ["Dim", "Lun", "Mar", "Mer", "Jeu", "Ven", "Sam"];

function getLocalTz() {
	return Intl.DateTimeFormat().resolvedOptions().timeZone;
}

function formatSlotTime(ms: number, tz: string): string {
	return new Intl.DateTimeFormat("fr-FR", {
		hour: "2-digit",
		minute: "2-digit",
		timeZone: tz,
	}).format(new Date(ms));
}

function formatTzOffset(tz: string): string {
	const now = new Date();
	const parts = new Intl.DateTimeFormat("en-GB", {
		timeZone: tz,
		timeZoneName: "shortOffset",
	}).formatToParts(now);
	return parts.find((p) => p.type === "timeZoneName")?.value ?? tz;
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function ReschedulePage({ params }: PageProps) {
	const { token } = use(params);
	const booking = useQuery(api.bookings.getByRescheduleToken, { token });
	const rescheduleByToken = useMutation(api.bookings.rescheduleByToken);

	const localTz = useMemo(() => getLocalTz(), []);
	const now = new Date();

	const [viewYear, setViewYear] = useState(now.getFullYear());
	const [viewMonth, setViewMonth] = useState(now.getMonth());
	const [selectedDay, setSelectedDay] = useState<number | null>(null);
	const [selectedSlot, setSelectedSlot] = useState<number | null>(null);
	const [isConfirming, setIsConfirming] = useState(false);
	const [done, setDone] = useState(false);

	// Get event slug from the booking to fetch available days/slots
	const slug = booking?.eventSlug;

	const availableDays = useQuery(
		api.bookings.getAvailableDays,
		slug
			? {
					slug,
					month: viewMonth,
					year: viewYear,
					mode: "reschedule",
					restrictToHostUserId: booking?.hostId,
				}
			: "skip",
	);

	const selectedDayMs =
		selectedDay !== null ? Date.UTC(viewYear, viewMonth, selectedDay) : null;

	const slots = useQuery(
		api.bookings.getAvailableSlotsStatic,
		slug && selectedDayMs !== null
			? {
					slug,
					dateMs: selectedDayMs,
					mode: "reschedule",
					restrictToHostUserId: booking?.hostId,
				}
			: "skip",
	);

	const handleConfirm = useCallback(async () => {
		if (selectedSlot === null) return;
		setIsConfirming(true);
		try {
			await rescheduleByToken({
				token,
				newStartTime: selectedSlot,
				timezone: localTz,
			});
			setDone(true);
		} catch (err) {
			toast.error(err instanceof Error ? err.message : "Erreur inattendue");
			setSelectedSlot(null);
		} finally {
			setIsConfirming(false);
		}
	}, [selectedSlot, token, localTz, rescheduleByToken]);

	// Loading
	if (booking === undefined) {
		return (
			<div className="flex items-center justify-center py-24 gap-3 text-[var(--ink-muted)]">
				<Loader2 className="w-5 h-5 animate-spin" />
			</div>
		);
	}

	// Invalid
	if (booking === null) {
		return (
			<StatePage
				title="Lien invalide"
				description="Ce lien de reprogrammation est invalide ou a expiré."
			/>
		);
	}

	// Cancelled
	if (booking.status === "cancelled") {
		return (
			<StatePage
				title="Réservation annulée"
				description="Cette réservation a été annulée et ne peut plus être reprogrammée."
			/>
		);
	}

	// Done
	if (done) {
		return (
			<motion.div
				initial={{ opacity: 0, scale: 0.97 }}
				animate={{ opacity: 1, scale: 1 }}
				className="max-w-md mx-auto text-center py-16 flex flex-col items-center gap-4"
			>
				<div className="w-14 h-14 rounded-full bg-[var(--success-soft)] flex items-center justify-center">
					<CalendarCheck2 className="w-7 h-7 text-[var(--success)]" />
				</div>
				<p
					className="text-xl font-bold text-[var(--ink)]"
					style={{ fontFamily: "var(--font-display)" }}
				>
					Rendez-vous reprogrammé.
				</p>
				<p className="text-sm text-[var(--ink-muted)]">
					Votre nouveau créneau a bien été enregistré.
				</p>
			</motion.div>
		);
	}

	// Calendar grid
	const daysInMonth = new Date(viewYear, viewMonth + 1, 0).getDate();
	const firstDow = new Date(viewYear, viewMonth, 1).getDay();
	const availableSet = new Set(availableDays ?? []);
	const isCurrentMonth =
		viewYear === now.getFullYear() && viewMonth === now.getMonth();

	function prevMonth() {
		if (viewMonth === 0) {
			setViewMonth(11);
			setViewYear((y) => y - 1);
		} else setViewMonth((m) => m - 1);
		setSelectedDay(null);
		setSelectedSlot(null);
	}
	function nextMonth() {
		if (viewMonth === 11) {
			setViewMonth(0);
			setViewYear((y) => y + 1);
		} else setViewMonth((m) => m + 1);
		setSelectedDay(null);
		setSelectedSlot(null);
	}

	return (
		<motion.div
			initial={{ opacity: 0, y: 12 }}
			animate={{ opacity: 1, y: 0 }}
			transition={{ duration: 0.4, ease: [0.16, 1, 0.3, 1] }}
			className="card-premium shadow-[var(--shadow-float)] max-w-[600px] mx-auto"
		>
			{/* Header */}
			<div className="px-6 py-5 border-b border-[var(--border)]">
				<h1
					className="text-lg font-bold text-[var(--ink)]"
					style={{ fontFamily: "var(--font-display)" }}
				>
					Reprogrammer votre rendez-vous
				</h1>
				<p className="text-xs text-[var(--ink-muted)] mt-1">
					Choisissez un nouveau créneau.
				</p>
			</div>

			<div className="p-6">
				{/* Month navigation */}
				<div className="flex items-center justify-between mb-4">
					<h2 className="text-sm font-semibold text-[var(--ink)]">
						{MONTH_NAMES[viewMonth]} {viewYear}
					</h2>
					<div className="flex gap-1">
						<button
							type="button"
							onClick={prevMonth}
							disabled={isCurrentMonth}
							className="w-8 h-8 flex items-center justify-center rounded-[var(--radius-sm)] text-[var(--ink-muted)] hover:bg-[var(--surface-raised)] disabled:opacity-30 transition-colors"
						>
							<ChevronLeft className="w-4 h-4" />
						</button>
						<button
							type="button"
							onClick={nextMonth}
							className="w-8 h-8 flex items-center justify-center rounded-[var(--radius-sm)] text-[var(--ink-muted)] hover:bg-[var(--surface-raised)] transition-colors"
						>
							<ChevronRight className="w-4 h-4" />
						</button>
					</div>
				</div>

				{/* DOW */}
				<div className="grid grid-cols-7 gap-1 mb-2">
					{DOW_LABELS.map((d) => (
						<div
							key={d}
							className="text-center text-[11px] font-semibold text-[var(--ink-ghost)] py-1"
						>
							{d}
						</div>
					))}
				</div>

				{/* Days */}
				<div className="grid grid-cols-7 gap-1 mb-5">
					{Array.from({ length: firstDow }).map((_, i) => (
						<div key={`e-${i}`} />
					))}
					{Array.from({ length: daysInMonth }).map((_, i) => {
						const day = i + 1;
						const isAvail = availableSet.has(day);
						const isSelected = selectedDay === day;
						const isPast = isCurrentMonth && day < now.getDate();
						return (
							<button
								key={day}
								type="button"
								onClick={() => {
									if (!isAvail || isPast) return;
									setSelectedDay(day);
									setSelectedSlot(null);
								}}
								disabled={!isAvail || isPast}
								className={cn(
									"h-9 w-full rounded-[var(--radius-sm)] text-sm font-medium transition-colors",
									isSelected && "bg-[var(--brand)] text-white",
									isAvail &&
										!isSelected &&
										!isPast &&
										"hover:bg-[var(--brand-soft)] hover:text-[var(--brand)] text-[var(--ink)]",
									(!isAvail || isPast) &&
										"text-[var(--ink-ghost)] opacity-40 cursor-not-allowed",
								)}
							>
								{day}
							</button>
						);
					})}
				</div>

				{/* Timezone */}
				<div className="flex items-center gap-1.5 text-xs text-[var(--ink-muted)] mb-4">
					<Globe className="w-3.5 h-3.5" />
					<span>
						{localTz.replace("_", " ")} ({formatTzOffset(localTz)})
					</span>
				</div>

				{/* Slots */}
				{selectedDay !== null && (
					<AnimatePresence mode="wait">
						<motion.div
							key={`slots-${selectedDay}`}
							initial={{ opacity: 0, y: 4 }}
							animate={{ opacity: 1, y: 0 }}
							exit={{ opacity: 0 }}
							transition={{ duration: 0.2 }}
						>
							{slots === undefined ? (
								<div className="flex items-center justify-center py-4 gap-2 text-[var(--ink-ghost)]">
									<Loader2 className="w-4 h-4 animate-spin" />
									<span className="text-xs">Chargement...</span>
								</div>
							) : slots.length === 0 ? (
								<div className="text-center py-4">
									<Clock className="w-6 h-6 text-[var(--ink-ghost)] mx-auto mb-2" />
									<p className="text-xs text-[var(--ink-muted)]">
										Aucun créneau disponible ce jour.
									</p>
								</div>
							) : (
								<div className="grid grid-cols-3 gap-2">
									{slots.map((slot) => {
										const isSelected = selectedSlot === slot.time;
										return (
											<div key={slot.time}>
												{isSelected ? (
													<div className="flex items-center gap-2 rounded-[var(--radius-md)] border border-[var(--brand)] bg-[var(--brand-soft)] px-2 py-2">
														<span className="flex-1 text-xs font-semibold text-[var(--brand)]">
															{formatSlotTime(slot.time, localTz)}
														</span>
														<Button
															size="xs"
															onClick={handleConfirm}
															disabled={isConfirming}
															style={{ background: "var(--grad-brand)" }}
															className="h-6 text-xs px-2 font-semibold shrink-0"
														>
															{isConfirming ? (
																<Loader2 className="w-3 h-3 animate-spin" />
															) : (
																"OK"
															)}
														</Button>
													</div>
												) : (
													<button
														type="button"
														onClick={() => setSelectedSlot(slot.time)}
														className={cn(
															"w-full h-9 rounded-[var(--radius-md)] border text-sm font-medium",
															"border-[var(--border)] text-[var(--ink)] transition-colors",
															"hover:bg-[var(--brand-soft)] hover:border-[var(--brand)] hover:text-[var(--brand)]",
														)}
													>
														{formatSlotTime(slot.time, localTz)}
													</button>
												)}
											</div>
										);
									})}
								</div>
							)}
						</motion.div>
					</AnimatePresence>
				)}
			</div>
		</motion.div>
	);
}

// ─── StatePage ────────────────────────────────────────────────────────────────

function StatePage({
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
