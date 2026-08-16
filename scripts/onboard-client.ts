#!/usr/bin/env bun

/**
 * Onboarding d'une instance CLIENT (une base de leads isolée par client).
 *
 * Prérequis (à faire UNE fois) :
 *   - `onboard.config.json` rempli (voir onboard.config.example.json) avec les
 *     identifiants PARTAGÉS : client OAuth Google + compte Resend.
 *
 * Pour CHAQUE client :
 *   1. Cloner le repo dans un nouveau dossier, `bun install`.
 *   2. `bunx convex dev` → crée le Convex du client (base isolée). Ctrl+C une fois
 *      "Convex functions ready". (Écrit CONVEX_URL dans .env.local.)
 *   3. `bun run scripts/onboard-client.ts` (ce script) → configure tout le reste.
 *   4. Suivre les étapes manuelles imprimées à la fin (Vercel, Google, DNS).
 *
 * Idempotent : relançable sans casser une instance déjà configurée.
 */

import { spawnSync } from "node:child_process";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { createInterface } from "node:readline/promises";
import { exportJWK, exportPKCS8, generateKeyPair } from "jose";

const ROOT = process.cwd();
const ENV_PATH = join(ROOT, ".env.local");
const CONFIG_PATH = join(ROOT, "onboard.config.json");

const c = {
	reset: "\x1b[0m",
	bold: "\x1b[1m",
	dim: "\x1b[2m",
	cyan: "\x1b[36m",
	green: "\x1b[32m",
	yellow: "\x1b[33m",
	red: "\x1b[31m",
};
const rl = createInterface({ input: process.stdin, output: process.stdout });
const log = (m: string) => console.log(m);
const header = (t: string) => log(`\n${c.bold}${c.cyan}━━━ ${t} ━━━${c.reset}`);
const ok = (m: string) => log(`${c.green}✓${c.reset} ${m}`);
const info = (m: string) => log(`${c.dim}${m}${c.reset}`);
const warn = (m: string) => log(`${c.yellow}!${c.reset} ${m}`);
function fail(m: string): never {
	log(`${c.red}✗${c.reset} ${m}`);
	process.exit(1);
}
async function ask(q: string): Promise<string> {
	return (await rl.question(`${q}: `)).trim();
}

