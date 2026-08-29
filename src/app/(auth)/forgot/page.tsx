"use client";

import { useAuthActions } from "@convex-dev/auth/react";
import { motion } from "framer-motion";
import { Loader2 } from "lucide-react";
import Image from "next/image";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { BRAND_LOGO_ICON, BRAND_NAME } from "@/lib/brand";

const containerVariants = {
	hidden: { opacity: 0, y: 16, scale: 0.98 },
	visible: {
		opacity: 1,
		y: 0,
		scale: 1,
		transition: {
			duration: 0.15,
			ease: "easeOut" as const,
			staggerChildren: 0.02,
		},
	},
};

const itemVariants = {
	hidden: { opacity: 0, y: 8 },
	visible: {
		opacity: 1,
		y: 0,
		transition: { duration: 0.15, ease: "easeOut" as const },
	},
};

export default function ForgotPasswordPage() {
	const router = useRouter();
	const { signIn } = useAuthActions();

	const [step, setStep] = useState<"request" | "verify">("request");
	const [email, setEmail] = useState("");
	const [code, setCode] = useState("");
	const [newPassword, setNewPassword] = useState("");
	const [error, setError] = useState<string | null>(null);
	const [isPending, startTransition] = useTransition();

	function handleRequest(e: React.FormEvent) {
		e.preventDefault();
		setError(null);
		startTransition(async () => {
			try {
				await signIn("password", {
					email: email.trim().toLowerCase(),
					flow: "reset",
				});
				setStep("verify");
			} catch {
				// Message générique — ne pas révéler si l'email existe (anti-énumération)
				setStep("verify");
			}
		});
	}

	function handleVerify(e: React.FormEvent) {
		e.preventDefault();
		setError(null);
		startTransition(async () => {
			try {
				await signIn("password", {
					email: email.trim().toLowerCase(),
					code: code.trim(),
					newPassword,
					flow: "reset-verification",
				});
				router.push("/dashboard");
				router.refresh();
			} catch (err) {
				setError(
					err instanceof Error
						? "Code invalide ou expiré, ou mot de passe trop faible."
						: "Une erreur est survenue.",
				);
			}
		});
	}

	return (
		<motion.div
			className="mx-auto w-full max-w-md"
			variants={containerVariants}
			initial="hidden"
			animate="visible"
		>
			<div className="card-premium p-8 shadow-[var(--shadow-float)]">
				<motion.div
					variants={itemVariants}
					className="mb-6 flex flex-col items-center gap-3"
				>
					<Image
						src={BRAND_LOGO_ICON}
						alt={BRAND_NAME}
						width={64}
						height={64}
						priority
						className="h-14 w-14 object-contain"
					/>
					<span
						className="font-display text-2xl font-semibold tracking-tight text-[var(--ink)]"
						style={{ fontFamily: "var(--font-display)" }}
					>
						{BRAND_NAME}
					</span>
					<p className="text-sm text-[var(--ink-muted)]">
						{step === "request"
							? "Mot de passe oublié"
							: "Vérifiez votre email"}
					</p>
				</motion.div>

				{step === "request" ? (
					<motion.form
						variants={itemVariants}
						onSubmit={handleRequest}
						className="space-y-3"
					>
						<p className="text-sm text-[var(--ink-muted)]">
							Entrez votre email : on vous envoie un code de réinitialisation.
						</p>
						<Input
							type="email"
							placeholder="email@exemple.com"
							value={email}
							onChange={(e) => setEmail(e.target.value)}
							required
							className="h-11"
							autoComplete="email"
						/>
						<Button
							type="submit"
							className="w-full h-11 bg-[var(--brand)] hover:bg-[var(--brand-bright)] text-white font-medium"
							disabled={isPending || !email}
						>
							{isPending ? (
								<Loader2 className="size-4 animate-spin" />
							) : (
								"Envoyer le code"
							)}
						</Button>
					</motion.form>
				) : (
					<motion.form
						variants={itemVariants}
						onSubmit={handleVerify}
						className="space-y-3"
					>
						<p className="text-sm text-[var(--ink-muted)]">
							Si un compte existe pour <strong>{email}</strong>, un code vient
							d'être envoyé. Saisissez-le avec votre nouveau mot de passe.
						</p>
						<Input
							type="text"
							inputMode="numeric"
							placeholder="Code à 6 chiffres"
							value={code}
							onChange={(e) => setCode(e.target.value)}
							required
							className="h-11 tracking-widest"
							autoComplete="one-time-code"
						/>
						<Input
							type="password"
							placeholder="Nouveau mot de passe"
							value={newPassword}
							onChange={(e) => setNewPassword(e.target.value)}
							required
							className="h-11"
							autoComplete="new-password"
						/>

						{error ? (
							<p
								className="rounded-lg bg-[color-mix(in_oklab,var(--destructive)_8%,transparent)] border border-[color-mix(in_oklab,var(--destructive)_25%,transparent)] px-3 py-2 text-sm text-[var(--destructive)]"
								role="alert"
							>
								{error}
							</p>
						) : null}

						<Button
							type="submit"
							className="w-full h-11 bg-[var(--brand)] hover:bg-[var(--brand-bright)] text-white font-medium"
							disabled={isPending || !code || !newPassword}
						>
							{isPending ? (
								<Loader2 className="size-4 animate-spin" />
							) : (
								"Réinitialiser le mot de passe"
							)}
						</Button>
						<button
							type="button"
							onClick={() => {
								setStep("request");
								setError(null);
							}}
							className="w-full text-center text-xs text-[var(--ink-muted)] hover:text-[var(--ink)] transition-colors"
						>
							← Changer d'email
						</button>
					</motion.form>
				)}

				<motion.p
					variants={itemVariants}
					className="mt-5 text-center text-sm text-[var(--ink-muted)]"
				>
					<a
						href="/login"
						className="text-[var(--brand)] font-medium hover:text-[var(--brand-bright)] transition-colors"
					>
						Retour à la connexion
					</a>
				</motion.p>
			</div>
		</motion.div>
	);
}
