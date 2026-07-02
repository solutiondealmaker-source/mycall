"use client";

import { Ban, Plus, Trash2 } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { SectionShell } from "@/components/events/section-shell";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import type {
	DisqualificationRule,
	EventDoc,
	EventPatch,
	EventQuestion,
} from "@/types/events";

// ─── Props ────────────────────────────────────────────────────────────────────

interface DisqualificationSectionProps {
	event: EventDoc;
	questions: EventQuestion[];
	onUpdate: (patch: EventPatch) => Promise<void>;
}

// ─── Form state ───────────────────────────────────────────────────────────────

interface DisqualificationForm {
	rules: DisqualificationRule[];
	disqualificationMessage: string;
	disqualificationRedirectUrl: string;
}

function formFromEvent(event: EventDoc): DisqualificationForm {
	return {
		rules: event.disqualificationRules ?? [],
		disqualificationMessage:
			event.disqualificationMessage ??
			"Merci pour votre intérêt. Malheureusement, votre profil ne correspond pas à nos critères actuels.",
		disqualificationRedirectUrl: event.disqualificationRedirectUrl ?? "",
	};
}

// ─── Composant ────────────────────────────────────────────────────────────────

/**
 * DisqualificationSection — règles de disqualification, message, redirect.
 */
export function DisqualificationSection({
	event,
	questions,
	onUpdate,
}: DisqualificationSectionProps) {
	const [form, setForm] = useState<DisqualificationForm>(() =>
		formFromEvent(event),
	);
	const [isDirty, setIsDirty] = useState(false);

	useEffect(() => {
		setForm(formFromEvent(event));
		setIsDirty(false);
	}, [event]);

	const addRule = useCallback(() => {
		setForm((prev) => ({
			...prev,
			rules: [...prev.rules, { questionLabel: "", answers: [""] }],
		}));
		setIsDirty(true);
	}, []);

	const removeRule = useCallback((index: number) => {
		setForm((prev) => ({
			...prev,
			rules: prev.rules.filter((_, i) => i !== index),
		}));
		setIsDirty(true);
	}, []);

	const updateRuleQuestion = useCallback(
		(index: number, questionLabel: string) => {
			setForm((prev) => {
				const next = [...prev.rules];
				next[index] = { ...next[index], questionLabel };
				return { ...prev, rules: next };
			});
			setIsDirty(true);
		},
		[],
	);

	const updateRuleAnswer = useCallback(
		(ruleIndex: number, answerIndex: number, value: string) => {
			setForm((prev) => {
				const next = [...prev.rules];
				const answers = [...next[ruleIndex].answers];
				answers[answerIndex] = value;
				next[ruleIndex] = { ...next[ruleIndex], answers };
				return { ...prev, rules: next };
			});
			setIsDirty(true);
		},
		[],
	);

	const addRuleAnswer = useCallback((ruleIndex: number) => {
		setForm((prev) => {
			const next = [...prev.rules];
			next[ruleIndex] = {
				...next[ruleIndex],
				answers: [...next[ruleIndex].answers, ""],
			};
			return { ...prev, rules: next };
		});
		setIsDirty(true);
	}, []);

	const removeRuleAnswer = useCallback(
		(ruleIndex: number, answerIndex: number) => {
			setForm((prev) => {
				const next = [...prev.rules];
				next[ruleIndex] = {
					...next[ruleIndex],
					answers: next[ruleIndex].answers.filter((_, i) => i !== answerIndex),
				};
				return { ...prev, rules: next };
			});
			setIsDirty(true);
		},
		[],
	);

	const handleSave = useCallback(async () => {
		await onUpdate({
			disqualificationRules: form.rules.filter(
				(r) => r.questionLabel && r.answers.some(Boolean),
			),
			disqualificationMessage: form.disqualificationMessage || undefined,
			disqualificationRedirectUrl:
				form.disqualificationRedirectUrl || undefined,
		});
		setIsDirty(false);
	}, [form, onUpdate]);

	const handleCancel = useCallback(() => {
		setForm(formFromEvent(event));
		setIsDirty(false);
	}, [event]);

	// Questions avec options disqualifiables
	const qualifyingQuestions = questions.filter((q) =>
		["single_select", "multi_select", "yes_no"].includes(q.type),
	);

	return (
		<SectionShell
			icon={Ban}
			title="Règles de disqualification"
			description="Définit les réponses qui empêchent un prospect de prendre rendez-vous."
			onSave={handleSave}
			isDirty={isDirty}
			onCancel={handleCancel}
		>
			<div className="space-y-6 max-w-[520px]">
				{/* Règles */}
				<div className="space-y-3">
					<div className="flex items-center justify-between">
						<Label className="text-xs font-medium uppercase tracking-wider text-[var(--ink-muted)]">
							Conditions de disqualification ({form.rules.length})
						</Label>
						<Button
							variant="outline"
							size="sm"
							onClick={addRule}
							className="gap-1.5"
						>
							<Plus className="w-3.5 h-3.5" />
							Ajouter une règle
						</Button>
					</div>

					{form.rules.length === 0 ? (
						<div className="flex flex-col items-center justify-center py-10 gap-3 rounded-[var(--radius-lg)] border border-dashed border-[var(--border)] bg-[var(--surface-raised)]">
							<Ban className="w-8 h-8 text-[var(--ink-ghost)]" />
							<div className="text-center">
								<p className="text-sm font-medium text-[var(--ink)]">
									Aucune règle de disqualification
								</p>
								<p className="text-xs text-[var(--ink-muted)] mt-0.5 max-w-xs">
									Tous les prospects peuvent actuellement prendre rendez-vous.
								</p>
							</div>
						</div>
					) : (
						<div className="space-y-3">
							{form.rules.map((rule, ruleIndex) => (
								<RuleCard
									key={ruleIndex}
									rule={rule}
									ruleIndex={ruleIndex}
									qualifyingQuestions={qualifyingQuestions}
									onQuestionChange={(q) => updateRuleQuestion(ruleIndex, q)}
									onAnswerChange={(ai, v) => updateRuleAnswer(ruleIndex, ai, v)}
									onAddAnswer={() => addRuleAnswer(ruleIndex)}
									onRemoveAnswer={(ai) => removeRuleAnswer(ruleIndex, ai)}
									onRemove={() => removeRule(ruleIndex)}
								/>
							))}
						</div>
					)}
				</div>

				{/* Preview pédagogique */}
				{form.rules.length > 0 && (
					<div className="rounded-[var(--radius-md)] bg-[var(--warning-soft)] border border-[var(--warning)]/20 px-4 py-3">
						<p className="text-xs font-semibold text-[var(--warning)] mb-1">
							Aperçu de la logique
						</p>
						{form.rules
							.filter((r) => r.questionLabel && r.answers.some(Boolean))
							.map((rule, i) => (
								<p
									key={i}
									className="text-xs text-[var(--ink-muted)] leading-relaxed"
								>
									Si la réponse à{" "}
									<strong className="text-[var(--ink)]">
										{rule.questionLabel || "..."}
									</strong>{" "}
									est{" "}
									<strong className="text-[var(--ink)]">
										{rule.answers.filter(Boolean).join(" ou ")}
									</strong>{" "}
									→ prospect disqualifié
								</p>
							))}
					</div>
				)}

				<div className="border-t border-[var(--border)]" />

				{/* Message de disqualification */}
				<div className="space-y-1.5">
					<Label className="text-xs font-medium uppercase tracking-wider text-[var(--ink-muted)]">
						Message de disqualification
					</Label>
					<Textarea
						value={form.disqualificationMessage}
						onChange={(e) => {
							setForm((prev) => ({
								...prev,
								disqualificationMessage: e.target.value,
							}));
							setIsDirty(true);
						}}
						placeholder="Message affiché au prospect disqualifié..."
						rows={3}
						className="resize-none"
					/>
				</div>

				{/* Redirect URL */}
				<div className="space-y-1.5">
					<Label className="text-xs font-medium uppercase tracking-wider text-[var(--ink-muted)]">
						Redirection après disqualification (optionnel)
					</Label>
					<Input
						type="url"
						value={form.disqualificationRedirectUrl}
						onChange={(e) => {
							setForm((prev) => ({
								...prev,
								disqualificationRedirectUrl: e.target.value,
							}));
							setIsDirty(true);
						}}
						placeholder="https://... — redirigé après 2s"
						className="h-10"
					/>
					<p className="text-[11px] text-[var(--ink-ghost)]">
						Si renseignée, le prospect sera redirigé automatiquement 2 secondes
						après avoir vu le message de disqualification.
					</p>
				</div>
			</div>
		</SectionShell>
	);
}

