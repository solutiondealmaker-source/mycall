"use client";

import { useAction, useQuery } from "convex/react";
import { AnimatePresence, motion } from "framer-motion";
import DOMPurify from "isomorphic-dompurify";
import {
	ArrowLeft,
	ChevronLeft,
	ChevronRight,
	Clock,
	Globe,
	Loader2,
	MapPin,
	Timer,
} from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import type { BookingResult, BookSessionData } from "@/types/book";
import type {
	DisqualificationRule,
	EventDoc,
	EventQuestion,
} from "@/types/events";
import { api } from "../../../convex/_generated/api";
import { DisqualificationOverlay } from "./disqualification-overlay";

// ─── Disqualification (inlined — avoids cross-boundary import issues) ─────────

function isDisqualified(
	rules: DisqualificationRule[] | undefined,
	answers: Record<string, string | string[] | undefined>,
): boolean {
	if (!rules || rules.length === 0) return false;
	for (const rule of rules) {
		const answer = answers[rule.questionLabel];
		if (answer === undefined) continue;
		if (Array.isArray(answer)) {
			if (answer.some((a) => rule.answers.includes(a))) return true;
		} else if (rule.answers.includes(answer)) {
			return true;
		}
	}
	return false;
}

// ─── Props ────────────────────────────────────────────────────────────────────

