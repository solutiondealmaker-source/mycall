"use client";

import { useMutation, useQuery } from "convex/react";
import { motion } from "framer-motion";
import {
	ChevronLeft,
	Clock,
	Loader2,
	Mail,
	Plus,
	ShieldOff,
	Trash2,
} from "lucide-react";
import Link from "next/link";
import { useState } from "react";
import { toast } from "sonner";
import { api } from "@/../convex/_generated/api";
import type { Id } from "@/../convex/_generated/dataModel";
import { PageHeader } from "@/components/dashboard/page-header";
import { Badge } from "@/components/ui/badge";
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
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { canAdminister } from "@/lib/roles";

// Les libellés disent ce qui déclenche, et depuis quand court le délai — c'est
// la seule chose que l'utilisateur a besoin de comprendre pour régler ses
// étapes correctement.
const TRIGGERS = [
	{
		value: "before_booking",
		label: "Avant un rendez-vous",
		help: "Se déclenche à la réservation. Les délais se comptent AVANT le rendez-vous — c'est ce qui réduit les no-show.",
		negative: true,
	},
	{
		value: "abandoned_form",
		label: "Formulaire abandonné",
		help: "Le prospect a laissé ses coordonnées sans réserver. Les délais courent depuis l'abandon.",
		negative: false,
	},
	{
		value: "no_show",
		label: "Rendez-vous manqué",
		help: "Le prospect n'est pas venu. Les délais courent depuis le rendez-vous manqué.",
		negative: false,
	},
	{
		value: "manual",
		label: "Manuel",
		help: "Inscription depuis la fiche d'un lead. Les délais courent depuis l'inscription.",
		negative: false,
	},
] as const;

type TriggerValue = (typeof TRIGGERS)[number]["value"];

// Les délais sont stockés en minutes ; on ne montre que des durées lisibles.
const DELAYS = [
	{ hours: 0, label: "Immédiatement" },
	{ hours: 1, label: "1 heure" },
	{ hours: 4, label: "4 heures" },
	{ hours: 24, label: "1 jour" },
	{ hours: 48, label: "2 jours" },
	{ hours: 72, label: "3 jours" },
	{ hours: 168, label: "7 jours" },
	{ hours: 336, label: "14 jours" },
	{ hours: 720, label: "30 jours" },
];

function delayLabel(offsetMinutes: number, negative: boolean): string {
	const hours = Math.abs(offsetMinutes) / 60;
	const found = DELAYS.find((d) => d.hours === hours);
	const base = found?.label ?? `${hours} h`;
	if (hours === 0) return "Immédiatement";
	return negative ? `${base} avant` : `${base} après`;
}

