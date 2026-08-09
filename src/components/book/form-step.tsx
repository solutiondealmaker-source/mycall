"use client";

import { useMutation } from "convex/react";
import { AnimatePresence, motion } from "framer-motion";
import DOMPurify from "isomorphic-dompurify";
import { ArrowRight, Calendar, MapPin } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import type { BookSessionData } from "@/types/book";
import type { EventDoc, EventQuestion } from "@/types/events";
import { api } from "../../../convex/_generated/api";
import { PhoneField } from "./phone-field";

// ─── Props ────────────────────────────────────────────────────────────────────

interface FormStepProps {
	event: EventDoc;
	questions: EventQuestion[];
	slug: string;
	sessionId: string;
	initialData: BookSessionData;
	onNext: (data: BookSessionData) => void;
}

// ─── Validation ───────────────────────────────────────────────────────────────

type FieldErrors = Partial<Record<keyof BookSessionData | string, string>>;

function validatePrimary(data: BookSessionData): FieldErrors {
	const errors: FieldErrors = {};
	if (!data.firstName.trim()) errors.firstName = "Prénom requis";
	if (!data.lastName.trim()) errors.lastName = "Nom requis";

	const phoneDigits = data.phone.replace(/\D/g, "");
	if (phoneDigits.length < 6) errors.phone = "Numéro de téléphone invalide";

	const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
	if (!data.email.trim()) errors.email = "Email requis";
	else if (!emailRegex.test(data.email)) errors.email = "Email invalide";

	return errors;
}

function validateQuestions(
	questions: EventQuestion[],
	answers: Record<string, string | string[]>,
): FieldErrors {
	const errors: FieldErrors = {};
	for (const q of questions) {
		if (q.type === "email") continue; // handled in primary
		if (!q.required) continue;
		const answer = answers[q.label];
		if (
			answer === undefined ||
			answer === "" ||
			(Array.isArray(answer) && answer.length === 0)
		) {
			errors[q.label] = "Ce champ est requis";
		}
	}
	return errors;
}

// ─── Mini calendar preview ────────────────────────────────────────────────────

function MiniCalendarPreview() {
	const now = new Date();
	const year = now.getFullYear();
	const month = now.getMonth();
	const daysInMonth = new Date(year, month + 1, 0).getDate();
	const firstDow = new Date(year, month, 1).getDay();
	const today = now.getDate();

	const monthNames = [
		"Janvier",
		"Février",
		"Mars",
		"Avril",
		"Mai",
		"Juin",
		"Juillet",
		"Août",
		"Septembre",
		"Octobre",
		"Novembre",
		"Décembre",
	];

	// Décoratif uniquement (aria-hidden) — aucune fausse disponibilité affichée.
	const fakeAvailable = new Set<number>();

	return (
		<div className="select-none pointer-events-none" aria-hidden="true">
			<div className="flex items-center justify-between mb-4">
				<span className="text-base font-semibold text-[var(--ink)] font-[family-name:var(--font-display)]">
					{monthNames[month]} {year}
				</span>
			</div>

			{/* Day headers */}
			<div className="grid grid-cols-7 gap-1 mb-2">
				{["DIM", "LUN", "MAR", "MER", "JEU", "VEN", "SAM"].map((d, i) => (
					<div
						key={i}
						className="text-center text-[10px] text-[var(--ink-ghost)] font-semibold py-1 tracking-wider"
					>
						{d}
					</div>
				))}
			</div>

			{/* Days grid */}
			<div className="grid grid-cols-7 gap-1">
				{Array.from({ length: firstDow }).map((_, i) => (
					<div key={`empty-${i}`} />
				))}
				{Array.from({ length: daysInMonth }).map((_, i) => {
					const day = i + 1;
					const isAvail = fakeAvailable.has(day);
					return (
						<div
							key={day}
							className={cn(
								"aspect-square w-full max-w-[44px] mx-auto flex items-center justify-center rounded-[var(--radius-md)] text-sm",
								isAvail
									? "bg-[var(--brand-soft)] text-[var(--brand)] font-medium"
									: "text-[var(--ink-ghost)]",
							)}
						>
							{day}
						</div>
					);
				})}
			</div>
		</div>
	);
}

