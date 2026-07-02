"use client";

import { Settings } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { SectionShell } from "@/components/events/section-shell";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { RichTextEditor } from "@/components/ui/rich-text-editor-lazy";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";
import type { EventDoc, EventPatch } from "@/types/events";

// ─── Color swatches ───────────────────────────────────────────────────────────

const COLOR_SWATCHES = [
	{ value: "#2563EB", label: "Bleu" },
	{ value: "#7C3AED", label: "Violet" },
	{ value: "#059669", label: "Emeraude" },
	{ value: "#DC2626", label: "Rouge" },
	{ value: "#D97706", label: "Ambre" },
	{ value: "#0891B2", label: "Cyan" },
	{ value: "#DB2777", label: "Rose" },
	{ value: "#374151", label: "Ardoise" },
] as const;

// ─── Slug utils ───────────────────────────────────────────────────────────────

function nameToSlug(name: string): string {
	return name
		.toLowerCase()
		.normalize("NFD")
		.replace(/[̀-ͯ]/g, "")
		.replace(/[^a-z0-9]+/g, "-")
		.replace(/^-+|-+$/g, "")
		.slice(0, 60);
}

// ─── Props ────────────────────────────────────────────────────────────────────

interface DetailsSectionProps {
	event: EventDoc;
	onUpdate: (patch: EventPatch) => Promise<void>;
}

// ─── Form state ───────────────────────────────────────────────────────────────

interface DetailsForm {
	name: string;
	slug: string;
	description: string;
	color: string;
	tagSource: string;
	isActive: boolean;
	noteInterne: string;
	location: "googleMeet" | "custom";
	customLocation: string;
}

function formFromEvent(event: EventDoc): DetailsForm {
	return {
		name: event.name,
		slug: event.slug,
		description: event.description ?? "",
		color: event.color ?? "#2563EB",
		tagSource: event.tagSource ?? "",
		isActive: event.isActive,
		noteInterne: event.noteInterne ?? "",
		location: event.location ?? "googleMeet",
		customLocation: event.customLocation ?? "",
	};
}

// ─── Composant ────────────────────────────────────────────────────────────────

/**
 * DetailsSection — nom, slug, couleur, localisation, statut, note interne.
 */