export default function SequencesPage() {
	const profile = useQuery(api.users.getMyProfile);
	const sequences = useQuery(api.sequences.listSequences);
	const createSequence = useMutation(api.sequences.createSequence);
	const updateSequence = useMutation(api.sequences.updateSequence);
	const deleteSequence = useMutation(api.sequences.deleteSequence);
	const upsertStep = useMutation(api.sequences.upsertStep);
	const deleteStep = useMutation(api.sequences.deleteStep);

	const [newName, setNewName] = useState("");
	const [newTrigger, setNewTrigger] = useState<TriggerValue>("before_booking");
	const [busy, setBusy] = useState<string | null>(null);

	if (profile !== undefined && !canAdminister(profile)) {
		return (
			<div className="animate-fade-in max-w-xl">
				<PageHeader title="Séquences" />
				<div className="card-premium p-8 text-center">
					<ShieldOff className="w-8 h-8 text-[var(--ink-ghost)] mx-auto mb-3" />
					<p className="text-sm font-medium text-[var(--ink)]">
						Accès réservé aux administrateurs
					</p>
				</div>
			</div>
		);
	}

	async function run(key: string, fn: () => Promise<unknown>, ok: string) {
		setBusy(key);
		try {
			await fn();
			toast.success(ok);
		} catch (err) {
			toast.error(err instanceof Error ? err.message : "Erreur");
		} finally {
			setBusy(null);
		}
	}

	return (
		<div className="animate-fade-in max-w-3xl">
			<PageHeader
				title="Séquences d'emails"
				description="Des messages programmés, envoyés automatiquement selon un déclencheur."
				actions={
					<Button variant="ghost" size="sm" asChild className="gap-1.5">
						<Link href="/settings">
							<ChevronLeft className="w-4 h-4" />
							Retour
						</Link>
					</Button>
				}
			/>

			{/* Création */}
			<motion.div
				initial={{ opacity: 0, y: 8 }}
				animate={{ opacity: 1, y: 0 }}
				transition={{ duration: 0.15 }}
				className="card-premium p-5 mb-6"
			>
				<h2 className="text-sm font-semibold text-[var(--ink)] mb-3">
					Nouvelle séquence
				</h2>
				<div className="flex flex-col sm:flex-row gap-3">
					<Input
						placeholder="Préparation au rendez-vous"
						value={newName}
						onChange={(e) => setNewName(e.target.value)}
						className="flex-1"
					/>
					<Select
						value={newTrigger}
						onValueChange={(v) => setNewTrigger(v as TriggerValue)}
					>
						<SelectTrigger className="sm:w-56">
							<SelectValue />
						</SelectTrigger>
						<SelectContent>
							{TRIGGERS.map((t) => (
								<SelectItem key={t.value} value={t.value}>
									{t.label}
								</SelectItem>
							))}
						</SelectContent>
					</Select>
					<Button
						disabled={!newName.trim() || busy === "create"}
						onClick={() =>
							run(
								"create",
								async () => {
									await createSequence({
										name: newName,
										trigger: newTrigger,
									});
									setNewName("");
								},
								"Séquence créée",
							)
						}
					>
						{busy === "create" && (
							<Loader2 className="w-4 h-4 animate-spin mr-1.5" />
						)}
						Créer
					</Button>
				</div>
				<p className="text-xs text-[var(--ink-muted)] mt-2.5 leading-relaxed">
					{TRIGGERS.find((t) => t.value === newTrigger)?.help}
				</p>
			</motion.div>

			{/* Liste */}
			{sequences === undefined ? (
				<p className="text-sm text-[var(--ink-ghost)]">Chargement…</p>
			) : sequences.length === 0 ? (
				<div className="card-premium py-12 text-center">
					<Mail className="w-7 h-7 text-[var(--ink-ghost)] mx-auto mb-3" />
					<p className="text-sm text-[var(--ink-muted)]">
						Aucune séquence pour l'instant
					</p>
				</div>
			) : (
				<div className="flex flex-col gap-5">
					{sequences.map((seq) => {
						const trigger = TRIGGERS.find((t) => t.value === seq.trigger);
						const negative = trigger?.negative ?? false;
						return (
							<div key={seq._id} className="card-premium p-5">
								{/* En-tête */}
								<div className="flex items-start justify-between gap-3 mb-1">
									<div className="min-w-0">
										<div className="flex items-center gap-2 flex-wrap">
											<h3 className="text-sm font-semibold text-[var(--ink)]">
												{seq.name}
											</h3>
											<Badge
												variant="secondary"
												className="text-[10px] px-1.5 h-4 border-0 bg-[var(--brand-soft)] text-[var(--brand)]"
											>
												{trigger?.label ?? seq.trigger}
											</Badge>
											{seq.activeCount > 0 && (
												<span className="text-[11px] text-[var(--ink-muted)]">
													{seq.activeCount} en cours
												</span>
											)}
										</div>
										<p className="text-xs text-[var(--ink-muted)] mt-1 leading-relaxed">
											{trigger?.help}
										</p>
									</div>
									<div className="flex items-center gap-3 shrink-0">
										<div className="flex items-center gap-2">
											<span className="text-xs text-[var(--ink-muted)]">
												{seq.isActive ? "Active" : "En pause"}
											</span>
											<Switch
												checked={seq.isActive}
												onCheckedChange={(v) =>
													run(
														`toggle-${seq._id}`,
														() =>
															updateSequence({
																sequenceId: seq._id,
																isActive: v,
															}),
														v ? "Séquence activée" : "Séquence mise en pause",
													)
												}
											/>
										</div>
										<button
											type="button"
											onClick={() => {
												if (
													window.confirm(
														`Supprimer « ${seq.name} » ? Les envois en cours seront arrêtés.`,
													)
												) {
													run(
														`del-${seq._id}`,
														() => deleteSequence({ sequenceId: seq._id }),
														"Séquence supprimée",
													);
												}
											}}
											className="text-[var(--ink-ghost)] hover:text-[var(--destructive)] transition-colors"
											aria-label={`Supprimer ${seq.name}`}
										>
											<Trash2 className="w-4 h-4" />
										</button>
									</div>
								</div>

								{/* Étapes */}
								<div className="mt-4 flex flex-col gap-3">
									{seq.steps.map((step) => (
										<StepEditor
											key={step._id}
											step={step}
											negative={negative}
											onSave={(patch) =>
												run(
													`step-${step._id}`,
													() =>
														upsertStep({
															stepId: step._id,
															sequenceId: seq._id,
															...patch,
														}),
													"Étape enregistrée",
												)
											}
											onDelete={() =>
												run(
													`stepdel-${step._id}`,
													() => deleteStep({ stepId: step._id }),
													"Étape supprimée",
												)
											}
										/>
									))}

									<Button
										variant="outline"
										size="sm"
										className="self-start gap-1.5"
										onClick={() =>
											run(
												`add-${seq._id}`,
												() =>
													upsertStep({
														sequenceId: seq._id,
														order: seq.steps.length,
														offsetMinutes: negative ? -2880 : 1440,
														subject: "Votre rendez-vous approche",
														body: "Bonjour {{prenom}},\n\nÉcris ton message ici.",
													}),
												"Étape ajoutée",
											)
										}
									>
										<Plus className="w-4 h-4" />
										Ajouter une étape
									</Button>
								</div>
							</div>
						);
					})}
				</div>
			)}

			<p className="text-xs text-[var(--ink-muted)] mt-6 leading-relaxed">
				Écris <code className="path">{"{{prenom}}"}</code> dans le sujet ou le
				message pour insérer le prénom du prospect. Chaque email porte un lien
				de désabonnement — obligatoire, et il arrête la séquence immédiatement.
				Une séquence s'arrête aussi d'elle-même si le lead devient client, ou si
				son rendez-vous est annulé.
			</p>
		</div>
	);
}

