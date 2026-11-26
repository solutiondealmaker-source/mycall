// atlas-key.ts — crée une clé d'API dans l'instance d'un client et affiche le
// couple adresse + clé, prêt à transmettre à l'outil externe.
//
//   bun run atlas-key ton-coach-idel
//   bun run atlas-key ton-coach-idel --nom "Atlas"
//
// Chaque client Mycall a sa propre base : il n'existe pas de clé globale, et
// c'est cette séparation qui protège les clients les uns des autres. Brancher
// un outil externe sur un nouveau client revient donc à créer une clé chez
// lui. Cette commande évite d'avoir à se connecter à son interface.

import { spawnSync } from "node:child_process";
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";

const CLIENTS_DIR = join(process.cwd(), "clients");
const c = {
	r: "\x1b[0m",
	b: "\x1b[1m",
	d: "\x1b[2m",
	g: "\x1b[32m",
	y: "\x1b[33m",
	red: "\x1b[31m",
	cy: "\x1b[36m",
};

interface Instance {
	slug: string;
	name: string;
	deployment: string;
}

function die(msg: string): never {
	console.error(`${c.red}✗ ${msg}${c.r}`);
	process.exit(1);
}

function deploymentFromUrl(url: string): string | null {
	return /^https:\/\/([^.]+)\./.exec(url.trim())?.[1] ?? null;
}

function loadInstances(): Instance[] {
	const out: Instance[] = [];
	for (const file of readdirSync(CLIENTS_DIR)) {
		if (!file.endsWith(".json") || file === "exemple.json") continue;
		const raw = JSON.parse(readFileSync(join(CLIENTS_DIR, file), "utf-8"));
		if (file === "instances.json") {
			for (const i of raw as Instance[]) out.push(i);
			continue;
		}
		const deployment = deploymentFromUrl(raw.convexUrl ?? "");
		if (deployment) {
			out.push({
				slug: file.replace(/\.json$/, ""),
				name: raw.name,
				deployment,
			});
		}
	}
	return out.sort((a, b) => a.name.localeCompare(b.name));
}

function convex(argv: string[]): string {
	const r = spawnSync(
		process.execPath,
		[join("node_modules", "convex", "bin", "main.js"), ...argv],
		{ encoding: "utf-8", stdio: ["ignore", "pipe", "pipe"] },
	);
	if (r.status !== 0) {
		throw new Error((r.stderr || r.stdout || "").trim().split("\n")[0]);
	}
	return (r.stdout ?? "").trim();
}

// L'adresse publique d'une base porte parfois sa région, parfois non : on
// interroge les deux formes et on garde celle qui répond.
async function apiUrl(deployment: string): Promise<string> {
	for (const base of [
		`https://${deployment}.convex.site`,
		`https://${deployment}.eu-west-1.convex.site`,
	]) {
		try {
			const res = await fetch(`${base}/api/v1/me`, {
				signal: AbortSignal.timeout(10_000),
			});
			// 401 = la route existe et réclame une clé : c'est la bonne adresse.
			if (res.status === 401) return `${base}/api/v1`;
		} catch {
			// Adresse suivante.
		}
	}
	throw new Error(`aucune adresse d'API ne répond pour ${deployment}`);
}

function adminOf(deployment: string): string {
	const rows = convex([
		"data",
		"users",
		"--deployment",
		deployment,
		"--limit",
		"100",
		"--format",
		"jsonl",
	]);
	const users = rows
		.split("\n")
		.filter((l) => l.trim().startsWith("{"))
		.map((l) => JSON.parse(l));
	const admin = users.find(
		(u) => u.isAdmin === true || u.role === "admin" || u.role === "ceo",
	);
	if (!admin) {
		throw new Error(
			`aucun compte administrateur dans ${deployment} : le client doit d'abord créer le sien`,
		);
	}
	return admin._id as string;
}

const args = process.argv.slice(2);
const target = args.find((a) => !a.startsWith("--"));
const nameFlag = args.indexOf("--nom");
const keyName = nameFlag >= 0 ? (args[nameFlag + 1] ?? "Atlas") : "Atlas";

const instances = loadInstances();
if (!target) {
	console.log(
		`\n${c.d}Usage : bun run atlas-key <instance> [--nom "Atlas"]${c.r}`,
	);
	console.log(`${c.d}Instances connues :${c.r}`);
	for (const i of instances) {
		console.log(`  ${c.b}${i.slug.padEnd(22)}${c.r}${c.d}${i.name}${c.r}`);
	}
	console.log();
	process.exit(0);
}

const instance = instances.find(
	(i) => i.slug === target || i.deployment === target,
);
if (!instance) {
	die(
		`Instance inconnue : « ${target} ». Connues : ${instances.map((i) => i.slug).join(", ")}`,
	);
}

const url = await apiUrl(instance.deployment).catch((e: Error) =>
	die(e.message),
);
const userId = (() => {
	try {
		return adminOf(instance.deployment);
	} catch (e) {
		return die((e as Error).message);
	}
})();

let key: string;
try {
	const out = convex([
		"run",
		"automations:createApiKey",
		JSON.stringify({ name: keyName }),
		"--deployment",
		instance.deployment,
		"--identity",
		JSON.stringify({ subject: `${userId}|atlas-key-cli` }),
	]);
	key = /"key":\s*"([^"]+)"/.exec(out)?.[1] ?? "";
	if (!key) throw new Error(`réponse inattendue : ${out.slice(0, 120)}`);
} catch (e) {
	die((e as Error).message);
}

console.log(`\n${c.g}✓ Clé « ${keyName} » créée pour ${instance.name}${c.r}\n`);
console.log(`${c.b}${instance.name}${c.r}`);
console.log(`  ${c.cy}${url}${c.r}`);
console.log(`  ${c.cy}${key}${c.r}\n`);
console.log(
	`${c.y}La clé ne sera plus affichée. Elle donne tous les droits sur cette instance : à révoquer depuis Paramètres → Intégrations si elle fuite.${c.r}\n`,
);
