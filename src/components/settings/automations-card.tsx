"use client";

import { useAction, useMutation, useQuery } from "convex/react";
import { motion } from "framer-motion";
import {
	ChevronDown,
	Copy,
	KeyRound,
	Loader2,
	Plus,
	Send,
	Trash2,
	Workflow,
} from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import { api } from "@/../convex/_generated/api";
import type { Doc, Id } from "@/../convex/_generated/dataModel";
import { OUTBOUND_EVENTS } from "@/../convex/lib/outboundEvents";
import { errorText } from "@/components/settings/email-provider-card";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { cn } from "@/lib/utils";

const API_BASE = `${(process.env.NEXT_PUBLIC_CONVEX_SITE_URL ?? "").replace(/\/$/, "")}/api/v1`;

function copy(text: string, label: string) {
	navigator.clipboard
		.writeText(text)
		.then(() => toast.success(`${label} copié`));
}

function fmt(ms: number): string {
	return new Intl.DateTimeFormat("fr-FR", {
		day: "numeric",
		month: "short",
		hour: "2-digit",
		minute: "2-digit",
	}).format(new Date(ms));
}

const eventLabel = (type: string) =>
	type === "*"
		? "Tous les événements"
		: (OUTBOUND_EVENTS.find((e) => e.type === type)?.label ?? type);

export function AutomationsCard() {
	return (
		<motion.div
			initial={{ opacity: 0, y: 8 }}
			animate={{ opacity: 1, y: 0 }}
			transition={{ duration: 0.15 }}
			className="card-premium max-w-2xl space-y-6 mt-6"
		>
			<div className="flex items-start gap-3">
				<div className="w-10 h-10 rounded-[var(--radius-sm)] bg-[var(--brand-soft)] ring-1 ring-[var(--brand-glow)] flex items-center justify-center shrink-0">
					<Workflow
						className="w-5 h-5 text-[var(--brand)]"
						strokeWidth={1.75}
					/>
				</div>
				<div className="flex-1 min-w-0">
					<h2 className="text-base font-semibold font-[family-name:var(--font-display)] text-[var(--ink)]">
						Automatisations — Make, Zapier, n8n
					</h2>
					<p className="text-sm text-[var(--ink-muted)] mt-0.5">
						Dans les deux sens : l'appli prévient tes scénarios à chaque
						événement, et tes scénarios peuvent créer des leads, ajouter des
						notes ou changer un statut.
					</p>
				</div>
			</div>
			<WebhooksSection />
			<ApiKeysSection />
		</motion.div>
	);
}

// ─── Sortant ─────────────────────────────────────────────────────────────────

