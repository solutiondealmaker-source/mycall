"use client";

import { useMutation, useQuery } from "convex/react";
import { motion } from "framer-motion";
import { CheckCircle2, CreditCard, Loader2, Trash2 } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import { api } from "@/../convex/_generated/api";
import { PageHeader } from "@/components/dashboard/page-header";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";

export default function IntegrationsPage() {
	const settings = useQuery(api.stripe.getSettings, {});
	const setStripeKey = useMutation(api.stripe.setStripeKey);
	const setEnabled = useMutation(api.stripe.setStripeEnabled);
	const removeKey = useMutation(api.stripe.removeStripeKey);

	const [key, setKey] = useState("");
	const [currency, setCurrency] = useState("eur");
	const [saving, setSaving] = useState(false);

	async function handleSave() {
		if (!key.trim()) return;
		setSaving(true);
		try {
			await setStripeKey({ secretKey: key.trim(), currency });
			setKey("");
			toast.success("Clé Stripe enregistrée");
		} catch (err) {
			toast.error(
				err instanceof Error ? err.message : "Enregistrement impossible",
			);
		} finally {
			setSaving(false);
		}
	}

	async function handleToggle(next: boolean) {
		try {
			await setEnabled({ enabled: next });
			toast.success(next ? "Stripe activé" : "Stripe désactivé");
		} catch (err) {
			toast.error(err instanceof Error ? err.message : "Action impossible");
		}
	}

	async function handleRemove() {
		try {
			await removeKey({});
			toast.success("Clé Stripe supprimée");
		} catch (err) {
			toast.error(
				err instanceof Error ? err.message : "Suppression impossible",
			);
		}
	}

	const configured = settings?.stripeConfigured ?? false;
	const enabled = settings?.stripeEnabled ?? false;
	const isLive = settings?.stripeMode === "live";

	return (
		<div className="animate-fade-in">
			<PageHeader
				title="Intégrations"
				description="Connecte des services externes à ton CRM"
			/>

			<motion.div
				initial={{ opacity: 0, y: 8 }}
				animate={{ opacity: 1, y: 0 }}
				transition={{ duration: 0.15 }}
				className="card-premium max-w-2xl space-y-5"
			>
				{/* En-tête Stripe */}
				<div className="flex items-start gap-3">
					<div className="w-10 h-10 rounded-[var(--radius-sm)] bg-[var(--brand-soft)] ring-1 ring-[var(--brand-glow)] flex items-center justify-center shrink-0">
						<CreditCard
							className="w-5 h-5 text-[var(--brand)]"
							strokeWidth={1.75}
						/>
					</div>
					<div className="flex-1 min-w-0">
						<div className="flex items-center gap-2">
							<h2 className="text-base font-semibold font-[family-name:var(--font-display)] text-[var(--ink)]">
								Stripe
							</h2>
							{configured && (
								<span
									className={cn(
										"text-[11px] font-medium px-2 py-0.5 rounded-full",
										enabled
											? "bg-[var(--success-soft)] text-[var(--success)]"
											: "bg-[var(--surface-muted)] text-[var(--ink-ghost)]",
									)}
								>
									{enabled ? "Actif" : "Inactif"}
								</span>
							)}
							{configured && (
								<span
									className={cn(
										"text-[11px] font-medium px-2 py-0.5 rounded-full",
										isLive
											? "bg-[var(--destructive-soft)] text-[var(--destructive)]"
											: "bg-[var(--warning-soft)] text-[var(--warning)]",
									)}
								>
									{isLive ? "Mode réel" : "Mode test"}
								</span>
							)}
						</div>
						<p className="text-sm text-[var(--ink-muted)] mt-0.5">
							Génère des liens de paiement directement depuis la fiche d'un
							lead.
						</p>
					</div>
				</div>

				{/* État actuel */}
				{settings === undefined ? (
					<p className="text-sm text-[var(--ink-ghost)]">Chargement…</p>
				) : configured ? (
					<div className="rounded-[var(--radius-md)] border border-[var(--border)] bg-[var(--surface-raised)] p-4 space-y-3">
						<div className="flex items-center gap-2 text-sm text-[var(--ink)]">
							<CheckCircle2 className="w-4 h-4 text-[var(--success)]" />
							Clé enregistrée :{" "}
							<code className="text-xs text-[var(--ink-muted)]">
								{settings.stripeKeyPreview}
							</code>
						</div>
						<div className="flex flex-wrap gap-2">
							<Button
								variant="outline"
								size="sm"
								onClick={() => handleToggle(!enabled)}
							>
								{enabled ? "Désactiver" : "Activer"}
							</Button>
							<Button
								variant="ghost"
								size="sm"
								onClick={handleRemove}
								className="gap-1.5 text-[var(--destructive)] hover:text-[var(--destructive)] hover:bg-[var(--destructive-soft)]"
							>
								<Trash2 className="w-3.5 h-3.5" />
								Supprimer la clé
							</Button>
						</div>
					</div>
				) : null}

				{/* Formulaire clé */}
				<div className="space-y-3">
					<div className="space-y-1.5">
						<Label
							htmlFor="stripe-key"
							className="text-xs font-medium uppercase tracking-wider text-[var(--ink-muted)]"
						>
							{configured ? "Remplacer la clé secrète" : "Clé secrète Stripe"}
						</Label>
						<Input
							id="stripe-key"
							type="password"
							value={key}
							onChange={(e) => setKey(e.target.value)}
							placeholder="sk_test_..."
							className="h-11 font-mono text-sm"
							autoComplete="off"
						/>
						<p className="text-xs text-[var(--ink-ghost)]">
							Dashboard Stripe → Développeurs → Clés API → <em>Clé secrète</em>.
							Commence par <code>sk_test_</code> (test) ou <code>sk_live_</code>{" "}
							(réel). Elle est stockée chiffrée et n'est jamais réaffichée.
						</p>
					</div>

					<div className="space-y-1.5">
						<Label
							htmlFor="stripe-currency"
							className="text-xs font-medium uppercase tracking-wider text-[var(--ink-muted)]"
						>
							Devise
						</Label>
						<select
							id="stripe-currency"
							value={currency}
							onChange={(e) => setCurrency(e.target.value)}
							className={cn(
								"w-full h-10 px-3 text-sm rounded-[var(--radius-md)]",
								"border border-[var(--border-strong)] bg-[var(--surface)] text-[var(--ink)]",
								"focus:outline-none focus:ring-2 focus:ring-[var(--brand)]/20",
							)}
						>
							<option value="eur">EUR (€)</option>
							<option value="usd">USD ($)</option>
							<option value="chf">CHF</option>
							<option value="gbp">GBP (£)</option>
						</select>
					</div>

					<Button
						onClick={handleSave}
						disabled={saving || !key.trim()}
						className="h-10"
						style={{ background: "var(--grad-brand)" }}
					>
						{saving ? (
							<Loader2 className="w-4 h-4 animate-spin" />
						) : configured ? (
							"Remplacer la clé"
						) : (
							"Enregistrer et activer"
						)}
					</Button>
				</div>

				<p className="text-xs text-[var(--ink-ghost)] border-t border-[var(--border)] pt-4">
					💡 Commence en <strong>mode test</strong> (<code>sk_test_</code>) pour
					vérifier le parcours sans encaisser d'argent réel. Les liens générés
					n'expirent pas.
				</p>
			</motion.div>
		</div>
	);
}
