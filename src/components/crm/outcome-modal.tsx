"use client";

import { useMutation, useQuery } from "convex/react";
import { AnimatePresence, motion } from "framer-motion";
import { useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
	Dialog,
	DialogContent,
	DialogHeader,
	DialogTitle,
} from "@/components/ui/dialog";
import { cn } from "@/lib/utils";
import { api } from "../../../convex/_generated/api";
import type { Doc, Id } from "../../../convex/_generated/dataModel";

type Tenue = "planifie" | "tenu" | "no_show" | "annule";
type Issue = "en_attente" | "follow_up" | "gagne" | "perdu";
type Channel = "call" | "sms" | "email" | "other";

const TENUE_OPTIONS: { value: Tenue; label: string; description: string }[] = [
	{ value: "planifie", label: "Planifié", description: "Appel à venir" },
	{ value: "tenu", label: "Tenu", description: "Appel s'est tenu" },
	{ value: "no_show", label: "No-show", description: "Prospect absent" },
	{ value: "annule", label: "Annulé", description: "Appel annulé" },
];

const ISSUE_OPTIONS: { value: Issue; label: string; color: string }[] = [
	{
		value: "gagne",
		label: "Gagné",
		color:
			"border-[var(--success)] bg-[var(--success-soft)] text-[var(--success)]",
	},
	{
		value: "perdu",
		label: "Perdu",
		color:
			"border-[var(--destructive)] bg-[var(--destructive-soft)] text-[var(--destructive)]",
	},
	{
		value: "follow_up",
		label: "Follow-up",
		color:
			"border-[var(--warning)] bg-[var(--warning-soft)] text-[var(--warning)]",
	},
	{
		value: "en_attente",
		label: "En attente",
		color:
			"border-[var(--border)] bg-[var(--surface-raised)] text-[var(--ink-muted)]",
	},
];

const CHANNEL_OPTIONS: { value: Channel; label: string }[] = [
	{ value: "call", label: "Appel" },
	{ value: "sms", label: "SMS" },
	{ value: "email", label: "Email" },
	{ value: "other", label: "Autre" },
];

interface OutcomeModalProps {
	bookingId: Id<"bookings"> | null;
	open: boolean;
	onOpenChange: (open: boolean) => void;
}

