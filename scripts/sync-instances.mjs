// Synchronise et déploie les instances secondaires depuis ce dépôt.
//
// Chaque instance est un clone en LECTURE SEULE de celui-ci : elle ne porte
// aucun code propre. Ce qui la distingue vit entièrement hors de git —
// .env.local, .vercel/ et les variables posées sur son déploiement Convex.
//
// C'est pour ça que `git reset --hard` est le bon outil ici, et pas un merge :
// il n'y a rien à fusionner, seulement une copie à remettre à l'identique.
// Avant, la synchronisation se faisait en copiant les fichiers modifiés à la
// main — un oubli suffisait à casser le build d'une instance.
//
//   bun run scripts/sync-instances.mjs            # synchronise et déploie tout
//   bun run scripts/sync-instances.mjs --dry-run  # montre ce qui serait fait
//   bun run scripts/sync-instances.mjs --no-deploy

import { execFileSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const CONFIG = join(ROOT, "instances.json");

const dryRun = process.argv.includes("--dry-run");
const noDeploy = process.argv.includes("--no-deploy");

function run(cmd, args, cwd) {
	if (dryRun) {
		console.log(`      $ ${cmd} ${args.join(" ")}`);
		return "";
	}
	return execFileSync(cmd, args, {
		cwd,
		encoding: "utf8",
		stdio: ["ignore", "pipe", "pipe"],
		shell: process.platform === "win32",
	});
}

function loadInstances() {
	if (!existsSync(CONFIG)) {
		console.error(`Fichier introuvable : ${CONFIG}`);
		console.error(
			"Crée-le sur ce modèle :\n" +
				JSON.stringify(
					[
						{
							name: "Protocole Renaître",
							path: "../protocole-renaitre",
							convexDeployment: "watchful-donkey-853",
							vercelProject: "protocole-renaitre",
						},
					],
					null,
					2,
				),
		);
		process.exit(1);
	}
	return JSON.parse(readFileSync(CONFIG, "utf8"));
}

// Vérifie que le dossier vise bien SA base et SON projet Vercel.
//
// Ce contrôle existe parce que l'inverse est arrivé : un outil en ligne de
// commande a réécrit le .env.local d'une instance en y mettant le déploiement
// Convex de l'instance principale. Rien n'a cassé — le code était identique et
// la production lit ses variables chez Vercel, pas dans ce fichier — mais la
// commande suivante aurait écrit dans la mauvaise base. Un envoi mal dirigé
// doit s'arrêter avant de partir, pas se découvrir après.
function assertIdentity(inst, path) {
	const problems = [];

	if (inst.convexDeployment) {
		const envFile = join(path, ".env.local");
		if (!existsSync(envFile)) {
			problems.push(".env.local absent");
		} else {
			const env = readFileSync(envFile, "utf8");
			const line =
				env.split("\n").find((l) => l.startsWith("CONVEX_DEPLOYMENT=")) ?? "";
			if (!line.includes(inst.convexDeployment)) {
				problems.push(
					`CONVEX_DEPLOYMENT ne vise pas ${inst.convexDeployment}\n       trouvé : ${line.trim() || "(absent)"}`,
				);
			}
		}
	}

	if (inst.vercelProject) {
		const linkFile = join(path, ".vercel", "project.json");
		if (!existsSync(linkFile)) {
			problems.push(".vercel/project.json absent — instance non liée");
		} else {
			const link = JSON.parse(readFileSync(linkFile, "utf8"));
			if (link.projectName && link.projectName !== inst.vercelProject) {
				problems.push(
					`projet Vercel = ${link.projectName}, attendu ${inst.vercelProject}`,
				);
			}
		}
	}

	return problems;
}

// ── Contrôles préalables sur le dépôt source ────────────────────────────────

const dirty = execFileSync("git", ["status", "--porcelain"], {
	cwd: ROOT,
	encoding: "utf8",
}).trim();
if (dirty) {
	console.error(
		"Le dépôt principal a des modifications non commitées.\n" +
			"Committe d'abord : les instances copient un commit, pas un dossier.\n",
	);
	console.error(dirty);
	process.exit(1);
}

const branch = execFileSync("git", ["rev-parse", "--abbrev-ref", "HEAD"], {
	cwd: ROOT,
	encoding: "utf8",
}).trim();
const head = execFileSync("git", ["rev-parse", "--short", "HEAD"], {
	cwd: ROOT,
	encoding: "utf8",
}).trim();

console.log(`\nSource : ${ROOT}`);
console.log(`Commit : ${head} (${branch})`);
if (dryRun) console.log("Mode   : simulation — rien ne sera modifié\n");
else console.log("");

// ── Boucle sur les instances ────────────────────────────────────────────────

const instances = loadInstances();
let failures = 0;

for (const inst of instances) {
	const path = resolve(ROOT, inst.path);
	console.log(`── ${inst.name}`);

	if (!existsSync(join(path, ".git"))) {
		console.log(`   ✗ dépôt git introuvable dans ${path}`);
		failures++;
		continue;
	}

	try {
		// Le remote pointe sur le dossier local du dépôt principal.
		const remotes = execFileSync("git", ["remote"], {
			cwd: path,
			encoding: "utf8",
		});
		if (!remotes.split("\n").includes("upstream")) {
			console.log("   + ajout du remote 'upstream'");
			run("git", ["remote", "add", "upstream", ROOT], path);
		} else {
			run("git", ["remote", "set-url", "upstream", ROOT], path);
		}

		run("git", ["fetch", "upstream", branch], path);

		const before = execFileSync("git", ["rev-parse", "--short", "HEAD"], {
			cwd: path,
			encoding: "utf8",
		}).trim();

		// Remise à l'identique. Les fichiers ignorés (.env.local, .vercel/) ne
		// sont pas touchés : c'est ce qui préserve l'identité de l'instance.
		run("git", ["reset", "--hard", `upstream/${branch}`], path);

		const after = dryRun
			? before
			: execFileSync("git", ["rev-parse", "--short", "HEAD"], {
					cwd: path,
					encoding: "utf8",
				}).trim();

		console.log(
			before === after
				? `   = déjà à jour (${after})`
				: `   ✓ ${before} → ${after}`,
		);

		if (noDeploy) {
			console.log("   · déploiement ignoré (--no-deploy)");
			continue;
		}

		// Contrôle d'identité juste avant l'envoi : c'est le dernier moment où
		// une erreur de cible est encore sans conséquence.
		const before2 = assertIdentity(inst, path);
		if (before2.length > 0) {
			failures++;
			console.log(`   ✗ cible incohérente, envoi annulé :`);
			for (const p of before2) console.log(`     - ${p}`);
			continue;
		}

		console.log("   · envoi des fonctions Convex…");
		run("bunx", ["convex", "dev", "--once"], path);

		console.log("   · déploiement Vercel…");
		run("bunx", ["vercel", "--prod", "--yes"], path);

		// Les CLI Convex et Vercel réécrivent .env.local. Si l'une d'elles a
		// changé la cible en passant, on le dit tout de suite plutôt que de le
		// découvrir à la prochaine commande.
		const after2 = assertIdentity(inst, path);
		if (after2.length > 0) {
			failures++;
			console.log("   ⚠ le déploiement a modifié l'identité de l'instance :");
			for (const p of after2) console.log(`     - ${p}`);
			console.log("     → corrige .env.local avant toute autre commande.");
			continue;
		}

		console.log("   ✓ en ligne");
	} catch (err) {
		failures++;
		const detail = err.stderr?.toString() || err.stdout?.toString() || err.message;
		console.log(`   ✗ échec :\n${detail.trim().split("\n").slice(-6).join("\n")}`);
	}
}

console.log(
	failures === 0
		? `\n${instances.length} instance(s) synchronisée(s).\n`
		: `\n${failures} instance(s) en échec.\n`,
);
process.exit(failures === 0 ? 0 : 1);
