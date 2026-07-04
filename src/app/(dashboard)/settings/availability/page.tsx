"use client";

import { useMutation, useQuery } from "convex/react";
import { motion } from "framer-motion";
import { ChevronLeft, Copy, Loader2, Plus, Save, Trash2 } from "lucide-react";
import Link from "next/link";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { api } from "@/../convex/_generated/api";
import { PageHeader } from "@/components/dashboard/page-header";
import { Button } from "@/components/ui/button";
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { cn } from "@/lib/utils";

// ─── Types ───────────────────────────────────────────────────────────────────

interface TimeWindow {
	startMinute: number;
	endMinute: number;
}

interface DayState {
	enabled: boolean;
	windows: TimeWindow[];
}

type WeekState = Record<number, DayState>; // 0=Sun … 6=Sat

// ─── Constants ───────────────────────────────────────────────────────────────

const DAY_LABELS: Record<number, string> = {
	0: "Dimanche",
	1: "Lundi",
	2: "Mardi",
	3: "Mercredi",
	4: "Jeudi",
	5: "Vendredi",
	6: "Samedi",
};

const _DAY_LABELS_SHORT: Record<number, string> = {
	0: "Dim",
	1: "Lun",
	2: "Mar",
	3: "Mer",
	4: "Jeu",
	5: "Ven",
	6: "Sam",
};

// Mon–Sun order for display
const DAY_ORDER = [1, 2, 3, 4, 5, 6, 0];

// Default: Mon–Fri 9h–12h + 14h–18h
const DEFAULT_WINDOWS: TimeWindow[] = [
	{ startMinute: 9 * 60, endMinute: 12 * 60 },
	{ startMinute: 14 * 60, endMinute: 18 * 60 },
];

