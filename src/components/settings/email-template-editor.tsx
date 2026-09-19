"use client";

import { useAction, useMutation, useQuery } from "convex/react";
import { motion } from "framer-motion";
import { Eye, Loader2, Mail, RotateCcw, Send } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";
import { api } from "@/../convex/_generated/api";
import type { Id } from "@/../convex/_generated/dataModel";
import {
	DEFAULT_CONTENT,
	EMAIL_KINDS,
	type EmailKind,
	TEMPLATE_VARIABLES,
} from "@/../convex/lib/emailContent";
import { errorText } from "@/components/settings/email-provider-card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";

const ALL_EVENTS = "__all__";

export function EmailTemplateEditor() {
	const templates = useQuery(api.emailCustomization.listTemplates, {});
	const events = useQuery(api.events.list, {});
	const save = useMutation(api.emailCustomization.saveTemplate);
	const remove = useMutation(api.emailCustomization.deleteTemplate);
	const sendTest = useAction(api.emailCustomization.sendTestTemplate);

	const [kind, setKind] = useState<EmailKind>("confirmation");
	const [scope, setScope] = useState<string>(ALL_EVENTS);
	const [enabled, setEnabled] = useState(false);
	const [subject, setSubject] = useState("");
	const [heading, setHeading] = useState("");
	const [body, setBody] = useState("");
	const [busy, setBusy] = useState<string | null>(null);
	const [showPreview, setShowPreview] = useState(true);
	const bodyRef = useRef<HTMLTextAreaElement>(null);

	const eventId = scope === ALL_EVENTS ? undefined : (scope as Id<"events">);
	const stored = templates?.find(
		(t) => t.kind === kind && (t.eventId ?? ALL_EVENTS) === scope,
	);
	const defaults = DEFAULT_CONTENT[kind];
	const meta = EMAIL_KINDS.find((k) => k.kind === kind);

	// Le formulaire suit l'email et l'événement choisis : texte enregistré s'il
	// existe, texte par défaut sinon — pour partir de l'existant.
	useEffect(() => {
		const row = templates?.find(
			(t) => t.kind === kind && (t.eventId ?? ALL_EVENTS) === scope,
		);
		setEnabled(row?.enabled ?? false);
		setSubject(row?.subject ?? DEFAULT_CONTENT[kind].subject);
		setHeading(row?.heading ?? DEFAULT_CONTENT[kind].heading);
		setBody(row?.body ?? DEFAULT_CONTENT[kind].body);
	}, [kind, scope, templates]);

	const dirty =
		stored === undefined
			? enabled ||
				subject !== defaults.subject ||
				heading !== defaults.heading ||
				body !== defaults.body
			: enabled !== stored.enabled ||
				subject !== stored.subject ||
				heading !== stored.heading ||
				body !== stored.body;

	const preview = useQuery(api.emailCustomization.previewTemplate, {
		kind,
		subject,
		heading,
		body,
		useDefault: !enabled,
	});

	const inheritedFromGlobal = useMemo(() => {
		if (scope === ALL_EVENTS) return null;
		const global = templates?.find(
			(t) => t.kind === kind && t.eventId === null && t.enabled,
		);
		return global ?? null;
	}, [templates, kind, scope]);

	function insertVariable(key: string) {
		const el = bodyRef.current;
		const token = `{{${key}}}`;
		if (!el) {
			setBody((b) => `${b}${token}`);
			return;
		}
		const start = el.selectionStart ?? body.length;
		const end = el.selectionEnd ?? body.length;
		setBody(`${body.slice(0, start)}${token}${body.slice(end)}`);
		requestAnimationFrame(() => {
			el.focus();
			el.setSelectionRange(start + token.length, start + token.length);
		});
	}

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

	return (
		<motion.div
			initial={{ opacity: 0, y: 8 }}
			animate={{ opacity: 1, y: 0 }}
			transition={{ duration: 0.15 }}
			className="card-premium space-y-5"
		>
			<div className="flex items-start gap-3">
				<div className="w-10 h-10 rounded-[var(--radius-sm)] bg-[var(--brand-soft)] ring-1 ring-[var(--brand-glow)] flex items-center justify-center shrink-0">
					<Mail className="w-5 h-5 text-[var(--brand)]" strokeWidth={1.75} />
				</div>
				<div className="flex-1 min-w-0">
					<h2 className="text-base font-semibold font-[family-name:var(--font-display)] text-[var(--ink)]">
						Textes des emails
					</h2>
					<p className="text-sm text-[var(--ink-muted)] mt-0.5">
						Écris tes propres mots. Les informations du rendez-vous restent
						ajoutées automatiquement.
					</p>
				</div>
			</div>

			{/* Choix de l'email */}
			<div className="flex flex-wrap gap-2">
				{EMAIL_KINDS.map((k) => {
					const customized = templates?.some(
						(t) => t.kind === k.kind && t.enabled,
					);
					return (
						<button
							key={k.kind}
							type="button"
							onClick={() => setKind(k.kind)}
							className={cn(
								"px-3 py-2 rounded-[var(--radius-md)] border text-sm font-medium transition-colors",
								kind === k.kind
									? "border-[var(--brand)] bg-[var(--brand-soft)] text-[var(--brand)]"
									: "border-[var(--border)] text-[var(--ink)] hover:bg-[var(--surface-raised)]",
							)}
						>
							{k.label}
							{customized && (
								<span className="ml-1.5 text-[11px] text-[var(--success)]">
									personnalisé
								</span>
							)}
						</button>
					);
				})}
			</div>

			<div className="grid lg:grid-cols-2 gap-5">
				{/* Édition */}
				<div className="space-y-4">
					<div className="space-y-1.5">
						<Label htmlFor="tpl-scope">S'applique à</Label>
						<Select value={scope} onValueChange={setScope}>
							<SelectTrigger id="tpl-scope">
								<SelectValue />
							</SelectTrigger>
							<SelectContent>
								<SelectItem value={ALL_EVENTS}>Tous les événements</SelectItem>
								{(events ?? []).map((e) => (
									<SelectItem key={e._id} value={e._id}>
										{e.name}
									</SelectItem>
								))}
							</SelectContent>
						</Select>
						{scope !== ALL_EVENTS && (
							<p className="text-xs text-[var(--ink-ghost)]">
								Ce texte ne vaut que pour cet événement. Sans texte ici, c'est
								{inheritedFromGlobal
									? " le texte de tous les événements qui s'applique."
									: " le texte par défaut qui s'applique."}
							</p>
						)}
					</div>

					<label
						htmlFor="tpl-enabled"
						className="flex items-start gap-3 cursor-pointer"
					>
						<Switch
							id="tpl-enabled"
							checked={enabled}
							onCheckedChange={setEnabled}
						/>
						<span className="text-sm text-[var(--ink)]">
							Utiliser mon texte
							<span className="block text-xs text-[var(--ink-muted)]">
								Désactivé, l'email part avec le texte par défaut.
							</span>
						</span>
					</label>

					<div className="space-y-1.5">
						<Label htmlFor="tpl-subject">Objet de l'email</Label>
						<Input
							id="tpl-subject"
							value={subject}
							onChange={(e) => setSubject(e.target.value)}
							className="h-10 text-sm"
						/>
					</div>

					<div className="space-y-1.5">
						<Label htmlFor="tpl-heading">Titre affiché dans l'email</Label>
						<Input
							id="tpl-heading"
							value={heading}
							onChange={(e) => setHeading(e.target.value)}
							placeholder="Laisse vide pour n'afficher aucun titre"
							className="h-10 text-sm"
						/>
					</div>

					<div className="space-y-1.5">
						<Label htmlFor="tpl-body">Message</Label>
						<Textarea
							id="tpl-body"
							ref={bodyRef}
							value={body}
							onChange={(e) => setBody(e.target.value)}
							rows={7}
							className="text-sm leading-relaxed"
						/>
						<div className="flex flex-wrap gap-1.5 pt-1">
							{TEMPLATE_VARIABLES.map((v) => (
								<button
									key={v.key}
									type="button"
									title={v.label}
									onClick={() => insertVariable(v.key)}
									className="px-2 py-0.5 rounded-full bg-[var(--surface-muted)] text-[11px] font-mono text-[var(--ink)] hover:bg-[var(--brand-soft)] hover:text-[var(--brand)]"
								>
									{`{{${v.key}}}`}
								</button>
							))}
						</div>
						<p className="text-xs text-[var(--ink-ghost)]">
							Clique une variable pour l'insérer. Une variable sans valeur
							disparaît du message.
						</p>
					</div>

					{meta && (
						<div className="rounded-[var(--radius-md)] bg-[var(--surface-raised)] border border-[var(--border)] p-3">
							<p className="text-xs font-medium text-[var(--ink)]">
								Toujours ajouté automatiquement
							</p>
							<ul className="mt-1 space-y-0.5">
								{meta.automatic.map((a) => (
									<li key={a} className="text-xs text-[var(--ink-muted)]">
										• {a}
									</li>
								))}
							</ul>
						</div>
					)}

					<div className="flex flex-wrap gap-2">
						<Button
							disabled={busy !== null || !dirty}
							onClick={() =>
								run("save", async () => {
									await save({
										kind,
										eventId,
										subject,
										heading,
										body,
										enabled,
									});
									toast.success(
										enabled
											? "Texte enregistré — les prochains emails l'utilisent"
											: "Texte enregistré, mais désactivé",
									);
								})
							}
							style={{ background: "var(--grad-brand)" }}
						>
							{busy === "save" && <Loader2 className="w-4 h-4 animate-spin" />}
							Enregistrer
						</Button>
						<Button
							variant="outline"
							disabled={busy !== null}
							onClick={() =>
								run("test", async () => {
									const res = await sendTest({
										kind,
										subject,
										heading,
										body,
										useDefault: !enabled,
									});
									if (res.ok) toast.success(`Email de test envoyé à ${res.to}`);
									else
										toast.error("Envoi impossible", { description: res.error });
								})
							}
							className="gap-1.5"
						>
							{busy === "test" ? (
								<Loader2 className="w-4 h-4 animate-spin" />
							) : (
								<Send className="w-4 h-4" />
							)}
							M'envoyer un test
						</Button>
						{stored && (
							<Button
								variant="ghost"
								disabled={busy !== null}
								onClick={() =>
									run("reset", async () => {
										if (
											!window.confirm(
												"Revenir au texte par défaut ? Ton texte sera supprimé.",
											)
										)
											return;
										await remove({ kind, eventId });
										toast.success("Texte par défaut rétabli");
									})
								}
								className="gap-1.5 text-[var(--destructive)] hover:text-[var(--destructive)] hover:bg-[var(--destructive-soft)]"
							>
								<RotateCcw className="w-4 h-4" />
								Texte par défaut
							</Button>
						)}
					</div>
				</div>

				{/* Aperçu */}
				<div className="space-y-2">
					<div className="flex items-center justify-between">
						<Label>Aperçu</Label>
						<Button
							variant="ghost"
							size="sm"
							onClick={() => setShowPreview((s) => !s)}
							className="gap-1.5"
						>
							<Eye className="w-3.5 h-3.5" />
							{showPreview ? "Masquer" : "Afficher"}
						</Button>
					</div>
					{showPreview &&
						(preview === undefined ? (
							<p className="text-sm text-[var(--ink-ghost)]">Chargement…</p>
						) : (
							<div className="rounded-[var(--radius-md)] border border-[var(--border)] overflow-hidden">
								<p className="px-3 py-2 text-xs border-b border-[var(--border)] bg-[var(--surface-raised)]">
									<span className="text-[var(--ink-muted)]">Objet : </span>
									<span className="text-[var(--ink)]">{preview.subject}</span>
								</p>
								<iframe
									title="Aperçu de l'email"
									srcDoc={preview.html}
									sandbox=""
									className="w-full h-[620px] bg-white"
								/>
							</div>
						))}
					<p className="text-xs text-[var(--ink-ghost)]">
						Aperçu avec un rendez-vous fictif : Camille Martin, « Appel
						découverte », dans deux jours.
					</p>
				</div>
			</div>
		</motion.div>
	);
}