interface CalendarStepProps {
	event: EventDoc;
	questions: EventQuestion[];
	slug: string;
	sessionId: string;
	data: BookSessionData;
	onBack: () => void;
	onSuccess: (result: BookingResult) => void;
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

function formatSlotTime(ms: number, tz: string, format: "h12" | "h24"): string {
	return new Intl.DateTimeFormat("fr-FR", {
		hour: "2-digit",
		minute: "2-digit",
		hour12: format === "h12",
		timeZone: tz,
	}).format(new Date(ms));
}

function getLocalTz(): string {
	return Intl.DateTimeFormat().resolvedOptions().timeZone;
}

function formatTzOffset(tz: string): string {
	const parts = new Intl.DateTimeFormat("en-GB", {
		timeZone: tz,
		timeZoneName: "shortOffset",
	}).formatToParts(new Date());
	return parts.find((p) => p.type === "timeZoneName")?.value ?? tz;
}

// ─── CalendarStep ─────────────────────────────────────────────────────────────

export function CalendarStep({
	event,
	questions: _questions,
	slug,
	sessionId,
	data,
	onBack,
	onSuccess,
}: CalendarStepProps) {
	const localTz = useMemo(() => getLocalTz(), []);
	const timeFormat = event.timeFormat ?? "h24";

	const now = new Date();
	const [viewYear, setViewYear] = useState(now.getFullYear());
	const [viewMonth, setViewMonth] = useState(now.getMonth());
	const [selectedDay, setSelectedDay] = useState<number | null>(null);
	const [selectedSlot, setSelectedSlot] = useState<number | null>(null);
	const [isConfirming, setIsConfirming] = useState(false);

	// Reservation timer
	const [secondsLeft, setSecondsLeft] = useState(
		(event.reservationTimerMinutes ?? 10) * 60,
	);
	const [timerActive, setTimerActive] = useState(false);

	// Disqualification check
	const disqualified = useMemo(() => {
		if (!event.disqualificationRules?.length) return false;
		return isDisqualified(event.disqualificationRules, data.formAnswers);
	}, [event.disqualificationRules, data.formAnswers]);

	// Queries
	const availableDays = useQuery(api.bookings.getAvailableDays, {
		slug,
		month: viewMonth,
		year: viewYear,
	});

	const selectedDayMs =
		selectedDay !== null ? Date.UTC(viewYear, viewMonth, selectedDay) : null;

	const slots = useQuery(
		api.bookings.getAvailableSlotsStatic,
		selectedDayMs !== null ? { slug, dateMs: selectedDayMs } : "skip",
	);

	const createBooking = useAction(api.bookings.createBookingChecked);

	// Timer activation
	useEffect(() => {
		if (selectedSlot !== null) setTimerActive(true);
	}, [selectedSlot]);

	useEffect(() => {
		if (!timerActive || secondsLeft <= 0) return;
		const interval = setInterval(() => {
			setSecondsLeft((s) => {
				if (s <= 1) {
					clearInterval(interval);
					setSelectedSlot(null);
					setTimerActive(false);
					toast.error(
						"Le créneau a été libéré. Choisissez un nouveau créneau.",
					);
					return 0;
				}
				return s - 1;
			});
		}, 1000);
		return () => clearInterval(interval);
	}, [timerActive]);

	useEffect(() => {
		if (selectedSlot !== null) {
			setSecondsLeft((event.reservationTimerMinutes ?? 10) * 60);
		}
	}, [selectedSlot, event.reservationTimerMinutes]);

	const formatTimer = (secs: number) => {
		const m = Math.floor(secs / 60)
			.toString()
			.padStart(2, "0");
		const s = (secs % 60).toString().padStart(2, "0");
		return `${m}:${s}`;
	};

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

	const handleConfirm = useCallback(async () => {
		if (selectedSlot === null) return;
		setIsConfirming(true);
		try {
			const result = await createBooking({
				slug,
				sessionId,
				startTime: selectedSlot,
				firstName: data.firstName,
				lastName: data.lastName,
				phone: data.phone,
				email: data.email,
				formAnswers:
					Object.keys(data.formAnswers).length > 0
						? JSON.stringify(data.formAnswers)
						: undefined,
				timezone: localTz,
			});
			if (!result.ok) {
				toast.error(result.error ?? "Erreur lors de la réservation");
				setSelectedSlot(null);
				setIsConfirming(false);
				return;
			}
			onSuccess(result as unknown as BookingResult);
		} catch (err) {
			toast.error(err instanceof Error ? err.message : "Erreur inattendue");
			setSelectedSlot(null);
			setIsConfirming(false);
		}
	}, [selectedSlot, createBooking, slug, sessionId, data, localTz, onSuccess]);

	// Calendar grid
	const daysInMonth = new Date(viewYear, viewMonth + 1, 0).getDate();
	const firstDow = new Date(viewYear, viewMonth, 1).getDay();
	const availableSet = new Set(availableDays ?? []);
	const todayDate = new Date();
	const isCurrentMonth =
		viewYear === todayDate.getFullYear() && viewMonth === todayDate.getMonth();

	return (
		<div className="grid md:grid-cols-[260px_1px_1fr] min-h-[480px]">
			{/* Left — Event details */}
			<div className="p-6 md:p-8 flex flex-col gap-5">
				<button
					type="button"
					onClick={onBack}
					className="flex items-center gap-1.5 text-sm text-[var(--ink-muted)] hover:text-[var(--ink)] transition-colors w-fit"
				>
					<ArrowLeft className="w-3.5 h-3.5" />
					Retour
				</button>

				<div className="space-y-3">
					<h2
						className="text-base font-bold text-[var(--ink)]"
						style={{ fontFamily: "var(--font-display)" }}
					>
						{event.name}
					</h2>
					<div className="flex items-center gap-2 text-sm text-[var(--ink-muted)]">
						<Clock className="w-3.5 h-3.5 shrink-0" />
						<span>{event.durationMinutes} minutes</span>
					</div>
					{event.location === "googleMeet" && (
						<div className="flex items-center gap-2 text-sm text-[var(--ink-muted)]">
							<GoogleMeetIcon />
							<span>Google Meet</span>
						</div>
					)}
					{event.location === "custom" && event.customLocation && (
						<div className="flex items-start gap-2 text-sm text-[var(--ink-muted)]">
							<MapPin className="w-3.5 h-3.5 shrink-0 mt-0.5" />
							<span className="whitespace-pre-line">
								{event.customLocation}
							</span>
						</div>
					)}
					{event.description && (
						<div
							className={cn(
								"text-xs leading-relaxed text-[var(--ink-muted)]",
								"max-h-[180px] overflow-y-auto",
								"[&_p]:my-1.5 [&_ul]:my-1.5 [&_ol]:my-1.5",
								"[&_ul]:list-disc [&_ul]:pl-4 [&_ol]:list-decimal [&_ol]:pl-4",
								"[&_strong]:text-[var(--ink)] [&_strong]:font-semibold",
								"[&_a]:text-[var(--brand)] [&_a]:underline",
							)}
							// biome-ignore lint/security/noDangerouslySetInnerHtml: sanitized via DOMPurify
							dangerouslySetInnerHTML={{
								__html: DOMPurify.sanitize(event.description),
							}}
						/>
					)}
				</div>

				<div className="pt-3 border-t border-[var(--border)] space-y-1">
					<p className="text-xs font-medium text-[var(--ink)]">
						{data.firstName} {data.lastName}
					</p>
					{data.email && (
						<p className="text-xs text-[var(--ink-ghost)] truncate">
							{data.email}
						</p>
					)}
				</div>

				{timerActive && secondsLeft > 0 && (
					<motion.div
						initial={{ opacity: 0, y: 4 }}
						animate={{ opacity: 1, y: 0 }}
						className="flex items-center gap-2 text-xs text-[var(--warning)] bg-[var(--warning-soft)] rounded-[var(--radius-md)] px-3 py-2 border border-[var(--warning)]/20"
					>
						<Timer className="w-3 h-3 shrink-0" />
						<span>
							Créneau réservé pour{" "}
							<span className="font-mono font-bold">
								{formatTimer(secondsLeft)}
							</span>
						</span>
					</motion.div>
				)}
			</div>

			{/* Divider */}
			<div className="hidden md:block bg-[var(--border)]" />

			{/* Right — Calendar + slots */}
			<div className="relative p-6 md:p-8">
				{disqualified && (
					<div className="absolute inset-0 z-20 flex items-center justify-center p-6">
						<DisqualificationOverlay
							message={event.disqualificationMessage}
							redirectUrl={event.disqualificationRedirectUrl}
							onBack={onBack}
						/>
					</div>
				)}

				<div
					className={cn(
						disqualified &&
							"pointer-events-none select-none opacity-40 blur-[1.5px]",
					)}
				>
					{/* Month navigation */}
					<div className="flex items-center justify-between mb-4">
						<h3
							className="text-base font-bold text-[var(--ink)]"
							style={{ fontFamily: "var(--font-display)" }}
						>
							{MONTH_NAMES[viewMonth]} {viewYear}
						</h3>
						<div className="flex items-center gap-1">
							<button
								type="button"
								onClick={prevMonth}
								disabled={isCurrentMonth}
								className="w-8 h-8 flex items-center justify-center rounded-[var(--radius-sm)] text-[var(--ink-muted)] hover:bg-[var(--surface-raised)] hover:text-[var(--ink)] transition-colors disabled:opacity-30"
								aria-label="Mois précédent"
							>
								<ChevronLeft className="w-4 h-4" />
							</button>
							<button
								type="button"
								onClick={nextMonth}
								className="w-8 h-8 flex items-center justify-center rounded-[var(--radius-sm)] text-[var(--ink-muted)] hover:bg-[var(--surface-raised)] hover:text-[var(--ink)] transition-colors"
								aria-label="Mois suivant"
							>
								<ChevronRight className="w-4 h-4" />
							</button>
						</div>
					</div>

					{/* DOW headers */}
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

					{/* Days grid */}
					<motion.div
						key={`${viewYear}-${viewMonth}`}
						initial="hidden"
						animate="show"
						variants={{ show: { transition: { staggerChildren: 0.012 } } }}
						className="grid grid-cols-7 gap-1 mb-6"
					>
						{Array.from({ length: firstDow }).map((_, i) => (
							<div key={`e-${i}`} />
						))}
						{Array.from({ length: daysInMonth }).map((_, i) => {
							const day = i + 1;
							const isAvail = availableSet.has(day);
							const isSelected = selectedDay === day;
							const isPast = isCurrentMonth && day < todayDate.getDate();
							return (
								<motion.button
									key={day}
									type="button"
									variants={{
										hidden: { opacity: 0, scale: 0.85 },
										show: { opacity: 1, scale: 1 },
									}}
									transition={{ duration: 0.15 }}
									onClick={() => {
										if (!isAvail || isPast) return;
										setSelectedDay(day);
										setSelectedSlot(null);
									}}
									disabled={!isAvail || isPast}
									className={cn(
										"h-9 w-full rounded-[var(--radius-sm)] text-sm font-medium transition-all duration-100",
										isSelected &&
											"bg-[var(--brand)] text-white shadow-[var(--shadow-brand)]",
										isAvail &&
											!isSelected &&
											!isPast &&
											"hover:bg-[var(--brand-soft)] hover:text-[var(--brand)] cursor-pointer text-[var(--ink)]",
										(!isAvail || isPast) &&
											"text-[var(--ink-ghost)] cursor-not-allowed opacity-40",
									)}
									aria-pressed={isSelected}
								>
									{day}
								</motion.button>
							);
						})}
					</motion.div>

					{/* Timezone + format */}
					<div className="flex items-center justify-between mb-4">
						<div className="flex items-center gap-1.5 text-xs text-[var(--ink-muted)]">
							<Globe className="w-3.5 h-3.5" />
							<span>{localTz.replace(/_/g, " ")}</span>
							<span className="text-[var(--ink-ghost)]">
								({formatTzOffset(localTz)})
							</span>
						</div>
						<div className="flex items-center rounded-[var(--radius-sm)] border border-[var(--border)] overflow-hidden text-xs">
							<span
								className={cn(
									"px-2.5 py-1",
									timeFormat === "h12"
										? "bg-[var(--brand)] text-white font-medium"
										: "text-[var(--ink-ghost)]",
								)}
							>
								12h
							</span>
							<span
								className={cn(
									"px-2.5 py-1",
									timeFormat === "h24"
										? "bg-[var(--brand)] text-white font-medium"
										: "text-[var(--ink-ghost)]",
								)}
							>
								24h
							</span>
						</div>
					</div>

					{/* Slots */}
					{selectedDay !== null && (
						<AnimatePresence mode="wait">
							<motion.div
								key={`slots-${selectedDay}`}
								initial={{ opacity: 0, y: 6 }}
								animate={{ opacity: 1, y: 0 }}
								exit={{ opacity: 0 }}
								transition={{ duration: 0.2 }}
							>
								{slots === undefined ? (
									<div className="flex items-center justify-center py-6 gap-2 text-sm text-[var(--ink-ghost)]">
										<Loader2 className="w-4 h-4 animate-spin" />
										Chargement des créneaux...
									</div>
								) : slots.length === 0 ? (
									<div className="flex flex-col items-center py-6 gap-2 text-center">
										<Clock className="w-8 h-8 text-[var(--ink-ghost)]" />
										<p className="text-sm font-medium text-[var(--ink)]">
											Aucun créneau disponible
										</p>
										<p className="text-xs text-[var(--ink-muted)]">
											Choisissez un autre jour.
										</p>
									</div>
								) : (
									<motion.div
										initial="hidden"
										animate="show"
										variants={{
											show: { transition: { staggerChildren: 0.04 } },
										}}
										className="grid grid-cols-2 gap-2"
									>
										{slots.map((slot) => {
											const isSelected = selectedSlot === slot.time;
											const label = formatSlotTime(
												slot.time,
												localTz,
												timeFormat,
											);
											return (
												<motion.div
													key={slot.time}
													variants={{
														hidden: { opacity: 0, y: 4 },
														show: { opacity: 1, y: 0 },
													}}
													transition={{ duration: 0.15 }}
												>
													<AnimatePresence mode="wait">
														{isSelected ? (
															<motion.div
																key="expanded"
																initial={{ opacity: 0 }}
																animate={{ opacity: 1 }}
																exit={{ opacity: 0 }}
																className="col-span-2 flex items-center gap-2 rounded-[var(--radius-md)] border border-[var(--brand)] bg-[var(--brand-soft)] px-3 py-2.5"
															>
																<span className="flex-1 text-sm font-semibold text-[var(--brand)]">
																	{label}
																</span>
																<Button
																	size="sm"
																	onClick={handleConfirm}
																	disabled={isConfirming}
																	className="h-8 shrink-0 font-semibold"
																	style={{ background: "var(--grad-brand)" }}
																>
																	{isConfirming ? (
																		<Loader2 className="w-3.5 h-3.5 animate-spin" />
																	) : (
																		"Confirmer"
																	)}
																</Button>
															</motion.div>
														) : (
															<motion.button
																key="pill"
																initial={{ opacity: 0 }}
																animate={{ opacity: 1 }}
																exit={{ opacity: 0 }}
																type="button"
																onClick={() => setSelectedSlot(slot.time)}
																className={cn(
																	"w-full h-10 rounded-[var(--radius-md)] border text-sm font-medium",
																	"transition-all duration-100",
																	"border-[var(--border)] text-[var(--ink)]",
																	"hover:bg-[var(--brand-soft)] hover:border-[var(--brand)] hover:text-[var(--brand)]",
																)}
															>
																{label}
															</motion.button>
														)}
													</AnimatePresence>
												</motion.div>
											);
										})}
									</motion.div>
								)}
							</motion.div>
						</AnimatePresence>
					)}

					{selectedDay === null && availableDays !== undefined && (
						<motion.p
							initial={{ opacity: 0 }}
							animate={{ opacity: 1 }}
							className="text-sm text-[var(--ink-ghost)] text-center py-4"
						>
							Sélectionnez un jour disponible pour voir les créneaux.
						</motion.p>
					)}
				</div>
			</div>
		</div>
	);
}

// ─── Google Meet icon ─────────────────────────────────────────────────────────

function GoogleMeetIcon() {
	return (
		<svg
			viewBox="0 0 24 24"
			className="w-3.5 h-3.5 shrink-0"
			fill="none"
			aria-hidden="true"
		>
			<path d="M21 7.5l-4 3.5v5l4 3.5V7.5z" fill="#00832D" />
			<rect x="3" y="7" width="13" height="10" rx="2" fill="#0097A7" />
		</svg>
	);
}
