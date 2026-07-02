"use client";

import { Check, UserPlus, Users, X } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { AvatarCircle } from "@/components/dashboard/avatar-circle";
import { SectionShell } from "@/components/events/section-shell";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
	Command,
	CommandEmpty,
	CommandGroup,
	CommandInput,
	CommandItem,
	CommandList,
} from "@/components/ui/command";
import { Label } from "@/components/ui/label";
import {
	Popover,
	PopoverContent,
	PopoverTrigger,
} from "@/components/ui/popover";
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "@/components/ui/select";
import { cn } from "@/lib/utils";
import type { EventDoc, EventHost, EventPatch } from "@/types/events";

// ─── Types ────────────────────────────────────────────────────────────────────

interface UserOption {
	id: string;
	name: string;
	email: string;
	image?: string;
}

// ─── Props ────────────────────────────────────────────────────────────────────

interface HostsSectionProps {
	event: EventDoc;
	hosts: EventHost[];
	availableUsers: UserOption[];
	onUpdate: (patch: EventPatch) => Promise<void>;
	onAddHost: (
		userId: string,
		priority: "high" | "medium" | "low",
	) => Promise<void>;
	onRemoveHost: (hostId: string) => Promise<void>;
	onUpdateHostPriority: (
		hostId: string,
		priority: "high" | "medium" | "low",
	) => Promise<void>;
}

// ─── Priority config ──────────────────────────────────────────────────────────

const PRIORITY_CONFIG = {
	high: {
		label: "Haute",
		color: "bg-[var(--success-soft)] text-[var(--success)]",
	},
	medium: {
		label: "Normale",
		color: "bg-[var(--brand-soft)] text-[var(--brand)]",
	},
	low: {
		label: "Basse",
		color: "bg-[var(--surface-muted)] text-[var(--ink-muted)]",
	},
} as const;

// ─── Composant ────────────────────────────────────────────────────────────────

/**
 * HostsSection — gestion des hôtes assignés à un événement.
 * Liste hôtes, ajout via combobox, priorité, mode de rotation.
 */
