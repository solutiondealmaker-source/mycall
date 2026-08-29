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

export default function LoginPage() {
	const router = useRouter();
	const { signIn } = useAuthActions();

	const [email, setEmail] = useState("");
	const [password, setPassword] = useState("");
	const [error, setError] = useState<string | null>(null);
	const [isPending, startTransition] = useTransition();

	function handleEmailSignIn(e: React.FormEvent) {
		e.preventDefault();
		setError(null);
		startTransition(async () => {
			try {
				await signIn("password", {
					email: email.trim().toLowerCase(),
					password,
					flow: "signIn",
				});
				router.push("/dashboard");
				router.refresh();
			} catch (err) {
				setError(
					err instanceof Error ? err.message : "Identifiants incorrects",
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
					<p className="text-sm text-[var(--ink-muted)]">Se connecter</p>
				</motion.div>

				<motion.form
					variants={itemVariants}
					onSubmit={handleEmailSignIn}
					className="space-y-3"
				>
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
						placeholder="Mot de passe"
						value={password}
						onChange={(e) => setPassword(e.target.value)}
						required
						className="h-11"
						autoComplete="current-password"
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
						disabled={isPending || !email || !password}
					>
						{isPending ? (
							<Loader2 className="size-4 animate-spin" />
						) : (
							"Se connecter"
						)}
					</Button>
				</motion.form>

				<motion.p variants={itemVariants} className="mt-4 text-center">
					<a
						href="/forgot"
						className="text-sm text-[var(--ink-muted)] hover:text-[var(--brand)] transition-colors"
					>
						Mot de passe oublié ?
					</a>
				</motion.p>

				<motion.p
					variants={itemVariants}
					className="mt-2 text-center text-sm text-[var(--ink-muted)]"
				>
					Pas encore de compte ?{" "}
					<a
						href="/signup"
						className="text-[var(--brand)] font-medium hover:text-[var(--brand-bright)] transition-colors"
					>
						Créer un compte
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
