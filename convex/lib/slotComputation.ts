// Pure slot-computation helper. Zero Convex / DB dependency — testable in
// isolation with `bun test`. The caller is responsible for fetching the
// per-host context (availability windows, existing bookings, Google busy
// blocks) and shaping it into `HostCtxForCompute[]`.
//
// Source: ported verbatim from DG COACHING (proven in prod).

import { zonedDowAndMinutes } from "./tz";

const MS_PER_MIN = 60 * 1000;

export type SlotCandidate = {
	time: number;
	endTime: number;
	display: string;
};

export type BusyRange = { start: number; end: number };
export type BookingRange = { startTime: number; endTime: number };
export type AvailabilityWindow = { start: number; end: number };

export type HostCtxForCompute = {
	tz: string;
	windowsByDow: Map<number, AvailabilityWindow[]>;
	bookings: BookingRange[];
	googleBusy: BusyRange[];
};

export type ComputeSlotsInput = {
	dayStart: number;
	cutoff: number;
	durationMin: number;
	bufferBeforeMs: number;
	bufferAfterMs: number;
	slotIncrementMin: number;
	timeFormat: "h12" | "h24";
	hosts: HostCtxForCompute[];
};

function isHostFreeForSlot(
	hc: HostCtxForCompute,
	slotStartMs: number,
	slotEndMs: number,
	bufferBeforeMs: number,
	bufferAfterMs: number,
): boolean {
	const { dow: hStartDow, minutesOfDay: hStartMin } = zonedDowAndMinutes(
		slotStartMs,
		hc.tz,
	);
	const { dow: hEndDow, minutesOfDay: hEndMinExclusive } = zonedDowAndMinutes(
		slotEndMs - 1,
		hc.tz,
	);
	if (hStartDow !== hEndDow) return false;
	const hEndMin = hEndMinExclusive + 1;

	const windows = hc.windowsByDow.get(hStartDow) ?? [];
	const inWindow = windows.some(
		(w) => hStartMin >= w.start && hEndMin <= w.end,
	);
	if (!inWindow) return false;

	const hasBookingConflict = hc.bookings.some((b) => {
		const bStart = b.startTime - bufferBeforeMs;
		const bEnd = b.endTime + bufferAfterMs;
		return slotStartMs < bEnd && slotEndMs > bStart;
	});
	if (hasBookingConflict) return false;

	const hasGoogleConflict = hc.googleBusy.some(
		(b) => slotStartMs < b.end && slotEndMs > b.start,
	);
	if (hasGoogleConflict) return false;

	return true;
}

export function computeSlotsForDay(input: ComputeSlotsInput): SlotCandidate[] {
	const {
		dayStart,
		cutoff,
		durationMin,
		bufferBeforeMs,
		bufferAfterMs,
		slotIncrementMin,
		timeFormat,
		hosts,
	} = input;
	const durationMs = durationMin * MS_PER_MIN;
	const slots: SlotCandidate[] = [];

	for (
		let startMin = 0;
		startMin + durationMin <= 24 * 60;
		startMin += slotIncrementMin
	) {
		const slotStartMs = dayStart + startMin * MS_PER_MIN;
		const slotEndMs = slotStartMs + durationMs;
		if (slotStartMs <= cutoff) continue;

		const anyHostAvailable = hosts.some((hc) =>
			isHostFreeForSlot(
				hc,
				slotStartMs,
				slotEndMs,
				bufferBeforeMs,
				bufferAfterMs,
			),
		);

		if (anyHostAvailable) {
			slots.push({
				time: slotStartMs,
				endTime: slotEndMs,
				display: minutesToDisplayTime(startMin, timeFormat),
			});
		}
	}

	return slots;
}

// Short-circuit variant — returns as soon as one slot is found.
export function hasAnySlotForDay(
	input: Omit<ComputeSlotsInput, "timeFormat">,
): boolean {
	const {
		dayStart,
		cutoff,
		durationMin,
		bufferBeforeMs,
		bufferAfterMs,
		slotIncrementMin,
		hosts,
	} = input;
	const durationMs = durationMin * MS_PER_MIN;

	for (
		let startMin = 0;
		startMin + durationMin <= 24 * 60;
		startMin += slotIncrementMin
	) {
		const slotStartMs = dayStart + startMin * MS_PER_MIN;
		const slotEndMs = slotStartMs + durationMs;
		if (slotStartMs <= cutoff) continue;

		const anyHostAvailable = hosts.some((hc) =>
			isHostFreeForSlot(
				hc,
				slotStartMs,
				slotEndMs,
				bufferBeforeMs,
				bufferAfterMs,
			),
		);
		if (anyHostAvailable) return true;
	}

	return false;
}

// Format a minutes-of-day value respecting the caller's time-format preference.
// "h24" → "09:00" / "14:30" · "h12" → "9:00 AM" / "2:30 PM" / "12:00 PM".
export function minutesToDisplayTime(m: number, format: "h12" | "h24"): string {
	const h = Math.floor(m / 60);
	const min = m % 60;
	if (format === "h24") {
		return `${h.toString().padStart(2, "0")}:${min.toString().padStart(2, "0")}`;
	}
	const suffix = h < 12 ? "AM" : "PM";
	let h12 = h % 12;
	if (h12 === 0) h12 = 12;
	return `${h12}:${min.toString().padStart(2, "0")} ${suffix}`;
}

// Coerce alwaysAvailableDays to an array of ints (0..6). Accepts legacy boolean
// rows (true → all 7 days, false/undefined → none).
export function normalizeAlwaysAvailableDays(
	raw: boolean | number[] | undefined,
): number[] {
	if (Array.isArray(raw)) return raw.filter((n) => n >= 0 && n <= 6);
	if (raw === true) return [0, 1, 2, 3, 4, 5, 6];
	return [];
}
