"use client";

import { useMutation } from "convex/react";
import { useEffect, useRef } from "react";
import { captureUtmParams } from "@/lib/utm";
import type { BookClientProps } from "@/types/book";
import { api } from "../../../convex/_generated/api";
import { BookFlow } from "./book-flow";

/**
 * BookClient — wraps BookFlow + tracks page view once per session.
 */
export function BookClient({ event, questions, slug }: BookClientProps) {
	const trackPageView = useMutation(api.bookings.trackPageView);
	const viewTracked = useRef(false);

	useEffect(() => {
		if (viewTracked.current) return;
		viewTracked.current = true;

		// Fige la provenance dès l'arrivée : l'URL peut perdre ses ?utm_* ensuite.
		captureUtmParams();

		// Get or create a stable session ID for analytics
		const storageKey = `iclone:session:${slug}`;
		let sessionId = sessionStorage.getItem(storageKey);
		if (!sessionId) {
			sessionId = crypto.randomUUID();
			sessionStorage.setItem(storageKey, sessionId);
		}

		trackPageView({
			slug,
			sessionId,
			userAgent: navigator.userAgent,
			referer: document.referrer || undefined,
		}).catch(() => {
			// Silent — page view tracking is non-critical
		});
	}, [slug, trackPageView]);

	return <BookFlow event={event} questions={questions} slug={slug} />;
}
