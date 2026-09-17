"use client";

import { useAction, useMutation, useQuery } from "convex/react";
import { motion } from "framer-motion";
import { CheckCircle2, Loader2, Tags, Unplug } from "lucide-react";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { api } from "@/../convex/_generated/api";
import { errorText } from "@/components/settings/email-provider-card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

const TAG_EXAMPLES = [
	"Nouveau lead",
	"RDV réservé",
	"RDV : nom de l'événement",
	"RDV déplacé",
	"RDV annulé",
	"Absent au RDV",
	"RDV tenu",
	"Follow-up",
	"Gagné",
	"Perdu",
	"Client payant",
];

export function SystemeioCard() {
	const status = useQuery(api.systemeio.getStatus, {});
	const connect = useAction(api.systemeio.connect);
	const updatePrefix = useMutation(api.systemeio.updatePrefix);
	const disconnect = useMutation(api.systemeio.disconnect);

	const [apiKey, setApiKey] = useState("");
	const [prefix, setPrefix] = useState("Mycall");
	const [busy, setBusy] = useState<string | null>(null);

	useEffect(() => {
		if (status) setPrefix(status.tagPrefix);
	}, [status]);

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

	const tag = (name: string) =>
		prefix.trim() ? `${prefix.trim()} · ${name}` : name;

	return (
		<motion.div
			initial={{ opacity: 0, y: 8 }}
			animate={{ opacity: 1, y: 0 }}
			transition={{ duration: 0.15 }}
			className="card-premium max-w-2xl space-y-5 mt-6"
		>
			<div className="flex items-start gap-3">
				<div className="w-10 h-10 rounded-[var(--radius-sm)] bg-[var(--brand-soft)] ring-1 ring-[var(--brand-glow)] flex items-center justify-center shrink-0">
					<Tags className="w-5 h-5 text-[var(--brand)]" strokeWidth={1.75} />
				</div>
				<div className="flex-1 min-w-0">
					<h2 className="text-base font-semibold font-[family-name:var(--font-display)] text-[var(--ink)]">
						systeme.io
					</h2>
					<p className="text-sm text-[var(--ink-muted)] mt-0.5">
						Chaque prospect est ajouté à tes contacts systeme.io, avec un tag à
						chaque étape. Branche tes campagnes et automatisations systeme.io
						sur ces tags.
					</p>
				</div>
			</div>

			{status === undefined ? (
				<p className="text-sm text-[var(--ink-ghost)]">Chargement…</p>
			) : status.connected ? (
				<>
					<div className="rounded-[var(--radius-md)] border border-[var(--border)] bg-[var(--surface-raised)] p-4 flex flex-wrap items-center justify-between gap-3">
						<div className="flex items-center gap-2 text-sm text-[var(--ink)]">
							<CheckCircle2 className="w-4 h-4 text-[var(--success)]" />
							Connecté ({status.keyPreview})
						</div>
						<Button
							variant="ghost"
							size="sm"
							disabled={busy !== null}
							onClick={() =>
								run("disconnect", async () => {
									if (!window.confirm("Déconnecter systeme.io ?")) return;
									await disconnect({});
									toast.success("systeme.io déconnecté");
								})
							}
							className="gap-1.5 text-[var(--destructive)] hover:text-[var(--destructive)] hover:bg-[var(--destructive-soft)]"
						>
							<Unplug className="w-3.5 h-3.5" />
							Déconnecter
						</Button>
					</div>
					<div className="space-y-1.5">
						<Label
							htmlFor="sio-prefix"
							className="text-xs font-medium uppercase tracking-wider text-[var(--ink-muted)]"
						>
							Préfixe des tags
						</Label>
						<div className="flex gap-2">
							<Input
								id="sio-prefix"
								value={prefix}
								onChange={(e) => setPrefix(e.target.value)}
								className="h-10 text-sm"
							/>
							<Button
								variant="outline"
								disabled={busy !== null || prefix.trim() === status.tagPrefix}
								onClick={() =>
									run("prefix", async () => {
										await updatePrefix({ tagPrefix: prefix });
										toast.success("Préfixe enregistré");
									})
								}
							>
								Enregistrer
							</Button>
						</div>
					</div>
				</>
			) : (
				<div className="space-y-3">
					<div className="space-y-1.5">
						<Label
							htmlFor="sio-key"
							className="text-xs font-medium uppercase tracking-wider text-[var(--ink-muted)]"
						>
							Clé API systeme.io
						</Label>
						<Input
							id="sio-key"
							type="password"
							value={apiKey}
							onChange={(e) => setApiKey(e.target.value)}
							className="h-10 font-mono text-sm"
							autoComplete="off"
						/>
						<p className="text-xs text-[var(--ink-ghost)]">
							systeme.io → Paramètres → Clé API publique → Créer. Elle est
							vérifiée puis stockée sans jamais être réaffichée.
						</p>
					</div>
					<Button
						onClick={() =>
							run("connect", async () => {
								await connect({ apiKey, tagPrefix: prefix });
								setApiKey("");
								toast.success("systeme.io connecté");
							})
						}
						disabled={busy !== null || !apiKey.trim()}
						className="h-10"
						style={{ background: "var(--grad-brand)" }}
					>
						{busy === "connect" ? (
							<Loader2 className="w-4 h-4 animate-spin" />
						) : (
							"Connecter systeme.io"
						)}
					</Button>
				</div>
			)}

			<div className="text-xs text-[var(--ink-muted)] border-t border-[var(--border)] pt-4 space-y-2">
				<p>Tags posés automatiquement :</p>
				<div className="flex flex-wrap gap-1.5">
					{TAG_EXAMPLES.map((t) => (
						<span
							key={t}
							className="px-2 py-0.5 rounded-full bg-[var(--surface-muted)] text-[var(--ink)]"
						>
							{tag(t)}
						</span>
					))}
				</div>
				<p className="text-[var(--ink-ghost)]">
					Seuls les prospects avec un email sont synchronisés, et jamais ceux
					qui se sont désabonnés.
				</p>
			</div>
		</motion.div>
	);
}
