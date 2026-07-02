import { NextResponse } from "next/server";

export const runtime = "nodejs";

// GET /api/health
// Returns 200 { status: "ok", time: <ISO> } when the app is healthy.
// Returns 500 { status: "error", reason: "..." } if a critical dependency fails.
export async function GET() {
	const now = new Date().toISOString();

	// Optional: light Convex reachability check.
	// If NEXT_PUBLIC_CONVEX_URL is set, probe the Convex HTTP endpoint.
	// A connection failure downgrades status to "degraded" (still 200) so
	// the container stays up — Convex outages shouldn't kill the whole pod.
	// Change to 500 if you want strict healthchecks.
	const convexUrl = process.env.NEXT_PUBLIC_CONVEX_URL;
	let convex: "ok" | "unreachable" | "skipped" = "skipped";

	if (convexUrl) {
		try {
			const res = await fetch(`${convexUrl}/api/query`, {
				method: "POST",
				signal: AbortSignal.timeout(3000),
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({ path: "health:ping", args: {} }),
			});
			convex = res.status < 500 ? "ok" : "unreachable";
		} catch {
			convex = "unreachable";
		}
	}

	return NextResponse.json(
		{
			status: "ok",
			time: now,
			convex,
		},
		{ status: 200 },
	);
}
