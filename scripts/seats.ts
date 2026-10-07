// seats.ts — sièges de chaque instance, vus et modifiés d'un seul endroit.
//
//   bun run seats                      état de toutes les instances
//   bun run seats ton-coach-idel 8     passe cette instance à 8 sièges
//   bun run seats mycall illimité      lève le plafond
//
// Le plafond est la variable SEAT_LIMIT de la base Convex du client. Elle est
// lue à chaud : aucun redéploiement n'est nécessaire.
//
// Les instances connues viennent de clients/*.json (celles onboardées par le
// script) et de clients/instances.json (les plus anciennes, créées à la main).

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

// Le nom de base se lit dans l'URL Convex : https://<base>.<region>.convex.cloud
function deploymentFromUrl(url: string): string | null {
	return /^https:\/\/([^.]+)\./.exec(url.trim())?.[1] ?? null;
}

function loadInstances(): Instance[] {
	const out: Instance[] = [];
	for (const file of readdirSync(CLIENTS_DIR)) {
		if (!file.endsWith(".json") || file === "exemple.json") continue;
		const raw = JSON.parse(readFileSync(join(CLIENTS_DIR, file), "utf-8"));
		if (file === "instances.json") {
			for (const i of raw as Instance[]) {
				out.push({ slug: i.slug, name: i.name, deployment: i.deployment });
			}
			continue;
		}
		const deployment = deploymentFromUrl(raw.convexUrl ?? "");
		if (!deployment) continue;
		out.push({ slug: file.replace(/\.json$/, ""), name: raw.name, deployment });
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

function countRows(deployment: string, table: string): number {
	const rows = convex([
		"data",
		table,
		"--deployment",
		deployment,
		"--limit",
		"1000",
		"--format",
		"jsonl",
	]);
	return rows.split("\n").filter((l) => l.trim().startsWith("{")).length;
}

function pendingInvitations(deployment: string): number {
	const rows = convex([
		"data",
		"invitations",
		"--deployment",
		deployment,
		"--limit",
		"1000",
		"--format",
		"jsonl",
	]);
	const now = Date.now();
	return rows
		.split("\n")
		.filter((l) => l.trim().startsWith("{"))
		.map((l) => JSON.parse(l))
		.filter((i) => !i.acceptedAt && !i.revokedAt && (i.expiresAt ?? 0) > now)
		.length;
}

function readLimit(deployment: string): string {
	try {
		const raw = convex([
			"env",
			"get",
			"--deployment",
			deployment,
			"SEAT_LIMIT",
		]);
		return raw.trim() === "" ? "illimité" : raw.trim();
	} catch {
		return "illimité";
	}
}

function status(instances: Instance[]) {
	console.log();
	for (const i of instances) {
		let line: string;
		try {
			const used =
				countRows(i.deployment, "users") + pendingInvitations(i.deployment);
			const limit = readLimit(i.deployment);
			const n = Number(limit);
			const full = Number.isFinite(n) && used >= n;
			const tight = Number.isFinite(n) && !full && n - used <= 1;
			const color = full ? c.red : tight ? c.y : c.g;
			line = `${color}${used} / ${limit}${c.r}`;
		} catch (e) {
			line = `${c.red}injoignable${c.r} ${c.d}(${(e as Error).message})${c.r}`;
		}
		console.log(
			`  ${c.b}${i.name.padEnd(22)}${c.r}${line}  ${c.d}${i.slug}${c.r}`,
		);
	}
	console.log(
		`\n${c.d}Modifier : bun run seats <instance> <nombre | illimité>${c.r}\n`,
	);
}

function setSeats(instance: Instance, value: string) {
	const unlimited = /^(illimité|illimite|unlimited|0)$/i.test(value);
	const n = Number(value);
	if (!unlimited && (!Number.isFinite(n) || n < 1)) {
		die(
			`Nombre de sièges invalide : « ${value} ». Attendu : un entier, ou « illimité ».`,
		);
	}
	const used =
		countRows(instance.deployment, "users") +
		pendingInvitations(instance.deployment);
	if (!unlimited && n < used) {
		// Baisser sous l'occupation ne supprime personne : les comptes existants
		// restent, seules les prochaines invitations sont refusées.
		console.log(
			`${c.y}⚠ ${instance.name} occupe déjà ${used} siège(s) : personne n'est retiré, mais plus aucune invitation ne passera.${c.r}`,
		);
	}
	convex([
		"env",
		"set",
		"--deployment",
		instance.deployment,
		"SEAT_LIMIT",
		unlimited ? "0" : String(Math.floor(n)),
	]);
	console.log(
		`${c.g}✓ ${instance.name} : ${unlimited ? "illimité" : Math.floor(n)} siège(s)${c.r} ${c.d}(${used} occupé(s))${c.r}`,
	);
}

const [target, value] = process.argv.slice(2);
const instances = loadInstances();
if (instances.length === 0) die("Aucune instance dans clients/.");

if (!target) {
	status(instances);
} else {
	const found = instances.find(
		(i) => i.slug === target || i.deployment === target,
	);
	if (!found) {
		die(
			`Instance inconnue : « ${target} ». Connues : ${instances.map((i) => i.slug).join(", ")}`,
		);
	}
	if (!value) die(`Usage : bun run seats ${found.slug} <nombre | illimité>`);
	setSeats(found, value);
}
