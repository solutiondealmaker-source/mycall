"use client";

import { AnimatePresence, motion } from "framer-motion";
import { useEffect, useMemo, useRef, useState } from "react";
import { cn } from "@/lib/utils";
import type { BookingResult, BookSessionData } from "@/types/book";
import type { EventDoc, EventQuestion } from "@/types/events";
import { CalendarStep } from "./calendar-step";
import { FormStep } from "./form-step";
import { BookingStepper } from "./stepper";
import { SuccessStep } from "./success-step";

// ─── Props ────────────────────────────────────────────────────────────────────

interface BookFlowProps {
	event: EventDoc;
	questions: EventQuestion[];
	slug: string;
}

// ─── Default data ─────────────────────────────────────────────────────────────

const DEFAULT_DATA: BookSessionData = {
	firstName: "",
	lastName: "",
	phone: "",
	email: "",
	formAnswers: {},
};

// ─── BookFlow ─────────────────────────────────────────────────────────────────

type Step = "form" | "calendar" | "success";

export function BookFlow({ event, questions, slug }: BookFlowProps) {
	const [step, setStep] = useState<Step>("form");
	const [data, setData] = useState<BookSessionData>(DEFAULT_DATA);
	const [result, setResult] = useState<BookingResult | null>(null);

	// Stable sessionId — persisted in sessionStorage
	const sessionId = useMemo(() => {
		if (typeof window === "undefined") return crypto.randomUUID();
		const key = `iclone:session:${slug}`;
		const existing = sessionStorage.getItem(key);
		if (existing) return existing;
		const fresh = crypto.randomUUID();
		sessionStorage.setItem(key, fresh);
		return fresh;
	}, [slug]);

	function handleFormNext(d: BookSessionData) {
		setData(d);
		setStep("calendar");
	}

	function handleCalendarBack() {
		setStep("form");
	}

	function handleSuccess(r: BookingResult) {
		setResult(r);
		setStep("success");
	}

	// Scroll to top on step change
	const cardRef = useRef<HTMLDivElement>(null);
	useEffect(() => {
		cardRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
	}, [step]);

	const currentStepNum: 1 | 2 = step === "form" ? 1 : 2;

	return (
		<motion.div
			ref={cardRef}
			initial={{ opacity: 0, y: 12 }}
			animate={{ opacity: 1, y: 0 }}
			transition={{ duration: 0.4, ease: [0.16, 1, 0.3, 1] }}
			className={cn(
				"bg-[var(--surface)] rounded-[var(--radius-xl)]",
				"border border-[var(--border)]",
				"shadow-[var(--shadow-float)]",
				"overflow-hidden",
				"grain",
			)}
		>
			{/* Stepper — hidden on success */}
			{step !== "success" && (
				<div className="px-6 md:px-8 py-4 border-b border-[var(--border)] bg-[var(--surface-raised)]/50">
					<BookingStepper current={currentStepNum} />
				</div>
			)}

			{/* Step content */}
			<AnimatePresence mode="wait">
				{step === "form" && (
					<motion.div
						key="form"
						initial={{ opacity: 0, x: -16 }}
						animate={{ opacity: 1, x: 0 }}
						exit={{ opacity: 0, x: -16 }}
						transition={{ duration: 0.25, ease: [0.16, 1, 0.3, 1] }}
					>
						<FormStep
							event={event}
							questions={questions}
							slug={slug}
							sessionId={sessionId}
							initialData={data}
							onNext={handleFormNext}
						/>
					</motion.div>
				)}

				{step === "calendar" && (
					<motion.div
						key="calendar"
						initial={{ opacity: 0, x: 16 }}
						animate={{ opacity: 1, x: 0 }}
						exit={{ opacity: 0, x: 16 }}
						transition={{ duration: 0.25, ease: [0.16, 1, 0.3, 1] }}
					>
						<CalendarStep
							event={event}
							questions={questions}
							slug={slug}
							sessionId={sessionId}
							data={data}
							onBack={handleCalendarBack}
							onSuccess={handleSuccess}
						/>
					</motion.div>
				)}

				{step === "success" && result && (
					<motion.div
						key="success"
						initial={{ opacity: 0, scale: 0.97 }}
						animate={{ opacity: 1, scale: 1 }}
						exit={{ opacity: 0 }}
						transition={{ duration: 0.35, ease: [0.16, 1, 0.3, 1] }}
					>
						<SuccessStep event={event} result={result} />
					</motion.div>
				)}
			</AnimatePresence>
		</motion.div>
	);
}