// ─── RuleCard ─────────────────────────────────────────────────────────────────

interface RuleCardProps {
	rule: DisqualificationRule;
	ruleIndex: number;
	qualifyingQuestions: EventQuestion[];
	onQuestionChange: (q: string) => void;
	onAnswerChange: (answerIndex: number, value: string) => void;
	onAddAnswer: () => void;
	onRemoveAnswer: (answerIndex: number) => void;
	onRemove: () => void;
}

function RuleCard({
	rule,
	ruleIndex,
	qualifyingQuestions,
	onQuestionChange,
	onAnswerChange,
	onAddAnswer,
	onRemoveAnswer,
	onRemove,
}: RuleCardProps) {
	// Options pour la question sélectionnée
	const selectedQuestion = qualifyingQuestions.find(
		(q) => q.label === rule.questionLabel,
	);
	const questionOptions =
		selectedQuestion?.type === "yes_no"
			? ["Oui", "Non"]
			: (selectedQuestion?.options ?? []);

	return (
		<div className="rounded-[var(--radius-md)] border border-[var(--border)] bg-[var(--surface)] p-4 space-y-3">
			<div className="flex items-start justify-between gap-2">
				<p className="text-xs font-semibold text-[var(--ink-muted)] uppercase tracking-wide">
					Règle {ruleIndex + 1}
				</p>
				<Button
					variant="ghost"
					size="icon-xs"
					onClick={onRemove}
					className="text-[var(--ink-ghost)] hover:text-[var(--destructive)] hover:bg-[var(--destructive-soft)]"
					aria-label="Supprimer la règle"
				>
					<Trash2 className="w-3.5 h-3.5" />
				</Button>
			</div>

			{/* Select question */}
			<div className="space-y-1">
				<Label className="text-xs text-[var(--ink-muted)]">
					Si la réponse à...
				</Label>
				{qualifyingQuestions.length > 0 ? (
					<Select value={rule.questionLabel} onValueChange={onQuestionChange}>
						<SelectTrigger className="h-9 text-sm">
							<SelectValue placeholder="Sélectionner une question..." />
						</SelectTrigger>
						<SelectContent>
							{qualifyingQuestions.map((q) => (
								<SelectItem key={q._id} value={q.label} className="text-sm">
									{q.label}
								</SelectItem>
							))}
						</SelectContent>
					</Select>
				) : (
					<p className="text-xs text-[var(--ink-ghost)] bg-[var(--surface-raised)] rounded-[var(--radius-sm)] px-3 py-2 border border-[var(--border)]">
						Aucune question avec options définie. Crée d'abord des questions de
						type "Choix unique", "Choix multiple" ou "Oui / Non".
					</p>
				)}
			</div>

			{/* Answers */}
			<div className="space-y-1">
				<Label className="text-xs text-[var(--ink-muted)]">
					Est égale à (au moins une de) :
				</Label>
				<div className="space-y-1.5">
					{rule.answers.map((answer, ai) => (
						<div key={ai} className="flex items-center gap-1.5">
							{questionOptions.length > 0 ? (
								<Select
									value={answer}
									onValueChange={(v) => onAnswerChange(ai, v)}
								>
									<SelectTrigger className="h-8 text-xs flex-1">
										<SelectValue placeholder="Sélectionner une valeur..." />
									</SelectTrigger>
									<SelectContent>
										{questionOptions.map((opt) => (
											<SelectItem key={opt} value={opt} className="text-xs">
												{opt}
											</SelectItem>
										))}
									</SelectContent>
								</Select>
							) : (
								<Input
									value={answer}
									onChange={(e) => onAnswerChange(ai, e.target.value)}
									placeholder="Valeur disqualifiante..."
									className="h-8 text-xs flex-1"
								/>
							)}
							{rule.answers.length > 1 && (
								<Button
									variant="ghost"
									size="icon-xs"
									onClick={() => onRemoveAnswer(ai)}
									className="text-[var(--ink-ghost)] hover:text-[var(--destructive)] h-7 w-7"
								>
									<Trash2 className="w-3 h-3" />
								</Button>
							)}
						</div>
					))}
					<button
						type="button"
						onClick={onAddAnswer}
						className="text-xs text-[var(--brand)] hover:text-[var(--brand-bright)] font-medium flex items-center gap-1"
					>
						<Plus className="w-3 h-3" />
						Ajouter une valeur
					</button>
				</div>
			</div>
		</div>
	);
}