// ─── Question field ───────────────────────────────────────────────────────────

interface QuestionFieldProps {
	question: EventQuestion;
	value: string | string[];
	onChange: (val: string | string[]) => void;
	error?: string;
}

function QuestionField({
	question,
	value,
	onChange,
	error,
}: QuestionFieldProps) {
	const options =
		question.type === "yes_no" ? ["Oui", "Non"] : (question.options ?? []);

	if (question.type === "long_text") {
		return (
			<textarea
				value={value as string}
				onChange={(e) => onChange(e.target.value)}
				placeholder="Votre réponse..."
				rows={3}
				className={cn(
					"w-full px-3 py-2 text-sm rounded-[var(--radius-md)] border resize-none",
					"bg-[var(--surface)] text-[var(--ink)] placeholder:text-[var(--ink-ghost)]",
					"focus:outline-none focus:ring-2 focus:ring-[var(--brand)]/20 focus:border-[var(--brand)]",
					"transition-all duration-150",
					error
						? "border-[var(--destructive)]"
						: "border-[var(--border-strong)]",
				)}
				aria-invalid={!!error}
			/>
		);
	}

	if (question.type === "single_select" || question.type === "yes_no") {
		return (
			<div className="grid grid-cols-2 gap-2">
				{options.map((opt) => {
					const isSelected = value === opt;
					return (
						<button
							key={opt}
							type="button"
							onClick={() => onChange(opt)}
							className={cn(
								"px-3 py-2.5 rounded-[var(--radius-md)] text-sm font-medium text-left",
								"border transition-all duration-150",
								isSelected
									? "bg-[var(--brand-soft)] border-[var(--brand)] text-[var(--brand)]"
									: "bg-[var(--surface)] border-[var(--border-strong)] text-[var(--ink)] hover:bg-[var(--surface-raised)]",
							)}
							aria-pressed={isSelected}
						>
							{opt}
						</button>
					);
				})}
			</div>
		);
	}

	if (question.type === "multi_select") {
		const selected = Array.isArray(value) ? value : [];
		return (
			<div className="grid grid-cols-2 gap-2">
				{options.map((opt) => {
					const isSelected = selected.includes(opt);
					return (
						<button
							key={opt}
							type="button"
							onClick={() => {
								if (isSelected) {
									onChange(selected.filter((v) => v !== opt));
								} else {
									onChange([...selected, opt]);
								}
							}}
							className={cn(
								"px-3 py-2.5 rounded-[var(--radius-md)] text-sm font-medium text-left",
								"border transition-all duration-150 flex items-center gap-2",
								isSelected
									? "bg-[var(--brand-soft)] border-[var(--brand)] text-[var(--brand)]"
									: "bg-[var(--surface)] border-[var(--border-strong)] text-[var(--ink)] hover:bg-[var(--surface-raised)]",
							)}
							aria-pressed={isSelected}
						>
							<span
								className={cn(
									"w-3.5 h-3.5 rounded shrink-0 border-2 flex items-center justify-center",
									isSelected
										? "bg-[var(--brand)] border-[var(--brand)]"
										: "border-[var(--border-strong)] bg-[var(--surface)]",
								)}
							>
								{isSelected && (
									<svg
										viewBox="0 0 12 12"
										className="w-2.5 h-2.5 text-white"
										fill="none"
										aria-hidden="true"
									>
										<path
											d="M2 6l3 3 5-5"
											stroke="currentColor"
											strokeWidth={2}
											strokeLinecap="round"
											strokeLinejoin="round"
										/>
									</svg>
								)}
							</span>
							{opt}
						</button>
					);
				})}
			</div>
		);
	}

	// Default: text / number input
	return (
		<input
			type={question.type === "number" ? "number" : "text"}
			value={value as string}
			onChange={(e) => onChange(e.target.value)}
			placeholder="Votre réponse..."
			className={cn(
				"w-full h-10 px-3 text-sm rounded-[var(--radius-md)] border",
				"bg-[var(--surface)] text-[var(--ink)] placeholder:text-[var(--ink-ghost)]",
				"focus:outline-none focus:ring-2 focus:ring-[var(--brand)]/20 focus:border-[var(--brand)]",
				"transition-all duration-150",
				error ? "border-[var(--destructive)]" : "border-[var(--border-strong)]",
			)}
			aria-invalid={!!error}
		/>
	);
}

