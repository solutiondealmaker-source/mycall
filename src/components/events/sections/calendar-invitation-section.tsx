"use client";

import { Mail } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";
import { SectionShell } from "@/components/events/section-shell";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";
import type { EventDoc, EventPatch } from "@/types/events";

const DEFAULT_GREETING = "Bonjour {firstName},";
const DEFAULT_BODY =
	"Merci d'avoir réservé un créneau pour {eventName}.\n\nNous avons rendez-vous le {date} à {time}.\n\nÀ très vite !";
const DEFAULT_SIGNATURE = "L'équipe";

const VARIABLES = [
	{ key: "{firstName}", desc: "Prénom du prospect" },
	{ key: "{lastName}", desc: "Nom du prospect" },
	{ key: "{fullName}", desc: "Nom complet" },
	{ key: "{email}", desc: "Email" },
	{ key: "{phone}", desc: "Téléphone" },
	{ key: "{eventName}", desc: "Nom de l'événement" },
	{ key: "{date}", desc: "Date du RDV" },
	{ key: "{time}", desc: "Heure du RDV" },
	{ key: "{cancelUrl}", desc: "Lien d'annulation" },
	{ key: "{rescheduleUrl}", desc: "Lien de reprogrammation" },
] as const;

interface CalendarInvitationSectionProps {
	event: EventDoc;
	onUpdate: (patch: EventPatch) => Promise<void>;
}

interface InvitationForm {
	calendarGreeting: string;
	calendarBody: string;
	calendarSignature: string;
}

function formFromEvent(event: EventDoc): InvitationForm {
	return {
		calendarGreeting: event.calendarGreeting ?? DEFAULT_GREETING,
		calendarBody: event.calendarBody ?? DEFAULT_BODY,
		calendarSignature: event.calendarSignature ?? DEFAULT_SIGNATURE,
	};
}

function renderPreview(form: InvitationForm): string {
	const sample = {
		firstName: "Léa",
		lastName: "Martin",
		fullName: "Léa Martin",
		email: "lea@example.com",
		phone: "+33 6 12 34 56 78",
		eventName: "Appel découverte 30 min",
		date: "lundi 26 mai 2026",
		time: "14:30",
		cancelUrl: "https://app.example.com/book/manage/abc123",
		rescheduleUrl: "https://app.example.com/book/reschedule/abc123",
	};

	const apply = (tpl: string) =>
		Object.entries(sample).reduce(
			(acc, [k, v]) => acc.replaceAll(`{${k}}`, v),
			tpl,
		);

	return [
		apply(form.calendarGreeting),
		"",
		apply(form.calendarBody),
		"",
		apply(form.calendarSignature),
		"",
		"—",
		`Annuler le rendez-vous : ${sample.cancelUrl}`,
		`Reprogrammer : ${sample.rescheduleUrl}`,
	].join("\n");
}

