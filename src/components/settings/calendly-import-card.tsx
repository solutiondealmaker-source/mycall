"use client";

import { useAction, useMutation, useQuery } from "convex/react";
import { motion } from "framer-motion";
import {
	CalendarPlus,
	CheckCircle2,
	History,
	Loader2,
	RefreshCw,
	Unplug,
} from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import { api } from "@/../convex/_generated/api";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

type EventTypeRow = {
	uri: string;
	name: string;
	durationMinutes: number;
	active: boolean;
	questionCount: number;
	alreadyImported: boolean;
};

function errorText(err: unknown): string {
	// Convex préfixe les erreurs serveur ; on ne garde que le message utile.
	const msg = err instanceof Error ? err.message : "Erreur";
	const m = /Uncaught Error: ([^\n]+)/.exec(msg);
	return m ? m[1] : msg;
}

function fmt(ms: number): string {
	return new Intl.DateTimeFormat("fr-FR", {
		day: "numeric",
		month: "short",
		hour: "2-digit",
		minute: "2-digit",
	}).format(new Date(ms));
}

export function CalendlyImportCard() {
	const status = useQuery(api.calendly.getStatus, {});
	const connect = useAction(api.calendly.connect);
	const disconnect = useMutation(api.calendly.disconnect);
	const listEventTypes = useAction(api.calendly.listEventTypes);
	const importEventTypes = useAction(api.calendly.importEventTypes);
	const startHistoryImport = useMutation(api.calendly.startHistoryImport);

	const [token, setToken] = useState("");
	const [busy, setBusy] = useState<string | null>(null);
	const [eventTypes, setEventTypes] = useState<EventTypeRow[] | null>(null);
	const [selected, setSelected] = useState<string[]>([]);

	const job = status?.latestJob ?? null;
	const jobRunning = job?.status === "running";

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

	const handleConnect = () =>
		run("connect", async () => {
			const res = await connect({ token });
			setToken("");
			toast.success(`Calendly connecté : ${res.accountLabel}`);
		});

	const handleDisconnect = () =>
		run("disconnect", async () => {
			if (
				!window.confirm(
					"Déconnecter Calendly ? Les données déjà importées restent.",
				)
			)
				return;
			await disconnect({});
			setEventTypes(null);
			setSelected([]);
			toast.success("Calendly déconnecté");
		});

	const handleLoad = () =>
		run("load", async () => {
			const rows = await listEventTypes({});
			setEventTypes(rows);
			setSelected(
				rows.filter((r) => r.active && !r.alreadyImported).map((r) => r.uri),
			);
		});

	const handleImportEvents = () =>
		run("events", async () => {
			const res = await importEventTypes({ uris: selected });
			const parts = [
				res.created.length && `${res.created.length} importé(s)`,
				res.updated.length && `${res.updated.length} complété(s)`,
				res.existing.length && `${res.existing.length} déjà à jour`,
				res.failed.length && `${res.failed.length} en échec`,
			].filter(Boolean);
			(res.failed.length ? toast.warning : toast.success)(
				`Événements : ${parts.join(", ")}`,
				res.created.length
					? {
							description:
								"Ils sont inactifs : règle les disponibilités et relis-les avant de les activer. Les leads déjà importés y sont rattachés automatiquement d'ici quelques minutes.",
						}
					: undefined,
			);
			setEventTypes(await listEventTypes({}));
			setSelected([]);
		});

	const handleHistory = () =>
		run("history", async () => {
			if (
				!window.confirm(
					"Importer tous les rendez-vous Calendly (passés et à venir) comme leads ? Aucun email ne sera envoyé aux prospects. Un rendez-vous déjà importé ne l'est jamais deux fois.",
				)
			)
				return;
			await startHistoryImport({});
			toast.success("Import lancé : tu peux quitter la page, il continue.");
		});

	return (
		<motion.div
			initial={{ opacity: 0, y: 8 }}
			animate={{ opacity: 1, y: 0 }}
			transition={{ duration: 0.15, delay: 0.05 }}
			className="card-premium max-w-2xl space-y-5 mt-6"
		>
			<div className="flex items-start gap-3">
				<div className="w-10 h-10 rounded-[var(--radius-sm)] bg-[var(--brand-soft)] ring-1 ring-[var(--brand-glow)] flex items-center justify-center shrink-0">
					<CalendarPlus
						className="w-5 h-5 text-[var(--brand)]"
						strokeWidth={1.75}
					/>
				</div>
				<div className="flex-1 min-w-0">
					<h2 className="text-base font-semibold font-[family-name:var(--font-display)] text-[var(--ink)]">
						Import depuis Calendly
					</h2>
					<p className="text-sm text-[var(--ink-muted)] mt-0.5">
						Récupère tes événements avec leurs questions, et tes rendez-vous
						avec les réponses de tes prospects.
					</p>
				</div>
			</div>

			{status === undefined ? (
				<p className="text-sm text-[var(--ink-ghost)]">Chargement…</p>
			) : !status.connected ? (
				<div className="space-y-3">
					<div className="space-y-1.5">
						<Label
							htmlFor="calendly-token"
							className="text-xs font-medium uppercase tracking-wider text-[var(--ink-muted)]"
						>
							Jeton d'accès personnel Calendly
						</Label>
						<Input
							id="calendly-token"
							type="password"
							value={token}
							onChange={(e) => setToken(e.target.value)}
							placeholder="eyJraWQiOi…"
							className="h-11 font-mono text-sm"
							autoComplete="off"
						/>
						<p className="text-xs text-[var(--ink-ghost)]">
							Calendly → <em>Intégrations et applications</em> →{" "}
							<em>API et webhooks</em> → <em>Générer un nouveau jeton</em>. Il
							est vérifié auprès de Calendly puis stocké sans jamais être
							réaffiché.
						</p>
					</div>
					<Button
						onClick={handleConnect}
						disabled={busy !== null || !token.trim()}
						className="h-10"
						style={{ background: "var(--grad-brand)" }}
					>
						{busy === "connect" ? (
							<Loader2 className="w-4 h-4 animate-spin" />
						) : (
							"Connecter Calendly"
						)}
					</Button>
				</div>
			) : (
				<>
					<div className="rounded-[var(--radius-md)] border border-[var(--border)] bg-[var(--surface-raised)] p-4 flex flex-wrap items-center justify-between gap-3">
						<div className="flex items-center gap-2 text-sm text-[var(--ink)] min-w-0">
							<CheckCircle2 className="w-4 h-4 text-[var(--success)] shrink-0" />
							<span className="truncate">Connecté : {status.accountLabel}</span>
						</div>
						<Button
							variant="ghost"
							size="sm"
							onClick={handleDisconnect}
							disabled={busy !== null}
							className="gap-1.5 text-[var(--destructive)] hover:text-[var(--destructive)] hover:bg-[var(--destructive-soft)]"
						>
							<Unplug className="w-3.5 h-3.5" />
							Déconnecter
						</Button>
					</div>

					{/* 1. Événements */}
					<div className="space-y-3">
						<div className="flex items-center justify-between gap-3">
							<div>
								<h3 className="text-sm font-semibold text-[var(--ink)]">
									1. Événements et questionnaires
								</h3>
								<p className="text-xs text-[var(--ink-muted)] mt-0.5">
									Créés inactifs, avec toi comme hôte. Les disponibilités se
									règlent ensuite dans l'appli.
								</p>
							</div>
							<Button
								variant="outline"
								size="sm"
								onClick={handleLoad}
								disabled={busy !== null}
								className="gap-1.5 shrink-0"
							>
								{busy === "load" ? (
									<Loader2 className="w-3.5 h-3.5 animate-spin" />
								) : (
									<RefreshCw className="w-3.5 h-3.5" />
								)}
								{eventTypes ? "Actualiser" : "Voir mes événements"}
							</Button>
						</div>

						{eventTypes && (
							<>
								<div className="rounded-[var(--radius-md)] border border-[var(--border)] divide-y divide-[var(--border)] max-h-72 overflow-y-auto">
									{eventTypes.length === 0 ? (
										<p className="px-3 py-3 text-sm text-[var(--ink-ghost)]">
											Aucun événement trouvé sur ce compte Calendly.
										</p>
									) : (
										eventTypes.map((t) => (
											<label
												key={t.uri}
												htmlFor={`cal-${t.uri}`}
												className="flex items-center gap-3 px-3 py-2.5 cursor-pointer hover:bg-[var(--surface-raised)]"
											>
												<Checkbox
													id={`cal-${t.uri}`}
													checked={selected.includes(t.uri)}
													onCheckedChange={(c) =>
														setSelected((prev) =>
															c === true
																? [...prev, t.uri]
																: prev.filter((u) => u !== t.uri),
														)
													}
												/>
												<div className="flex-1 min-w-0">
													<p className="text-sm text-[var(--ink)] truncate">
														{t.name}
													</p>
													<p className="text-xs text-[var(--ink-muted)]">
														{t.durationMinutes} min · {t.questionCount} question
														{t.questionCount > 1 ? "s" : ""}
														{!t.active && " · désactivé sur Calendly"}
													</p>
												</div>
												{t.alreadyImported && (
													<span className="text-[11px] text-[var(--success)] shrink-0">
														Déjà importé · recocher pour compléter
													</span>
												)}
											</label>
										))
									)}
								</div>
								<Button
									onClick={handleImportEvents}
									disabled={busy !== null || selected.length === 0}
									size="sm"
								>
									{busy === "events" && (
										<Loader2 className="w-3.5 h-3.5 animate-spin" />
									)}
									Importer {selected.length || ""} événement
									{selected.length > 1 ? "s" : ""}
								</Button>
							</>
						)}
					</div>

					{/* 2. Historique */}
					<div className="space-y-3 border-t border-[var(--border)] pt-5">
						<div className="flex items-center justify-between gap-3">
							<div>
								<h3 className="text-sm font-semibold text-[var(--ink)]">
									2. Rendez-vous et réponses
								</h3>
								<p className="text-xs text-[var(--ink-muted)] mt-0.5">
									Chaque invité devient un lead, avec ses réponses en note. Un
									lead existant est complété, jamais écrasé. Importe d'abord les
									événements pour que les leads y soient rattachés.
								</p>
							</div>
							<Button
								variant="outline"
								size="sm"
								onClick={handleHistory}
								disabled={busy !== null || jobRunning}
								className="gap-1.5 shrink-0"
							>
								{busy === "history" || jobRunning ? (
									<Loader2 className="w-3.5 h-3.5 animate-spin" />
								) : (
									<History className="w-3.5 h-3.5" />
								)}
								{jobRunning ? "Import en cours" : "Importer l'historique"}
							</Button>
						</div>

						{job && (
							<div className="rounded-[var(--radius-md)] border border-[var(--border)] bg-[var(--surface-raised)] px-4 py-3 text-xs text-[var(--ink-muted)] space-y-1">
								<p className="text-[var(--ink)] font-medium">
									{job.status === "running"
										? "Import en cours…"
										: job.status === "done"
											? `Import terminé le ${fmt(job.finishedAt ?? job.startedAt)}`
											: "Import interrompu"}
								</p>
								<p>
									{job.meetingsSeen} rendez-vous parcourus · {job.leadsCreated}{" "}
									lead(s) créé(s) · {job.leadsUpdated} complété(s) ·{" "}
									{job.alreadyImported} déjà importé(s)
								</p>
								{job.error && (
									<p className="text-[var(--destructive)]">{job.error}</p>
								)}
							</div>
						)}
					</div>
				</>
			)}
		</motion.div>
	);
}
