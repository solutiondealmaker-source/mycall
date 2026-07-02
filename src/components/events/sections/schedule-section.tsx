"use client";

import { Clock } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { SectionShell } from "@/components/events/section-shell";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { cn } from "@/lib/utils";
import type { EventDoc, EventPatch } from "@/types/events";

// ─── Constants ────────────────────────────────────────────────────────────────

const DURATION_OPTIONS = [15, 20, 30, 45, 60, 75, 90, 120] as const;
const INCREMENT_OPTIONS = [10, 15, 20, 30, 45, 60] as const;

// Import depuis convex/lib/tz.ts côté client — dupliqué ici pour éviter
// l'import depuis le runtime Convex en contexte Next.js
const COMMON_TIMEZONES = [
	"Europe/Paris",
	"Europe/London",
	"Europe/Berlin",
	"Europe/Madrid",
	"Europe/Lisbon",
	"America/New_York",
	"America/Chicago",
	"America/Denver",
	"America/Los_Angeles",
	"America/Toronto",
	"America/Mexico_City",
	"America/Sao_Paulo",
	"Africa/Casablanca",
	"Africa/Abidjan",
	"Asia/Dubai",
	"Asia/Kolkata",
	"Asia/Bangkok",
	"Asia/Shanghai",
	"Asia/Tokyo",
	"Asia/Singapore",
	"Asia/Makassar",
	"Australia/Sydney",
	"Pacific/Auckland",
	"Pacific/Honolulu",
];

const DOW_LABELS = ["Dim", "Lun", "Mar", "Mer", "Jeu", "Ven", "Sam"];

// ─── Props ────────────────────────────────────────────────────────────────────

interface ScheduleSectionProps {
	event: EventDoc;
	onUpdate: (patch: EventPatch) => Promise<void>;
}

// ─── Form state ───────────────────────────────────────────────────────────────

interface ScheduleForm {
	durationMinutes: number;
	slotIncrementMinutes: number;
	bufferBeforeMinutes: number;
	bufferAfterMinutes: number;
	timeFormat: "h12" | "h24";
	timezone: string;
	rangeType: "rolling" | "indefinite";
	rangeDays: number;
	rescheduleRangeDays: number;
	minimumNoticeHours: number;
	businessDaysOnly: boolean;
	alwaysAvailableDaysEnabled: boolean;
	alwaysAvailableDays: number[];
	preventDoubleBooking: boolean;
	allowReschedule: boolean;
	rescheduleWithSameHost: boolean;
}

function formFromEvent(event: EventDoc): ScheduleForm {
	let alwaysAvailableDaysEnabled = false;
	let alwaysAvailableDays: number[] = [];

	if (Array.isArray(event.alwaysAvailableDays)) {
		alwaysAvailableDaysEnabled = true;
		alwaysAvailableDays = event.alwaysAvailableDays;
	} else if (event.alwaysAvailableDays === true) {
		alwaysAvailableDaysEnabled = true;
		alwaysAvailableDays = [0, 1, 2, 3, 4, 5, 6];
	}

	return {
		durationMinutes: event.durationMinutes,
		slotIncrementMinutes: event.slotIncrementMinutes ?? 15,
		bufferBeforeMinutes: event.bufferBeforeMinutes ?? 0,
		bufferAfterMinutes: event.bufferAfterMinutes ?? 0,
		timeFormat: event.timeFormat ?? "h24",
		timezone: event.timezone,
		rangeType: event.rangeType ?? "rolling",
		rangeDays: event.rangeDays ?? 60,
		rescheduleRangeDays: event.rescheduleRangeDays ?? 0,
		minimumNoticeHours: event.minimumNoticeHours ?? 24,
		businessDaysOnly: event.businessDaysOnly ?? false,
		alwaysAvailableDaysEnabled,
		alwaysAvailableDays,
		preventDoubleBooking: event.preventDoubleBooking ?? true,
		allowReschedule: event.allowReschedule,
		rescheduleWithSameHost: event.rescheduleWithSameHost ?? false,
	};
}

// ─── Composant ────────────────────────────────────────────────────────────────

/**
 * ScheduleSection — durée, slots, buffers, fuseau, fenêtre rolling, reschedule.
 */
