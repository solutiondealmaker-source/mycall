// Disqualification evaluation — shared between server guard and client UI.
// A prospect is disqualified if at least one rule matches (OR semantics).
//
// Source: ported verbatim from DG COACHING.

export type DisqualificationRule = {
	questionLabel: string;
	answers: string[];
};

export function isDisqualified(
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