export function DetailsSection({ event, onUpdate }: DetailsSectionProps) {
	const [form, setForm] = useState<DetailsForm>(() => formFromEvent(event));
	const [isDirty, setIsDirty] = useState(false);
	const [slugManuallyEdited, setSlugManuallyEdited] = useState(false);

	// Sync form si event change (ex: après save)
	useEffect(() => {
		setForm(formFromEvent(event));
		setIsDirty(false);
		setSlugManuallyEdited(false);
	}, [event]);

	const patch = useCallback(
		<K extends keyof DetailsForm>(key: K, value: DetailsForm[K]) => {
			setForm((prev) => ({ ...prev, [key]: value }));
			setIsDirty(true);
		},
		[],
	);

	// Auto-slug depuis nom si pas édité manuellement
	const handleNameChange = useCallback(
		(name: string) => {
			setForm((prev) => ({
				...prev,
				name,
				slug: slugManuallyEdited ? prev.slug : nameToSlug(name),
			}));
			setIsDirty(true);
		},
		[slugManuallyEdited],
	);

	const handleSlugChange = useCallback((slug: string) => {
		setSlugManuallyEdited(true);
		setForm((prev) => ({
			...prev,
			slug: slug
				.toLowerCase()
				.replace(/[^a-z0-9-]/g, "")
				.slice(0, 60),
		}));
		setIsDirty(true);
	}, []);

	const handleSave = useCallback(async () => {
		await onUpdate({
			name: form.name,
			slug: form.slug,
			description: form.description || undefined,
			color: form.color,
			tagSource: form.tagSource || undefined,
			isActive: form.isActive,
			noteInterne: form.noteInterne || undefined,
			location: form.location,
			customLocation:
				form.location === "custom"
					? form.customLocation || undefined
					: undefined,
		});
		setIsDirty(false);
	}, [form, onUpdate]);

	const handleCancel = useCallback(() => {
		setForm(formFromEvent(event));
		setIsDirty(false);
		setSlugManuallyEdited(false);
	}, [event]);

	return (
		<SectionShell
			icon={Settings}
			title="Détails de l'événement"
			description="Nom, identifiant public, couleur et paramètres généraux."
			onSave={handleSave}
			isDirty={isDirty}
			onCancel={handleCancel}
		>
			<div className="space-y-6 max-w-[520px]">
				{/* Nom */}
				<div className="space-y-1.5">
					<Label
						htmlFor="event-name"
						className="text-xs font-medium uppercase tracking-wider text-[var(--ink-muted)]"
					>
						Nom de l'événement *
					</Label>
					<Input
						id="event-name"
						value={form.name}
						onChange={(e) => handleNameChange(e.target.value)}
						placeholder="Ex : Appel découverte 30 min"
						className="h-10"
					/>
				</div>

				{/* Slug */}
				<div className="space-y-1.5">
					<Label
						htmlFor="event-slug"
						className="text-xs font-medium uppercase tracking-wider text-[var(--ink-muted)]"
					>
						Identifiant URL (slug)
					</Label>
					<div className="flex items-center gap-0 rounded-[var(--radius-md)] border border-[var(--border)] bg-[var(--surface-raised)] focus-within:ring-2 focus-within:ring-[var(--brand)]/20 focus-within:border-[var(--brand)] transition-all overflow-hidden">
						<span className="px-3 text-xs text-[var(--ink-ghost)] font-[family-name:var(--font-body)] whitespace-nowrap border-r border-[var(--border)] h-10 flex items-center select-none">
							/book/
						</span>
						<Input
							id="event-slug"
							value={form.slug}
							onChange={(e) => handleSlugChange(e.target.value)}
							placeholder="mon-evenement"
							className="border-0 bg-transparent focus-visible:ring-0 h-10 rounded-none"
						/>
					</div>
					<p className="text-[11px] text-[var(--ink-ghost)]">
						URL publique :{" "}
						<code className="text-[var(--brand)]">
							/book/{form.slug || "..."}
						</code>
					</p>
				</div>

				{/* Description rich text */}
				<div className="space-y-1.5">
					<Label className="text-xs font-medium uppercase tracking-wider text-[var(--ink-muted)]">
						Description / Instructions
					</Label>
					<RichTextEditor
						value={form.description}
						onChange={(html) => patch("description", html)}
						placeholder="Décris ton offre, les instructions de préparation, ou ce que le prospect doit savoir avant le RDV…"
						maxLength={1500}
						minHeight={180}
					/>
					<p className="text-[11px] text-[var(--ink-ghost)]">
						Affichée sur la page publique de réservation. Gras, italique, listes
						et liens supportés.
					</p>
				</div>

				{/* Couleur */}
				<div className="space-y-2">
					<Label className="text-xs font-medium uppercase tracking-wider text-[var(--ink-muted)]">
						Couleur d'accentuation
					</Label>
					<div className="flex items-center gap-2 flex-wrap">
						{COLOR_SWATCHES.map((swatch) => (
							<button
								key={swatch.value}
								type="button"
								onClick={() => patch("color", swatch.value)}
								title={swatch.label}
								className={cn(
									"w-7 h-7 rounded-full transition-all duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2",
									form.color === swatch.value
										? "ring-2 ring-offset-2 ring-[var(--brand)] scale-110"
										: "hover:scale-105 opacity-80 hover:opacity-100",
								)}
								style={{
									backgroundColor: swatch.value,
								}}
								aria-pressed={form.color === swatch.value}
							/>
						))}
						{/* Custom color input */}
						<div className="relative w-7 h-7 rounded-full overflow-hidden border border-[var(--border)] cursor-pointer">
							<input
								type="color"
								value={form.color}
								onChange={(e) => patch("color", e.target.value)}
								className="absolute inset-0 opacity-0 cursor-pointer w-full h-full"
								title="Couleur personnalisée"
							/>
							<div
								className="w-full h-full rounded-full"
								style={{ backgroundColor: form.color }}
							/>
						</div>
					</div>
				</div>

				{/* Séparateur */}
				<div className="border-t border-[var(--border)]" />

				{/* Location */}
				<div className="space-y-2">
					<Label className="text-xs font-medium uppercase tracking-wider text-[var(--ink-muted)]">
						Type de réunion
					</Label>
					<div className="grid grid-cols-2 gap-2">
						{[
							{
								value: "googleMeet",
								label: "Google Meet",
								desc: "Lien auto-généré",
							},
							{
								value: "custom",
								label: "Personnalisé",
								desc: "Lien ou adresse custom",
							},
						].map((opt) => (
							<button
								key={opt.value}
								type="button"
								onClick={() =>
									patch("location", opt.value as "googleMeet" | "custom")
								}
								className={cn(
									"flex flex-col gap-0.5 px-4 py-3 rounded-[var(--radius-md)] border text-left transition-all duration-150 cursor-pointer",
									form.location === opt.value
										? "border-[var(--brand)] bg-[var(--brand-soft)] text-[var(--brand)]"
										: "border-[var(--border)] bg-[var(--surface)] text-[var(--ink)] hover:border-[var(--brand)]/30 hover:bg-[var(--surface-raised)]",
								)}
							>
								<span className="text-sm font-semibold font-[family-name:var(--font-display)]">
									{opt.label}
								</span>
								<span
									className={cn(
										"text-xs",
										form.location === opt.value
											? "text-[var(--brand)]/70"
											: "text-[var(--ink-muted)]",
									)}
								>
									{opt.desc}
								</span>
							</button>
						))}
					</div>

					{form.location === "custom" && (
						<div className="mt-2 space-y-1.5">
							<Label
								htmlFor="custom-location"
								className="text-xs text-[var(--ink-muted)]"
							>
								Lien ou adresse de réunion
							</Label>
							<Input
								id="custom-location"
								value={form.customLocation}
								onChange={(e) => patch("customLocation", e.target.value)}
								placeholder="https://zoom.us/... ou adresse physique"
								className="h-10"
							/>
						</div>
					)}
				</div>

				{/* Séparateur */}
				<div className="border-t border-[var(--border)]" />

				{/* Tag source */}
				<div className="space-y-1.5">
					<Label
						htmlFor="tag-source"
						className="text-xs font-medium uppercase tracking-wider text-[var(--ink-muted)]"
					>
						Source (tag tracking)
					</Label>
					<Input
						id="tag-source"
						value={form.tagSource}
						onChange={(e) => patch("tagSource", e.target.value)}
						placeholder="Ex : youtube, ads, referral..."
						className="h-10"
					/>
				</div>

				{/* Statut actif */}
				<div className="flex items-center justify-between rounded-[var(--radius-md)] border border-[var(--border)] bg-[var(--surface-raised)] px-4 py-3">
					<div className="space-y-0.5">
						<p className="text-sm font-medium text-[var(--ink)]">
							Événement actif
						</p>
						<p className="text-xs text-[var(--ink-muted)]">
							Si désactivé, la page de booking devient inaccessible.
						</p>
					</div>
					<Switch
						checked={form.isActive}
						onCheckedChange={(checked) => patch("isActive", checked)}
						aria-label="Activer/désactiver l'événement"
					/>
				</div>

				{/* Note interne */}
				<div className="space-y-1.5">
					<Label
						htmlFor="note-interne"
						className="text-xs font-medium uppercase tracking-wider text-[var(--ink-muted)]"
					>
						Note interne (non visible par les prospects)
					</Label>
					<Textarea
						id="note-interne"
						value={form.noteInterne}
						onChange={(e) => patch("noteInterne", e.target.value)}
						placeholder="Contexte, instructions équipe, infos sales..."
						rows={3}
						className="resize-none"
					/>
				</div>
			</div>
		</SectionShell>
	);
}
