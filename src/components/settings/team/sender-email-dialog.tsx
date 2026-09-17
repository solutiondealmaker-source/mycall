"use client";

import { useMutation } from "convex/react";
import { Loader2, Mail, Pencil } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import { api } from "@/../convex/_generated/api";
import type { Id } from "@/../convex/_generated/dataModel";
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

interface SenderSettings {
	domain: string | null;
	defaultAddress: string;
}

// Adresse d'envoi effective d'un membre — miroir de senderAddressFor() côté
// serveur, pour l'affichage uniquement.
export function effectiveSender(
	user: { email?: string; senderEmail?: string },
	settings: SenderSettings,
): { address: string; source: "custom" | "login" | "default" } {
	const onDomain = (e?: string) =>
		!!e && !!settings.domain && e.toLowerCase().endsWith(`@${settings.domain}`);
	if (onDomain(user.senderEmail)) {
		return { address: user.senderEmail as string, source: "custom" };
	}
	if (onDomain(user.email)) {
		return { address: (user.email as string).toLowerCase(), source: "login" };
	}
	return { address: settings.defaultAddress, source: "default" };
}

export function SenderEmailLine({
	user,
	displayName,
	settings,
}: {
	user: { _id: Id<"users">; email?: string; senderEmail?: string };
	displayName: string;
	settings: SenderSettings;
}) {
	const setSender = useMutation(api.users.setSenderEmail);
	const [open, setOpen] = useState(false);
	const [value, setValue] = useState(user.senderEmail ?? "");
	const [saving, setSaving] = useState(false);

	const current = effectiveSender(user, settings);
	const hint =
		current.source === "default"
			? "adresse par défaut"
			: current.source === "login"
				? "son email de connexion"
				: null;

	async function save(next: string | null) {
		setSaving(true);
		try {
			await setSender({ userId: user._id, senderEmail: next });
			toast.success(
				next
					? `Les emails de ${displayName} partiront de ${next.trim().toLowerCase()}`
					: `Adresse d'envoi de ${displayName} retirée`,
			);
			setOpen(false);
		} catch (err) {
			toast.error(err instanceof Error ? err.message : "Erreur");
		} finally {
			setSaving(false);
		}
	}

	return (
		<Dialog
			open={open}
			onOpenChange={(o) => {
				setOpen(o);
				if (o) setValue(user.senderEmail ?? "");
			}}
		>
			<DialogTrigger asChild>
				<button
					type="button"
					className="group/sender mt-0.5 flex max-w-full items-center gap-1 text-left text-[11px] text-[var(--ink-muted)] hover:text-[var(--brand)]"
					title="Modifier l'adresse d'envoi"
				>
					<Mail className="w-3 h-3 shrink-0" />
					<span className="truncate">
						Envoie depuis {current.address}
						{hint && <span className="text-[var(--ink-ghost)]"> ({hint})</span>}
					</span>
					<Pencil className="w-3 h-3 shrink-0 opacity-0 group-hover/sender:opacity-100" />
				</button>
			</DialogTrigger>
			<DialogContent className="sm:max-w-md">
				<form
					onSubmit={(e) => {
						e.preventDefault();
						save(value.trim() || null);
					}}
				>
					<DialogHeader>
						<DialogTitle>Adresse d'envoi de {displayName}</DialogTitle>
						<DialogDescription>
							Confirmations, rappels, replanifications, annulations et relances
							de ses prospects partiront de cette adresse. Les réponses des
							prospects y arriveront directement.
						</DialogDescription>
					</DialogHeader>

					<div className="space-y-1.5 py-5">
						<Label htmlFor="sender-email">Adresse email</Label>
						<Input
							id="sender-email"
							type="email"
							autoComplete="off"
							placeholder={
								settings.domain
									? `prenom@${settings.domain}`
									: "prenom@exemple.com"
							}
							value={value}
							onChange={(e) => setValue(e.target.value)}
						/>
						<p className="text-xs text-[var(--ink-muted)] leading-relaxed">
							{settings.domain
								? `Doit se terminer par @${settings.domain}. Vérifie que cette boîte existe : c'est là qu'arriveront les réponses.`
								: "Aucun domaine d'envoi n'est configuré sur cette instance."}{" "}
							Laisse vide pour revenir à son email de connexion s'il est sur ce
							domaine, sinon à l'adresse par défaut.
						</p>
					</div>

					<DialogFooter>
						<Button
							type="button"
							variant="ghost"
							onClick={() => setOpen(false)}
							disabled={saving}
						>
							Annuler
						</Button>
						<Button type="submit" disabled={saving}>
							{saving && <Loader2 className="w-4 h-4 animate-spin" />}
							Enregistrer
						</Button>
					</DialogFooter>
				</form>
			</DialogContent>
		</Dialog>
	);
}
