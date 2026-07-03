import { ConvexHttpClient } from "convex/browser";
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { BookClient } from "@/components/book/book-client";
import type { EventDoc, EventQuestion } from "@/types/events";
import { api } from "../../../../../convex/_generated/api";

// ─── SSR Convex client ────────────────────────────────────────────────────────

function getConvexClient() {
	const url = process.env.NEXT_PUBLIC_CONVEX_URL;
	if (!url) throw new Error("NEXT_PUBLIC_CONVEX_URL is not set");
	return new ConvexHttpClient(url);
}

// ─── Metadata ─────────────────────────────────────────────────────────────────

interface PageProps {
	params: Promise<{ slug: string }>;
}

export async function generateMetadata({
	params,
}: PageProps): Promise<Metadata> {
	const { slug } = await params;
	const convex = getConvexClient();

	let event: EventDoc | null = null;
	try {
		event = await convex.query(api.events.getBySlug, { slug });
	} catch {
		// Silently fall back to defaults
	}

	if (!event) {
		return {
			title: "Réservation — Mycall",
			description: "Prenez rendez-vous en ligne.",
		};
	}

	const title = `${event.name} — Réservation`;
	const description = `Réservez votre créneau pour : ${event.name}. Durée : ${event.durationMinutes} minutes.`;

	return {
		title,
		description,
		openGraph: {
			title,
			description,
			type: "website",
		},
		twitter: {
			card: "summary",
			title,
			description,
		},
	};
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default async function BookingPage({ params }: PageProps) {
	const { slug } = await params;
	const convex = getConvexClient();

	// Fetch event + questions in parallel
	let event: EventDoc | null = null;
	let questions: EventQuestion[] = [];

	try {
		[event, questions] = await Promise.all([
			convex.query(api.events.getBySlug, { slug }),
			convex.query(api.events.listQuestionsPublic, { slug }),
		]);
	} catch {
		notFound();
	}

	if (!event) notFound();
	if (!event.isActive) notFound();

	return <BookClient event={event} questions={questions} slug={slug} />;
}