export function HostsSection({
	event,
	hosts,
	availableUsers,
	onUpdate,
	onAddHost,
	onRemoveHost,
	onUpdateHostPriority,
}: HostsSectionProps) {
	const [isDirty, setIsDirty] = useState(false);
	const [priorityMode, setPriorityMode] = useState(event.priorityMode);
	const [setterId, setSetterId] = useState(event.setterId ?? "");
	const [addPopoverOpen, setAddPopoverOpen] = useState(false);
	const [selectedNewUserId, setSelectedNewUserId] = useState("");

	useEffect(() => {
		setPriorityMode(event.priorityMode);
		setSetterId(event.setterId ?? "");
		setIsDirty(false);
	}, [event]);

	const handleAddHost = useCallback(async () => {
		if (!selectedNewUserId) return;
		await onAddHost(selectedNewUserId, "medium");
		setSelectedNewUserId("");
		setAddPopoverOpen(false);
	}, [selectedNewUserId, onAddHost]);

	const handleSave = useCallback(async () => {
		await onUpdate({
			priorityMode,
			setterId: setterId || undefined,
		});
		setIsDirty(false);
	}, [onUpdate, priorityMode, setterId]);

	const handleCancel = useCallback(() => {
		setPriorityMode(event.priorityMode);
		setSetterId(event.setterId ?? "");
		setIsDirty(false);
	}, [event]);

	// Filtre les utilisateurs déjà hôtes
	const alreadyHostUserIds = new Set(hosts.map((h) => h.userId));
	const addableUsers = availableUsers.filter(
		(u) => !alreadyHostUserIds.has(u.id),
	);

	return (
		<SectionShell
			icon={Users}
			title="Hôtes de l'événement"
			description="Les hôtes sont les membres de l'équipe qui recevront des réservations sur cet événement."
			onSave={handleSave}
			isDirty={isDirty}
			onCancel={handleCancel}
		>
			<div className="space-y-6 max-w-[520px]">
				{/* Liste des hôtes */}
				<div className="space-y-2">
					<div className="flex items-center justify-between mb-3">
						<Label className="text-xs font-medium uppercase tracking-wider text-[var(--ink-muted)]">
							Hôtes assignés ({hosts.length})
						</Label>

						{/* Bouton ajouter */}
						<Popover open={addPopoverOpen} onOpenChange={setAddPopoverOpen}>
							<PopoverTrigger asChild>
								<Button variant="outline" size="sm" className="gap-1.5">
									<UserPlus className="w-3.5 h-3.5" />
									Ajouter un hôte
								</Button>
							</PopoverTrigger>
							<PopoverContent className="w-[300px] p-0" align="end">
								<Command>
									<CommandInput placeholder="Rechercher par nom ou email..." />
									<CommandList>
										<CommandEmpty>
											<p className="text-sm text-[var(--ink-muted)] text-center py-4">
												Aucun utilisateur trouvé
											</p>
										</CommandEmpty>
										<CommandGroup heading="Utilisateurs disponibles">
											{addableUsers.map((user) => (
												<CommandItem
													key={user.id}
													value={`${user.name} ${user.email}`}
													onSelect={() => setSelectedNewUserId(user.id)}
												>
													<div className="flex items-center gap-2.5 flex-1">
														<AvatarCircle
															name={user.name ?? user.email}
															size="xs"
														/>
														<div className="min-w-0">
															<p className="text-sm font-medium text-[var(--ink)] truncate">
																{user.name ?? "Sans nom"}
															</p>
															<p className="text-xs text-[var(--ink-muted)] truncate">
																{user.email}
															</p>
														</div>
													</div>
													{selectedNewUserId === user.id && (
														<Check className="w-4 h-4 text-[var(--brand)] ml-auto shrink-0" />
													)}
												</CommandItem>
											))}
										</CommandGroup>
									</CommandList>
								</Command>
								<div className="p-2 border-t border-[var(--border)]">
									<Button
										size="sm"
										className="w-full"
										disabled={!selectedNewUserId}
										onClick={handleAddHost}
									>
										Confirmer l'ajout
									</Button>
								</div>
							</PopoverContent>
						</Popover>
					</div>

					{/* Empty state */}
					{hosts.length === 0 ? (
						<div className="flex flex-col items-center justify-center py-10 gap-3 rounded-[var(--radius-lg)] border border-dashed border-[var(--border)] bg-[var(--surface-raised)]">
							<Users className="w-8 h-8 text-[var(--ink-ghost)]" />
							<div className="text-center">
								<p className="text-sm font-medium text-[var(--ink)]">
									Aucun hôte assigné
								</p>
								<p className="text-xs text-[var(--ink-muted)] mt-0.5">
									Commence par t'ajouter en premier hôte.
								</p>
							</div>
						</div>
					) : (
						<div className="space-y-2">
							{hosts.map((host) => (
								<HostRow
									key={host._id}
									host={host}
									onRemove={() => onRemoveHost(host._id)}
									onPriorityChange={(p) => onUpdateHostPriority(host._id, p)}
								/>
							))}
						</div>
					)}
				</div>

				{/* Séparateur */}
				<div className="border-t border-[var(--border)]" />

				{/* Mode de rotation */}
				<div className="space-y-2">
					<Label className="text-xs font-medium uppercase tracking-wider text-[var(--ink-muted)]">
						Mode de distribution des appels
					</Label>
					<div className="grid grid-cols-2 gap-2">
						{[
							{
								value: "manual",
								label: "Manuel",
								desc: "Ordre de priorité défini manuellement",
							},
							{
								value: "round_robin",
								label: "Rotation équitable",
								desc: "Distribution automatique entre hôtes",
							},
						].map((opt) => (
							<button
								key={opt.value}
								type="button"
								onClick={() => {
									setPriorityMode(opt.value as "manual" | "round_robin");
									setIsDirty(true);
								}}
								className={cn(
									"flex flex-col gap-0.5 px-4 py-3 rounded-[var(--radius-md)] border text-left transition-all duration-150 cursor-pointer",
									priorityMode === opt.value
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
										priorityMode === opt.value
											? "text-[var(--brand)]/70"
											: "text-[var(--ink-muted)]",
									)}
								>
									{opt.desc}
								</span>
							</button>
						))}
					</div>
				</div>

				{/* Setter assigné */}
				<div className="space-y-1.5">
					<Label className="text-xs font-medium uppercase tracking-wider text-[var(--ink-muted)]">
						Setter associé (optionnel)
					</Label>
					<Select
						value={setterId}
						onValueChange={(val) => {
							setSetterId(val);
							setIsDirty(true);
						}}
					>
						<SelectTrigger className="h-10">
							<SelectValue placeholder="Aucun setter assigné" />
						</SelectTrigger>
						<SelectContent>
							<SelectItem value="none">Aucun</SelectItem>
							{availableUsers.map((user) => (
								<SelectItem key={user.id} value={user.id}>
									{user.name ?? user.email}
								</SelectItem>
							))}
						</SelectContent>
					</Select>
					<p className="text-[11px] text-[var(--ink-ghost)]">
						Le setter sera notifié à chaque nouvelle réservation sur cet
						événement.
					</p>
				</div>
			</div>
		</SectionShell>
	);
}

