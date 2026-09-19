"use client";

import { useMutation, useQuery } from "convex/react";
import { motion } from "framer-motion";
import { ImageUp, Loader2, Palette, Trash2 } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { api } from "@/../convex/_generated/api";
import type { Id } from "@/../convex/_generated/dataModel";
import { errorText } from "@/components/settings/email-provider-card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

const FALLBACK_COLOR = "#192A3B";
const ACCEPTED = "image/png,image/jpeg,image/gif,image/webp";

// Contraste avec le texte blanc des boutons — même calcul que le serveur,
// pour prévenir avant l'enregistrement.
function contrastWithWhite(hex: string): number | null {
	const m = /^#?([0-9a-f]{6})$/i.exec(hex.trim());
	if (!m) return null;
	const n = Number.parseInt(m[1], 16);
	const channel = (c: number) => {
		const s = c / 255;
		return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
	};
	const lum =
		0.2126 * channel((n >> 16) & 255) +
		0.7152 * channel((n >> 8) & 255) +
		0.0722 * channel(n & 255);
	return 1.05 / (lum + 0.05);
}

export function EmailBrandingCard() {
	const branding = useQuery(api.emailBranding.getBranding, {});
	const generateUploadUrl = useMutation(
		api.emailBranding.generateLogoUploadUrl,
	);
	const setLogo = useMutation(api.emailBranding.setLogo);
	const removeLogo = useMutation(api.emailBranding.removeLogo);
	const saveBranding = useMutation(api.emailBranding.saveBranding);

	const defaultColor = branding?.defaultColor ?? FALLBACK_COLOR;
	const [color, setColor] = useState(FALLBACK_COLOR);
	const [tagline, setTagline] = useState("");
	const [busy, setBusy] = useState<string | null>(null);
	const fileRef = useRef<HTMLInputElement>(null);

	useEffect(() => {
		if (!branding) return;
		setColor(branding.color ?? branding.defaultColor);
		setTagline(branding.tagline ?? "");
	}, [branding]);

	const contrast = contrastWithWhite(color);
	const tooLight = contrast !== null && contrast < 3;
	const dirty =
		branding !== undefined &&
		(color !== (branding.color ?? defaultColor) ||
			tagline !== (branding.tagline ?? ""));

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

	const handleFile = (file: File | undefined) => {
		if (!file) return;
		run("logo", async () => {
			if (file.size > 1_000_000)
				throw new Error("Logo trop lourd : 1 Mo maximum.");
			const url = await generateUploadUrl({});
			const res = await fetch(url, {
				method: "POST",
				headers: { "Content-Type": file.type },
				body: file,
			});
			if (!res.ok) throw new Error("L'envoi du logo a échoué.");
			const { storageId } = (await res.json()) as {
				storageId: Id<"_storage">;
			};
			await setLogo({ storageId });
			toast.success("Logo enregistré");
		}).finally(() => {
			if (fileRef.current) fileRef.current.value = "";
		});
	};

	return (
		<motion.div
			initial={{ opacity: 0, y: 8 }}
			animate={{ opacity: 1, y: 0 }}
			transition={{ duration: 0.15 }}
			className="card-premium space-y-5 mb-6"
		>
			<div className="flex items-start gap-3">
				<div className="w-10 h-10 rounded-[var(--radius-sm)] bg-[var(--brand-soft)] ring-1 ring-[var(--brand-glow)] flex items-center justify-center shrink-0">
					<Palette className="w-5 h-5 text-[var(--brand)]" strokeWidth={1.75} />
				</div>
				<div className="flex-1 min-w-0">
					<h2 className="text-base font-semibold font-[family-name:var(--font-display)] text-[var(--ink)]">
						Apparence des emails
					</h2>
					<p className="text-sm text-[var(--ink-muted)] mt-0.5">
						Ton logo en tête, ta couleur sur les boutons et les liens. Appliqué
						à tous les emails : prospects, équipe et séquences.
					</p>
				</div>
			</div>

			{branding === undefined ? (
				<p className="text-sm text-[var(--ink-ghost)]">Chargement…</p>
			) : (
				<div className="grid md:grid-cols-3 gap-5">
					{/* Logo */}
					<div className="space-y-2">
						<Label>Logo</Label>
						<div className="h-24 rounded-[var(--radius-md)] border border-dashed border-[var(--border)] bg-white flex items-center justify-center p-3">
							{branding.logoUrl ? (
								// biome-ignore lint/performance/noImgElement: aperçu d'une image stockée dans Convex, hors optimisation Next
								<img
									src={branding.logoUrl}
									alt="Logo"
									className="max-h-16 max-w-full object-contain"
								/>
							) : (
								<span
									className="text-lg font-extrabold tracking-tight"
									style={{ color }}
								>
									{branding.name}
								</span>
							)}
						</div>
						<input
							ref={fileRef}
							type="file"
							accept={ACCEPTED}
							className="hidden"
							onChange={(e) => handleFile(e.target.files?.[0])}
						/>
						<div className="flex gap-2">
							<Button
								variant="outline"
								size="sm"
								disabled={busy !== null}
								onClick={() => fileRef.current?.click()}
								className="gap-1.5"
							>
								{busy === "logo" ? (
									<Loader2 className="w-3.5 h-3.5 animate-spin" />
								) : (
									<ImageUp className="w-3.5 h-3.5" />
								)}
								{branding.logoUrl ? "Changer" : "Ajouter un logo"}
							</Button>
							{branding.logoUrl && (
								<Button
									variant="ghost"
									size="sm"
									disabled={busy !== null}
									onClick={() =>
										run("remove", async () => {
											await removeLogo({});
											toast.success("Logo retiré");
										})
									}
									aria-label="Retirer le logo"
									className="text-[var(--destructive)] hover:text-[var(--destructive)] hover:bg-[var(--destructive-soft)]"
								>
									<Trash2 className="w-3.5 h-3.5" />
								</Button>
							)}
						</div>
						<p className="text-xs text-[var(--ink-ghost)]">
							PNG, JPG ou WebP, 1 Mo max. Idéalement horizontal, sur fond
							transparent ou blanc. Sans logo, le nom s'affiche.
						</p>
					</div>

					{/* Couleur */}
					<div className="space-y-2">
						<Label htmlFor="brand-color">Couleur principale</Label>
						<div className="flex items-center gap-2">
							<input
								type="color"
								value={/^#[0-9a-f]{6}$/i.test(color) ? color : defaultColor}
								onChange={(e) => setColor(e.target.value.toUpperCase())}
								className="h-10 w-12 rounded-[var(--radius-sm)] border border-[var(--border)] cursor-pointer bg-transparent"
								aria-label="Choisir la couleur"
							/>
							<Input
								id="brand-color"
								value={color}
								onChange={(e) => setColor(e.target.value)}
								className="h-10 font-mono text-sm"
							/>
						</div>
						<div
							className="rounded-[var(--radius-md)] px-4 py-2.5 text-sm font-semibold text-white text-center"
							style={{
								background: /^#[0-9a-f]{6}$/i.test(color)
									? color
									: defaultColor,
							}}
						>
							Aperçu d'un bouton
						</div>
						{tooLight && (
							<p className="text-xs text-[var(--destructive)]">
								Trop claire : le texte blanc des boutons serait illisible.
							</p>
						)}
					</div>

					{/* Signature */}
					<div className="space-y-2">
						<Label htmlFor="brand-tagline">Signature de pied de page</Label>
						<Input
							id="brand-tagline"
							value={tagline}
							onChange={(e) => setTagline(e.target.value)}
							placeholder="Ex. Coaching pour infirmiers libéraux"
							maxLength={120}
							className="h-10 text-sm"
						/>
						<p className="text-xs text-[var(--ink-ghost)]">
							Affichée sous le nom, en bas de chaque email. Facultatif.
						</p>
					</div>
				</div>
			)}

			<div className="flex gap-2">
				<Button
					disabled={busy !== null || !dirty || tooLight}
					onClick={() =>
						run("save", async () => {
							await saveBranding({
								color: color.toUpperCase() === defaultColor ? null : color,
								tagline: tagline.trim() || null,
							});
							toast.success(
								"Apparence enregistrée — l'aperçu ci-dessous est à jour",
							);
						})
					}
					style={{ background: "var(--grad-brand)" }}
				>
					{busy === "save" && <Loader2 className="w-4 h-4 animate-spin" />}
					Enregistrer
				</Button>
			</div>
		</motion.div>
	);
}