function buildDefaultWeek(): WeekState {
	const state: WeekState = {};
	for (let d = 0; d <= 6; d++) {
		const isWorkday = d >= 1 && d <= 5;
		state[d] = {
			enabled: isWorkday,
			windows: isWorkday ? DEFAULT_WINDOWS.map((w) => ({ ...w })) : [],
		};
	}
	return state;
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function minutesToHHMM(minutes: number): string {
	const h = Math.floor(minutes / 60)
		.toString()
		.padStart(2, "0");
	const m = (minutes % 60).toString().padStart(2, "0");
	return `${h}:${m}`;
}

function _hhmmToMinutes(hhmm: string): number {
	const [hStr, mStr] = hhmm.split(":");
	return Number(hStr ?? 0) * 60 + Number(mStr ?? 0);
}

// Generate minute options every 15 minutes
const TIME_OPTIONS = Array.from({ length: 24 * 4 }, (_, i) => i * 15).map(
	(m) => ({ value: m, label: minutesToHHMM(m) }),
);

// ─── Flatten / unflatten ─────────────────────────────────────────────────────

function weekStateToWindows(
	state: WeekState,
): Array<{ dayOfWeek: number; startMinute: number; endMinute: number }> {
	const result: Array<{
		dayOfWeek: number;
		startMinute: number;
		endMinute: number;
	}> = [];
	for (const [dayStr, day] of Object.entries(state)) {
		if (!day.enabled) continue;
		const dow = Number(dayStr);
		for (const w of day.windows) {
			if (w.startMinute < w.endMinute) {
				result.push({
					dayOfWeek: dow,
					startMinute: w.startMinute,
					endMinute: w.endMinute,
				});
			}
		}
	}
	return result;
}

function windowsToWeekState(
	rows: Array<{ dayOfWeek: number; startMinute: number; endMinute: number }>,
): WeekState {
	const state = buildDefaultWeek();
	// Reset all first
	for (let d = 0; d <= 6; d++) {
		state[d] = { enabled: false, windows: [] };
	}
	for (const r of rows) {
		const day = state[r.dayOfWeek];
		if (!day) continue;
		day.enabled = true;
		day.windows.push({ startMinute: r.startMinute, endMinute: r.endMinute });
	}
	return state;
}

// ─── Component ───────────────────────────────────────────────────────────────

export default function AvailabilityPage() {
	const rawWindows = useQuery(api.userAvailability.getMyAvailability);
	const preview = useQuery(api.userAvailability.previewMyNextSlots);
	const setWeekly = useMutation(api.userAvailability.setWeekly);

	const [week, setWeek] = useState<WeekState>(buildDefaultWeek());
	const [isDirty, setIsDirty] = useState(false);
	const [isSaving, setIsSaving] = useState(false);

	// Seed from DB
	useEffect(() => {
		if (rawWindows === undefined) return;
		if (rawWindows.length === 0) {
			setWeek(buildDefaultWeek());
		} else {
			setWeek(windowsToWeekState(rawWindows));
		}
		setIsDirty(false);
	}, [rawWindows]);

	function updateDay(dow: number, patch: Partial<DayState>) {
		setWeek((prev) => ({
			...prev,
			[dow]: { ...(prev[dow] ?? { enabled: false, windows: [] }), ...patch },
		}));
		setIsDirty(true);
	}

	function addWindow(dow: number) {
		const day = week[dow] ?? { enabled: true, windows: [] };
		const last = day.windows[day.windows.length - 1];
		const newStart = last ? Math.min(last.endMinute + 15, 23 * 60) : 9 * 60;
		const newEnd = Math.min(newStart + 60, 24 * 60);
		updateDay(dow, {
			windows: [...day.windows, { startMinute: newStart, endMinute: newEnd }],
		});
	}

	function removeWindow(dow: number, idx: number) {
		const day = week[dow];
		if (!day) return;
		const windows = day.windows.filter((_, i) => i !== idx);
		updateDay(dow, { windows });
	}

	function updateWindow(
		dow: number,
		idx: number,
		field: "startMinute" | "endMinute",
		value: number,
	) {
		const day = week[dow];
		if (!day) return;
		const windows = day.windows.map((w, i) =>
			i === idx ? { ...w, [field]: value } : w,
		);
		updateDay(dow, { windows });
	}

	function copyToWorkdays() {
		const mondayDay = week[1] ?? {
			enabled: true,
			windows: [...DEFAULT_WINDOWS],
		};
		const sourceWindows = mondayDay.windows;
		setWeek((prev) => {
			const next = { ...prev };
			for (const d of [1, 2, 3, 4, 5]) {
				next[d] = {
					enabled: true,
					windows: sourceWindows.map((w) => ({ ...w })),
				};
			}
			return next;
		});
		setIsDirty(true);
		toast.info("Copié sur les jours ouvrables (Lun–Ven)");
	}

	function copyToWeekend() {
		const saturdayDay = week[6] ?? {
			enabled: true,
			windows: [...DEFAULT_WINDOWS],
		};
		const sourceWindows = saturdayDay.windows.length
			? saturdayDay.windows
			: DEFAULT_WINDOWS;
		setWeek((prev) => {
			const next = { ...prev };
			for (const d of [0, 6]) {
				next[d] = {
					enabled: true,
					windows: sourceWindows.map((w) => ({ ...w })),
				};
			}
			return next;
		});
		setIsDirty(true);
		toast.info("Copié sur le weekend (Sam–Dim)");
	}

	async function handleSave() {
		setIsSaving(true);
		try {
			const windows = weekStateToWindows(week);
			await setWeekly({ windows });
			setIsDirty(false);
			toast.success("Disponibilités enregistrées");
		} catch (err) {
			toast.error(
				err instanceof Error ? err.message : "Erreur lors de la sauvegarde",
			);
		} finally {
			setIsSaving(false);
		}
	}

	const isLoading = rawWindows === undefined;

	return (
		<div className="animate-fade-in">
			<PageHeader
				title="Disponibilités"
				description="Définis tes plages horaires pour les bookings."
				actions={
					<Button variant="ghost" size="sm" asChild className="gap-1.5">
						<Link href="/settings">
							<ChevronLeft className="w-4 h-4" />
							Retour
						</Link>
					</Button>
				}
			/>

			<div className="grid grid-cols-1 lg:grid-cols-[1fr_300px] gap-6">
				{/* ── Left: editor ── */}
				<motion.div
					initial={{ opacity: 0, y: 12 }}
					animate={{ opacity: 1, y: 0 }}
					transition={{ duration: 0.15, ease: [0.16, 1, 0.3, 1] }}
					className="space-y-4"
				>
					{/* Quick actions */}
					<div className="card-premium p-4 flex flex-wrap items-center gap-2">
						<span className="text-xs text-[var(--ink-muted)] mr-auto">
							Raccourcis
						</span>
						<Button
							variant="outline"
							size="sm"
							onClick={copyToWorkdays}
							className="gap-1.5 text-xs h-8"
						>
							<Copy className="w-3.5 h-3.5" />
							Copier sur jours ouvrables
						</Button>
						<Button
							variant="outline"
							size="sm"
							onClick={copyToWeekend}
							className="gap-1.5 text-xs h-8"
						>
							<Copy className="w-3.5 h-3.5" />
							Copier sur weekend
						</Button>
					</div>

					{/* Days */}
					{isLoading ? (
						<div className="space-y-3">
							{Array.from({ length: 5 }).map((_, i) => (
								<div
									key={i}
									className="card-premium p-4 h-20 animate-pulse bg-[var(--surface-raised)]"
								/>
							))}
						</div>
					) : (
						<div className="space-y-3">
							{DAY_ORDER.map((dow) => {
								const day = week[dow] ?? { enabled: false, windows: [] };
								return (
									<DayRow
										key={dow}
										dow={dow}
										dayLabel={DAY_LABELS[dow] ?? ""}
										day={day}
										onToggle={(enabled) => updateDay(dow, { enabled })}
										onAddWindow={() => addWindow(dow)}
										onRemoveWindow={(idx) => removeWindow(dow, idx)}
										onUpdateWindow={(idx, field, value) =>
											updateWindow(dow, idx, field, value)
										}
									/>
								);
							})}
						</div>
					)}

					{/* Sticky save */}
					<div
						className={cn(
							"sticky bottom-6 flex justify-end",
							"transition-opacity duration-200",
							isDirty ? "opacity-100" : "opacity-40 pointer-events-none",
						)}
					>
						<Button
							onClick={handleSave}
							disabled={!isDirty || isSaving}
							className="gap-2 shadow-[var(--shadow-float)] bg-[var(--brand)] hover:bg-[var(--brand-bright)] text-white"
						>
							{isSaving ? (
								<Loader2 className="w-4 h-4 animate-spin" />
							) : (
								<Save className="w-4 h-4" />
							)}
							Enregistrer les disponibilités
						</Button>
					</div>
				</motion.div>

				{/* ── Right: preview ── */}
				<motion.div
					initial={{ opacity: 0, y: 12 }}
					animate={{ opacity: 1, y: 0 }}
					transition={{ duration: 0.15, delay: 0.1, ease: [0.16, 1, 0.3, 1] }}
				>
					<div className="card-premium p-5 sticky top-8">
						<h3 className="text-sm font-semibold text-[var(--ink)] font-[family-name:var(--font-display)] mb-4">
							Aperçu — 7 prochains jours
						</h3>
						{preview === undefined ? (
							<div className="space-y-2">
								{Array.from({ length: 7 }).map((_, i) => (
									<div
										key={i}
										className="h-10 bg-[var(--surface-raised)] rounded-[var(--radius-sm)] animate-pulse"
									/>
								))}
							</div>
						) : (
							<div className="space-y-2">
								{preview.map((day) => (
									<div
										key={day.date}
										className={cn(
											"flex items-center gap-3 px-3 py-2 rounded-[var(--radius-sm)]",
											day.windows.length > 0
												? "bg-[var(--success-soft)]"
												: "bg-[var(--surface-raised)]",
										)}
									>
										<span
											className={cn(
												"text-xs font-semibold w-8",
												day.windows.length > 0
													? "text-[var(--success)]"
													: "text-[var(--ink-ghost)]",
											)}
										>
											{day.dayLabel}
										</span>
										<div className="flex-1 min-w-0">
											{day.windows.length > 0 ? (
												<div className="flex flex-wrap gap-1">
													{day.windows.map((w, i) => (
														<span
															key={i}
															className="text-[10px] font-medium text-[var(--success)] bg-white/60 px-1.5 py-0.5 rounded"
														>
															{w.start}–{w.end}
														</span>
													))}
												</div>
											) : (
												<span className="text-[11px] text-[var(--ink-ghost)]">
													Non disponible
												</span>
											)}
										</div>
									</div>
								))}
							</div>
						)}
						<p className="text-[11px] text-[var(--ink-ghost)] mt-3">
							L'aperçu se met à jour après l'enregistrement.
						</p>
					</div>
				</motion.div>
			</div>
		</div>
	);
}

// ─── DayRow ──────────────────────────────────────────────────────────────────

interface DayRowProps {
	dow: number;
	dayLabel: string;
	day: DayState;
	onToggle: (enabled: boolean) => void;
	onAddWindow: () => void;
	onRemoveWindow: (idx: number) => void;
	onUpdateWindow: (
		idx: number,
		field: "startMinute" | "endMinute",
		value: number,
	) => void;
}

function DayRow({
	dow,
	dayLabel,
	day,
	onToggle,
	onAddWindow,
	onRemoveWindow,
	onUpdateWindow,
}: DayRowProps) {
	return (
		<div
			className={cn(
				"card-premium p-4 transition-all duration-200",
				!day.enabled && "opacity-60",
			)}
		>
			{/* Header */}
			<div className="flex items-center gap-3 mb-3">
				<Switch
					checked={day.enabled}
					onCheckedChange={onToggle}
					aria-label={`Activer ${dayLabel}`}
				/>
				<span
					className={cn(
						"text-sm font-semibold font-[family-name:var(--font-display)] min-w-[90px]",
						day.enabled ? "text-[var(--ink)]" : "text-[var(--ink-muted)]",
					)}
				>
					{dayLabel}
				</span>
				{!day.enabled && (
					<span className="text-xs text-[var(--ink-ghost)]">
						Non disponible
					</span>
				)}
				{day.enabled && day.windows.length === 0 && (
					<span className="text-xs text-[var(--warning)]">
						Aucune plage — ajoute une fenêtre
					</span>
				)}
			</div>

			{/* Windows */}
			{day.enabled && (
				<div className="space-y-2 pl-10">
					{day.windows.map((w, idx) => (
						<WindowRow
							key={idx}
							window={w}
							onChangeStart={(v) => onUpdateWindow(idx, "startMinute", v)}
							onChangeEnd={(v) => onUpdateWindow(idx, "endMinute", v)}
							onRemove={() => onRemoveWindow(idx)}
						/>
					))}
					<button
						type="button"
						onClick={onAddWindow}
						className={cn(
							"flex items-center gap-1.5 text-xs font-medium",
							"text-[var(--brand)] hover:text-[var(--brand-bright)]",
							"transition-colors duration-150 mt-1",
						)}
					>
						<Plus className="w-3.5 h-3.5" />
						Ajouter une plage
					</button>
				</div>
			)}
		</div>
	);
}

// ─── WindowRow ────────────────────────────────────────────────────────────────

interface WindowRowProps {
	window: TimeWindow;
	onChangeStart: (v: number) => void;
	onChangeEnd: (v: number) => void;
	onRemove: () => void;
}

function WindowRow({
	window: w,
	onChangeStart,
	onChangeEnd,
	onRemove,
}: WindowRowProps) {
	return (
		<div className="flex items-center gap-2">
			{/* Start */}
			<Select
				value={String(w.startMinute)}
				onValueChange={(v) => onChangeStart(Number(v))}
			>
				<SelectTrigger className="h-8 w-24 text-xs">
					<SelectValue />
				</SelectTrigger>
				<SelectContent className="max-h-48">
					{TIME_OPTIONS.filter((o) => o.value < w.endMinute).map((o) => (
						<SelectItem
							key={o.value}
							value={String(o.value)}
							className="text-xs"
						>
							{o.label}
						</SelectItem>
					))}
				</SelectContent>
			</Select>

			<span className="text-xs text-[var(--ink-ghost)]">–</span>

			{/* End */}
			<Select
				value={String(w.endMinute)}
				onValueChange={(v) => onChangeEnd(Number(v))}
			>
				<SelectTrigger className="h-8 w-24 text-xs">
					<SelectValue />
				</SelectTrigger>
				<SelectContent className="max-h-48">
					{TIME_OPTIONS.filter((o) => o.value > w.startMinute).map((o) => (
						<SelectItem
							key={o.value}
							value={String(o.value)}
							className="text-xs"
						>
							{o.label}
						</SelectItem>
					))}
				</SelectContent>
			</Select>

			{/* Remove */}
			<button
				type="button"
				onClick={onRemove}
				className={cn(
					"flex items-center justify-center w-7 h-7 rounded-[var(--radius-sm)]",
					"text-[var(--ink-ghost)] hover:text-[var(--destructive)]",
					"hover:bg-[var(--destructive-soft)] transition-colors duration-150",
				)}
				aria-label="Supprimer la plage"
			>
				<Trash2 className="w-3.5 h-3.5" />
			</button>
		</div>
	);
}
