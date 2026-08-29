"use client";

import { useMutation, useQuery } from "convex/react";
import { CalendarClock, Loader2 } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import { api } from "@/../convex/_generated/api";
import type { Doc, Id } from "@/../convex/_generated/dataModel";
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

// Prochaine heure ronde : un rendez-vous convenu au téléphone se pose presque
// toujours sur une heure pleine.
function defaultStart(): string {
	const d = new Date();
	d.setHours(d.getHours() + 1, 0, 0, 0);
	const pad = (n: number) => String(n).padStart(2, "0");
	return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

export function BookForLeadDialog({ lead }: { lead: Doc<"leads"> }) {
	const events = useQuery(api.events.listForBooking, {});
	const book = useMutation(api.bookings.adminBookByCloser);

	const [open, setOpen] = useState(false);
	const [eventId, setEventId] = useState<string>("");
	const [startAt, setStartAt] = useState(defaultStart);
	const [submitting, setSubmitting] = useState(false);

	const selected = events?.find((e) => e._id === eventId);

	async function handleSubmit(e: React.FormEvent) {
		e.preventDefault();
		if (!selected) {
			toast.error("Choisis un type de rendez-vous");
			return;
		}
		const ts = new Date(startAt).getTime();
		if (Number.isNaN(ts)) {
			toast.error("Date invalide");
			return;
		}
		if (!lead.phone) {
			toast.error("Ce lead n'a pas de téléphone — ajoute-le d'abord.");
			return;
		}

		setSubmitting(true);
		try {
			await book({
				slug: selected.slug,
				startTime: ts,
				firstName: lead.firstName ?? "",
				lastName: lead.lastName ?? "",
				phone: lead.phone,
				email: lead.email ?? undefined,
				timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
				existingLeadId: lead._id as Id<"leads">,
			});
			toast.success("Rendez-vous créé");
			setOpen(false);
		} catch (err) {
			toast.error(err instanceof Error ? err.message : "Création impossible");
		} finally {
			setSubmitting(false);
		}
	}

	return (
		<Dialog open={open} onOpenChange={setOpen}>
			<DialogTrigger asChild>
				<Button variant="outline" size="sm" className="gap-1.5">
					<CalendarClock className="w-4 h-4" />
					Créer un rendez-vous
				</Button>
			</DialogTrigger>
			<DialogContent className="sm:max-w-md">
				<form onSubmit={handleSubmit}>
					<DialogHeader>
						<DialogTitle>Créer un rendez-vous</DialogTitle>
						<DialogDescription>
							Pour un créneau convenu de vive voix. Le rendez-vous est
							enregistré au nom de ce lead, avec son agenda Google et son email
							de confirmation, comme une réservation en ligne.
						</DialogDescription>
					</DialogHeader>

					<div className="space-y-4 py-5">
						<div className="space-y-1.5">
							<Label htmlFor="bk-event">Type de rendez-vous</Label>
							<Select value={eventId} onValueChange={setEventId}>
								<SelectTrigger id="bk-event" className="w-full">
									<SelectValue
										placeholder={
											events === undefined
												? "Chargement…"
												: events.length === 0
													? "Aucun événement actif"
													: "Choisir…"
										}
									/>
								</SelectTrigger>
								<SelectContent>
									{events?.map((ev) => (
										<SelectItem key={ev._id} value={ev._id}>
											{ev.name} · {ev.durationMinutes} min
										</SelectItem>
									))}
								</SelectContent>
							</Select>
						</div>

						<div className="space-y-1.5">
							<Label htmlFor="bk-start">Date et heure</Label>
							<Input
								id="bk-start"
								type="datetime-local"
								required
								value={startAt}
								onChange={(e) => setStartAt(e.target.value)}
							/>
							<p className="text-xs text-[var(--ink-muted)]">
								Les créneaux déjà occupés restent bloqués : si l'horaire n'est
								pas libre, la création sera refusée.
							</p>
						</div>

						<div className="rounded-[var(--radius-sm)] bg-[var(--surface-raised)] px-3 py-2.5 text-xs text-[var(--ink-muted)] leading-relaxed">
							Prospect :{" "}
							<span className="text-[var(--ink)] font-medium">
								{`${lead.firstName ?? ""} ${lead.lastName ?? ""}`.trim() ||
									"Sans nom"}
							</span>
							{lead.phone ? ` · ${lead.phone}` : " · téléphone manquant"}
							{lead.email ? ` · ${lead.email}` : ""}
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
						<Button type="submit" disabled={submitting || !eventId}>
							{submitting && <Loader2 className="w-4 h-4 animate-spin" />}
							Créer le rendez-vous
						</Button>
					</DialogFooter>
				</form>
			</DialogContent>
		</Dialog>
	);
}
