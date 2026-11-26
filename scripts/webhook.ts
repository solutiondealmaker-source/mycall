// webhook.ts — déclare la même adresse de réception dans plusieurs instances.
//
//   bun run webhook --url https://atlas.exemple.com/mycall
//   bun run webhook --url https://atlas.exemple.com/mycall --instance ton-coach-idel
//   bun run webhook --liste
//
// Un outil externe veut en général une seule adresse de réception. Comme
// chaque client tourne sur sa propre base, il faut déclarer le webhook dans
// chacune : cette commande le fait partout d'un coup, et ajoute
// « ?client=<slug> » à l'adresse pour que l'outil sache d'où vient l'événement.

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

function loadInstances(): Instance[] {
	const out: Instance[] = [];
	for (const file of readdirSync(CLIENTS_DIR)) {
		if (!file.endsWith(".json") || file === "exemple.json") continue;
		const raw = JSON.parse(readFileSync(join(CLIENTS_DIR, file), "utf-8"));
		if (file === "instances.json") {
			for (const i of raw as Instance[]) out.push(i);
			continue;
		}
		const deployment = /^https:\/\/([^.]+)\./.exec(raw.convexUrl ?? "")?.[1];
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
	if (!admin) throw new Error(`aucun administrateur dans ${deployment}`);
	return admin._id as string;
}

function listEndpoints(instance: Instance) {
	const rows = convex([
		"data",
		"webhookEndpoints",
		"--deployment",
		instance.deployment,
		"--limit",
		"50",
		"--format",
		"jsonl",
	]);
	return rows
		.split("\n")
		.filter((l) => l.trim().startsWith("{"))
		.map((l) => JSON.parse(l))
		.filter((e) => e.active);
}

const args = process.argv.slice(2);
const flag = (name: string) => {
	const i = args.indexOf(`--${name}`);
	return i >= 0 ? args[i + 1] : undefined;
};

const instances = loadInstances();
const only = flag("instance");
const targets = only
	? instances.filter((i) => i.slug === only || i.deployment === only)
	: instances;
if (targets.length === 0) {
	die(
		`Instance inconnue : ${only}. Connues : ${instances.map((i) => i.slug).join(", ")}`,
	);
}

// --liste : montrer ce qui est déjà branché, avant de toucher à quoi que ce soit.
if (args.includes("--liste")) {
	console.log();
	for (const i of targets) {
		let line: string;
		try {
			const endpoints = listEndpoints(i);
			line =
				endpoints.length === 0
					? `${c.d}aucun webhook${c.r}`
					: endpoints
							.map((e) => `${c.cy}${String(e.url).slice(0, 60)}${c.r}`)
							.join(", ");
		} catch (e) {
			line = `${c.red}${(e as Error).message}${c.r}`;
		}
		console.log(`  ${c.b}${i.name.padEnd(22)}${c.r}${line}`);
	}
	console.log();
	process.exit(0);
}

const url = flag("url");
if (!url) {
	die("Usage : bun run webhook --url <adresse> [--instance <slug>] | --liste");
}
try {
	new URL(url);
} catch {
	die(`Adresse invalide : ${url}`);
}

console.log();
for (const instance of targets) {
	// Le client est passé en paramètre : l'outil externe reçoit tout sur une
	// seule adresse et sait de quelle instance vient chaque événement.
	const full = `${url}${url.includes("?") ? "&" : "?"}client=${instance.slug}`;
	try {
		const existing = listEndpoints(instance).find((e) => e.url === full);
		if (existing) {
			console.log(
				`  ${c.b}${instance.name.padEnd(22)}${c.r}${c.d}déjà branché${c.r}`,
			);
			continue;
		}
		convex([
			"run",
			"automations:createEndpoint",
			JSON.stringify({
				url: full,
				events: ["*"],
				description: "Outil externe (posé par bun run webhook)",
			}),
			"--deployment",
			instance.deployment,
			"--identity",
			JSON.stringify({
				subject: `${adminOf(instance.deployment)}|webhook-cli`,
			}),
		]);
		console.log(
			`  ${c.g}✓${c.r} ${c.b}${instance.name.padEnd(20)}${c.r}${c.d}${full}${c.r}`,
		);
	} catch (e) {
		console.log(
			`  ${c.red}✗${c.r} ${c.b}${instance.name.padEnd(20)}${c.r}${c.red}${(e as Error).message}${c.r}`,
		);
	}
}
console.log(
	`\n${c.y}Vérifie la réception côté outil externe : un événement part à la prochaine réservation.${c.r}\n`,
);
