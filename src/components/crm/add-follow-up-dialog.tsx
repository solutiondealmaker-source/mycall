"use client";

import { useMutation } from "convex/react";
import { CalendarPlus, Loader2 } from "lucide-react";
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
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";

type Channel = "call" | "sms" | "email" | "other";

const CHANNELS: { value: Channel; label: string }[] = [
	{ value: "call", label: "Appel" },
	{ value: "sms", label: "SMS" },
	{ value: "email", label: "Email" },
	{ value: "other", label: "Autre" },
];

// Valeur par défaut : demain à 10h. Une relance sans date proposée finit
// toujours par être saisie à la va-vite, ou pas du tout.
function defaultDueAt(): string {
	const d = new Date();
	d.setDate(d.getDate() + 1);
	d.setHours(10, 0, 0, 0);
	const pad = (n: number) => String(n).padStart(2, "0");
	return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

export function AddFollowUpDialog({ leadId }: { leadId: Id<"leads"> }) {
	const addFollowUp = useMutation(api.leads.addFollowUp);
	const [open, setOpen] = useState(false);
	const [dueAt, setDueAt] = useState(defaultDueAt);
	const [reason, setReason] = useState("");
	const [channel, setChannel] = useState<Channel>("call");
	const [note, setNote] = useState("");
	const [submitting, setSubmitting] = useState(false);

	async function handleSubmit(e: React.FormEvent) {
		e.preventDefault();
		const ts = new Date(dueAt).getTime();
		if (Number.isNaN(ts)) {
			toast.error("Date invalide");
			return;
		}
		setSubmitting(true);
		try {
			await addFollowUp({
				leadId,
				dueAt: ts,
				reason: reason.trim(),
				channel,
				note: note.trim() || undefined,
			});
			toast.success("Relance planifiée");
			setDueAt(defaultDueAt());
			setReason("");
			setChannel("call");
			setNote("");
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
					<CalendarPlus className="w-4 h-4" />
					Planifier une relance
				</Button>
			</DialogTrigger>
			<DialogContent className="sm:max-w-md">
				<form onSubmit={handleSubmit}>
					<DialogHeader>
						<DialogTitle>Planifier une relance</DialogTitle>
						<DialogDescription>
							Elle apparaîtra dans l'onglet Relances de ce lead, et passera en
							retard si la date est dépassée.
						</DialogDescription>
					</DialogHeader>

					<div className="space-y-4 py-5">
						<div className="grid grid-cols-2 gap-3">
							<div className="space-y-1.5">
								<Label htmlFor="fu-date">Quand</Label>
								<Input
									id="fu-date"
									type="datetime-local"
									required
									value={dueAt}
									onChange={(e) => setDueAt(e.target.value)}
								/>
							</div>
							<div className="space-y-1.5">
								<Label htmlFor="fu-channel">Canal</Label>
								<Select
									value={channel}
									onValueChange={(v) => setChannel(v as Channel)}
								>
									<SelectTrigger id="fu-channel" className="w-full">
										<SelectValue />
									</SelectTrigger>
									<SelectContent>
										{CHANNELS.map((c) => (
											<SelectItem key={c.value} value={c.value}>
												{c.label}
											</SelectItem>
										))}
									</SelectContent>
								</Select>
							</div>
						</div>

						<div className="space-y-1.5">
							<Label htmlFor="fu-reason">Motif</Label>
							<Input
								id="fu-reason"
								required
								placeholder="Rappeler après réception du devis"
								value={reason}
								onChange={(e) => setReason(e.target.value)}
							/>
						</div>

						<div className="space-y-1.5">
							<Label htmlFor="fu-note">Note (optionnel)</Label>
							<Textarea
								id="fu-note"
								rows={3}
								placeholder="Contexte utile pour la personne qui rappellera."
								value={note}
								onChange={(e) => setNote(e.target.value)}
							/>
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
						<Button type="submit" disabled={submitting || !reason.trim()}>
							{submitting && <Loader2 className="w-4 h-4 animate-spin" />}
							Planifier
						</Button>
					</DialogFooter>
				</form>
			</DialogContent>
		</Dialog>
	);
}
