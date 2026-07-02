"use client";

import { useMutation, useQuery } from "convex/react";
import { motion, type Variants } from "framer-motion";
import {
	CalendarDays,
	Copy,
	MoreHorizontal,
	Pencil,
	Plus,
	Search,
	Trash2,
} from "lucide-react";
import Link from "next/link";
import { useMemo, useState } from "react";
import { toast } from "sonner";
import { api } from "@/../convex/_generated/api";
import type { Id } from "@/../convex/_generated/dataModel";
import { PageHeader } from "@/components/dashboard/page-header";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
	DropdownMenu,
	DropdownMenuContent,
	DropdownMenuItem,
	DropdownMenuSeparator,
	DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { Switch } from "@/components/ui/switch";
import { cn } from "@/lib/utils";
import type { EventDoc } from "@/types/events";

// ─── Filter types ──────────────────────────────────────────────────────────────

type FilterStatus = "all" | "active" | "inactive";

// ─── Row animation variants ───────────────────────────────────────────────────

const rowVariants: Variants = {
	hidden: { opacity: 0, y: 8 },
	visible: (i: number) => ({
		opacity: 1,
		y: 0,
		transition: { duration: 0.3, delay: i * 0.05, ease: [0.16, 1, 0.3, 1] },
	}),
};

// ─── Composant ────────────────────────────────────────────────────────────────

/**
 * Page liste des événements.
 * TODO API: useQuery(api.events.listAll) + useMutation(api.events.toggleActive) + useMutation(api.events.archive)
 */
export default function EventsPage() {
	const rawEvents = useQuery(api.events.list, {}) as EventDoc[] | undefined;
	const updateEvent = useMutation(api.events.update);
	const archiveEvent = useMutation(api.events.archive);

	const [search, setSearch] = useState("");
	const [filterStatus, setFilterStatus] = useState<FilterStatus>("all");

	const isLoading = rawEvents === undefined;

	const filteredEvents = useMemo(() => {
		if (!rawEvents) return [];
		let result = rawEvents;

		if (filterStatus === "active") result = result.filter((e) => e.isActive);
		if (filterStatus === "inactive") result = result.filter((e) => !e.isActive);

		if (search.length >= 1) {
			const q = search.toLowerCase();
			result = result.filter(
				(e) =>
					e.name.toLowerCase().includes(q) || e.slug.toLowerCase().includes(q),
			);
		}

		return result;
	}, [search, filterStatus, rawEvents]);

	const handleToggleActive = async (id: string, current: boolean) => {
		try {
			await updateEvent({
				id: id as Id<"events">,
				isActive: !current,
			});
			toast.success(`Événement ${current ? "désactivé" : "activé"}`);
		} catch (err) {
			const msg = err instanceof Error ? err.message : "Erreur inconnue";
			toast.error("Impossible de modifier l'événement", { description: msg });
		}
	};

	const handleCopyUrl = (slug: string) => {
		const url = `${window.location.origin}/book/${slug}`;
		navigator.clipboard.writeText(url).then(() => {
			toast.success("URL copiée !");
		});
	};

	const handleArchive = async (id: string, name: string) => {
		try {
			await archiveEvent({ id: id as Id<"events"> });
			toast.success(`"${name}" archivé`);
		} catch (err) {
			const msg = err instanceof Error ? err.message : "Erreur inconnue";
			toast.error("Impossible d'archiver", { description: msg });
		}
	};

	return (
		<div className="animate-fade-in">
			<PageHeader
				title="Événements"
				description="Gère tes types de rendez-vous et leurs configurations."
				actions={
					<Button asChild className="gap-1.5">
						<Link href="/events/new">
							<Plus className="w-4 h-4" />
							Nouvel événement
						</Link>
					</Button>
				}
			/>

			{/* Filter bar */}
			<div className="flex items-center gap-3 mb-6">
				{/* Search */}
				<div className="relative flex-1 max-w-[320px]">
					<Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-[var(--ink-ghost)]" />
					<Input
						value={search}
						onChange={(e) => setSearch(e.target.value)}
						placeholder="Rechercher un événement..."
						className="pl-9 h-9"
					/>
				</div>

				{/* Status filter tabs */}
				<div className="flex items-center gap-1 rounded-[var(--radius-md)] border border-[var(--border)] bg-[var(--surface-raised)] p-1">
					{(
						[
							{ value: "all", label: "Tous" },
							{ value: "active", label: "Actifs" },
							{ value: "inactive", label: "Inactifs" },
						] as { value: FilterStatus; label: string }[]
					).map((opt) => (
						<button
							key={opt.value}
							type="button"
							onClick={() => setFilterStatus(opt.value)}
							className={cn(
								"px-3 h-7 text-xs font-medium rounded-[calc(var(--radius-md)-4px)] transition-all duration-150",
								filterStatus === opt.value
									? "bg-[var(--brand)] text-white shadow-[var(--shadow-brand)]"
									: "text-[var(--ink-muted)] hover:text-[var(--ink)] hover:bg-[var(--surface-muted)]",
							)}
						>
							{opt.label}
						</button>
					))}
				</div>
			</div>

			{/* Contenu */}
			{isLoading ? (
				<LoadingSkeleton />
			) : filteredEvents.length === 0 ? (
				<EmptyState
					hasSearch={search.length > 0}
					onClearSearch={() => setSearch("")}
				/>
			) : (
				<div className="space-y-2">
					{filteredEvents.map((event, i) => (
						<EventRow
							key={event._id}
							event={event}
							index={i}
							onToggleActive={() =>
								handleToggleActive(event._id, event.isActive)
							}
							onCopyUrl={() => handleCopyUrl(event.slug)}
							onArchive={() => handleArchive(event._id, event.name)}
						/>
					))}
				</div>
			)}
		</div>
	);
}

