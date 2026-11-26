import { NextResponse } from "next/server";
import { authorized, findClient, gatewayEnabled } from "@/lib/gateway";

export const runtime = "nodejs";

// /api/gateway/v1/{client}/{chemin de l'API Mycall}
//
// La passerelle ne transforme rien : elle reconnaît le client, ajoute SA clé,
// transmet la requête telle quelle et renvoie la réponse en y ajoutant le nom
// du client. Un intégrateur apprend donc une seule API, celle de Mycall, et
// l'adresse de la passerelle lui évite d'avoir à gérer une connexion par
// client.

const TIMEOUT_MS = 20_000;

async function proxy(
	request: Request,
	ctx: { params: Promise<{ client: string; path: string[] }> },
) {
	if (!gatewayEnabled()) {
		return NextResponse.json(
			{ error: "Passerelle désactivée." },
			{ status: 404 },
		);
	}
	if (!authorized(request)) {
		return NextResponse.json(
			{ error: "Clé de passerelle absente ou invalide." },
			{ status: 401 },
		);
	}

	const { client: slug, path } = await ctx.params;
	const client = findClient(slug);
	if (!client) {
		return NextResponse.json(
			{ error: `Client inconnu : ${slug}. Voir /api/gateway/v1/clients.` },
			{ status: 404 },
		);
	}

	const incoming = new URL(request.url);
	const target = `${client.url}/${path.join("/")}${incoming.search}`;
	const body = request.method === "GET" ? undefined : await request.text();

	let response: Response;
	try {
		response = await fetch(target, {
			method: request.method,
			headers: {
				// La clé du client est ajoutée ici : elle ne quitte jamais la
				// passerelle, et l'outil externe ne la voit pas.
				Authorization: `Bearer ${client.key}`,
				"Content-Type":
					request.headers.get("content-type") ?? "application/json",
			},
			body,
			signal: AbortSignal.timeout(TIMEOUT_MS),
		});
	} catch (err) {
		const reason = err instanceof Error ? err.message : "inconnue";
		return NextResponse.json(
			{ error: `Instance ${slug} injoignable : ${reason}`, client: slug },
			{ status: 502 },
		);
	}

	const text = await response.text();
	let payload: unknown;
	try {
		payload = JSON.parse(text);
	} catch {
		// L'instance a répondu autre chose que du JSON : on le remonte tel quel
		// plutôt que de laisser croire à une réponse vide.
		// Sans message, on en fabrique un : « erreur vide » ne dit rien à qui
		// débogue un branchement.
		return NextResponse.json(
			{
				error:
					text.trim().slice(0, 500) ||
					`Instance ${slug} : réponse ${response.status} sans contenu. Adresse ou clé incorrecte ?`,
				client: slug,
			},
			{ status: response.status },
		);
	}

	const withClient =
		payload && typeof payload === "object" && !Array.isArray(payload)
			? { client: slug, ...(payload as Record<string, unknown>) }
			: { client: slug, data: payload };

	return NextResponse.json(withClient, { status: response.status });
}

export const GET = proxy;
export const POST = proxy;
