// Utilities for matching leads across phone / email / name.
// Avoids creating duplicate rows when the prospect already exists with a
// slightly different format (spaces in phone, upper/lower email, accents).
//
// Source: ported verbatim from DG COACHING (proven in prod).

export function normalizePhone(raw: string | undefined | null): string {
	if (!raw) return "";
	const cleaned = raw.replace(/[^\d+]/g, "");
	if (!cleaned) return "";
	const plus = cleaned.startsWith("+") ? "+" : "";
	const digits = cleaned.replace(/\+/g, "");
	// FR national numbers: 0XXXXXXXXX → +33XXXXXXXXX
	if (!plus && digits.startsWith("0") && digits.length === 10) {
		return `+33${digits.slice(1)}`;
	}
	return plus + digits;
}

export function normalizeEmail(raw: string | undefined | null): string {
	if (!raw) return "";
	return raw.trim().toLowerCase();
}

export function normalizeName(raw: string | undefined | null): string {
	if (!raw) return "";
	return raw
		.trim()
		.toLowerCase()
		.normalize("NFD")
		.replace(/[̀-ͯ]/g, "")
		.replace(/\s+/g, " ");
}

export function sameLead(
	a: {
		phone?: string;
		email?: string;
		firstName?: string;
		lastName?: string;
		name?: string;
	},
	b: {
		phone?: string;
		email?: string;
		firstName?: string;
		lastName?: string;
		name?: string;
	},
): boolean {
	const aPhone = normalizePhone(a.phone);
	const bPhone = normalizePhone(b.phone);
	if (aPhone && bPhone && aPhone === bPhone) return true;
	const aEmail = normalizeEmail(a.email);
	const bEmail = normalizeEmail(b.email);
	if (aEmail && bEmail && aEmail === bEmail) return true;
	const aName = normalizeName(
		a.name ?? `${a.firstName ?? ""} ${a.lastName ?? ""}`,
	);
	const bName = normalizeName(
		b.name ?? `${b.firstName ?? ""} ${b.lastName ?? ""}`,
	);
	if (aName && bName && aName === bName) return true;
	return false;
}