export function ScheduleSection({ event, onUpdate }: ScheduleSectionProps) {
	const [form, setForm] = useState<ScheduleForm>(() => formFromEvent(event));
	const [isDirty, setIsDirty] = useState(false);

	useEffect(() => {
		setForm(formFromEvent(event));
		setIsDirty(false);
	}, [event]);

	const patch = useCallback(
		<K extends keyof ScheduleForm>(key: K, value: ScheduleForm[K]) => {
			setForm((prev) => ({ ...prev, [key]: value }));
			setIsDirty(true);
		},
		[],
	);

	const toggleDow = useCallback((dow: number) => {
		setForm((prev) => {
			const current = prev.alwaysAvailableDays;
			const next = current.includes(dow)
				? current.filter((d) => d !== dow)
				: [...current, dow].sort((a, b) => a - b);
			return { ...prev, alwaysAvailableDays: next };
		});
		setIsDirty(true);
	}, []);

	const handleSave = useCallback(async () => {
		let alwaysAvailableDays: boolean | number[] | undefined;
		if (form.alwaysAvailableDaysEnabled) {
			alwaysAvailableDays =
				form.alwaysAvailableDays.length === 7 ? true : form.alwaysAvailableDays;
		}

		await onUpdate({
			durationMinutes: form.durationMinutes,
			slotIncrementMinutes: form.slotIncrementMinutes,
			bufferBeforeMinutes: form.bufferBeforeMinutes || undefined,
			bufferAfterMinutes: form.bufferAfterMinutes || undefined,
			timeFormat: form.timeFormat,
			timezone: form.timezone,
			rangeType: form.rangeType,
			rangeDays: form.rangeType === "rolling" ? form.rangeDays : undefined,
			rescheduleRangeDays: form.rescheduleRangeDays || undefined,
			minimumNoticeHours: form.minimumNoticeHours || undefined,
			businessDaysOnly: form.businessDaysOnly || undefined,
			alwaysAvailableDays,
			preventDoubleBooking: form.preventDoubleBooking || undefined,
			allowReschedule: form.allowReschedule,
			rescheduleWithSameHost: form.rescheduleWithSameHost || undefined,
		});
		setIsDirty(false);
	}, [form, onUpdate]);

	const handleCancel = useCallback(() => {
		setForm(formFromEvent(event));
		setIsDirty(false);
	}, [event]);

	return (
		<SectionShell
			icon={Clock}
			title="Horaires et limites"
			description="Durée, créneaux, buffers, fenêtre de disponibilité et restrictions."
			onSave={handleSave}
			isDirty={isDirty}
			onCancel={handleCancel}
		>
			<div className="space-y-8 max-w-[520px]">
				{/* Durée & slots */}
				<div className="space-y-4">
					<SectionGroupLabel>Durée des créneaux</SectionGroupLabel>

					<div className="grid grid-cols-2 gap-4">
						<Field label="Durée de l'appel">
							<Select
								value={String(form.durationMinutes)}
								onValueChange={(v) => patch("durationMinutes", Number(v))}
							>
								<SelectTrigger className="h-10">
									<SelectValue />
								</SelectTrigger>
								<SelectContent>
									{DURATION_OPTIONS.map((d) => (
										<SelectItem key={d} value={String(d)}>
											{d} min
										</SelectItem>
									))}
								</SelectContent>
							</Select>
						</Field>

						<Field label="Incrément des slots">
							<Select
								value={String(form.slotIncrementMinutes)}
								onValueChange={(v) => patch("slotIncrementMinutes", Number(v))}
							>
								<SelectTrigger className="h-10">
									<SelectValue />
								</SelectTrigger>
								<SelectContent>
									{INCREMENT_OPTIONS.map((d) => (
										<SelectItem key={d} value={String(d)}>
											{d} min
										</SelectItem>
									))}
								</SelectContent>
							</Select>
						</Field>
					</div>

					<div className="grid grid-cols-2 gap-4">
						<Field label="Buffer avant (min)">
							<Input
								type="number"
								min={0}
								max={120}
								value={form.bufferBeforeMinutes}
								onChange={(e) =>
									patch(
										"bufferBeforeMinutes",
										Math.max(0, Number(e.target.value)),
									)
								}
								className="h-10"
							/>
						</Field>
						<Field label="Buffer après (min)">
							<Input
								type="number"
								min={0}
								max={120}
								value={form.bufferAfterMinutes}
								onChange={(e) =>
									patch(
										"bufferAfterMinutes",
										Math.max(0, Number(e.target.value)),
									)
								}
								className="h-10"
							/>
						</Field>
					</div>
				</div>

				<Divider />

				{/* Format & fuseau */}
				<div className="space-y-4">
					<SectionGroupLabel>Affichage horaire</SectionGroupLabel>

					<Field label="Format d'heure">
						<RadioGroup
							value={form.timeFormat}
							onValueChange={(v) => patch("timeFormat", v as "h12" | "h24")}
							className="flex items-center gap-4"
						>
							{(["h24", "h12"] as const).map((f) => (
								<div key={f} className="flex items-center gap-2">
									<RadioGroupItem value={f} id={`tf-${f}`} />
									<Label htmlFor={`tf-${f}`} className="text-sm cursor-pointer">
										{f === "h24" ? "24h (14:30)" : "12h (2:30 PM)"}
									</Label>
								</div>
							))}
						</RadioGroup>
					</Field>

					<Field label="Fuseau horaire de présentation">
						<Select
							value={form.timezone}
							onValueChange={(v) => patch("timezone", v)}
						>
							<SelectTrigger className="h-10">
								<SelectValue />
							</SelectTrigger>
							<SelectContent>
								{COMMON_TIMEZONES.map((tz) => (
									<SelectItem key={tz} value={tz}>
										{tz}
									</SelectItem>
								))}
							</SelectContent>
						</Select>
					</Field>
				</div>

				<Divider />

				{/* Fenêtre de disponibilité */}
				<div className="space-y-4">
					<SectionGroupLabel>Fenêtre de disponibilité</SectionGroupLabel>

					<Field label="Mode de fenêtre">
						<RadioGroup
							value={form.rangeType}
							onValueChange={(v) =>
								patch("rangeType", v as "rolling" | "indefinite")
							}
							className="flex flex-col gap-3"
						>
							<div className="flex items-start gap-2.5">
								<RadioGroupItem
									value="rolling"
									id="range-rolling"
									className="mt-0.5"
								/>
								<div>
									<Label
										htmlFor="range-rolling"
										className="text-sm cursor-pointer font-medium"
									>
										Fenêtre glissante
									</Label>
									<p className="text-xs text-[var(--ink-muted)]">
										Les prospects ne peuvent réserver que dans les N prochains
										jours.
									</p>
								</div>
							</div>
							<div className="flex items-start gap-2.5">
								<RadioGroupItem
									value="indefinite"
									id="range-indefinite"
									className="mt-0.5"
								/>
								<div>
									<Label
										htmlFor="range-indefinite"
										className="text-sm cursor-pointer font-medium"
									>
										Sans limite
									</Label>
									<p className="text-xs text-[var(--ink-muted)]">
										La réservation est ouverte indéfiniment.
									</p>
								</div>
							</div>
						</RadioGroup>
					</Field>

					{form.rangeType === "rolling" && (
						<div className="grid grid-cols-2 gap-4">
							<Field label="Jours maximum (rolling)">
								<Input
									type="number"
									min={1}
									max={365}
									value={form.rangeDays}
									onChange={(e) =>
										patch("rangeDays", Math.max(1, Number(e.target.value)))
									}
									className="h-10"
								/>
							</Field>
							<Field label="Fenêtre reschedule (jours)">
								<Input
									type="number"
									min={0}
									max={365}
									value={form.rescheduleRangeDays || ""}
									placeholder="Identique"
									onChange={(e) =>
										patch(
											"rescheduleRangeDays",
											Math.max(0, Number(e.target.value)),
										)
									}
									className="h-10"
								/>
							</Field>
						</div>
					)}

					<Field label="Délai minimum avant réservation (heures)">
						<Input
							type="number"
							min={0}
							max={720}
							value={form.minimumNoticeHours}
							onChange={(e) =>
								patch("minimumNoticeHours", Math.max(0, Number(e.target.value)))
							}
							className="h-10 max-w-[140px]"
						/>
					</Field>
				</div>

				<Divider />

				{/* Comportement booking */}
				<div className="space-y-3">
					<SectionGroupLabel>Comportement</SectionGroupLabel>

					<ToggleRow
						label="Jours ouvrables uniquement"
						description="Exclut samedis et dimanches de la fenêtre de booking."
						checked={form.businessDaysOnly}
						onCheckedChange={(v) => patch("businessDaysOnly", v)}
					/>

					<ToggleRow
						label="Prévenir les doubles réservations"
						description="Un prospect ne peut pas réserver deux créneaux simultanément."
						checked={form.preventDoubleBooking}
						onCheckedChange={(v) => patch("preventDoubleBooking", v)}
					/>

					<ToggleRow
						label="Autoriser la reprogrammation"
						description="Le prospect peut déplacer son RDV via le lien reschedule."
						checked={form.allowReschedule}
						onCheckedChange={(v) => patch("allowReschedule", v)}
					/>

					{form.allowReschedule && (
						<ToggleRow
							label="Reprogrammation avec le même hôte"
							description="Le prospect retrouve le même closer lors du reschedule."
							checked={form.rescheduleWithSameHost}
							onCheckedChange={(v) => patch("rescheduleWithSameHost", v)}
							indent
						/>
					)}

					<ToggleRow
						label="Jours toujours disponibles"
						description="Certains jours de la semaine ignorent la fenêtre glissante."
						checked={form.alwaysAvailableDaysEnabled}
						onCheckedChange={(v) => patch("alwaysAvailableDaysEnabled", v)}
					/>

					{form.alwaysAvailableDaysEnabled && (
						<div className="ml-4 pl-4 border-l border-[var(--border)] flex items-center gap-2 flex-wrap">
							{DOW_LABELS.map((label, dow) => (
								<button
									key={dow}
									type="button"
									onClick={() => toggleDow(dow)}
									className={cn(
										"w-10 h-10 rounded-[var(--radius-sm)] text-xs font-semibold transition-all duration-150",
										form.alwaysAvailableDays.includes(dow)
											? "bg-[var(--brand)] text-white"
											: "bg-[var(--surface-raised)] text-[var(--ink-muted)] hover:bg-[var(--surface-muted)] hover:text-[var(--ink)]",
									)}
								>
									{label}
								</button>
							))}
						</div>
					)}
				</div>
			</div>
		</SectionShell>
	);
}

