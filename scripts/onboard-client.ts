#!/usr/bin/env bun

/**
 * Configure la base Convex d'une nouvelle instance client, puis la vérifie.
 *
 *   bun run onboard clients/<client>.json            configure (idempotent)
 *   bun run onboard clients/<client>.json --dry-run  montre sans rien écrire
 *   bun run onboard clients/<client>.json --check    vérifie une instance en ligne
 *
 * Aucun dossier local par client : le code est déployé par GitHub → Vercel, et
 * ce script ne touche qu'à la base de PRODUCTION du client, désignée par son URL.
 *
 * Ce qu'il fait à ta place — et qui a déjà coûté des heures quand c'était fait
 * à la main :
 *   - génère les clés d'authentification propres à l'instance
 *   - pose SITE_URL (sans elle, « mot de passe oublié » plante)
 *   - pose la marque des emails
 *   - reprend l'identifiant Google et le secret partagés depuis Mycall
 *   - vérifie que chaque variable est bien posée
 *   - imprime les valeurs Vercel et l'adresse de retour Google à ajouter
 *
 * Stripe n'y apparaît pas : un client qui en veut le configure lui-même dans
 * l'application. Sa clé ne passe jamais par nous.
 */

import { spawnSync } from "node:child_process";
import { randomBytes } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";
import { exportJWK, exportPKCS8, generateKeyPair } from "jose";

// La base de production de Mycall. On y lit les identifiants partagés (Google,
// Resend) en la nommant, sans dépendre du projet auquel ce dossier est lié ; et
// le script refuse d'y écrire : une faute de frappe dans un fichier client ne
// doit jamais pouvoir écraser l'instance principale.
const MYCALL = "healthy-capybara-234";

const c = {
	r: "\x1b[0m",
	b: "\x1b[1m",
	d: "\x1b[2m",
	cy: "\x1b[36m",
	g: "\x1b[32m",
	y: "\x1b[33m",
	red: "\x1b[31m",
};
const log = (m = "") => console.log(m);
const title = (t: string) => log(`\n${c.b}${c.cy}━━ ${t} ━━${c.r}`);
const ok = (m: string) => log(`  ${c.g}✓${c.r} ${m}`);
const ko = (m: string) => log(`  ${c.red}✗${c.r} ${m}`);
const hint = (m: string) => log(`    ${c.d}→ ${m}${c.r}`);
function die(m: string): never {
	log(`\n${c.red}✗ ${m}${c.r}\n`);
	process.exit(1);
}

// ── Fichier client ──────────────────────────────────────────────────────────

interface ClientConfig {
	name: string; // nom affiché : application, emails, onglet
	convexUrl: string; // copié tel quel depuis le tableau de bord Convex
	domain: string; // rdv.client.com
	adminEmail: string; // seul email autorisé à créer le premier compte
	fromEmail: string; // "Nom <rdv@client.com>" — domaine vérifié dans Resend
	brandColor?: string; // défaut : marine Mycall
	tagline?: string; // aucun slogan si absent
	// true si le client a son propre compte Resend. Sa clé ne s'écrit jamais
	// dans ce fichier (il est versionné) : elle se colle à la main dans Convex.
	// Par défaut, ton compte Resend — un compte, plusieurs domaines.
	ownResend?: boolean;
}

const args = process.argv.slice(2);
const file = args.find((a) => !a.startsWith("--"));
const dryRun = args.includes("--dry-run");
const checkOnly = args.includes("--check");

if (!file)
	die("Usage : bun run onboard clients/<client>.json [--dry-run | --check]");
if (!existsSync(file)) die(`Fichier introuvable : ${file}`);

const cfg = JSON.parse(readFileSync(file, "utf-8")) as ClientConfig;
for (const k of [
	"name",
	"convexUrl",
	"domain",
	"adminEmail",
	"fromEmail",
] as const) {
	if (!cfg[k] || String(cfg[k]).includes("xxx"))
		die(`${file} : « ${k} » non renseigné.`);
}

