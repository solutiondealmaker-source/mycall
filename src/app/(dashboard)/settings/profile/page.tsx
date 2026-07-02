"use client";

import { useMutation, useQuery } from "convex/react";
import { motion } from "framer-motion";
import { ChevronLeft, Loader2, Lock, Save } from "lucide-react";
import Link from "next/link";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { api } from "@/../convex/_generated/api";
import { AvatarCircle } from "@/components/dashboard/avatar-circle";
import { PageHeader } from "@/components/dashboard/page-header";
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
import { Separator } from "@/components/ui/separator";
import { cn } from "@/lib/utils";

// ─── Timezones ───────────────────────────────────────────────────────────────

const COMMON_TIMEZONES = [
	{ value: "Europe/Paris", label: "Europe/Paris (UTC+1/+2)" },
	{ value: "Europe/London", label: "Europe/London (UTC+0/+1)" },
	{ value: "Europe/Brussels", label: "Europe/Brussels (UTC+1/+2)" },
	{ value: "Europe/Zurich", label: "Europe/Zurich (UTC+1/+2)" },
	{ value: "Europe/Madrid", label: "Europe/Madrid (UTC+1/+2)" },
	{ value: "Europe/Rome", label: "Europe/Rome (UTC+1/+2)" },
	{ value: "Europe/Amsterdam", label: "Europe/Amsterdam (UTC+1/+2)" },
	{ value: "America/New_York", label: "America/New_York (UTC-5/-4)" },
	{ value: "America/Chicago", label: "America/Chicago (UTC-6/-5)" },
	{ value: "America/Denver", label: "America/Denver (UTC-7/-6)" },
	{ value: "America/Los_Angeles", label: "America/Los_Angeles (UTC-8/-7)" },
	{ value: "America/Sao_Paulo", label: "America/Sao_Paulo (UTC-3)" },
	{ value: "America/Montreal", label: "America/Montreal (UTC-5/-4)" },
	{ value: "Africa/Casablanca", label: "Africa/Casablanca (UTC+0/+1)" },
	{ value: "Asia/Dubai", label: "Asia/Dubai (UTC+4)" },
	{ value: "Asia/Singapore", label: "Asia/Singapore (UTC+8)" },
	{ value: "Asia/Tokyo", label: "Asia/Tokyo (UTC+9)" },
	{ value: "Australia/Sydney", label: "Australia/Sydney (UTC+10/+11)" },
	{ value: "UTC", label: "UTC" },
] as const;

// ─── Component ───────────────────────────────────────────────────────────────