// ─── Éditeur d'une étape ─────────────────────────────────────────────────────

function StepEditor({
	step,
	negative,
	onSave,
	onDelete,
}: {
	step: {
		_id: Id<"sequenceSteps">;
		order: number;
		offsetMinutes: number;
		subject: string;
		body: string;
	};
	negative: boolean;
	onSave: (patch: {
		order: number;
		offsetMinutes: number;
		subject: string;
		body: string;
	}) => void;
	onDelete: () => void;
}) {
	const [subject, setSubject] = useState(step.subject);
	const [body, setBody] = useState(step.body);
	const [hours, setHours] = useState(String(Math.abs(step.offsetMinutes) / 60));

	const dirty =
		subject !== step.subject ||
		body !== step.body ||
		Number(hours) * 60 !== Math.abs(step.offsetMinutes);

	return (
		<div className="rounded-[var(--radius-sm)] border border-[var(--border)] p-4 flex flex-col gap-3">
			<div className="flex items-center gap-2 flex-wrap">
				<Clock className="w-3.5 h-3.5 text-[var(--ink-ghost)]" />
				<Select value={hours} onValueChange={setHours}>
					<SelectTrigger className="h-8 w-44 text-xs">
						<SelectValue />
					</SelectTrigger>
					<SelectContent>
						{DELAYS.map((d) => (
							<SelectItem key={d.hours} value={String(d.hours)}>
								{d.hours === 0
									? "Immédiatement"
									: `${d.label} ${negative ? "avant" : "après"}`}
							</SelectItem>
						))}
					</SelectContent>
				</Select>
				<span className="text-xs text-[var(--ink-ghost)]">
					{delayLabel(step.offsetMinutes, negative)}
				</span>
				<button
					type="button"
					onClick={onDelete}
					className="ml-auto text-[var(--ink-ghost)] hover:text-[var(--destructive)] transition-colors"
					aria-label="Supprimer l'étape"
				>
					<Trash2 className="w-3.5 h-3.5" />
				</button>
			</div>

			<div className="space-y-1.5">
				<Label htmlFor={`sub-${step._id}`} className="text-xs">
					Sujet
				</Label>
				<Input
					id={`sub-${step._id}`}
					value={subject}
					onChange={(e) => setSubject(e.target.value)}
					className="h-9"
				/>
			</div>

			<div className="space-y-1.5">
				<Label htmlFor={`body-${step._id}`} className="text-xs">
					Message
				</Label>
				<Textarea
					id={`body-${step._id}`}
					rows={5}
					value={body}
					onChange={(e) => setBody(e.target.value)}
				/>
			</div>

			{dirty && (
				<Button
					size="sm"
					className="self-start"
					onClick={() =>
						onSave({
							order: step.order,
							offsetMinutes: negative
								? -Math.abs(Number(hours) * 60)
								: Math.abs(Number(hours) * 60),
							subject,
							body,
						})
					}
				>
					Enregistrer
				</Button>
			)}
		</div>
	);
}