// L'URL copiée depuis le tableau de bord porte déjà la région éventuelle
// (…eu-west-1.convex.cloud). Tout en dérive — rien n'est reconstruit à la main,
// c'est ce qui a fait croire deux fois à une panne.
const convexUrl = cfg.convexUrl.trim().replace(/\/$/, "");
if (!/^https:\/\/[a-z0-9-]+(\.[a-z0-9-]+)*\.convex\.cloud$/.test(convexUrl)) {
	die(
		`convexUrl doit ressembler à https://nom-123.convex.cloud — reçu : ${convexUrl}`,
	);
}
const siteUrl = convexUrl.replace(/\.convex\.cloud$/, ".convex.site");
const deployment = new URL(convexUrl).hostname.split(".")[0];
const domain = cfg.domain.replace(/^https?:\/\//, "").replace(/\/$/, "");
const appUrl = `https://${domain}`;
const adminEmail = cfg.adminEmail.trim().toLowerCase();
const redirectUri = `${siteUrl}/google/callback`;

if (deployment === MYCALL) {
	die(`${deployment} est la base de Mycall. Vérifie convexUrl dans ${file}.`);
}

// ── Accès Convex ────────────────────────────────────────────────────────────

// La CLI est lancée directement par Bun, sans shell : sous Windows, passer par
// cmd.exe découpait les valeurs contenant des espaces (la clé privée, le nom
// du business) et interprétait les < > de l'adresse d'envoi comme des
// redirections.
function convex(argv: string[]): { ok: boolean; out: string } {
	const r = spawnSync(
		process.execPath,
		["node_modules/convex/bin/main.js", ...argv],
		{ encoding: "utf-8", stdio: ["ignore", "pipe", "pipe"] },
	);
	return { ok: r.status === 0, out: (r.stdout ?? "").trim() };
}

// Valeur sur la base du client (null si absente).
function getTarget(key: string): string | null {
	const r = convex(["env", "get", "--deployment", deployment, key]);
	return r.ok && r.out && !r.out.includes("not found") ? r.out : null;
}

// Valeur partagée, lue sur la production de Mycall.
function getShared(key: string): string {
	const r = convex(["env", "get", "--deployment", MYCALL, key]);
	if (!r.ok || !r.out)
		die(`Impossible de lire ${key} sur Mycall. Es-tu connecté à Convex ?`);
	return r.out;
}

// "--" : la clé privée commence par "-----BEGIN", la CLI la prendrait pour une
// option. Oublier ce séparateur fait échouer JWT_PRIVATE_KEY, et seulement elle.
function setTarget(key: string, value: string) {
	if (dryRun) {
		ok(`${key} ${c.d}(simulation)${c.r}`);
		return;
	}
	const r = convex([
		"env",
		"set",
		"--deployment",
		deployment,
		"--",
		key,
		value,
	]);
	if (r.ok) ok(key);
	else ko(`${key} — échec de l'écriture`);
}

async function authKeys() {
	const kp = await generateKeyPair("RS256", { extractable: true });
	const pem = await exportPKCS8(kp.privateKey);
	const jwk = await exportJWK(kp.publicKey);
	return {
		// Format attendu par Convex Auth : une seule ligne, retours remplacés
		// par des espaces.
		JWT_PRIVATE_KEY: pem.trimEnd().replace(/\n/g, " "),
		JWKS: JSON.stringify({ keys: [{ use: "sig", ...jwk }] }),
	};
}

// ── Mode vérification ───────────────────────────────────────────────────────

async function check(): Promise<number> {
	title(`Vérification — ${cfg.name}`);
	let failures = 0;
	const pass = (label: string, cond: boolean, fix: string) => {
		if (cond) ok(label);
		else {
			ko(label);
			hint(fix);
			failures++;
		}
	};

	const REQUIRED = [
		"JWT_PRIVATE_KEY",
		"JWKS",
		"GOOGLE_CLIENT_ID",
		"GOOGLE_CLIENT_SECRET",
		"GOOGLE_OAUTH_STATE_SECRET",
		"RESEND_API_KEY",
		"RESEND_FROM_EMAIL",
		"SIGNUP_ALLOWED_EMAILS",
		"APP_BASE_URL",
		"SITE_URL",
		"BRAND_NAME",
	];
	const listed = convex(["env", "list", "--deployment", deployment]).out;
	const missing = REQUIRED.filter((k) => !listed.includes(`${k}=`));
	pass(
		"Variables Convex complètes",
		missing.length === 0,
		`manquantes : ${missing.join(", ")} — relance sans --check`,
	);

	const login = await fetch(`${appUrl}/login`).catch(() => null);
	const html = login ? await login.text() : "";
	pass(
		`${appUrl}/login répond 200`,
		login?.status === 200,
		"domaine pas encore actif, CNAME absent ou en Proxied (doit être DNS only)",
	);
	pass(
		`Marque affichée : « ${cfg.name} »`,
		html.includes(cfg.name.replace(/'/g, "&#x27;")) || html.includes(cfg.name),
		"NEXT_PUBLIC_BRAND_NAME absente ou pas redéployée sur Vercel",
	);

	const health = await fetch(`${appUrl}/api/health`)
		.then((r) => r.text())
		.catch(() => "");
	pass(
		"Base joignable depuis le site",
		health.includes('"convex":"ok"'),
		"NEXT_PUBLIC_CONVEX_URL absente sur Vercel (nécessaire à l'exécution, pas seulement au build)",
	);

	const stripe = await fetch(`${siteUrl}/webhooks/stripe`, {
		method: "POST",
		body: "{}",
	}).catch(() => null);
	pass(
		"Fonctions déployées sur la bonne base",
		stripe?.status === 400,
		"clé de déploiement Preview au lieu de Production ? (journal de build : l'URL doit être [REDACTED])",
	);

	const cb = await fetch(`${siteUrl}/google/callback`, {
		redirect: "manual",
	}).catch(() => null);
	const loc = cb?.headers.get("location") ?? "";
	pass(
		"Retour Google renvoie vers le domaine du client",
		cb?.status === 302 && loc.startsWith(appUrl),
		`APP_BASE_URL incorrecte (renvoie vers ${loc || "rien"})`,
	);

	const clientId = getShared("GOOGLE_CLIENT_ID");
	const probe = await fetch(
		`https://accounts.google.com/o/oauth2/v2/auth?${new URLSearchParams({
			client_id: clientId,
			redirect_uri: redirectUri,
			response_type: "code",
			scope: "https://www.googleapis.com/auth/calendar",
		})}`,
	)
		.then((r) => r.text())
		.catch(() => "");
	pass(
		"Google accepte l'adresse de retour",
		probe.length > 0 && !probe.includes("redirect_uri_mismatch"),
		`ajoute dans Google Cloud → Credentials → Authorized redirect URIs :\n      ${redirectUri}`,
	);

	log(
		failures === 0
			? `\n${c.g}${c.b}Instance prête à livrer.${c.r}\n`
			: `\n${c.red}${failures} point(s) à corriger avant de livrer.${c.r}\n`,
	);
	return failures;
}

// ── Mode configuration ──────────────────────────────────────────────────────

async function configure() {
	title(`Configuration — ${cfg.name}`);
	log(`  base      ${c.cy}${deployment}${c.r}`);
	log(`  domaine   ${c.cy}${appUrl}${c.r}`);
	log(`  admin     ${c.cy}${adminEmail}${c.r}`);
	if (dryRun) log(`  ${c.y}simulation : rien ne sera écrit${c.r}`);

	// Une base neuve n'a encore aucune fonction : on s'assure au moins qu'elle
	// existe et qu'on y a accès avant d'écrire quoi que ce soit.
	const probe = convex(["env", "list", "--deployment", deployment]);
	if (!probe.ok) {
		die(
			`Base ${deployment} inaccessible. Elle doit exister dans ton équipe Convex (Production du projet du client).`,
		);
	}

	title("Clés d'authentification");
	// Jamais réécrites si elles existent : les changer déconnecterait tous les
	// utilisateurs de l'instance.
	if (getTarget("JWT_PRIVATE_KEY") && getTarget("JWKS")) {
		ok("déjà présentes — conservées");
	} else {
		const k = await authKeys();
		setTarget("JWT_PRIVATE_KEY", k.JWT_PRIVATE_KEY);
		setTarget("JWKS", k.JWKS);
	}

	// Même valeur côté Convex et côté Vercel : on garde l'existante si elle est
	// là, sinon Vercel et Convex divergeraient au deuxième passage.
	const stateSecret =
		getTarget("GOOGLE_OAUTH_STATE_SECRET") ?? randomBytes(32).toString("hex");

	title("Variables");
	setTarget("GOOGLE_OAUTH_STATE_SECRET", stateSecret);
	setTarget("GOOGLE_CLIENT_ID", getShared("GOOGLE_CLIENT_ID"));
	setTarget("GOOGLE_CLIENT_SECRET", getShared("GOOGLE_CLIENT_SECRET"));
	if (cfg.ownResend) {
		if (getTarget("RESEND_API_KEY"))
			ok("RESEND_API_KEY — celle du client, déjà posée");
		else {
			ko("RESEND_API_KEY — à coller toi-même");
			hint(
				`dashboard.convex.dev/d/${deployment}/settings/environment-variables`,
			);
		}
	} else {
		setTarget("RESEND_API_KEY", getShared("RESEND_API_KEY"));
	}
	setTarget("RESEND_FROM_EMAIL", cfg.fromEmail);
	setTarget("SIGNUP_ALLOWED_EMAILS", adminEmail);
	setTarget("APP_BASE_URL", appUrl);
	// Lue directement par la bibliothèque d'authentification : sans elle, le
	// lien de réinitialisation de mot de passe ne peut pas être construit.
	setTarget("SITE_URL", appUrl);
	setTarget("BRAND_NAME", cfg.name);
	setTarget("BRAND_COLOR", cfg.brandColor ?? "#192A3B");
	if (cfg.tagline) setTarget("BRAND_TAGLINE", cfg.tagline);

	const clientId = getShared("GOOGLE_CLIENT_ID");

	title(
		"À coller dans Vercel — projet du client → Settings → Environments → Production",
	);
	const vercel: [string, string][] = [
		[
			"CONVEX_DEPLOY_KEY",
			"(la clé de PRODUCTION générée dans Convex — à coller toi-même)",
		],
		["NEXT_PUBLIC_CONVEX_URL", convexUrl],
		["NEXT_PUBLIC_CONVEX_SITE_URL", siteUrl],
		["NEXT_PUBLIC_APP_URL", appUrl],
		["NEXT_PUBLIC_BRAND_NAME", cfg.name],
		["GOOGLE_CLIENT_ID", clientId],
		["GOOGLE_OAUTH_STATE_SECRET", stateSecret],
	];
	for (const [k, v] of vercel) log(`  ${c.b}${k.padEnd(28)}${c.r} ${v}`);

	title("À ajouter dans Google Cloud → Credentials → Authorized redirect URIs");
	log(`  ${c.cy}${redirectUri}${c.r}`);

	log(
		`\n${c.d}Une fois Vercel déployé et le domaine actif :${c.r}\n  ${c.b}bun run onboard ${file} --check${c.r}\n`,
	);
}

if (checkOnly) {
	process.exit((await check()) === 0 ? 0 : 1);
} else {
	await configure();
}
