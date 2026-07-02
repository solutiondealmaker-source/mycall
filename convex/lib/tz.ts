// Timezone helpers — pure JS (Intl.DateTimeFormat), compatible Convex runtime.
//
// Model:
// - A "day" clicked by the prospect is sent as Date.UTC(y, m, d) — a tz-naive
//   marker for a calendar date.
// - Availability windows (userAvailability.startMinute/endMinute) are stored
//   as minutes-from-midnight in the user's own timezone.
// - Events have a "presentation timezone" (event.timezone), used to convert
//   the clicked date into a real UTC day window.
// - Slots are absolute UTC timestamps. To check availability, we convert the
//   slot's UTC time into the host's local (tz) day-of-week + minute-of-day
//   and match against the host's windows for that day.
//
// Source: ported verbatim from DG COACHING.

const DAY_SHORT_TO_DOW: Record<string, number> = {
	Sun: 0,
	Mon: 1,
	Tue: 2,
	Wed: 3,
	Thu: 4,
	Fri: 5,
	Sat: 6,
};

/** Returns the UTC offset (in minutes) of the given instant in the given tz. */
export function tzOffsetMinutes(utcMs: number, tz: string): number {
	const dtf = new Intl.DateTimeFormat("en-US", {
		timeZone: tz,
		year: "numeric",
		month: "2-digit",
		day: "2-digit",
		hour: "2-digit",
		minute: "2-digit",
		second: "2-digit",
		hour12: false,
	});
	const parts = dtf.formatToParts(new Date(utcMs));
	// Intl sometimes renders midnight as "24" instead of "00" on the `hour`
	// part — apply the normalization ONLY to `hour`, never to `day`/`month`.
	const get = (t: string) => {
		const v = parts.find((p) => p.type === t)?.value ?? "0";
		if (t === "hour" && v === "24") return 0;
		return Number(v);
	};
	const asUtc = Date.UTC(
		get("year"),
		get("month") - 1,
		get("day"),
		get("hour"),
		get("minute"),
		get("second"),
	);
	return Math.round((asUtc - utcMs) / 60_000);
}

/** Converts a tz-naive day marker (Date.UTC(y, m, d)) into the UTC ms of
 * 00:00:00 for that calendar date in `tz`. */
export function startOfDayInTz(dateMs: number, tz: string): number {
	const d = new Date(dateMs);
	const y = d.getUTCFullYear();
	const m = d.getUTCMonth();
	const day = d.getUTCDate();
	const naiveUtcMidnight = Date.UTC(y, m, day);
	const offset = tzOffsetMinutes(naiveUtcMidnight, tz);
	return naiveUtcMidnight - offset * 60_000;
}

/** At the given UTC instant, what day-of-week (0=Sun..6=Sat) and minute-of-day
 * (0..1439) does it fall on in `tz`? */
export function zonedDowAndMinutes(
	utcMs: number,
	tz: string,
): { dow: number; minutesOfDay: number } {
	const dtf = new Intl.DateTimeFormat("en-US", {
		timeZone: tz,
		weekday: "short",
		hour: "2-digit",
		minute: "2-digit",
		second: "2-digit",
		hour12: false,
	});
	const parts = dtf.formatToParts(new Date(utcMs));
	const get = (t: string) => parts.find((p) => p.type === t)?.value ?? "0";
	const weekday = get("weekday");
	const hh = Number(get("hour") === "24" ? "0" : get("hour"));
	const mm = Number(get("minute"));
	return {
		dow: DAY_SHORT_TO_DOW[weekday] ?? 0,
		minutesOfDay: hh * 60 + mm,
	};
}

/** Common timezones for UI select. */
export const COMMON_TIMEZONES = [
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
