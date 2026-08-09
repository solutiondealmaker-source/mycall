"use client";

import { useMutation, useQuery } from "convex/react";
import { ArrowLeft, CalendarPlus, Loader2 } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";
import { api } from "../../../../../convex/_generated/api";

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

// ─── Composant ────────────────────────────────────────────────────────────────

/**
 * Page de création d'un nouvel événement.
 * Formulaire minimaliste : nom + slug → redirige vers /events/[id]/edit
 */
export default function NewEventPage() {
	const router = useRouter();
	const createEvent = useMutation(api.events.create);
	const [name, setName] = useState("");
	const [slug, setSlug] = useState("");
	const [slugManuallyEdited, setSlugManuallyEdited] = useState(false);
	const [slugError, setSlugError] = useState("");
	const [creating, setCreating] = useState(false);

	const existingEvent = useQuery(
		api.events.getBySlug,
		slug.length >= 2 ? { slug } : "skip",
	);

	const handleNameChange = useCallback(
		(value: string) => {
			setName(value);
			if (!slugManuallyEdited) {
				setSlug(nameToSlug(value));
				setSlugError("");
			}
		},
		[slugManuallyEdited],
	);

	const handleSlugChange = useCallback((value: string) => {
		setSlugManuallyEdited(true);
		const cleaned = value
			.toLowerCase()
			.replace(/[^a-z0-9-]/g, "")
			.slice(0, 60);
		setSlug(cleaned);
		setSlugError("");
	}, []);

	const handleCreate = useCallback(async () => {
		if (!name.trim() || !slug.trim()) return;
		if (slug.length < 2) {
			setSlugError("Le slug doit contenir au moins 2 caractères.");
			return;
		}

		if (existingEvent) {
			setSlugError("Ce slug est déjà utilisé. Choisis-en un autre.");
			return;
		}

		setCreating(true);
		try {
			const newId = await createEvent({
				name: name.trim(),
				slug: slug.trim(),
				durationMinutes: 30,
				timezone: "Europe/Paris",
				priorityMode: "manual",
				allowReschedule: true,
				timeFormat: "h24",
				rangeType: "rolling",
				rangeDays: 14,
				minimumNoticeHours: 2,
				bufferBeforeMinutes: 0,
				bufferAfterMinutes: 0,
				slotIncrementMinutes: 30,
				location: "googleMeet",
			});
			toast.success("Événement créé !");
			router.push(`/events/${newId}/edit`);
		} catch (err) {
			const msg = err instanceof Error ? err.message : "Erreur inconnue";
			if (msg.includes("slug") || msg.includes("duplicate")) {
				setSlugError("Ce slug est déjà utilisé. Choisis-en un autre.");
			} else {
				toast.error("Impossible de créer l'événement", { description: msg });
			}
		} finally {
			setCreating(false);
		}
	}, [name, slug, router, createEvent, existingEvent]);

	const isValid = name.trim().length >= 2 && slug.trim().length >= 2;

	return (
		<div className="max-w-[480px] mx-auto pt-12 animate-fade-in">
			{/* Back */}
			<Button
				variant="ghost"
				size="sm"
				asChild
				className="mb-8 -ml-1 gap-1.5 text-[var(--ink-muted)]"
			>
				<Link href="/events">
					<ArrowLeft className="w-3.5 h-3.5" />
					Retour aux événements
				</Link>
			</Button>

			{/* Card */}
			<div className="card-premium">
				{/* Header */}
				<div className="flex items-start gap-3.5 mb-6">
					<div className="w-10 h-10 rounded-[var(--radius-sm)] bg-[var(--brand-soft)] ring-1 ring-[var(--brand-glow)] flex items-center justify-center shrink-0">
						<CalendarPlus
							className="w-5 h-5 text-[var(--brand)]"
							strokeWidth={1.75}
						/>
					</div>
					<div>
						<h1 className="text-xl font-semibold font-[family-name:var(--font-display)] text-[var(--ink)] tracking-[-0.01em]">
							Nouvel événement
						</h1>
						<p className="text-sm text-[var(--ink-muted)] mt-0.5">
							Crée un nouveau type de rendez-vous public.
						</p>
					</div>
				</div>

				{/* Form */}
				<div className="space-y-5">
					{/* Nom */}
					<div className="space-y-1.5">
						<Label
							htmlFor="new-name"
							className="text-xs font-medium uppercase tracking-wider text-[var(--ink-muted)]"
						>
							Nom de l'événement *
						</Label>
						<Input
							id="new-name"
							autoFocus
							value={name}
							onChange={(e) => handleNameChange(e.target.value)}
							placeholder="Ex : Appel découverte 30 min"
							className="h-11 text-base"
							onKeyDown={(e) => e.key === "Enter" && isValid && handleCreate()}
						/>
					</div>

					{/* Slug */}
					<div className="space-y-1.5">
						<Label
							htmlFor="new-slug"
							className="text-xs font-medium uppercase tracking-wider text-[var(--ink-muted)]"
						>
							Identifiant URL (slug)
						</Label>
						<div
							className={cn(
								"flex items-center rounded-[var(--radius-md)] border overflow-hidden",
								"focus-within:ring-2 focus-within:ring-[var(--brand)]/20 focus-within:border-[var(--brand)] transition-all",
								slugError
									? "border-[var(--destructive)]"
									: "border-[var(--border)] bg-[var(--surface-raised)]",
							)}
						>
							<span className="px-3 text-xs text-[var(--ink-ghost)] whitespace-nowrap border-r border-[var(--border)] h-11 flex items-center select-none font-[family-name:var(--font-body)]">
								/book/
							</span>
							<Input
								id="new-slug"
								value={slug}
								onChange={(e) => handleSlugChange(e.target.value)}
								placeholder="mon-evenement"
								className="border-0 bg-transparent focus-visible:ring-0 h-11 rounded-none"
								onKeyDown={(e) =>
									e.key === "Enter" && isValid && handleCreate()
								}
							/>
						</div>
						{slugError ? (
							<p className="text-xs text-[var(--destructive)]">{slugError}</p>
						) : slug ? (
							<p className="text-[11px] text-[var(--ink-ghost)]">
								URL publique :{" "}
								<code className="text-[var(--brand)]">/book/{slug}</code>
							</p>
						) : null}
					</div>

					{/* Bouton créer */}
					<Button
						className="w-full h-11 text-base"
						disabled={!isValid || creating}
						onClick={handleCreate}
					>
						{creating ? (
							<>
								<Loader2 className="w-4 h-4 mr-2 animate-spin" />
								Création en cours...
							</>
						) : (
							"Créer l'événement →"
						)}
					</Button>
				</div>
			</div>
		</div>
	);
}
