"use client";

import { useMutation } from "convex/react";
import { Loader2, UserPlus } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import { api } from "@/../convex/_generated/api";
import { Button } from "@/components/ui/button";
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

export function InviteMemberDialog() {
	const invite = useMutation(api.invitations.create);
	const [open, setOpen] = useState(false);
	const [email, setEmail] = useState("");
	const [role, setRole] = useState<RoleValue>("closer");
	const [submitting, setSubmitting] = useState(false);

	const selected = INVITABLE_ROLES.find((r) => r.value === role);

	async function handleSubmit(e: React.FormEvent) {
		e.preventDefault();
		setSubmitting(true);
		try {
			await invite({ email, role });
			toast.success(`Invitation envoyée à ${email.trim().toLowerCase()}`);
			setEmail("");
			setRole("closer");
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
				<Button variant="outline" size="sm" className="gap-1.5">
					<UserPlus className="w-4 h-4" />
					Inviter un membre
				</Button>
			</DialogTrigger>
			<DialogContent className="sm:max-w-md">
				<form onSubmit={handleSubmit}>
					<DialogHeader>
						<DialogTitle>Inviter un membre</DialogTitle>
						<DialogDescription>
							La personne recevra un email l'invitant à créer son compte. Elle
							devra utiliser exactement cette adresse.
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