export function OutcomeModal({
	bookingId,
	open,
	onOpenChange,
}: OutcomeModalProps) {
	const [step, setStep] = useState<1 | 2 | 3>(1);
	const [tenue, setTenue] = useState<Tenue | null>(null);
	const [issue, setIssue] = useState<Issue | null>(null);
	const [amount, setAmount] = useState("");
	const [lossReasonId, setLossReasonId] = useState<Id<"lossReasons"> | null>(
		null,
	);
	const [followUpDate, setFollowUpDate] = useState("");
	const [followUpReason, setFollowUpReason] = useState("");
	const [followUpChannel, setFollowUpChannel] = useState<Channel>("call");
	const [saving, setSaving] = useState(false);

	const setOutcome = useMutation(api.bookings.setOutcome);
	const lossReasons = useQuery(api.bookings.listLossReasons, {});

	function handleTenueSelect(val: Tenue) {
		setTenue(val);
		if (val === "tenu") {
			setStep(2);
		} else {
			// No issue needed for non-tenu
			setIssue("en_attente");
			setStep(3);
		}
	}

	function handleIssueSelect(val: Issue) {
		setIssue(val);
		if (val === "gagne" || val === "perdu" || val === "follow_up") {
			setStep(3);
		} else {
			handleSubmit(tenue!, val);
		}
	}

	async function handleSubmit(t: Tenue, i: Issue) {
		if (!bookingId || !t) return;
		setSaving(true);
		try {
			await setOutcome({
				bookingId,
				tenue: t,
				issue: i,
				...(i === "gagne" && amount
					? { issueAmountCents: Math.round(parseFloat(amount) * 100) }
					: {}),
				...(i === "perdu" && lossReasonId
					? { issueLossReasonId: lossReasonId }
					: {}),
				...(i === "follow_up" && followUpDate && followUpReason
					? {
							followUp: {
								dueAt: new Date(followUpDate).getTime(),
								reason: followUpReason,
								channel: followUpChannel,
							},
						}
					: {}),
			});
			toast.success("Résultat enregistré");
			onOpenChange(false);
			resetState();
		} catch (err) {
			toast.error(err instanceof Error ? err.message : "Erreur inconnue");
		} finally {
			setSaving(false);
		}
	}

	function resetState() {
		setStep(1);
		setTenue(null);
		setIssue(null);
		setAmount("");
		setLossReasonId(null);
		setFollowUpDate("");
		setFollowUpReason("");
		setFollowUpChannel("call");
	}

	return (
		<Dialog
			open={open}
			onOpenChange={(o) => {
				onOpenChange(o);
				if (!o) resetState();
			}}
		>
			<DialogContent className="max-w-md">
				<DialogHeader>
					<DialogTitle>Enregistrer le résultat</DialogTitle>
				</DialogHeader>

				{/* Step indicator */}
				<div className="flex items-center gap-2 mb-4">
					{[1, 2, 3].map((s) => (
						<div
							key={s}
							className={cn(
								"h-1 flex-1 rounded-full transition-colors duration-200",
								s <= step ? "bg-[var(--brand)]" : "bg-[var(--surface-muted)]",
							)}
						/>
					))}
				</div>

				<AnimatePresence mode="wait">
					{step === 1 && (
						<motion.div
							key="step1"
							initial={{ opacity: 0, x: 10 }}
							animate={{ opacity: 1, x: 0 }}
							exit={{ opacity: 0, x: -10 }}
							transition={{ duration: 0.15 }}
						>
							<p className="text-sm text-[var(--ink-muted)] mb-3">
								Comment s'est passé cet appel ?
							</p>
							<div className="grid grid-cols-2 gap-2">
								{TENUE_OPTIONS.map((opt) => (
									<button
										key={opt.value}
										type="button"
										onClick={() => handleTenueSelect(opt.value)}
										className={cn(
											"flex flex-col items-start gap-1 p-3 rounded-[var(--radius-md)]",
											"border text-left transition-all duration-150",
											tenue === opt.value
												? "border-[var(--brand)] bg-[var(--brand-soft)]"
												: "border-[var(--border)] hover:border-[var(--brand-glow)] hover:bg-[var(--surface-raised)]",
										)}
									>
										<span className="text-sm font-medium text-[var(--ink)]">
											{opt.label}
										</span>
										<span className="text-xs text-[var(--ink-muted)]">
											{opt.description}
										</span>
									</button>
								))}
							</div>
						</motion.div>
					)}

					{step === 2 && (
						<motion.div
							key="step2"
							initial={{ opacity: 0, x: 10 }}
							animate={{ opacity: 1, x: 0 }}
							exit={{ opacity: 0, x: -10 }}
							transition={{ duration: 0.15 }}
						>
							<p className="text-sm text-[var(--ink-muted)] mb-3">
								Quel est le résultat commercial ?
							</p>
							<div className="grid grid-cols-2 gap-2">
								{ISSUE_OPTIONS.map((opt) => (
									<button
										key={opt.value}
										type="button"
										onClick={() => handleIssueSelect(opt.value)}
										className={cn(
											"flex items-center justify-center h-10 rounded-[var(--radius-md)]",
											"border text-sm font-medium transition-all duration-150",
											opt.color,
											"hover:opacity-80",
										)}
									>
										{opt.label}
									</button>
								))}
							</div>
							<button
								type="button"
								onClick={() => setStep(1)}
								className="mt-3 text-xs text-[var(--ink-muted)] hover:text-[var(--ink)] transition-colors"
							>
								Retour
							</button>
						</motion.div>
					)}

					{step === 3 && (
						<motion.div
							key="step3"
							initial={{ opacity: 0, x: 10 }}
							animate={{ opacity: 1, x: 0 }}
							exit={{ opacity: 0, x: -10 }}
							transition={{ duration: 0.15 }}
							className="space-y-3"
						>
							{issue === "gagne" && (
								<div>
									<label
										htmlFor="outcome-amount"
										className="text-xs font-medium text-[var(--ink-muted)] uppercase tracking-wide block mb-1"
									>
										Montant contracté (€)
									</label>
									<input
										id="outcome-amount"
										type="number"
										min="0"
										step="0.01"
										placeholder="Ex : 2500"
										value={amount}
										onChange={(e) => setAmount(e.target.value)}
										className={cn(
											"w-full h-9 px-3 text-sm rounded-[var(--radius-md)]",
											"border border-[var(--border)] bg-[var(--surface-raised)]",
											"text-[var(--ink)] focus:outline-none focus:ring-2 focus:ring-[var(--brand-glow)] focus:border-[var(--brand)]",
										)}
									/>
								</div>
							)}

							{issue === "perdu" && (
								<div>
									<label
										htmlFor="outcome-loss-reason"
										className="text-xs font-medium text-[var(--ink-muted)] uppercase tracking-wide block mb-1"
									>
										Raison de perte
									</label>
									<select
										id="outcome-loss-reason"
										value={lossReasonId ?? ""}
										onChange={(e) =>
											setLossReasonId(
												e.target.value
													? (e.target.value as Id<"lossReasons">)
													: null,
											)
										}
										className={cn(
											"w-full h-9 px-3 text-sm rounded-[var(--radius-md)]",
											"border border-[var(--border)] bg-[var(--surface-raised)]",
											"text-[var(--ink)] focus:outline-none focus:ring-2 focus:ring-[var(--brand-glow)]",
										)}
									>
										<option value="">Sélectionner...</option>
										{(lossReasons as Doc<"lossReasons">[] | undefined)?.map(
											(lr) => (
												<option key={lr._id} value={lr._id}>
													{lr.label}
												</option>
											),
										)}
									</select>
								</div>
							)}

							{issue === "follow_up" && (
								<>
									<div>
										<label
											htmlFor="outcome-followup-date"
											className="text-xs font-medium text-[var(--ink-muted)] uppercase tracking-wide block mb-1"
										>
											Date de relance
										</label>
										<input
											id="outcome-followup-date"
											type="datetime-local"
											value={followUpDate}
											onChange={(e) => setFollowUpDate(e.target.value)}
											className={cn(
												"w-full h-9 px-3 text-sm rounded-[var(--radius-md)]",
												"border border-[var(--border)] bg-[var(--surface-raised)]",
												"text-[var(--ink)] focus:outline-none focus:ring-2 focus:ring-[var(--brand-glow)]",
											)}
										/>
									</div>
									<div>
										<label
											htmlFor="outcome-followup-reason"
											className="text-xs font-medium text-[var(--ink-muted)] uppercase tracking-wide block mb-1"
										>
											Raison
										</label>
										<textarea
											id="outcome-followup-reason"
											rows={2}
											placeholder="Préciser la raison de la relance..."
											value={followUpReason}
											onChange={(e) => setFollowUpReason(e.target.value)}
											className={cn(
												"w-full px-3 py-2 text-sm rounded-[var(--radius-md)] resize-none",
												"border border-[var(--border)] bg-[var(--surface-raised)]",
												"text-[var(--ink)] focus:outline-none focus:ring-2 focus:ring-[var(--brand-glow)]",
											)}
										/>
									</div>
									<div>
										<p className="text-xs font-medium text-[var(--ink-muted)] uppercase tracking-wide mb-1">
											Canal
										</p>
										<div className="flex gap-2">
											{CHANNEL_OPTIONS.map((ch) => (
												<button
													key={ch.value}
													type="button"
													onClick={() => setFollowUpChannel(ch.value)}
													className={cn(
														"flex-1 h-8 text-xs rounded-[var(--radius-sm)] border transition-all",
														followUpChannel === ch.value
															? "border-[var(--brand)] bg-[var(--brand-soft)] text-[var(--brand)]"
															: "border-[var(--border)] text-[var(--ink-muted)] hover:bg-[var(--surface-raised)]",
													)}
												>
													{ch.label}
												</button>
											))}
										</div>
									</div>
								</>
							)}

							<div className="flex gap-2 pt-2">
								<button
									type="button"
									onClick={() => setStep(tenue === "tenu" ? 2 : 1)}
									className="text-xs text-[var(--ink-muted)] hover:text-[var(--ink)] transition-colors"
								>
									Retour
								</button>
								<div className="flex-1" />
								<Button
									size="sm"
									disabled={
										saving ||
										(issue === "gagne" && !amount) ||
										(issue === "perdu" && !lossReasonId) ||
										(issue === "follow_up" &&
											(!followUpDate || !followUpReason))
									}
									onClick={() => handleSubmit(tenue!, issue!)}
								>
									{saving ? "Enregistrement..." : "Enregistrer"}
								</Button>
							</div>
						</motion.div>
					)}
				</AnimatePresence>
			</DialogContent>
		</Dialog>
	);
}