// ─── EventRow ──────────────────────────────────────────────────────────────────

interface EventRowProps {
	event: EventDoc;
	index: number;
	onToggleActive: () => void;
	onCopyUrl: () => void;
	onArchive: () => void;
}

function EventRow({
	event,
	index,
	onToggleActive,
	onCopyUrl,
	onArchive,
}: EventRowProps) {
	const createdAt = new Intl.DateTimeFormat("fr-FR", {
		day: "numeric",
		month: "short",
		year: "numeric",
	}).format(new Date(event._creationTime));

	return (
		<motion.div
			custom={index}
			variants={rowVariants}
			initial="hidden"
			animate="visible"
			className={cn(
				"group flex items-center gap-4 px-5 py-4",
				"rounded-[var(--radius-lg)] border border-[var(--border)] bg-[var(--surface)]",
				"transition-all duration-150",
				"hover:border-[var(--brand)]/20 hover:bg-[var(--surface-raised)] hover:shadow-[var(--shadow-card)]",
			)}
		>
			{/* Icône event */}
			<div className="shrink-0 w-10 h-10 rounded-[var(--radius-sm)] bg-[var(--brand-soft)] flex items-center justify-center">
				<CalendarDays
					className="w-5 h-5 text-[var(--brand)]"
					strokeWidth={1.75}
				/>
			</div>

			{/* Infos */}
			<div className="flex-1 min-w-0">
				<div className="flex items-center gap-2">
					<p className="text-sm font-semibold text-[var(--ink)] font-[family-name:var(--font-display)] truncate">
						{event.name}
					</p>
					<Badge
						variant="secondary"
						className={cn(
							"text-[10px] px-2 h-5 shrink-0 border-0 font-medium",
							event.isActive
								? "bg-[var(--success-soft)] text-[var(--success)]"
								: "bg-[var(--surface-muted)] text-[var(--ink-ghost)]",
						)}
					>
						{event.isActive ? "Actif" : "Inactif"}
					</Badge>
				</div>
				{/* Slug cliquable */}
				<button
					type="button"
					onClick={onCopyUrl}
					className="flex items-center gap-1 mt-0.5 group/slug"
					title="Copier l'URL publique"
				>
					<code className="text-xs text-[var(--ink-ghost)] font-[family-name:var(--font-mono)] group-hover/slug:text-[var(--brand)] transition-colors">
						/book/{event.slug}
					</code>
					<Copy className="w-3 h-3 text-[var(--ink-ghost)] opacity-0 group-hover/slug:opacity-100 transition-opacity" />
				</button>
			</div>

			{/* Durée */}
			<div className="shrink-0 text-center hidden sm:block">
				<p className="text-sm font-medium text-[var(--ink)]">
					{event.durationMinutes} min
				</p>
				<p className="text-xs text-[var(--ink-ghost)]">Durée</p>
			</div>

			{/* Créé le */}
			<div className="shrink-0 text-center hidden md:block">
				<p className="text-sm font-medium text-[var(--ink)]">{createdAt}</p>
				<p className="text-xs text-[var(--ink-ghost)]">Créé le</p>
			</div>

			{/* Toggle actif */}
			{/* biome-ignore lint/a11y/noStaticElementInteractions: stop propagation only, no interaction */}
			{/* biome-ignore lint/a11y/useKeyWithClickEvents: stop propagation only, keyboard not needed */}
			<div
				className="shrink-0 flex items-center gap-2"
				onClick={(e) => e.stopPropagation()}
			>
				<Switch
					checked={event.isActive}
					onCheckedChange={onToggleActive}
					aria-label={event.isActive ? "Désactiver" : "Activer"}
				/>
			</div>

			{/* Actions */}
			<div className="shrink-0 flex items-center gap-2">
				<Button
					variant="ghost"
					size="sm"
					asChild
					className="gap-1.5 text-xs opacity-0 group-hover:opacity-100 transition-opacity"
				>
					<Link href={`/events/${event._id}/edit`}>
						<Pencil className="w-3.5 h-3.5" />
						Éditer
					</Link>
				</Button>

				<DropdownMenu>
					<DropdownMenuTrigger asChild>
						<Button
							variant="ghost"
							size="icon-xs"
							className="opacity-0 group-hover:opacity-100 transition-opacity"
							aria-label="Plus d'actions"
						>
							<MoreHorizontal className="w-4 h-4" />
						</Button>
					</DropdownMenuTrigger>
					<DropdownMenuContent align="end" className="w-44">
						<DropdownMenuItem asChild>
							<Link href={`/events/${event._id}/edit`} className="gap-2">
								<Pencil className="w-3.5 h-3.5" />
								Éditer
							</Link>
						</DropdownMenuItem>
						<DropdownMenuItem onClick={onCopyUrl} className="gap-2">
							<Copy className="w-3.5 h-3.5" />
							Copier l'URL
						</DropdownMenuItem>
						<DropdownMenuSeparator />
						<DropdownMenuItem
							onClick={onArchive}
							className="text-[var(--destructive)] focus:text-[var(--destructive)] gap-2"
						>
							<Trash2 className="w-3.5 h-3.5" />
							Archiver
						</DropdownMenuItem>
					</DropdownMenuContent>
				</DropdownMenu>
			</div>
		</motion.div>
	);
}