function parseEnv(content: string): Map<string, string> {
	const out = new Map<string, string>();
	for (const line of content.split("\n")) {
		const t = line.trim();
		if (!t || t.startsWith("#")) continue;
		const eq = t.indexOf("=");
		if (eq === -1) continue;
		let v = t.slice(eq + 1).trim();
		if (
			(v.startsWith('"') && v.endsWith('"')) ||
			(v.startsWith("'") && v.endsWith("'"))
		)
			v = v.slice(1, -1);
		out.set(t.slice(0, eq).trim(), v);
	}
	return out;
}
function serializeEnv(values: Map<string, string>): string {
	const lines = ["# Généré par onboard-client.ts", ""];
	for (const [k, v] of values) {
		const needsQuote = /[\s#"'`$\\]/.test(v);
		lines.push(`${k}=${needsQuote ? `"${v.replaceAll('"', '\\"')}"` : v}`);
	}
	return `${lines.join("\n")}\n`;
}

// Lance une commande convex ; renvoie ok/stdout.
function runConvex(args: string[]): { ok: boolean; stdout: string } {
	const res = spawnSync("bunx", ["convex", ...args], {
		cwd: ROOT,
		stdio: ["inherit", "pipe", "pipe"],
		encoding: "utf-8",
	});
	return { ok: res.status === 0, stdout: res.stdout ?? "" };
}
// "--" = fin des options (la clé PKCS8 commence par "-----BEGIN…").
function setConvexEnv(key: string, value: string) {
	const r = runConvex(["env", "set", key, "--", value]);
	if (!r.ok) warn(`Impossible de poser ${key} sur Convex.`);
	else ok(`Convex env : ${key}`);
}

async function generateAuthKeys() {
	const keys = await generateKeyPair("RS256", { extractable: true });
	const privateKey = await exportPKCS8(keys.privateKey);
	const publicKey = await exportJWK(keys.publicKey);
	return {
		JWT_PRIVATE_KEY: privateKey.trimEnd().replace(/\n/g, " "),
		JWKS: JSON.stringify({ keys: [{ use: "sig", ...publicKey }] }),
	};
}
function randomHex(bytes: number): string {
	const b = new Uint8Array(bytes);
	crypto.getRandomValues(b);
	return Array.from(b, (x) => x.toString(16).padStart(2, "0")).join("");
}

async function main() {
	header("Onboarding client Mycall");

	// 1. Config partagée
	if (!existsSync(CONFIG_PATH)) {
		fail(
			`onboard.config.json manquant. Copie onboard.config.example.json → onboard.config.json et remplis-le.`,
		);
	}
	const cfg = JSON.parse(readFileSync(CONFIG_PATH, "utf-8")) as Record<
		string,
		string
	>;
	for (const k of [
		"GOOGLE_CLIENT_ID",
		"GOOGLE_CLIENT_SECRET",
		"RESEND_API_KEY",
		"RESEND_FROM_EMAIL",
	]) {
		if (!cfg[k] || cfg[k].includes("xxxx"))
			fail(`onboard.config.json : "${k}" non renseigné.`);
	}

	// 2. Convex provisionné ?
	if (!existsSync(ENV_PATH))
		fail(
			"Pas de .env.local — lance d'abord `bunx convex dev` dans ce dossier.",
		);
	const env = parseEnv(readFileSync(ENV_PATH, "utf-8"));
	const cloudUrl = env.get("NEXT_PUBLIC_CONVEX_URL") ?? env.get("CONVEX_URL");
	if (!cloudUrl)
		fail(
			"NEXT_PUBLIC_CONVEX_URL absent — lance `bunx convex dev` (crée le projet Convex) puis relance ce script.",
		);
	const siteUrl = cloudUrl.replace(".convex.cloud", ".convex.site");
	ok(`Convex : ${cloudUrl}`);

	// 3. Params client
	header("Infos client");
	const adminEmail = (await ask("Email admin du client (owner)")).toLowerCase();
	if (!adminEmail.includes("@")) fail("Email invalide.");
	const domain = await ask(
		"Domaine public du client (ex: rdv.client.com) — laisse vide si tu prendras l'URL Vercel plus tard",
	);
	const appBaseUrl = domain
		? `https://${domain.replace(/^https?:\/\//, "").replace(/\/$/, "")}`
		: "";

	// 4. Clés + secrets
	header("Clés & secrets");
	const existingJwt = runConvex(["env", "get", "JWT_PRIVATE_KEY"]);
	if (existingJwt.ok && existingJwt.stdout.trim()) {
		ok("Clés Auth déjà présentes — skip.");
	} else {
		const { JWT_PRIVATE_KEY, JWKS } = await generateAuthKeys();
		setConvexEnv("JWT_PRIVATE_KEY", JWT_PRIVATE_KEY);
		setConvexEnv("JWKS", JWKS);
	}
	const stateSecret = randomHex(32);
	setConvexEnv("GOOGLE_OAUTH_STATE_SECRET", stateSecret);

	// 5. Env partagées + client
	header("Configuration Convex");
	setConvexEnv("GOOGLE_CLIENT_ID", cfg.GOOGLE_CLIENT_ID);
	setConvexEnv("GOOGLE_CLIENT_SECRET", cfg.GOOGLE_CLIENT_SECRET);
	setConvexEnv("RESEND_API_KEY", cfg.RESEND_API_KEY);
	setConvexEnv("RESEND_FROM_EMAIL", cfg.RESEND_FROM_EMAIL);
	setConvexEnv("SIGNUP_ALLOWED_EMAILS", adminEmail);
	if (appBaseUrl) setConvexEnv("APP_BASE_URL", appBaseUrl);

	// 6. .env.local (côté Next)
	env.set("NEXT_PUBLIC_CONVEX_SITE_URL", siteUrl);
	env.set("GOOGLE_CLIENT_ID", cfg.GOOGLE_CLIENT_ID);
	env.set("GOOGLE_OAUTH_STATE_SECRET", stateSecret);
	if (appBaseUrl) env.set("APP_BASE_URL", appBaseUrl);
	writeFileSync(ENV_PATH, serializeEnv(env), "utf-8");
	ok(".env.local mis à jour.");

	// 7. Étapes manuelles restantes
	header("À FAIRE MANUELLEMENT (copie-colle)");
	log(`
${c.bold}1) Google Cloud${c.reset} → Credentials → ton client OAuth → Authorized
   redirect URIs → AJOUTER :
   ${c.cyan}${siteUrl}/google/callback${c.reset}

${c.bold}2) Déployer sur Vercel${c.reset} :
   ${c.dim}bunx vercel link${c.dim}   (nouveau projet, nom en minuscules)${c.reset}
   ${c.dim}bunx vercel --prod${c.reset}
   Puis pose ces 4 variables (Vercel → Settings → Env Variables, Production) :
     NEXT_PUBLIC_CONVEX_URL       = ${cloudUrl}
     NEXT_PUBLIC_CONVEX_SITE_URL  = ${siteUrl}
     GOOGLE_CLIENT_ID             = ${cfg.GOOGLE_CLIENT_ID}
     GOOGLE_OAUTH_STATE_SECRET    = ${stateSecret}
   ${appBaseUrl ? "" : `${c.yellow}(quand tu as l'URL Vercel, lance : bunx convex env set APP_BASE_URL <url>)${c.reset}`}

${c.bold}3) Domaine${c.reset} : dans Vercel → Domains → ajoute ${domain || "<sous-domaine>"} ;
   chez ton registrar (Cloudflare) : CNAME ${domain ? domain.split(".")[0] : "<sous-domaine>"} → cname.vercel-dns.com (DNS only).

${c.bold}4) Le client s'inscrit${c.reset} sur son URL → il est admin de SA base isolée.
`);
	ok("Instance client configurée côté Convex ✅");
	rl.close();
}

main().catch((e) => {
	console.error(e);
	process.exit(1);
});
