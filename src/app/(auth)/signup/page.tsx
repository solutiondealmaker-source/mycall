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

export default function SignupPage() {
	const router = useRouter();
	const { signIn } = useAuthActions();

	const [name, setName] = useState("");
	const [email, setEmail] = useState("");
	const [password, setPassword] = useState("");
	const [error, setError] = useState<string | null>(null);
	const [isPending, startTransition] = useTransition();

	function handleEmailSignUp(e: React.FormEvent) {
		e.preventDefault();
		setError(null);
		startTransition(async () => {
			try {
				await signIn("password", {
					email: email.trim().toLowerCase(),
					password,
					name: name.trim() || email.split("@")[0],
					flow: "signUp",
				});
				router.push("/dashboard");
				router.refresh();
			} catch (err) {
				setError(
					err instanceof Error ? err.message : "Impossible de créer le compte",
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
					<p className="text-sm text-[var(--ink-muted)]">Créer un compte</p>
				</motion.div>

				<motion.form
					variants={itemVariants}
					onSubmit={handleEmailSignUp}
					className="space-y-3"
				>
					<Input
						type="text"
						placeholder="Nom complet"
						value={name}
						onChange={(e) => setName(e.target.value)}
						className="h-11"
						autoComplete="name"
					/>
					<Input
						type="email"
						placeholder="email@exemple.com"
						value={email}
						onChange={(e) => setEmail(e.target.value)}
						required
						className="h-11"
						autoComplete="email"
					/>
					<Input
						type="password"
						placeholder="Mot de passe (8 caractères min.)"
						value={password}
						onChange={(e) => setPassword(e.target.value)}
						required
						minLength={8}
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
						disabled={isPending || !email || password.length < 8}
					>
						{isPending ? (
							<Loader2 className="size-4 animate-spin" />
						) : (
							"Créer mon compte"
						)}
					</Button>
				</motion.form>

				<motion.p
					variants={itemVariants}
					className="mt-5 text-center text-sm text-[var(--ink-muted)]"
				>
					Déjà un compte ?{" "}
					<a
						href="/login"
						className="text-[var(--brand)] font-medium hover:text-[var(--brand-bright)] transition-colors"
					>
						Se connecter
					</a>
				</motion.p>
			</div>

			<motion.p
				variants={itemVariants}
				className="mt-6 text-center text-xs text-[var(--ink-ghost)]"
			>
				Propulsé par {BRAND_NAME}
			</motion.p>
		</motion.div>
	);
}
