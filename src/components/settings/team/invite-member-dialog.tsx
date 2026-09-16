"use client";

import { useMutation, useQuery } from "convex/react";
import { Loader2, UserPlus } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import { api } from "@/../convex/_generated/api";
import type { Id } from "@/../convex/_generated/dataModel";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import {
	Dialog,
	DialogContent,
	DialogDescription,
	DialogFooter,
	DialogHeader,
	DialogTitle,
	DialogTrigger,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "@/components/ui/select";
import { INVITABLE_ROLES, type RoleValue } from "@/lib/roles";

// Rôles qui reçoivent des rendez-vous : on leur propose de choisir des
// événements dès l'invitation.
const HOST_ROLES = new Set<RoleValue>([
	"closer",
	"setter",
	"coach",
	"head_of_sales",
]);

interface InviteMemberDialogProps {
	// Depuis la section Hôtes d'un événement : il est présélectionné et imposé.
	eventId?: Id<"events">;
	trigger?: React.ReactNode;
}

export function InviteMemberDialog({
	eventId,
	trigger,
}: InviteMemberDialogProps) {
	const invite = useMutation(api.invitations.create);
	const [open, setOpen] = useState(false);
	const [email, setEmail] = useState("");
	const [role, setRole] = useState<RoleValue>("closer");
	const [eventIds, setEventIds] = useState<Id<"events">[]>([]);
	const [submitting, setSubmitting] = useState(false);

	const offersEvents = !eventId && HOST_ROLES.has(role);
	const events = useQuery(api.events.list, open && offersEvents ? {} : "skip");

	const selected = INVITABLE_ROLES.find((r) => r.value === role);

	function reset() {
		setEmail("");
		setRole("closer");
		setEventIds([]);
	}

	function toggleEvent(id: Id<"events">, checked: boolean) {
		setEventIds((prev) =>
			checked ? [...prev, id] : prev.filter((e) => e !== id),
		);
	}

	async function handleSubmit(e: React.FormEvent) {
		e.preventDefault();
		setSubmitting(true);
		try {
			const res = await invite({
				email,
				role,
				eventIds: eventId ? [eventId] : offersEvents ? eventIds : undefined,
			});
			const who = email.trim().toLowerCase();
			toast.success(
				res.merged
					? `${who} était déjà invité·e : l'événement est ajouté à son invitation`
					: `Invitation envoyée à ${who}`,
			);
			reset();
			setOpen(false);
		} catch (err) {
			toast.error(err instanceof Error ? err.message : "Erreur");
		} finally {
			setSubmitting(false);
		}
	}

	return (
		<Dialog open={open} onOpenChange={setOpen}>
			<DialogTrigger asChild>
				{trigger ?? (
					<Button variant="outline" size="sm" className="gap-1.5">
						<UserPlus className="w-4 h-4" />
						Inviter un membre
					</Button>
				)}
			</DialogTrigger>
			<DialogContent className="sm:max-w-md">
				<form onSubmit={handleSubmit}>
					<DialogHeader>
						<DialogTitle>
							{eventId ? "Inviter un hôte" : "Inviter un membre"}
						</DialogTitle>
						<DialogDescription>
							{eventId
								? "La personne reçoit un email pour créer son compte. Elle devient hôte de cet événement dès son inscription, sans rien à ajouter ensuite."
								: "La personne recevra un email l'invitant à créer son compte. Elle devra utiliser exactement cette adresse."}
						</DialogDescription>
					</DialogHeader>

					<div className="space-y-4 py-5">
						<div className="space-y-1.5">
							<Label htmlFor="invite-email">Adresse email</Label>
							<Input
								id="invite-email"
								type="email"
								required
								autoComplete="off"
								placeholder="prenom@exemple.com"
								value={email}
								onChange={(e) => setEmail(e.target.value)}
							/>
						</div>

						<div className="space-y-1.5">
							<Label htmlFor="invite-role">Rôle</Label>
							<Select
								value={role}
								onValueChange={(v) => setRole(v as RoleValue)}
							>
								<SelectTrigger id="invite-role">
									<SelectValue />
								</SelectTrigger>
								<SelectContent>
									{INVITABLE_ROLES.map((r) => (
										<SelectItem key={r.value} value={r.value}>
											{r.label}
										</SelectItem>
									))}
								</SelectContent>
							</Select>
							{selected && (
								<p className="text-xs text-[var(--ink-muted)] leading-relaxed pt-1">
									{selected.description}
								</p>
							)}
						</div>

						{offersEvents && (
							<div className="space-y-1.5">
								<Label>Événements à lui attribuer</Label>
								<p className="text-xs text-[var(--ink-muted)]">
									Facultatif. Il en devient hôte dès la création de son compte.
								</p>
								<div className="max-h-44 overflow-y-auto rounded-[var(--radius-md)] border border-[var(--border)] divide-y divide-[var(--border)]">
									{events === undefined ? (
										<p className="px-3 py-2.5 text-xs text-[var(--ink-ghost)]">
											Chargement…
										</p>
									) : events.length === 0 ? (
										<p className="px-3 py-2.5 text-xs text-[var(--ink-ghost)]">
											Aucun événement pour l'instant.
										</p>
									) : (
										events.map((ev) => (
											<label
												key={ev._id}
												htmlFor={`invite-ev-${ev._id}`}
												className="flex items-center gap-2.5 px-3 py-2 cursor-pointer hover:bg-[var(--surface-raised)]"
											>
												<Checkbox
													id={`invite-ev-${ev._id}`}
													checked={eventIds.includes(ev._id)}
													onCheckedChange={(c) =>
														toggleEvent(ev._id, c === true)
													}
												/>
												<span className="text-sm text-[var(--ink)] truncate flex-1">
													{ev.name}
												</span>
												{!ev.isActive && (
													<span className="text-[10px] text-[var(--ink-ghost)]">
														Inactif
													</span>
												)}
											</label>
										))
									)}
								</div>
							</div>
						)}
					</div>

					<DialogFooter>
						<Button
							type="button"
							variant="ghost"
							onClick={() => setOpen(false)}
							disabled={submitting}
						>
							Annuler
						</Button>
						<Button type="submit" disabled={submitting || !email.trim()}>
							{submitting && <Loader2 className="w-4 h-4 animate-spin" />}
							Envoyer l'invitation
						</Button>
					</DialogFooter>
				</form>
			</DialogContent>
		</Dialog>
	);
}
