"use client";

import { useMutation, useQuery } from "convex/react";
import { motion } from "framer-motion";
import {
	ChevronLeft,
	Loader2,
	Mail,
	ShieldOff,
	Trash2,
	UserPlus,
} from "lucide-react";
import Link from "next/link";
import { useState } from "react";
import { toast } from "sonner";
import { api } from "@/../convex/_generated/api";
import type { Id } from "@/../convex/_generated/dataModel";
import { AvatarCircle } from "@/components/dashboard/avatar-circle";
import { PageHeader } from "@/components/dashboard/page-header";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { Switch } from "@/components/ui/switch";
import { cn } from "@/lib/utils";

// ─── Constants ───────────────────────────────────────────────────────────────

const ROLE_OPTIONS = [
	{ value: "closer", label: "Closer" },
	{ value: "setter", label: "Setter" },
	{ value: "coach", label: "Coach" },
	{ value: "head_of_sales", label: "Head of Sales" },
	{ value: "ceo", label: "CEO" },
	{ value: "ops", label: "Ops" },
	{ value: "admin", label: "Admin" },
] as const;

type RoleValue = (typeof ROLE_OPTIONS)[number]["value"];

// ─── Component ───────────────────────────────────────────────────────────────

export default function TeamPage() {
	const profile = useQuery(api.users.getMyProfile);
	const allUsers = useQuery(api.users.listAllUsers);
	const updateRole = useMutation(api.users.updateUserRole);
	const toggleAdmin = useMutation(api.users.toggleAdmin);
	const removeUser = useMutation(api.users.removeUser);

	const [pendingAction, setPendingAction] = useState<string | null>(null);

	const isAdmin =
		profile?.isAdmin === true ||
		["admin", "ceo", "ops", "head_of_sales"].includes(profile?.role ?? "");

	// Non-admin redirect hint
	if (profile !== undefined && !isAdmin) {
		return (
			<div className="animate-fade-in max-w-xl">
				<PageHeader title="Équipe" />
				<div className="card-premium p-8 text-center">
					<ShieldOff className="w-8 h-8 text-[var(--ink-ghost)] mx-auto mb-3" />
					<p className="text-sm font-medium text-[var(--ink)]">
						Accès réservé aux administrateurs
					</p>
					<p className="text-xs text-[var(--ink-muted)] mt-1">
						Tu n'as pas les droits pour accéder à cette page.
					</p>
				</div>
			</div>
		);
	}

	async function handleRoleChange(userId: Id<"users">, role: RoleValue) {
		setPendingAction(userId);
		try {
			await updateRole({ userId, role });
			toast.success("Rôle mis à jour");
		} catch (err) {
			toast.error(err instanceof Error ? err.message : "Erreur");
		} finally {
			setPendingAction(null);
		}
	}

	async function handleToggleAdmin(userId: Id<"users">) {
		setPendingAction(`admin-${userId}`);
		try {
			const result = await toggleAdmin({ userId });
			toast.success(
				result.isAdmin ? "Droits admin accordés" : "Droits admin retirés",
			);
		} catch (err) {
			toast.error(err instanceof Error ? err.message : "Erreur");
		} finally {
			setPendingAction(null);
		}
	}

	async function handleRemove(userId: Id<"users">, name: string) {
		if (
			!window.confirm(
				`Supprimer "${name}" ? Cette action est irréversible et supprimera aussi ses disponibilités.`,
			)
		)
			return;
		setPendingAction(`remove-${userId}`);
		try {
			await removeUser({ userId });
			toast.success(`"${name}" supprimé`);
		} catch (err) {
			toast.error(err instanceof Error ? err.message : "Erreur");
		} finally {
			setPendingAction(null);
		}
	}

	return (
		<div className="animate-fade-in max-w-4xl">
			<PageHeader
				title="Équipe"
				description="Gère les membres, rôles et permissions."
				actions={
					<div className="flex items-center gap-2">
						<Button
							variant="outline"
							size="sm"
							className="gap-1.5 opacity-50 cursor-not-allowed"
							disabled
							title="Disponible en V1.5"
						>
							<UserPlus className="w-4 h-4" />
							Inviter un membre
						</Button>
						<Button variant="ghost" size="sm" asChild className="gap-1.5">
							<Link href="/settings">
								<ChevronLeft className="w-4 h-4" />
								Retour
							</Link>
						</Button>
					</div>
				}
			/>

			{/* Invite V1.5 notice */}
			<motion.div
				initial={{ opacity: 0, y: 8 }}
				animate={{ opacity: 1, y: 0 }}
				transition={{ duration: 0.15 }}
				className="card-premium p-4 mb-6 flex items-center gap-3"
			>
				<Mail className="w-4 h-4 text-[var(--brand)] shrink-0" />
				<p className="text-xs text-[var(--ink-muted)]">
					<span className="font-medium text-[var(--ink)]">
						Invitation par email
					</span>{" "}
					— Les nouveaux membres peuvent créer leur compte directement via la
					page de signup. L'invitation automatique par email arrive en V1.5.
				</p>
			</motion.div>

			{/* Table */}
			<motion.div
				initial={{ opacity: 0, y: 12 }}
				animate={{ opacity: 1, y: 0 }}
				transition={{ duration: 0.15, ease: [0.16, 1, 0.3, 1] }}
				className="card-premium overflow-hidden"
			>
				{/* Header */}
				<div className="grid grid-cols-[1fr_160px_100px_40px] gap-3 px-5 py-3 border-b border-[var(--border)] bg-[var(--surface-raised)]">
					<span className="text-[11px] font-semibold text-[var(--ink-ghost)] uppercase tracking-wide">
						Membre
					</span>
					<span className="text-[11px] font-semibold text-[var(--ink-ghost)] uppercase tracking-wide">
						Rôle
					</span>
					<span className="text-[11px] font-semibold text-[var(--ink-ghost)] uppercase tracking-wide">
						Admin
					</span>
					<span />
				</div>

				{/* Rows */}
				{allUsers === undefined ? (
					<div className="divide-y divide-[var(--border)]">
						{Array.from({ length: 4 }).map((_, i) => (
							<div key={i} className="flex items-center gap-3 px-5 py-4">
								<Skeleton className="w-9 h-9 rounded-full" />
								<div className="flex-1 space-y-1.5">
									<Skeleton className="h-3.5 w-32" />
									<Skeleton className="h-3 w-44" />
								</div>
								<Skeleton className="h-8 w-36" />
								<Skeleton className="h-6 w-10 rounded-full" />
							</div>
						))}
					</div>
				) : allUsers.length === 0 ? (
					<div className="flex flex-col items-center justify-center py-16 gap-3">
						<p className="text-sm text-[var(--ink-muted)]">Aucun membre</p>
					</div>
				) : (
					<div className="divide-y divide-[var(--border)]">
						{allUsers.map((user) => {
							const displayName = user.name ?? user.email ?? "Inconnu";
							const isCurrentUser = user._id === profile?._id;
							const isPendingRole = pendingAction === user._id;
							const isPendingAdmin = pendingAction === `admin-${user._id}`;
							const isPendingRemove = pendingAction === `remove-${user._id}`;

							return (
								<div
									key={user._id}
									className={cn(
										"grid grid-cols-[1fr_160px_100px_40px] gap-3 items-center px-5 py-4",
										"transition-colors duration-150 hover:bg-[var(--surface-raised)]",
										isCurrentUser && "bg-[var(--brand-soft)]",
									)}
								>
									{/* Identity */}
									<div className="flex items-center gap-3 min-w-0">
										<AvatarCircle name={displayName} size="sm" />
										<div className="min-w-0">
											<div className="flex items-center gap-1.5">
												<p className="text-sm font-medium text-[var(--ink)] truncate font-[family-name:var(--font-display)]">
													{displayName}
												</p>
												{isCurrentUser && (
													<Badge
														variant="secondary"
														className="text-[10px] px-1.5 h-4 border-0 bg-[var(--brand-soft)] text-[var(--brand)] shrink-0"
													>
														Toi
													</Badge>
												)}
											</div>
											<p className="text-xs text-[var(--ink-ghost)] truncate">
												{user.email}
											</p>
										</div>
									</div>

									{/* Role select */}
									<div className="flex items-center">
										{isPendingRole ? (
											<Loader2 className="w-4 h-4 animate-spin text-[var(--brand)]" />
										) : (
											<Select
												value={user.role ?? "closer"}
												onValueChange={(v) =>
													handleRoleChange(user._id, v as RoleValue)
												}
												disabled={isCurrentUser}
											>
												<SelectTrigger className="h-8 text-xs w-36">
													<SelectValue />
												</SelectTrigger>
												<SelectContent>
													{ROLE_OPTIONS.map((r) => (
														<SelectItem
															key={r.value}
															value={r.value}
															className="text-xs"
														>
															{r.label}
														</SelectItem>
													))}
												</SelectContent>
											</Select>
										)}
									</div>

									{/* Admin toggle */}
									<div className="flex items-center">
										{isPendingAdmin ? (
											<Loader2 className="w-4 h-4 animate-spin text-[var(--brand)]" />
										) : (
											<Switch
												checked={user.isAdmin === true}
												onCheckedChange={() => handleToggleAdmin(user._id)}
												disabled={isCurrentUser}
												aria-label={`Admin ${displayName}`}
											/>
										)}
									</div>

									{/* Remove */}
									<div className="flex items-center justify-end">
										{isPendingRemove ? (
											<Loader2 className="w-4 h-4 animate-spin text-[var(--destructive)]" />
										) : (
											<button
												type="button"
												disabled={isCurrentUser}
												onClick={() => handleRemove(user._id, displayName)}
												className={cn(
													"flex items-center justify-center w-7 h-7 rounded-[var(--radius-sm)]",
													"text-[var(--ink-ghost)] transition-colors duration-150",
													"hover:text-[var(--destructive)] hover:bg-[var(--destructive-soft)]",
													isCurrentUser && "opacity-20 cursor-not-allowed",
												)}
												aria-label={`Supprimer ${displayName}`}
											>
												<Trash2 className="w-3.5 h-3.5" />
											</button>
										)}
									</div>
								</div>
							);
						})}
					</div>
				)}
			</motion.div>
		</div>
	);
}
