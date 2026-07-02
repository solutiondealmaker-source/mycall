"use client";

import { CalendarIcon, ChevronDownIcon } from "lucide-react";
import { useState } from "react";
import {
	Popover,
	PopoverContent,
	PopoverTrigger,
} from "@/components/ui/popover";
import { cn } from "@/lib/utils";

// ─── Types ────────────────────────────────────────────────────────────────────

export interface DateRange {
	startMs: number;
	endMs: number;
	label: string;
}

// ─── Presets ──────────────────────────────────────────────────────────────────

function today(): Date {
	const d = new Date();
	d.setHours(0, 0, 0, 0);
	return d;
}

function endOfDay(d: Date): Date {
	const e = new Date(d);
	e.setHours(23, 59, 59, 999);
	return e;
}

export function getPresets(): { label: string; range: DateRange }[] {
	const now = today();
	const eod = endOfDay(new Date());

	const last7 = new Date(now);
	last7.setDate(last7.getDate() - 6);

	const last30 = new Date(now);
	last30.setDate(last30.getDate() - 29);

	const last90 = new Date(now);
	last90.setDate(last90.getDate() - 89);

	// Ce mois
	const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
	const monthEnd = new Date(now.getFullYear(), now.getMonth() + 1, 0);

	// Ce trimestre
	const qMonth = Math.floor(now.getMonth() / 3) * 3;
	const qStart = new Date(now.getFullYear(), qMonth, 1);
	const qEnd = new Date(now.getFullYear(), qMonth + 3, 0);

	// Tout (2 ans en arrière)
	const allStart = new Date(now);
	allStart.setFullYear(allStart.getFullYear() - 2);

	return [
		{
			label: "7 derniers jours",
			range: {
				startMs: last7.getTime(),
				endMs: endOfDay(new Date()).getTime(),
				label: "7 derniers jours",
			},
		},
		{
			label: "30 derniers jours",
			range: {
				startMs: last30.getTime(),
				endMs: eod.getTime(),
				label: "30 derniers jours",
			},
		},
		{
			label: "90 derniers jours",
			range: {
				startMs: last90.getTime(),
				endMs: eod.getTime(),
				label: "90 derniers jours",
			},
		},
		{
			label: "Ce mois",
			range: {
				startMs: monthStart.getTime(),
				endMs: endOfDay(monthEnd).getTime(),
				label: "Ce mois",
			},
		},
		{
			label: "Ce trimestre",
			range: {
				startMs: qStart.getTime(),
				endMs: endOfDay(qEnd).getTime(),
				label: "Ce trimestre",
			},
		},
		{
			label: "Tout",
			range: {
				startMs: allStart.getTime(),
				endMs: eod.getTime(),
				label: "Tout",
			},
		},
	];
}

export function getDefaultRange(): DateRange {
	const presets = getPresets();
	return presets[1]!.range; // 30 derniers jours
}

// ─── Component ────────────────────────────────────────────────────────────────

interface DateRangePickerProps {
	value: DateRange;
	onChange: (range: DateRange) => void;
}

export function DateRangePicker({ value, onChange }: DateRangePickerProps) {
	const [open, setOpen] = useState(false);
	const presets = getPresets();

	return (
		<Popover open={open} onOpenChange={setOpen}>
			<PopoverTrigger asChild>
				<button
					type="button"
					className={cn(
						"flex items-center gap-2 px-3 h-9 rounded-[var(--radius-sm)]",
						"bg-[var(--surface)] border border-[var(--border)]",
						"text-sm font-medium text-[var(--ink)]",
						"hover:border-[var(--brand)] hover:bg-[var(--brand-soft)]",
						"transition-colors duration-150",
						"focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--brand)]",
					)}
				>
					<CalendarIcon className="w-3.5 h-3.5 text-[var(--ink-muted)]" />
					<span>{value.label}</span>
					<ChevronDownIcon className="w-3.5 h-3.5 text-[var(--ink-ghost)]" />
				</button>
			</PopoverTrigger>
			<PopoverContent align="start" className="w-52 p-1.5">
				<div className="flex flex-col gap-0.5">
					{presets.map((p) => (
						<button
							key={p.label}
							type="button"
							onClick={() => {
								onChange(p.range);
								setOpen(false);
							}}
							className={cn(
								"flex items-center gap-2 px-3 py-2 rounded-md text-sm text-left w-full",
								"transition-colors duration-100",
								value.label === p.label
									? "bg-[var(--brand-soft)] text-[var(--brand)] font-medium"
									: "text-[var(--ink-muted)] hover:bg-[var(--surface-raised)] hover:text-[var(--ink)]",
							)}
						>
							{p.label}
						</button>
					))}
				</div>
			</PopoverContent>
		</Popover>
	);
}