// ─── HostRow ──────────────────────────────────────────────────────────────────

interface HostRowProps {
	host: EventHost;
	onRemove: () => void;
	onPriorityChange: (priority: "high" | "medium" | "low") => void;
}

function HostRow({ host, onRemove, onPriorityChange }: HostRowProps) {
	const name = host.user?.name ?? host.user?.email ?? "Hôte inconnu";
	const email = host.user?.email ?? "";

	return (
		<div
			className={cn(
				"flex items-center gap-3 px-4 py-3",
				"rounded-[var(--radius-md)] border border-[var(--border)]",
				"bg-[var(--surface)] transition-all duration-150",
				"hover:border-[var(--brand)]/20 hover:bg-[var(--surface-raised)]",
			)}
		>
			<AvatarCircle name={name} size="sm" />

			<div className="flex-1 min-w-0">
				<p className="text-sm font-medium text-[var(--ink)] truncate">{name}</p>
				<p className="text-xs text-[var(--ink-muted)] truncate">{email}</p>
			</div>

			{/* Priority select */}
			<Select
				value={host.priority}
				onValueChange={(val) =>
					onPriorityChange(val as "high" | "medium" | "low")
				}
			>
				<SelectTrigger className="h-7 w-[100px] text-xs border-0 bg-transparent">
					<SelectValue>
						<Badge
							variant="secondary"
							className={cn(
								"text-[10px] font-medium border-0",
								PRIORITY_CONFIG[host.priority].color,
							)}
						>
							{PRIORITY_CONFIG[host.priority].label}
						</Badge>
					</SelectValue>
				</SelectTrigger>
				<SelectContent>
					{(["high", "medium", "low"] as const).map((p) => (
						<SelectItem key={p} value={p} className="text-xs">
							<Badge
								variant="secondary"
								className={cn(
									"text-[10px] font-medium border-0",
									PRIORITY_CONFIG[p].color,
								)}
							>
								{PRIORITY_CONFIG[p].label}
							</Badge>
						</SelectItem>
					))}
				</SelectContent>
			</Select>

			{/* Remove */}
			<Button
				variant="ghost"
				size="icon-xs"
				onClick={onRemove}
				className="text-[var(--ink-ghost)] hover:text-[var(--destructive)] hover:bg-[var(--destructive-soft)]"
				aria-label="Retirer l'hôte"
			>
				<X className="w-3.5 h-3.5" />
			</Button>
		</div>
	);
}