function WebhooksSection() {
	const endpoints = useQuery(api.automations.listEndpoints, {});
	const create = useAction(api.automations.createEndpoint);
	const [adding, setAdding] = useState(false);
	const [url, setUrl] = useState("");
	const [description, setDescription] = useState("");
	const [events, setEvents] = useState<string[]>(["*"]);
	const [saving, setSaving] = useState(false);

	const all = events.includes("*");

	async function handleCreate() {
		setSaving(true);
		try {
			await create({ url, events, description: description || undefined });
			toast.success("Webhook ajouté", {
				description:
					"Clique « Tester » pour que Make ou Zapier reconnaisse les champs.",
			});
			setUrl("");
			setDescription("");
			setEvents(["*"]);
			setAdding(false);
		} catch (err) {
			toast.error(errorText(err));
		} finally {
			setSaving(false);
		}
	}

	return (
		<div className="space-y-3">
			<div className="flex items-center justify-between gap-3">
				<div>
					<h3 className="text-sm font-semibold text-[var(--ink)]">
						1. Envoyer les événements (webhooks)
					</h3>
					<p className="text-xs text-[var(--ink-muted)] mt-0.5">
						Dans Make : module « Webhooks → Custom webhook ». Dans Zapier : «
						Webhooks by Zapier → Catch Hook ». Colle ici l'adresse fournie.
					</p>
				</div>
				{!adding && (
					<Button
						variant="outline"
						size="sm"
						onClick={() => setAdding(true)}
						className="gap-1.5 shrink-0"
					>
						<Plus className="w-3.5 h-3.5" />
						Ajouter
					</Button>
				)}
			</div>

			{adding && (
				<div className="rounded-[var(--radius-md)] border border-[var(--border)] p-4 space-y-3">
					<div className="space-y-1.5">
						<Label htmlFor="wh-url">Adresse du webhook</Label>
						<Input
							id="wh-url"
							value={url}
							onChange={(e) => setUrl(e.target.value)}
							placeholder="https://hook.eu2.make.com/…"
							className="h-10 font-mono text-sm"
						/>
					</div>
					<div className="space-y-1.5">
						<Label htmlFor="wh-desc">Nom (facultatif)</Label>
						<Input
							id="wh-desc"
							value={description}
							onChange={(e) => setDescription(e.target.value)}
							placeholder="Ex. Relance SMS no-show"
							className="h-10 text-sm"
						/>
					</div>
					<div className="space-y-2">
						<Label>Événements envoyés</Label>
						<label
							htmlFor="wh-all"
							className="flex items-center gap-2.5 text-sm cursor-pointer"
						>
							<Checkbox
								id="wh-all"
								checked={all}
								onCheckedChange={(c) => setEvents(c === true ? ["*"] : [])}
							/>
							Tous les événements
						</label>
						{!all && (
							<div className="grid sm:grid-cols-2 gap-2 pl-1">
								{OUTBOUND_EVENTS.map((e) => (
									<label
										key={e.type}
										htmlFor={`wh-${e.type}`}
										className="flex items-start gap-2.5 text-sm cursor-pointer"
										title={e.description}
									>
										<Checkbox
											id={`wh-${e.type}`}
											checked={events.includes(e.type)}
											onCheckedChange={(c) =>
												setEvents((prev) =>
													c === true
														? [...prev, e.type]
														: prev.filter((x) => x !== e.type),
												)
											}
											className="mt-0.5"
										/>
										<span>
											{e.label}
											<span className="block text-[11px] text-[var(--ink-ghost)] font-mono">
												{e.type}
											</span>
										</span>
									</label>
								))}
							</div>
						)}
					</div>
					<div className="flex gap-2">
						<Button
							size="sm"
							onClick={handleCreate}
							disabled={saving || !url.trim() || events.length === 0}
						>
							{saving && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
							Enregistrer
						</Button>
						<Button variant="ghost" size="sm" onClick={() => setAdding(false)}>
							Annuler
						</Button>
					</div>
				</div>
			)}

			{endpoints === undefined ? (
				<p className="text-sm text-[var(--ink-ghost)]">Chargement…</p>
			) : endpoints.length === 0 && !adding ? (
				<p className="text-sm text-[var(--ink-ghost)]">Aucun webhook.</p>
			) : (
				<div className="space-y-2">
					{endpoints.map((e) => (
						<EndpointRow key={e._id} endpoint={e} />
					))}
				</div>
			)}
		</div>
	);
}

function EndpointRow({ endpoint }: { endpoint: Doc<"webhookEndpoints"> }) {
	const update = useMutation(api.automations.updateEndpoint);
	const remove = useMutation(api.automations.deleteEndpoint);
	const sendTest = useAction(api.automations.sendTest);
	const [open, setOpen] = useState(false);
	const [testing, setTesting] = useState(false);
	const deliveries = useQuery(
		api.automations.listDeliveries,
		open ? { endpointId: endpoint._id } : "skip",
	);

	async function handleTest() {
		setTesting(true);
		try {
			const res = await sendTest({ id: endpoint._id });
			if (res.ok) toast.success(`Test reçu (HTTP ${res.httpStatus})`);
			else
				toast.error("Le test n'est pas passé", {
					description: res.error ?? `HTTP ${res.httpStatus}`,
				});
		} catch (err) {
			toast.error(errorText(err));
		} finally {
			setTesting(false);
		}
	}

	return (
		<div className="rounded-[var(--radius-md)] border border-[var(--border)]">
			<div className="flex items-center gap-3 px-3 py-2.5">
				<Switch
					checked={endpoint.active}
					onCheckedChange={(active) =>
						update({ id: endpoint._id, active }).catch((err) =>
							toast.error(errorText(err)),
						)
					}
					aria-label="Activer le webhook"
				/>
				<button
					type="button"
					onClick={() => setOpen((o) => !o)}
					className="flex-1 min-w-0 text-left"
				>
					<p className="text-sm text-[var(--ink)] truncate">
						{endpoint.description || endpoint.url}
					</p>
					<p className="text-xs text-[var(--ink-muted)] truncate">
						{endpoint.events.map(eventLabel).join(", ")}
						{endpoint.lastDeliveryAt &&
							` · dernier envoi ${fmt(endpoint.lastDeliveryAt)} `}
						{endpoint.lastStatus && (
							<span
								className={
									endpoint.lastStatus === "success"
										? "text-[var(--success)]"
										: "text-[var(--destructive)]"
								}
							>
								{endpoint.lastStatus === "success" ? "✓" : "✗ échec"}
							</span>
						)}
					</p>
					{endpoint.disabledReason && (
						<p className="text-xs text-[var(--destructive)]">
							{endpoint.disabledReason}
						</p>
					)}
				</button>
				<Button
					variant="outline"
					size="sm"
					onClick={handleTest}
					disabled={testing}
					className="gap-1.5"
				>
					{testing ? (
						<Loader2 className="w-3.5 h-3.5 animate-spin" />
					) : (
						<Send className="w-3.5 h-3.5" />
					)}
					Tester
				</Button>
				<button
					type="button"
					onClick={() => setOpen((o) => !o)}
					aria-label="Détails"
				>
					<ChevronDown
						className={cn(
							"w-4 h-4 text-[var(--ink-ghost)] transition-transform",
							open && "rotate-180",
						)}
					/>
				</button>
			</div>

			{open && (
				<div className="border-t border-[var(--border)] px-3 py-3 space-y-3 text-xs">
					<div className="space-y-1">
						<p className="text-[var(--ink-muted)]">Adresse</p>
						<code className="block break-all">{endpoint.url}</code>
					</div>
					<div className="space-y-1">
						<p className="text-[var(--ink-muted)]">
							Secret de signature (en-tête X-Mycall-Signature, facultatif à
							vérifier)
						</p>
						<div className="flex items-center gap-2">
							<code className="break-all">{endpoint.secret}</code>
							<button
								type="button"
								onClick={() => copy(endpoint.secret, "Secret")}
								aria-label="Copier le secret"
							>
								<Copy className="w-3.5 h-3.5 text-[var(--ink-ghost)]" />
							</button>
						</div>
					</div>
					<div className="space-y-1">
						<p className="text-[var(--ink-muted)]">Derniers envois</p>
						{deliveries === undefined ? (
							<p className="text-[var(--ink-ghost)]">Chargement…</p>
						) : deliveries.length === 0 ? (
							<p className="text-[var(--ink-ghost)]">
								Aucun envoi pour l'instant.
							</p>
						) : (
							<ul className="space-y-1">
								{deliveries.map((d) => (
									<li key={d._id} className="flex gap-2">
										<span
											className={cn(
												"shrink-0 w-16",
												d.status === "success"
													? "text-[var(--success)]"
													: d.status === "retrying"
														? "text-[var(--warning)]"
														: "text-[var(--destructive)]",
											)}
										>
											{d.status === "success"
												? "✓ reçu"
												: d.status === "retrying"
													? "↻ réessai"
													: "✗ échec"}
										</span>
										<span className="shrink-0 text-[var(--ink-muted)]">
											{fmt(d.createdAt)}
										</span>
										<span className="truncate">
											{d.eventType}
											{d.httpStatus ? ` · HTTP ${d.httpStatus}` : ""}
											{d.error ? ` · ${d.error}` : ""}
										</span>
									</li>
								))}
							</ul>
						)}
					</div>
					<Button
						variant="ghost"
						size="sm"
						onClick={() => {
							if (!window.confirm("Supprimer ce webhook ?")) return;
							remove({ id: endpoint._id })
								.then(() => toast.success("Webhook supprimé"))
								.catch((err) => toast.error(errorText(err)));
						}}
						className="gap-1.5 text-[var(--destructive)] hover:text-[var(--destructive)] hover:bg-[var(--destructive-soft)]"
					>
						<Trash2 className="w-3.5 h-3.5" />
						Supprimer
					</Button>
				</div>
			)}
		</div>
	);
}

// ─── Entrant ─────────────────────────────────────────────────────────────────

function ApiKeysSection() {
	const keys = useQuery(api.automations.listApiKeys, {});
	const create = useAction(api.automations.createApiKey);
	const revoke = useMutation(api.automations.revokeApiKey);
	const [name, setName] = useState("");
	const [creating, setCreating] = useState(false);
	const [newKey, setNewKey] = useState<string | null>(null);
	const [showDoc, setShowDoc] = useState(false);

	async function handleCreate() {
		setCreating(true);
		try {
			const res = await create({ name });
			setNewKey(res.key);
			setName("");
		} catch (err) {
			toast.error(errorText(err));
		} finally {
			setCreating(false);
		}
	}

	return (
		<div className="space-y-3 border-t border-[var(--border)] pt-5">
			<div>
				<h3 className="text-sm font-semibold text-[var(--ink)]">
					2. Recevoir des actions (API)
				</h3>
				<p className="text-xs text-[var(--ink-muted)] mt-0.5">
					Dans Make : module « HTTP → Make a request ». Dans Zapier : « Webhooks
					by Zapier → POST ». Crée une clé par outil pour pouvoir la révoquer
					seule.
				</p>
			</div>

			<div className="space-y-1">
				<p className="text-xs text-[var(--ink-muted)]">Adresse de l'API</p>
				<div className="flex items-center gap-2">
					<code className="flex-1 text-xs bg-[var(--surface-raised)] border border-[var(--border)] rounded-[var(--radius-md)] px-3 py-2 break-all">
						{API_BASE}
					</code>
					<Button
						variant="outline"
						size="sm"
						onClick={() => copy(API_BASE, "Adresse")}
					>
						Copier
					</Button>
				</div>
			</div>

			{newKey && (
				<div className="rounded-[var(--radius-md)] border border-[var(--warning)] bg-[var(--warning-soft)] p-3 space-y-2">
					<p className="text-xs font-medium text-[var(--ink)]">
						Copie cette clé maintenant : elle ne sera plus jamais affichée.
					</p>
					<div className="flex items-center gap-2">
						<code className="flex-1 text-xs break-all">{newKey}</code>
						<Button
							variant="outline"
							size="sm"
							onClick={() => copy(newKey, "Clé")}
						>
							Copier
						</Button>
					</div>
					<button
						type="button"
						onClick={() => setNewKey(null)}
						className="text-xs text-[var(--ink-muted)] underline"
					>
						C'est copié
					</button>
				</div>
			)}

			<div className="flex gap-2">
				<Input
					value={name}
					onChange={(e) => setName(e.target.value)}
					placeholder="Nom de la clé (ex. Make)"
					className="h-9 text-sm"
				/>
				<Button
					variant="outline"
					size="sm"
					onClick={handleCreate}
					disabled={creating || !name.trim()}
					className="gap-1.5 shrink-0 h-9"
				>
					{creating ? (
						<Loader2 className="w-3.5 h-3.5 animate-spin" />
					) : (
						<KeyRound className="w-3.5 h-3.5" />
					)}
					Créer une clé
				</Button>
			</div>

			{keys && keys.length > 0 && (
				<ul className="rounded-[var(--radius-md)] border border-[var(--border)] divide-y divide-[var(--border)]">
					{keys.map((k) => (
						<li key={k._id} className="flex items-center gap-3 px-3 py-2">
							<div className="flex-1 min-w-0">
								<p className="text-sm text-[var(--ink)] truncate">{k.name}</p>
								<p className="text-xs text-[var(--ink-muted)]">
									<code>{k.prefix}…</code> · créée {fmt(k.createdAt)}
									{k.lastUsedAt
										? ` · utilisée ${fmt(k.lastUsedAt)}`
										: " · jamais utilisée"}
								</p>
							</div>
							<Button
								variant="ghost"
								size="sm"
								onClick={() => {
									if (!window.confirm(`Révoquer la clé « ${k.name} » ?`))
										return;
									revoke({ id: k._id as Id<"apiKeys"> })
										.then(() => toast.success("Clé révoquée"))
										.catch((err) => toast.error(errorText(err)));
								}}
								className="text-[var(--destructive)] hover:text-[var(--destructive)] hover:bg-[var(--destructive-soft)]"
							>
								Révoquer
							</Button>
						</li>
					))}
				</ul>
			)}

			<button
				type="button"
				onClick={() => setShowDoc((s) => !s)}
				className="flex items-center gap-1 text-xs text-[var(--brand)]"
			>
				<ChevronDown
					className={cn(
						"w-3.5 h-3.5 transition-transform",
						showDoc && "rotate-180",
					)}
				/>
				Ce que l'API permet
			</button>
			{showDoc && (
				<div className="text-xs text-[var(--ink-muted)] space-y-3 rounded-[var(--radius-md)] bg-[var(--surface-raised)] p-3">
					<p>
						Clé dans l'en-tête <code>Authorization: Bearer mc_…</code> (ou{" "}
						<code>X-API-Key</code>). Corps en JSON ou formulaire.
					</p>
					<Endpoint
						method="POST"
						path="/leads"
						desc="Crée le lead, ou le complète s'il existe (même email ou téléphone)."
						fields="email ou phone (obligatoire), first_name, last_name, status, source, tags, note, closer_email, event_slug, amount, utm_source…"
					/>
					<Endpoint
						method="POST"
						path="/leads/notes"
						desc="Ajoute une note dans la fiche."
						fields="id, email ou phone · body"
					/>
					<Endpoint
						method="POST"
						path="/leads/status"
						desc="Change le statut (et ajoute un montant en euros si gagné)."
						fields="id, email ou phone · status · amount"
					/>
					<Endpoint
						method="GET"
						path="/leads?email=…"
						desc="Retrouve un lead, avec son statut et ses réponses."
						fields="email, phone ou id"
					/>
					<Endpoint
						method="GET"
						path="/events"
						desc="Liste les événements et leurs liens de réservation."
						fields="—"
					/>
					<p>
						Statuts : potentiel, qualifie, rdv_reserve, tenu, gagne, perdu,
						follow_up (won / lost / booked acceptés).
					</p>
				</div>
			)}
		</div>
	);
}

function Endpoint({
	method,
	path,
	desc,
	fields,
}: {
	method: string;
	path: string;
	desc: string;
	fields: string;
}) {
	return (
		<div>
			<p className="text-[var(--ink)]">
				<code className="font-semibold">{method}</code> <code>{path}</code>
			</p>
			<p>{desc}</p>
			<p className="text-[var(--ink-ghost)]">Champs : {fields}</p>
		</div>
	);
}
