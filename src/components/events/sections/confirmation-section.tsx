"use client";

import { CheckCircle } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { SectionShell } from "@/components/events/section-shell";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import type { EventDoc, EventPatch } from "@/types/events";

// ─── Props ────────────────────────────────────────────────────────────────────

interface ConfirmationSectionProps {
	event: EventDoc;
	onUpdate: (patch: EventPatch) => Promise<void>;
}

// ─── Form state ───────────────────────────────────────────────────────────────

interface ConfirmationForm {
	confirmationTitle: string;
	confirmationMessage: string;
	confirmationRedirectUrl: string;
	autoRedirect: boolean;
}

function formFromEvent(event: EventDoc): ConfirmationForm {
	return {
		confirmationTitle:
			event.confirmationTitle ?? "Votre rendez-vous est confirmé !",
		confirmationMessage: event.confirmationMessage ?? "",
		confirmationRedirectUrl: event.confirmationRedirectUrl ?? "",
		autoRedirect: Boolean(event.confirmationRedirectUrl),
	};
}

// ─── Composant ────────────────────────────────────────────────────────────────

/**
 * ConfirmationSection — titre, message, redirect post-booking.
 */
export function ConfirmationSection({
	event,
	onUpdate,
}: ConfirmationSectionProps) {
	const [form, setForm] = useState<ConfirmationForm>(() =>
		formFromEvent(event),
	);
	const [isDirty, setIsDirty] = useState(false);

	useEffect(() => {
		setForm(formFromEvent(event));
		setIsDirty(false);
	}, [event]);

	const patch = useCallback(
		<K extends keyof ConfirmationForm>(key: K, value: ConfirmationForm[K]) => {
			setForm((prev) => ({ ...prev, [key]: value }));
			setIsDirty(true);
		},
		[],
	);

	const handleSave = useCallback(async () => {
		await onUpdate({
			confirmationTitle: form.confirmationTitle || undefined,
			confirmationMessage: form.confirmationMessage || undefined,
			confirmationRedirectUrl:
				form.autoRedirect && form.confirmationRedirectUrl
					? form.confirmationRedirectUrl
					: undefined,
		});
		setIsDirty(false);
	}, [form, onUpdate]);

	const handleCancel = useCallback(() => {
		setForm(formFromEvent(event));
		setIsDirty(false);
	}, [event]);

	return (
		<SectionShell
			icon={CheckCircle}
			title="Page de confirmation"
			description="Personnalise ce que le prospect voit après avoir réservé son créneau."
			onSave={handleSave}
			isDirty={isDirty}
			onCancel={handleCancel}
		>
			<div className="space-y-6 max-w-[520px]">
				{/* Preview card */}
				<div className="rounded-[var(--radius-lg)] border border-[var(--border)] bg-[var(--surface-raised)] p-6">
					<div className="flex flex-col items-center text-center gap-3">
						<div className="w-12 h-12 rounded-full bg-[var(--success-soft)] flex items-center justify-center">
							<CheckCircle className="w-6 h-6 text-[var(--success)]" />
						</div>
						<div className="space-y-1">
							<p className="text-base font-semibold font-[family-name:var(--font-display)] text-[var(--ink)]">
								{form.confirmationTitle || "Votre rendez-vous est confirmé !"}
							</p>
							{form.confirmationMessage && (
								<p className="text-xs text-[var(--ink-muted)] max-w-xs leading-relaxed">
									{form.confirmationMessage}
								</p>
							)}
						</div>
						<div className="text-xs text-[var(--ink-ghost)] bg-[var(--surface)] rounded-full px-3 py-1 border border-[var(--border)]">
							Aperçu de la confirmation
						</div>
					</div>
				</div>

				{/* Titre */}
				<div className="space-y-1.5">
					<Label
						htmlFor="confirmation-title"
						className="text-xs font-medium uppercase tracking-wider text-[var(--ink-muted)]"
					>
						Titre de confirmation
					</Label>
					<Input
						id="confirmation-title"
						value={form.confirmationTitle}
						onChange={(e) => patch("confirmationTitle", e.target.value)}
						placeholder="Votre rendez-vous est confirmé !"
						className="h-10"
					/>
				</div>

				{/* Message */}
				<div className="space-y-1.5">
					<Label
						htmlFor="confirmation-message"
						className="text-xs font-medium uppercase tracking-wider text-[var(--ink-muted)]"
					>
						Message personnalisé
					</Label>
					<Textarea
						id="confirmation-message"
						value={form.confirmationMessage}
						onChange={(e) => patch("confirmationMessage", e.target.value)}
						placeholder="Merci pour votre réservation. Vous recevrez une confirmation par email..."
						rows={4}
						className="resize-none"
					/>
					<p className="text-[11px] text-[var(--ink-ghost)]">
						Markdown basique supporté (gras, italique, liens).
					</p>
				</div>

				<div className="border-t border-[var(--border)]" />

				{/* Auto-redirect toggle */}
				<div className="space-y-3">
					<div className="flex items-start justify-between rounded-[var(--radius-md)] border border-[var(--border)] bg-[var(--surface-raised)] px-4 py-3 gap-4">
						<div className="space-y-0.5 flex-1">
							<p className="text-sm font-medium text-[var(--ink)]">
								Redirection automatique après 4s
							</p>
							<p className="text-xs text-[var(--ink-muted)]">
								Le prospect sera redirigé vers l'URL ci-dessous après avoir vu
								la confirmation.
							</p>
						</div>
						<Switch
							checked={form.autoRedirect}
							onCheckedChange={(v) => patch("autoRedirect", v)}
							aria-label="Activer la redirection automatique"
						/>
					</div>

					{form.autoRedirect && (
						<div className="space-y-1.5">
							<Label
								htmlFor="confirmation-redirect"
								className="text-xs font-medium uppercase tracking-wider text-[var(--ink-muted)]"
							>
								URL de redirection
							</Label>
							<Input
								id="confirmation-redirect"
								type="url"
								value={form.confirmationRedirectUrl}
								onChange={(e) =>
									patch("confirmationRedirectUrl", e.target.value)
								}
								placeholder="https://ton-site.com/merci"
								className="h-10"
							/>
						</div>
					)}
				</div>
			</div>
		</SectionShell>
	);
}
