"use client";

import { useAction, useMutation, useQuery } from "convex/react";
import { motion } from "framer-motion";
import { CheckCircle2, Loader2, Mail, Send, Undo2 } from "lucide-react";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { api } from "@/../convex/_generated/api";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";

type Provider = "resend" | "brevo";

const PROVIDERS: Record<
	Provider,
	{ label: string; keyHelp: string; placeholder: string; senderHelp: string }
> = {
	resend: {
		label: "Resend",
		keyHelp: "Resend → API Keys → Create API Key (accès « Sending » suffit).",
		placeholder: "re_…",
		senderHelp: "Adresse d'un domaine vérifié dans Resend → Domains.",
	},
	brevo: {
		label: "Brevo",
		keyHelp: "Brevo → Paramètres → SMTP & API → Clés API → Générer (clé v3).",
		placeholder: "xkeysib-…",
		senderHelp:
			"Adresse d'un expéditeur ou d'un domaine vérifié dans Brevo → Expéditeurs, domaines.",
	},
};

export function errorText(err: unknown): string {
	const msg = err instanceof Error ? err.message : "Erreur";
	return /Uncaught Error: ([^\n]+)/.exec(msg)?.[1] ?? msg;
}

export function EmailProviderCard() {
	const settings = useQuery(api.emailSettings.getEmailSettings, {});
	const save = useAction(api.emailSettings.saveEmailProvider);
	const reset = useMutation(api.emailSettings.resetEmailProvider);
	const sendTest = useAction(api.emailSettings.sendTest);

	const [provider, setProvider] = useState<Provider>("resend");
	const [apiKey, setApiKey] = useState("");
	const [fromAddress, setFromAddress] = useState("");
	const [fromName, setFromName] = useState("");
	const [busy, setBusy] = useState<string | null>(null);

	useEffect(() => {
		if (!settings) return;
		if (settings.provider) setProvider(settings.provider);
		setFromAddress(settings.fromAddress ?? "");
		setFromName(settings.fromName ?? "");
	}, [settings]);

	const current = settings?.provider ?? null;
	const sameProvider = current === provider;

	async function run(label: string, fn: () => Promise<void>) {
		setBusy(label);
		try {
			await fn();
		} catch (err) {
			toast.error(errorText(err));
		} finally {
			setBusy(null);
		}
	}

	const handleSave = () =>
		run("save", async () => {
			await save({
				provider,
				apiKey: apiKey.trim() || undefined,
				fromAddress,
				fromName: fromName.trim() || undefined,
			});
			setApiKey("");
			toast.success(`Emails raccordés à ${PROVIDERS[provider].label}`, {
				description: "Envoie-toi un email de test pour vérifier l'expéditeur.",
			});
		});

	const handleTest = () =>
		run("test", async () => {
			const res = await sendTest({});
			if (res.ok) toast.success(`Email de test envoyé à ${res.to}`);
			else toast.error("L'envoi a échoué", { description: res.error });
		});

	const handleReset = () =>
		run("reset", async () => {
			if (
				!window.confirm(
					"Revenir à l'envoi par défaut ? La clé enregistrée sera supprimée.",
				)
			)
				return;
			await reset({});
			setApiKey("");
			toast.success("Envoi par défaut rétabli");
		});

	return (
		<motion.div
			initial={{ opacity: 0, y: 8 }}
			animate={{ opacity: 1, y: 0 }}
			transition={{ duration: 0.15 }}
			className="card-premium max-w-2xl space-y-5 mt-6"
		>
			<div className="flex items-start gap-3">
				<div className="w-10 h-10 rounded-[var(--radius-sm)] bg-[var(--brand-soft)] ring-1 ring-[var(--brand-glow)] flex items-center justify-center shrink-0">
					<Mail className="w-5 h-5 text-[var(--brand)]" strokeWidth={1.75} />
				</div>
				<div className="flex-1 min-w-0">
					<h2 className="text-base font-semibold font-[family-name:var(--font-display)] text-[var(--ink)]">
						Envoi des emails
					</h2>
					<p className="text-sm text-[var(--ink-muted)] mt-0.5">
						Confirmations, rappels et relances partent de ton propre compte
						Resend ou Brevo, avec tes statistiques d'envoi.
					</p>
				</div>
			</div>

			{settings === undefined ? (
				<p className="text-sm text-[var(--ink-ghost)]">Chargement…</p>
			) : (
				<>
					<div className="rounded-[var(--radius-md)] border border-[var(--border)] bg-[var(--surface-raised)] p-4 flex flex-wrap items-center justify-between gap-3">
						<div className="flex items-center gap-2 text-sm text-[var(--ink)] min-w-0">
							<CheckCircle2 className="w-4 h-4 text-[var(--success)] shrink-0" />
							<span className="truncate">
								{current
									? `${PROVIDERS[current].label} · ${settings.fromAddress} (${settings.keyPreview})`
									: settings.defaultAvailable
										? `Envoi par défaut · ${settings.defaultFrom}`
										: "Aucun envoi configuré"}
							</span>
						</div>
						<div className="flex gap-2">
							<Button
								variant="outline"
								size="sm"
								onClick={handleTest}
								disabled={busy !== null}
								className="gap-1.5"
							>
								{busy === "test" ? (
									<Loader2 className="w-3.5 h-3.5 animate-spin" />
								) : (
									<Send className="w-3.5 h-3.5" />
								)}
								M'envoyer un test
							</Button>
							{current && (
								<Button
									variant="ghost"
									size="sm"
									onClick={handleReset}
									disabled={busy !== null}
									className="gap-1.5"
								>
									<Undo2 className="w-3.5 h-3.5" />
									Envoi par défaut
								</Button>
							)}
						</div>
					</div>

					<div className="space-y-3">
						<div className="grid grid-cols-2 gap-2">
							{(Object.keys(PROVIDERS) as Provider[]).map((p) => (
								<button
									key={p}
									type="button"
									onClick={() => setProvider(p)}
									className={cn(
										"px-4 py-2.5 rounded-[var(--radius-md)] border text-sm font-medium text-left transition-colors",
										provider === p
											? "border-[var(--brand)] bg-[var(--brand-soft)] text-[var(--brand)]"
											: "border-[var(--border)] text-[var(--ink)] hover:bg-[var(--surface-raised)]",
									)}
								>
									{PROVIDERS[p].label}
									{current === p && (
										<span className="ml-2 text-[11px] text-[var(--success)]">
											actif
										</span>
									)}
								</button>
							))}
						</div>

						<div className="space-y-1.5">
							<Label
								htmlFor="email-key"
								className="text-xs font-medium uppercase tracking-wider text-[var(--ink-muted)]"
							>
								Clé API {PROVIDERS[provider].label}
							</Label>
							<Input
								id="email-key"
								type="password"
								value={apiKey}
								onChange={(e) => setApiKey(e.target.value)}
								placeholder={
									sameProvider
										? "Laisser vide pour garder la clé enregistrée"
										: PROVIDERS[provider].placeholder
								}
								className="h-10 font-mono text-sm"
								autoComplete="off"
							/>
							<p className="text-xs text-[var(--ink-ghost)]">
								{PROVIDERS[provider].keyHelp} Elle est vérifiée puis stockée
								sans jamais être réaffichée.
							</p>
						</div>

						<div className="grid sm:grid-cols-2 gap-3">
							<div className="space-y-1.5">
								<Label
									htmlFor="email-from"
									className="text-xs font-medium uppercase tracking-wider text-[var(--ink-muted)]"
								>
									Adresse d'expédition
								</Label>
								<Input
									id="email-from"
									type="email"
									value={fromAddress}
									onChange={(e) => setFromAddress(e.target.value)}
									placeholder="rdv@ton-domaine.fr"
									className="h-10 text-sm"
								/>
							</div>
							<div className="space-y-1.5">
								<Label
									htmlFor="email-name"
									className="text-xs font-medium uppercase tracking-wider text-[var(--ink-muted)]"
								>
									Nom affiché
								</Label>
								<Input
									id="email-name"
									value={fromName}
									onChange={(e) => setFromName(e.target.value)}
									placeholder="Nom de ton activité"
									className="h-10 text-sm"
								/>
							</div>
						</div>
						<p className="text-xs text-[var(--ink-ghost)]">
							{PROVIDERS[provider].senderHelp} Les adresses d'envoi des closers
							(Paramètres → Équipe) doivent être sur le même domaine.
						</p>

						<Button
							onClick={handleSave}
							disabled={
								busy !== null ||
								!fromAddress.trim() ||
								(!apiKey.trim() && !sameProvider)
							}
							className="h-10"
							style={{ background: "var(--grad-brand)" }}
						>
							{busy === "save" ? (
								<Loader2 className="w-4 h-4 animate-spin" />
							) : current ? (
								"Enregistrer"
							) : (
								`Raccorder ${PROVIDERS[provider].label}`
							)}
						</Button>
					</div>
				</>
			)}
		</motion.div>
	);
}