export default function ProfilePage() {
	const profile = useQuery(api.users.getMyProfile);
	const updateProfile = useMutation(api.users.updateMyProfile);

	const [name, setName] = useState("");
	const [timezone, setTimezone] = useState("Europe/Paris");
	const [isDirty, setIsDirty] = useState(false);
	const [isSaving, setIsSaving] = useState(false);

	// Sync state when profile loads
	useEffect(() => {
		if (profile) {
			setName(profile.name ?? "");
			setTimezone(profile.defaultTimezone ?? "Europe/Paris");
			setIsDirty(false);
		}
	}, [profile]);

	function markDirty() {
		setIsDirty(true);
	}

	async function handleSave() {
		setIsSaving(true);
		try {
			await updateProfile({ name: name.trim(), defaultTimezone: timezone });
			setIsDirty(false);
			toast.success("Profil mis à jour");
		} catch (err) {
			toast.error(
				err instanceof Error ? err.message : "Erreur lors de la sauvegarde",
			);
		} finally {
			setIsSaving(false);
		}
	}

	const isLoading = profile === undefined;
	const displayName = profile?.name ?? profile?.email ?? "Utilisateur";

	return (
		<div className="animate-fade-in max-w-2xl">
			<PageHeader
				title="Profil"
				description="Modifie tes informations personnelles."
				actions={
					<Button variant="ghost" size="sm" asChild className="gap-1.5">
						<Link href="/settings">
							<ChevronLeft className="w-4 h-4" />
							Retour
						</Link>
					</Button>
				}
			/>

			<motion.div
				initial={{ opacity: 0, y: 12 }}
				animate={{ opacity: 1, y: 0 }}
				transition={{ duration: 0.4, ease: [0.16, 1, 0.3, 1] }}
				className="space-y-6"
			>
				{/* Avatar + identité */}
				<div className="card-premium p-6 flex items-center gap-5">
					<AvatarCircle name={displayName} size="lg" />
					<div className="flex-1 min-w-0">
						<p className="text-sm font-semibold text-[var(--ink)] font-[family-name:var(--font-display)]">
							{displayName}
						</p>
						<p className="text-xs text-[var(--ink-muted)] mt-0.5">
							{profile?.email ?? ""}
						</p>
						<p className="text-[11px] text-[var(--ink-ghost)] mt-1.5">
							Modification de l'avatar disponible en V1.5 — stockage Convex
							Files
						</p>
					</div>
				</div>

				{/* Form */}
				<div className="card-premium p-6 space-y-5">
					<h2 className="text-sm font-semibold text-[var(--ink)] font-[family-name:var(--font-display)] tracking-[-0.01em]">
						Informations générales
					</h2>

					{/* Nom */}
					<div className="space-y-1.5">
						<Label
							htmlFor="name"
							className="text-xs font-medium text-[var(--ink-muted)] uppercase tracking-wide"
						>
							Nom complet
						</Label>
						{isLoading ? (
							<div className="h-10 bg-[var(--surface-raised)] rounded-[var(--radius-sm)] animate-pulse" />
						) : (
							<Input
								id="name"
								value={name}
								onChange={(e) => {
									setName(e.target.value);
									markDirty();
								}}
								placeholder="Ton nom"
								className="h-10"
							/>
						)}
					</div>

					{/* Email readonly */}
					<div className="space-y-1.5">
						<Label
							htmlFor="email"
							className="text-xs font-medium text-[var(--ink-muted)] uppercase tracking-wide"
						>
							Email
						</Label>
						<div className="relative">
							<Input
								id="email"
								value={profile?.email ?? ""}
								readOnly
								className="h-10 pr-10 cursor-not-allowed opacity-60"
							/>
							<Lock className="absolute right-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-[var(--ink-ghost)]" />
						</div>
						<p className="text-[11px] text-[var(--ink-ghost)]">
							L'email est géré par le système d'authentification et ne peut pas
							être modifié ici.
						</p>
					</div>

					{/* Timezone */}
					<div className="space-y-1.5">
						<Label
							htmlFor="timezone"
							className="text-xs font-medium text-[var(--ink-muted)] uppercase tracking-wide"
						>
							Fuseau horaire
						</Label>
						{isLoading ? (
							<div className="h-10 bg-[var(--surface-raised)] rounded-[var(--radius-sm)] animate-pulse" />
						) : (
							<Select
								value={timezone}
								onValueChange={(v) => {
									setTimezone(v);
									markDirty();
								}}
							>
								<SelectTrigger id="timezone" className="h-10">
									<SelectValue placeholder="Sélectionner un fuseau" />
								</SelectTrigger>
								<SelectContent>
									{COMMON_TIMEZONES.map((tz) => (
										<SelectItem key={tz.value} value={tz.value}>
											{tz.label}
										</SelectItem>
									))}
								</SelectContent>
							</Select>
						)}
						<p className="text-[11px] text-[var(--ink-ghost)]">
							Utilisé pour afficher les créneaux de booking dans ton heure
							locale.
						</p>
					</div>

					{/* Save button */}
					<div className="flex justify-end pt-2">
						<Button
							onClick={handleSave}
							disabled={!isDirty || isSaving}
							className={cn(
								"gap-2 h-9",
								"bg-[var(--brand)] hover:bg-[var(--brand-bright)] text-white",
							)}
						>
							{isSaving ? (
								<Loader2 className="w-4 h-4 animate-spin" />
							) : (
								<Save className="w-4 h-4" />
							)}
							Enregistrer
						</Button>
					</div>
				</div>

				{/* Section sécurité */}
				<div className="card-premium p-6 space-y-4">
					<h2 className="text-sm font-semibold text-[var(--ink)] font-[family-name:var(--font-display)] tracking-[-0.01em]">
						Sécurité
					</h2>
					<Separator className="bg-[var(--border)]" />
					<div className="flex items-start gap-3">
						<div className="w-8 h-8 rounded-[var(--radius-sm)] bg-[var(--surface-raised)] flex items-center justify-center shrink-0">
							<Lock className="w-4 h-4 text-[var(--ink-ghost)]" />
						</div>
						<div>
							<p className="text-sm font-medium text-[var(--ink)]">
								Mot de passe
							</p>
							<p className="text-xs text-[var(--ink-muted)] mt-0.5 leading-relaxed">
								Le changement de mot de passe est géré via la page{" "}
								<Link
									href="/reset"
									className="text-[var(--brand)] hover:text-[var(--brand-bright)] transition-colors"
								>
									/reset
								</Link>
								. La modification directe depuis les paramètres sera disponible
								en V1.5.
							</p>
						</div>
					</div>
				</div>
			</motion.div>
		</div>
	);
}
