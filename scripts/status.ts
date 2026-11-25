// status.ts — quelle version chaque instance sert-elle réellement ?
//
//   bun run status
//
// Un envoi sur GitHub déclenche une construction par projet Vercel, mais rien
// ne garantit qu'elles aboutissent toutes : une offre gratuite plafonne le
// nombre de constructions par jour, une construction peut échouer, un projet
// peut avoir été débranché du dépôt. Sans contrôle, une instance cliente
// reste des semaines sur une ancienne version sans que personne ne le voie.
//
// Chaque instance expose sa version sur /api/health. On la compare au dernier
// commit poussé.

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
};

interface Instance {
	slug: string;
	name: string;
	domain: string;
}

function loadInstances(): Instance[] {
	const out: Instance[] = [];
	for (const file of readdirSync(CLIENTS_DIR)) {
		if (!file.endsWith(".json") || file === "exemple.json") continue;
		const raw = JSON.parse(readFileSync(join(CLIENTS_DIR, file), "utf-8"));
		if (file === "instances.json") {
			for (const i of raw as Instance[]) {
				if (i.domain) out.push(i);
			}
			continue;
		}
		if (raw.domain) {
			out.push({
				slug: file.replace(/\.json$/, ""),
				name: raw.name,
				domain: raw.domain,
			});
		}
	}
	return out.sort((a, b) => a.name.localeCompare(b.name));
}

function localHead(): string {
	const r = spawnSync("git", ["rev-parse", "--short=7", "HEAD"], {
		encoding: "utf-8",
	});
	return (r.stdout ?? "").trim();
}

async function versionOf(domain: string): Promise<string> {
	const res = await fetch(`https://${domain}/api/health`, {
		signal: AbortSignal.timeout(15_000),
	});
	if (!res.ok) throw new Error(`HTTP ${res.status}`);
	const body = (await res.json()) as { version?: string };
	return body.version ?? "inconnue";
}

const head = localHead();
const instances = loadInstances();
console.log(`\n${c.d}Dernier commit local : ${head}${c.r}\n`);

let late = 0;
for (const i of instances) {
	let line: string;
	try {
		const version = await versionOf(i.domain);
		if (version === head) {
			line = `${c.g}à jour${c.r}   ${c.d}${version}${c.r}`;
		} else if (version === "local" || version === "inconnue") {
			// L'instance ne renvoie pas encore de version : elle tourne sur une
			// construction antérieure à l'ajout de ce champ.
			line = `${c.y}version inconnue — construction antérieure${c.r}`;
			late++;
		} else {
			line = `${c.red}en retard${c.r} ${c.d}${version}${c.r}`;
			late++;
		}
	} catch (e) {
		line = `${c.red}injoignable${c.r} ${c.d}(${(e as Error).message})${c.r}`;
		late++;
	}
	console.log(`  ${c.b}${i.name.padEnd(22)}${c.r}${line}`);
}

console.log(
	late === 0
		? `\n${c.g}Toutes les instances servent la dernière version.${c.r}\n`
		: `\n${c.y}${late} instance(s) à redéployer depuis leur projet Vercel.${c.r}\n`,
);