// ─── Empty state ──────────────────────────────────────────────────────────────

function EmptyState({
	hasSearch,
	onClearSearch,
}: {
	hasSearch: boolean;
	onClearSearch: () => void;
}) {
	return (
		<motion.div
			initial={{ opacity: 0, y: 12 }}
			animate={{ opacity: 1, y: 0 }}
			transition={{ duration: 0.4, ease: [0.16, 1, 0.3, 1] }}
			className="flex flex-col items-center justify-center py-24 gap-5"
		>
			{/* Mesh blob decoration */}
			<div className="relative w-20 h-20 flex items-center justify-center">
				<div className="absolute inset-0 rounded-full bg-[var(--brand-soft)] blur-xl opacity-60" />
				<div className="relative w-16 h-16 rounded-full bg-[var(--brand-soft)] ring-1 ring-[var(--brand-glow)] flex items-center justify-center">
					<CalendarDays
						className="w-7 h-7 text-[var(--brand)]"
						strokeWidth={1.5}
					/>
				</div>
			</div>

			<div className="text-center space-y-1">
				<h3 className="text-base font-semibold font-[family-name:var(--font-display)] text-[var(--ink)]">
					{hasSearch ? "Aucun résultat" : "Aucun événement"}
				</h3>
				<p className="text-sm text-[var(--ink-muted)] max-w-xs">
					{hasSearch
						? "Aucun événement ne correspond à ta recherche."
						: "Crée ton premier type de rendez-vous pour commencer à recevoir des bookings."}
				</p>
			</div>

			{hasSearch ? (
				<Button variant="outline" size="sm" onClick={onClearSearch}>
					Effacer la recherche
				</Button>
			) : (
				<Button asChild className="gap-1.5">
					<Link href="/events/new">
						<Plus className="w-4 h-4" />
						Créer mon premier événement
					</Link>
				</Button>
			)}
		</motion.div>
	);
}

// ─── Loading skeleton ─────────────────────────────────────────────────────────

function LoadingSkeleton() {
	return (
		<div className="space-y-2">
			{Array.from({ length: 4 }).map((_, i) => (
				<div
					key={i}
					className="flex items-center gap-4 px-5 py-4 rounded-[var(--radius-lg)] border border-[var(--border)] bg-[var(--surface)]"
				>
					<Skeleton className="w-10 h-10 rounded-[var(--radius-sm)] shrink-0" />
					<div className="flex-1 space-y-2">
						<Skeleton className="h-4 w-48 rounded" />
						<Skeleton className="h-3 w-28 rounded" />
					</div>
					<Skeleton className="h-4 w-16 rounded hidden sm:block" />
					<Skeleton className="h-4 w-20 rounded hidden md:block" />
					<Skeleton className="h-6 w-10 rounded-full" />
					<Skeleton className="h-7 w-16 rounded" />
				</div>
			))}
		</div>
	);
}