// ─── Sub-components ───────────────────────────────────────────────────────────

function SectionGroupLabel({ children }: { children: React.ReactNode }) {
	return (
		<h3 className="text-xs font-semibold uppercase tracking-widest text-[var(--ink-ghost)] font-[family-name:var(--font-body)]">
			{children}
		</h3>
	);
}

function Divider() {
	return <div className="border-t border-[var(--border)]" />;
}

function Field({
	label,
	children,
}: {
	label: string;
	children: React.ReactNode;
}) {
	return (
		<div className="space-y-1.5">
			<Label className="text-xs font-medium text-[var(--ink-muted)]">
				{label}
			</Label>
			{children}
		</div>
	);
}

interface ToggleRowProps {
	label: string;
	description?: string;
	checked: boolean;
	onCheckedChange: (checked: boolean) => void;
	indent?: boolean;
}

function ToggleRow({
	label,
	description,
	checked,
	onCheckedChange,
	indent,
}: ToggleRowProps) {
	return (
		<div
			className={cn(
				"flex items-start justify-between rounded-[var(--radius-md)] border border-[var(--border)] bg-[var(--surface-raised)] px-4 py-3 gap-4",
				indent &&
					"ml-4 border-l-[2px] border-l-[var(--brand)]/20 rounded-l-none",
			)}
		>
			<div className="space-y-0.5 flex-1">
				<p className="text-sm font-medium text-[var(--ink)]">{label}</p>
				{description && (
					<p className="text-xs text-[var(--ink-muted)]">{description}</p>
				)}
			</div>
			<Switch
				checked={checked}
				onCheckedChange={onCheckedChange}
				className="shrink-0 mt-0.5"
			/>
		</div>
	);
}