// ─── FormStep ─────────────────────────────────────────────────────────────────

export function FormStep({
	event,
	questions,
	slug,
	sessionId,
	initialData,
	onNext,
}: FormStepProps) {
	const [data, setData] = useState<BookSessionData>(initialData);
	const [errors, setErrors] = useState<FieldErrors>({});
	const [subStep, setSubStep] = useState<"primary" | "questions">("primary");
	const captureTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

	const capturePartialLead = useMutation(api.partialLeads.capturePartialLead);

	// Secondary questions (excluding email which is in primary)
	const secondaryQuestions = questions.filter((q) => q.type !== "email");
	const hasSecondaryQuestions = secondaryQuestions.length > 0;

	// Debounced partial lead capture
	const scheduleCapture = useCallback(
		(current: BookSessionData) => {
			if (captureTimer.current) clearTimeout(captureTimer.current);
			captureTimer.current = setTimeout(() => {
				const phoneDigits = current.phone.replace(/\D/g, "");
				if (
					current.firstName.trim() &&
					current.lastName.trim() &&
					phoneDigits.length >= 6
				) {
					capturePartialLead({
						eventSlug: slug,
						sessionId,
						firstName: current.firstName.trim(),
						lastName: current.lastName.trim(),
						phone: current.phone,
						email: current.email || undefined,
						formAnswers:
							Object.keys(current.formAnswers).length > 0
								? JSON.stringify(current.formAnswers)
								: undefined,
					}).catch(() => {
						// Silent — non-critical
					});
				}
			}, 600);
		},
		[capturePartialLead, slug, sessionId],
	);

	useEffect(() => {
		return () => {
			if (captureTimer.current) clearTimeout(captureTimer.current);
		};
	}, []);

	function updateField<K extends keyof BookSessionData>(
		field: K,
		value: BookSessionData[K],
	) {
		const next = { ...data, [field]: value };
		setData(next);
		// Clear error on change
		if (errors[field]) setErrors((e) => ({ ...e, [field]: undefined }));
		scheduleCapture(next);
	}

	function updateAnswer(label: string, value: string | string[]) {
		const next = {
			...data,
			formAnswers: { ...data.formAnswers, [label]: value },
		};
		setData(next);
		if (errors[label]) setErrors((e) => ({ ...e, [label]: undefined }));
		scheduleCapture(next);
	}

	function handlePrimaryNext(e: React.FormEvent) {
		e.preventDefault();
		const primaryErrors = validatePrimary(data);
		if (Object.keys(primaryErrors).length > 0) {
			setErrors(primaryErrors);
			return;
		}
		if (hasSecondaryQuestions) {
			setSubStep("questions");
		} else {
			onNext(data);
		}
	}

	function handleQuestionsNext(e: React.FormEvent) {
		e.preventDefault();
		const qErrors = validateQuestions(secondaryQuestions, data.formAnswers);
		if (Object.keys(qErrors).length > 0) {
			setErrors(qErrors);
			return;
		}
		onNext(data);
	}

	const inputClass = (field: keyof FieldErrors) =>
		cn(
			"w-full h-10 px-3 text-sm rounded-[var(--radius-md)] border",
			"bg-[var(--surface)] text-[var(--ink)] placeholder:text-[var(--ink-ghost)]",
			"focus:outline-none focus:ring-2 focus:ring-[var(--brand)]/20 focus:border-[var(--brand)]",
			"transition-all duration-150",
			errors[field]
				? "border-[var(--destructive)]"
				: "border-[var(--border-strong)]",
		);

	const labelClass =
		"block text-xs font-semibold uppercase tracking-wider text-[var(--ink-muted)] mb-1.5";

	return (
		<div className="grid md:grid-cols-[1fr_1px_minmax(360px,1fr)] gap-0">
			{/* Left — Form */}
			<div className="p-6 md:p-8">
				{/* Event header */}
				<div className="mb-6">
					{/* Duration badge */}
					<div className="flex items-center gap-2 mb-3">
						<span className="inline-flex items-center gap-1.5 text-xs font-semibold text-[var(--brand)] bg-[var(--brand-soft)] px-2.5 py-1 rounded-full">
							<Calendar className="w-3 h-3" />
							{event.durationMinutes} min
						</span>
						{event.location === "googleMeet" && (
							<span className="inline-flex items-center gap-1.5 text-xs text-[var(--ink-muted)] bg-[var(--surface-raised)] px-2.5 py-1 rounded-full border border-[var(--border)]">
								Google Meet
							</span>
						)}
					</div>
					<h1
						className="text-2xl font-bold text-[var(--ink)] tracking-tight leading-tight"
						style={{ fontFamily: "var(--font-display)" }}
					>
						{event.name}
					</h1>
					{event.location === "custom" && event.customLocation && (
						<p className="mt-2 flex items-start gap-2 text-sm text-[var(--ink-muted)] whitespace-pre-line">
							<MapPin className="w-3.5 h-3.5 shrink-0 mt-0.5" />
							{event.customLocation}
						</p>
					)}
					{event.description && (
						<div
							className={cn(
								"mt-4 text-sm leading-relaxed text-[var(--ink-muted)]",
								"max-h-[200px] overflow-y-auto pr-2",
								"[&_p]:my-1.5 [&_ul]:my-2 [&_ol]:my-2",
								"[&_ul]:list-disc [&_ul]:pl-5 [&_ol]:list-decimal [&_ol]:pl-5",
								"[&_strong]:text-[var(--ink)] [&_strong]:font-semibold",
								"[&_a]:text-[var(--brand)] [&_a]:underline",
							)}
							// biome-ignore lint/security/noDangerouslySetInnerHtml: sanitized via DOMPurify
							dangerouslySetInnerHTML={{
								__html: DOMPurify.sanitize(event.description),
							}}
						/>
					)}
				</div>

				{/* Sub-step animation */}
				<AnimatePresence mode="wait">
					{subStep === "primary" ? (
						<motion.form
							key="primary"
							initial={{ opacity: 0, x: -8 }}
							animate={{ opacity: 1, x: 0 }}
							exit={{ opacity: 0, x: -8 }}
							transition={{ duration: 0.2, ease: [0.16, 1, 0.3, 1] }}
							onSubmit={handlePrimaryNext}
							noValidate
							className="space-y-4"
						>
							{/* Phone */}
							<div>
								<label htmlFor="phone" className={labelClass}>
									Téléphone *
								</label>
								<PhoneField
									id="phone"
									value={data.phone}
									onChange={(v) => updateField("phone", v)}
									error={errors.phone}
								/>
							</div>

							{/* First + Last name */}
							<div className="grid grid-cols-2 gap-3">
								<div>
									<label htmlFor="firstName" className={labelClass}>
										Prénom *
									</label>
									<input
										id="firstName"
										type="text"
										autoComplete="given-name"
										placeholder="Jean"
										value={data.firstName}
										onChange={(e) => updateField("firstName", e.target.value)}
										className={inputClass("firstName")}
										aria-invalid={!!errors.firstName}
									/>
									{errors.firstName && (
										<p className="mt-1 text-xs text-[var(--destructive)]">
											{errors.firstName}
										</p>
									)}
								</div>
								<div>
									<label htmlFor="lastName" className={labelClass}>
										Nom *
									</label>
									<input
										id="lastName"
										type="text"
										autoComplete="family-name"
										placeholder="Dupont"
										value={data.lastName}
										onChange={(e) => updateField("lastName", e.target.value)}
										className={inputClass("lastName")}
										aria-invalid={!!errors.lastName}
									/>
									{errors.lastName && (
										<p className="mt-1 text-xs text-[var(--destructive)]">
											{errors.lastName}
										</p>
									)}
								</div>
							</div>

							{/* Email */}
							<div>
								<label htmlFor="email" className={labelClass}>
									Email *
								</label>
								<input
									id="email"
									type="email"
									autoComplete="email"
									placeholder="vous@exemple.com"
									value={data.email}
									onChange={(e) => updateField("email", e.target.value)}
									className={inputClass("email")}
									aria-invalid={!!errors.email}
								/>
								{errors.email && (
									<p className="mt-1 text-xs text-[var(--destructive)]">
										{errors.email}
									</p>
								)}
							</div>

							{/* Legal */}
							<p className="text-[11px] text-[var(--ink-ghost)] leading-relaxed">
								En saisissant vos informations, vous acceptez que vos données
								soient enregistrées conformément à notre politique de
								confidentialité.
							</p>

							<Button
								type="submit"
								size="lg"
								className="w-full h-11 font-semibold gap-2"
								style={{
									background: "var(--grad-brand)",
									boxShadow: "var(--shadow-brand)",
								}}
							>
								{hasSecondaryQuestions ? "Continuer" : "Choisir un créneau"}
								<ArrowRight className="w-4 h-4" />
							</Button>
						</motion.form>
					) : (
						<motion.form
							key="questions"
							initial={{ opacity: 0, x: 8 }}
							animate={{ opacity: 1, x: 0 }}
							exit={{ opacity: 0, x: 8 }}
							transition={{ duration: 0.2, ease: [0.16, 1, 0.3, 1] }}
							onSubmit={handleQuestionsNext}
							noValidate
							className="space-y-5"
						>
							<p className="text-sm text-[var(--ink-muted)] mb-2">
								Quelques questions pour mieux vous préparer.
							</p>

							{secondaryQuestions.map((q) => (
								<div key={q._id}>
									<span className={cn(labelClass, "block")}>
										{q.label}
										{q.required && " *"}
									</span>
									<QuestionField
										question={q}
										value={
											(data.formAnswers[q.label] as string | string[]) ?? ""
										}
										onChange={(v) => updateAnswer(q.label, v)}
										error={errors[q.label]}
									/>
									{errors[q.label] && (
										<p className="mt-1 text-xs text-[var(--destructive)]">
											{errors[q.label]}
										</p>
									)}
								</div>
							))}

							<div className="flex gap-3">
								<Button
									type="button"
									variant="outline"
									className="flex-1 h-11"
									onClick={() => setSubStep("primary")}
								>
									Retour
								</Button>
								<Button
									type="submit"
									className="flex-1 h-11 font-semibold gap-2"
									style={{
										background: "var(--grad-brand)",
										boxShadow: "var(--shadow-brand)",
									}}
								>
									Choisir un créneau
									<ArrowRight className="w-4 h-4" />
								</Button>
							</div>
						</motion.form>
					)}
				</AnimatePresence>
			</div>

			{/* Divider */}
			<div className="hidden md:block bg-[var(--border)]" />

			{/* Right — Calendar preview (visible but disabled) */}
			<div className="hidden md:flex flex-col relative p-6 md:p-8 bg-[var(--surface-raised)]/30">
				<div className="opacity-40 pointer-events-none select-none">
					<MiniCalendarPreview />
				</div>
				{/* Centered hint card */}
				<div className="absolute inset-0 flex items-center justify-center p-6">
					<div
						className={cn(
							"max-w-[260px] rounded-[var(--radius-lg)] border border-[var(--border)] px-5 py-4 text-center",
							"bg-[var(--surface)] shadow-[var(--shadow-float)]",
						)}
					>
						<p className="text-sm font-medium text-[var(--ink)] leading-snug">
							{subStep === "primary"
								? "Merci de remplir le formulaire avant de choisir ton créneau."
								: "Encore quelques questions avant d'accéder au calendrier."}
						</p>
					</div>
				</div>
			</div>
		</div>
	);
}
