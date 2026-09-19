"use client";

import { useAction, useMutation, useQuery } from "convex/react";
import { motion } from "framer-motion";
import {
	CheckCircle2,
	Download,
	Link2,
	Loader2,
	Plus,
	Unplug,
	Video,
} from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import { api } from "@/../convex/_generated/api";
import type { Id } from "@/../convex/_generated/dataModel";
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

const NO_MEMBER = "__none__";

function fmt(ms: number): string {
	return new Intl.DateTimeFormat("fr-FR", {
		day: "numeric",
		month: "short",
		hour: "2-digit",
		minute: "2-digit",
	}).format(new Date(ms));
}

export function FathomCard() {
	const data = useQuery(api.fathom.listConnections, {});
	const members = useQuery(api.users.listAllUsers, {});
	const connect = useAction(api.fathom.connect);
	const disconnect = useAction(api.fathom.disconnect);
	const importRecent = useAction(api.fathom.importRecent);
	const setAutoHeld = useMutation(api.fathom.setAutoHeld);

	const [adding, setAdding] = useState(false);
	const [label, setLabel] = useState("");
	const [apiKey, setApiKey] = useState("");
	const [memberId, setMemberId] = useState(NO_MEMBER);
	const [busy, setBusy] = useState<string | null>(null);

	async function run(key: string, fn: () => Promise<void>) {
		setBusy(key);
		try {
			await fn();
		} catch (err) {
			toast.error(errorText(err));
		} finally {
			setBusy(null);
		}
	}

	const handleConnect = () =>
		run("connect", async () => {
			const member = members?.find((m) => m._id === memberId);
			await connect({
				label:
					label.trim() ||
					(member ? `Fathom de ${member.name ?? member.email}` : "Fathom"),
				apiKey,
				userId: memberId === NO_MEMBER ? undefined : (memberId as Id<"users">),
			});
			toast.success("Fathom connecté", {
				description:
					"Les prochains appels enregistrés arriveront automatiquement. Tu peux aussi importer les 30 derniers jours.",
			});
			setAdding(false);
			setLabel("");
			setApiKey("");
			setMemberId(NO_MEMBER);
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
					<Video className="w-5 h-5 text-[var(--brand)]" strokeWidth={1.75} />
				</div>
				<div className="flex-1 min-w-0">
					<h2 className="text-base font-semibold font-[family-name:var(--font-display)] text-[var(--ink)]">
						Fathom — enregistrements d'appels
					</h2>
					<p className="text-sm text-[var(--ink-muted)] mt-0.5">
						Chaque appel enregistré arrive dans la fiche du prospect, rattaché à
						son rendez-vous : lien de l'enregistrement, résumé, actions à mener
						et transcription.
					</p>
				</div>
			</div>

			{data === undefined ? (
				<p className="text-sm text-[var(--ink-ghost)]">Chargement…</p>
			) : (
				<>
					{data.connections.length > 0 && (
						<ul className="rounded-[var(--radius-md)] border border-[var(--border)] divide-y divide-[var(--border)]">
							{data.connections.map((c) => (
								<li key={c._id} className="px-3 py-2.5 flex items-center gap-3">
									<CheckCircle2
										className={
											c.webhookActive
												? "w-4 h-4 text-[var(--success)] shrink-0"
												: "w-4 h-4 text-[var(--warning)] shrink-0"
										}
									/>
									<div className="flex-1 min-w-0">
										<p className="text-sm text-[var(--ink)] truncate">
											{c.label}
											{c.memberName && (
												<span className="text-[var(--ink-muted)]">
													{" "}
													· {c.memberName}
												</span>
											)}
										</p>
										<p className="text-xs text-[var(--ink-muted)] truncate">
											{c.accountEmail ?? c.keyPreview}
											{c.lastReceivedAt
												? ` · dernier appel reçu ${fmt(c.lastReceivedAt)}`
												: " · aucun appel reçu pour l'instant"}
										</p>
										{c.lastError && (
											<p className="text-xs text-[var(--destructive)] truncate">
												{c.lastError}
											</p>
										)}
									</div>
									<Button
										variant="outline"
										size="sm"
										disabled={busy !== null}
										onClick={() =>
											run(`import-${c._id}`, async () => {
												const r = await importRecent({
													connectionId: c._id,
													days: 30,
												});
												toast.success(
													`${r.seen} appel(s) des 30 derniers jours`,
													{
														description: `${r.matched} rattaché(s), ${r.unmatched} à rattacher, ${r.updated} déjà présent(s).`,
													},
												);
											})
										}
										className="gap-1.5 shrink-0"
									>
										{busy === `import-${c._id}` ? (
											<Loader2 className="w-3.5 h-3.5 animate-spin" />
										) : (
											<Download className="w-3.5 h-3.5" />
										)}
										30 derniers jours
									</Button>
									<Button
										variant="ghost"
										size="sm"
										disabled={busy !== null}
										onClick={() =>
											run(`off-${c._id}`, async () => {
												if (
													!window.confirm(
														`Déconnecter « ${c.label} » ? Les appels déjà reçus restent dans les fiches.`,
													)
												)
													return;
												await disconnect({ connectionId: c._id });
												toast.success("Fathom déconnecté");
											})
										}
										aria-label="Déconnecter"
										className="text-[var(--destructive)] hover:text-[var(--destructive)] hover:bg-[var(--destructive-soft)]"
									>
										<Unplug className="w-3.5 h-3.5" />
									</Button>
								</li>
							))}
						</ul>
					)}

					{adding ? (
						<div className="rounded-[var(--radius-md)] border border-[var(--border)] p-4 space-y-3">
							<div className="grid sm:grid-cols-2 gap-3">
								<div className="space-y-1.5">
									<Label htmlFor="fathom-member">Compte Fathom de</Label>
									<Select value={memberId} onValueChange={setMemberId}>
										<SelectTrigger id="fathom-member">
											<SelectValue />
										</SelectTrigger>
										<SelectContent>
											<SelectItem value={NO_MEMBER}>
												Compte partagé / non attribué
											</SelectItem>
											{(members ?? []).map((m) => (
												<SelectItem key={m._id} value={m._id}>
													{m.name ?? m.email}
												</SelectItem>
											))}
										</SelectContent>
									</Select>
								</div>
								<div className="space-y-1.5">
									<Label htmlFor="fathom-label">Nom (facultatif)</Label>
									<Input
										id="fathom-label"
										value={label}
										onChange={(e) => setLabel(e.target.value)}
										placeholder="Fathom de Julie"
										className="h-10 text-sm"
									/>
								</div>
							</div>
							<div className="space-y-1.5">
								<Label htmlFor="fathom-key">Clé API Fathom</Label>
								<Input
									id="fathom-key"
									type="password"
									value={apiKey}
									onChange={(e) => setApiKey(e.target.value)}
									className="h-10 font-mono text-sm"
									autoComplete="off"
								/>
								<p className="text-xs text-[var(--ink-ghost)]">
									Dans Fathom : Paramètres → API Access → Generate API Key. La
									clé ne donne accès qu'aux appels de son propriétaire : une
									connexion par closer.
								</p>
							</div>
							<div className="flex gap-2">
								<Button
									onClick={handleConnect}
									disabled={busy !== null || !apiKey.trim()}
									style={{ background: "var(--grad-brand)" }}
								>
									{busy === "connect" && (
										<Loader2 className="w-4 h-4 animate-spin" />
									)}
									Connecter
								</Button>
								<Button variant="ghost" onClick={() => setAdding(false)}>
									Annuler
								</Button>
							</div>
						</div>
					) : (
						<Button
							variant="outline"
							size="sm"
							onClick={() => setAdding(true)}
							className="gap-1.5"
						>
							<Plus className="w-3.5 h-3.5" />
							{data.connections.length
								? "Connecter un autre compte Fathom"
								: "Connecter Fathom"}
						</Button>
					)}

					<label
						htmlFor="fathom-autoheld"
						className="flex items-start gap-3 cursor-pointer border-t border-[var(--border)] pt-4"
					>
						<Switch
							id="fathom-autoheld"
							checked={data.autoHeld}
							onCheckedChange={(v) =>
								setAutoHeld({ enabled: v }).catch((err) =>
									toast.error(errorText(err)),
								)
							}
						/>
						<span className="text-sm text-[var(--ink)]">
							Marquer le rendez-vous comme « tenu » quand l'appel est enregistré
							<span className="block text-xs text-[var(--ink-muted)]">
								Seulement si rien n'a encore été renseigné. Déclenche la
								séquence « après un rendez-vous tenu » si tu en as une.
							</span>
						</span>
					</label>

					<Unmatched />
				</>
			)}
		</motion.div>
	);
}

function Unmatched() {
	const rows = useQuery(api.fathom.listUnmatched, {});
	const attach = useMutation(api.fathom.attachManually);
	const remove = useMutation(api.fathom.deleteRecording);
	const [emails, setEmails] = useState<Record<string, string>>({});

	if (!rows || rows.length === 0) return null;
	return (
		<div className="space-y-2 border-t border-[var(--border)] pt-4">
			<p className="text-sm font-medium text-[var(--ink)]">
				Appels à rattacher ({rows.length})
			</p>
			<p className="text-xs text-[var(--ink-muted)]">
				Aucun invité de ces appels ne correspond à un lead. Indique l'email du
				prospect pour le rattacher.
			</p>
			<ul className="space-y-2">
				{rows.map((r) => (
					<li
						key={r._id}
						className="rounded-[var(--radius-md)] border border-[var(--border)] p-3 space-y-2"
					>
						<div className="flex items-center justify-between gap-2">
							<p className="text-sm text-[var(--ink)] truncate">
								{r.title}{" "}
								<span className="text-xs text-[var(--ink-muted)]">
									· {fmt(r.startedAt)}
								</span>
							</p>
							{r.url && (
								<a
									href={r.url}
									target="_blank"
									rel="noreferrer"
									className="text-xs text-[var(--brand)] underline shrink-0"
								>
									Voir
								</a>
							)}
						</div>
						{r.inviteeEmails.length > 0 && (
							<p className="text-xs text-[var(--ink-ghost)] truncate">
								Invités : {r.inviteeEmails.join(", ")}
							</p>
						)}
						<div className="flex gap-2">
							<Input
								value={emails[r._id] ?? ""}
								onChange={(e) =>
									setEmails((prev) => ({ ...prev, [r._id]: e.target.value }))
								}
								placeholder="email du prospect"
								className="h-8 text-xs"
							/>
							<Button
								size="sm"
								variant="outline"
								disabled={!emails[r._id]?.trim()}
								onClick={() =>
									attach({ recordingId: r._id, email: emails[r._id] ?? "" })
										.then(() => toast.success("Appel rattaché au lead"))
										.catch((err) => toast.error(errorText(err)))
								}
								className="gap-1.5 h-8"
							>
								<Link2 className="w-3.5 h-3.5" />
								Rattacher
							</Button>
							<Button
								size="sm"
								variant="ghost"
								onClick={() => {
									if (!window.confirm("Ignorer cet appel ? Il sera supprimé."))
										return;
									remove({ recordingId: r._id }).catch((err) =>
										toast.error(errorText(err)),
									);
								}}
								className="h-8 text-xs"
							>
								Ignorer
							</Button>
						</div>
					</li>
				))}
			</ul>
		</div>
	);
}
