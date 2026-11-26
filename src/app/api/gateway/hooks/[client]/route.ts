import { NextResponse } from "next/server";
import { findClient, gatewayEnabled } from "@/lib/gateway";

export const runtime = "nodejs";

// POST /api/gateway/hooks/{client}
//
// Adresse à déclarer comme webhook sortant dans CHAQUE instance. La passerelle
// relaie l'événement vers l'outil externe en précisant de quel client il
// vient : celui-ci n'a donc qu'une seule adresse à exposer, au lieu d'une par
// client.
//
// Aucune vérification de signature ici : la passerelle ne détient pas les
// secrets de webhook des instances. Elle transmet les en-têtes d'origine, et
// c'est l'outil externe qui vérifie, s'il le souhaite, avec le secret du
// client concerné.

export async function POST(
	request: Request,
	ctx: { params: Promise<{ client: string }> },
) {
	if (!gatewayEnabled()) {
		return NextResponse.json(
			{ error: "Passerelle désactivée." },
			{ status: 404 },
		);
	}

	const { client: slug } = await ctx.params;
	if (!findClient(slug)) {
		return NextResponse.json(
			{ error: `Client inconnu : ${slug}` },
			{ status: 404 },
		);
	}

	const destination = process.env.GATEWAY_WEBHOOK_URL?.trim();
	if (!destination) {
		return NextResponse.json(
			{ error: "GATEWAY_WEBHOOK_URL n'est pas renseignée." },
			{ status: 500 },
		);
	}

	const body = await request.text();
	const headers: Record<string, string> = {
		"Content-Type": "application/json",
		"X-Mycall-Client": slug,
	};
	// On repasse la signature d'origine : elle reste vérifiable avec le secret
	// du webhook de l'instance.
	for (const name of [
		"x-mycall-event",
		"x-mycall-timestamp",
		"x-mycall-signature",
	]) {
		const value = request.headers.get(name);
		if (value) headers[name] = value;
	}

	try {
		const res = await fetch(destination, {
			method: "POST",
			headers,
			body,
			signal: AbortSignal.timeout(15_000),
		});
		// Le code de l'outil externe est renvoyé tel quel à l'instance : si
		// l'outil refuse, l'instance réessaiera selon sa propre politique.
		return new NextResponse(await res.text(), {
			status: res.status,
			headers: { "Content-Type": "application/json" },
		});
	} catch (err) {
		const reason = err instanceof Error ? err.message : "inconnue";
		return NextResponse.json(
			{ error: `Destination injoignable : ${reason}` },
			{ status: 502 },
		);
	}
}