export function CalendarInvitationSection({
	event,
	onUpdate,
}: CalendarInvitationSectionProps) {
	const [form, setForm] = useState<InvitationForm>(() => formFromEvent(event));
	const [isDirty, setIsDirty] = useState(false);

	useEffect(() => {
		setForm(formFromEvent(event));
		setIsDirty(false);
	}, [event]);

	const patch = useCallback(
		<K extends keyof InvitationForm>(key: K, value: InvitationForm[K]) => {
			setForm((prev) => ({ ...prev, [key]: value }));
			setIsDirty(true);
		},
		[],
	);

	const handleSave = useCallback(async () => {
		await onUpdate({
			calendarGreeting: form.calendarGreeting || undefined,
			calendarBody: form.calendarBody || undefined,
			calendarSignature: form.calendarSignature || undefined,
		});
		setIsDirty(false);
	}, [form, onUpdate]);

	const handleCancel = useCallback(() => {
		setForm(formFromEvent(event));
		setIsDirty(false);
	}, [event]);

	const copyVar = (key: string) => {
		navigator.clipboard.writeText(key);
		toast.success(`${key} copié`);
	};

	return (
		<SectionShell
			icon={Mail}
			title="Invitation Google Calendar"
			description="Personnalise le contenu de l'invitation envoyée au prospect quand son créneau est confirmé."
			onSave={handleSave}
			isDirty={isDirty}
			onCancel={handleCancel}
		>
			<div className="grid grid-cols-1 lg:grid-cols-[1fr_280px] gap-6 max-w-[860px]">
				<div className="space-y-5">
					<div className="space-y-1.5">
						<Label
							htmlFor="cal-greeting"
							className="text-xs font-medium uppercase tracking-wider text-[var(--ink-muted)]"
						>
							Salutation
						</Label>
						<Textarea
							id="cal-greeting"
							value={form.calendarGreeting}
							onChange={(e) => patch("calendarGreeting", e.target.value)}
							placeholder={DEFAULT_GREETING}
							rows={1}
							className="resize-none"
						/>
					</div>

					<div className="space-y-1.5">
						<Label
							htmlFor="cal-body"
							className="text-xs font-medium uppercase tracking-wider text-[var(--ink-muted)]"
						>
							Corps de l'invitation
						</Label>
						<Textarea
							id="cal-body"
							value={form.calendarBody}
							onChange={(e) => patch("calendarBody", e.target.value)}
							placeholder={DEFAULT_BODY}
							rows={8}
							className="resize-y"
						/>
						<p className="text-[11px] text-[var(--ink-ghost)]">
							Utilise les variables ci-contre pour personnaliser le message. Les
							liens d'annulation et de reprogrammation sont ajoutés
							automatiquement.
						</p>
					</div>

					<div className="space-y-1.5">
						<Label
							htmlFor="cal-signature"
							className="text-xs font-medium uppercase tracking-wider text-[var(--ink-muted)]"
						>
							Signature
						</Label>
						<Textarea
							id="cal-signature"
							value={form.calendarSignature}
							onChange={(e) => patch("calendarSignature", e.target.value)}
							placeholder={DEFAULT_SIGNATURE}
							rows={2}
							className="resize-none"
						/>
					</div>

					<div className="border-t border-[var(--border)] pt-4 space-y-2">
						<Label className="text-xs font-medium uppercase tracking-wider text-[var(--ink-muted)]">
							Aperçu (données fictives)
						</Label>
						<pre
							className={cn(
								"text-xs text-[var(--ink-muted)] leading-relaxed",
								"font-[family-name:var(--font-body)]",
								"rounded-[var(--radius-md)] border border-[var(--border)]",
								"bg-[var(--surface-raised)] p-4",
								"whitespace-pre-wrap break-words",
							)}
						>
							{renderPreview(form)}
						</pre>
					</div>
				</div>

				<aside className="space-y-3">
					<Label className="text-xs font-medium uppercase tracking-wider text-[var(--ink-muted)]">
						Variables disponibles
					</Label>
					<div className="rounded-[var(--radius-md)] border border-[var(--border)] bg-[var(--surface-raised)] p-2 space-y-1">
						{VARIABLES.map((v) => (
							<button
								key={v.key}
								type="button"
								onClick={() => copyVar(v.key)}
								className={cn(
									"w-full text-left flex flex-col px-2.5 py-1.5",
									"rounded-[var(--radius-sm)]",
									"hover:bg-[var(--surface)] transition-colors duration-100",
									"focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--brand)]",
								)}
								title="Cliquer pour copier"
							>
								<code className="text-[11px] font-[family-name:var(--font-mono)] text-[var(--brand)] font-semibold">
									{v.key}
								</code>
								<span className="text-[10px] text-[var(--ink-ghost)] leading-tight">
									{v.desc}
								</span>
							</button>
						))}
					</div>
					<p className="text-[11px] text-[var(--ink-ghost)] leading-relaxed px-1">
						Clique sur une variable pour la copier. Colle-la dans le corps de
						l'invitation à l'endroit voulu.
					</p>
				</aside>
			</div>
		</SectionShell>
	);
}
