"use client";

import { useEffect } from "react";

/**
 * /reset — force-clear côté client + appel /api/auth/clear pour vider
 * les cookies HttpOnly côté serveur, puis redirige sur /login.
 */
export default function ResetPage() {
	useEffect(() => {
		(async () => {
			try {
				Object.keys(localStorage).forEach((k) => {
					if (
						k.includes("convex") ||
						k.includes("auth") ||
						k.startsWith("iclone")
					) {
						localStorage.removeItem(k);
					}
				});
				sessionStorage.clear();
				document.cookie.split(";").forEach((c) => {
					const eq = c.indexOf("=");
					const name = (eq > -1 ? c.substring(0, eq) : c).trim();
					document.cookie = `${name}=; expires=Thu, 01 Jan 1970 00:00:00 GMT; path=/`;
				});
				// Call server endpoint to delete HttpOnly cookies
				await fetch("/api/auth/clear", { method: "POST" });
			} catch (e) {
				console.warn("Reset error:", e);
			}
			setTimeout(() => {
				window.location.href = "/login";
			}, 200);
		})();
	}, []);

	return (
		<main className="flex min-h-screen items-center justify-center">
			<div className="text-center">
				<p className="font-display text-lg">Réinitialisation de la session…</p>
				<p className="mt-2 text-sm opacity-60">Redirection vers /login</p>
			</div>
		</main>
	);
}
