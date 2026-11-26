import { NextResponse } from "next/server";
import { authorized, gatewayEnabled, readRegistry } from "@/lib/gateway";

export const runtime = "nodejs";

// GET /api/gateway/v1/clients
// Les instances joignables, sans leurs clés. Un outil externe découvre ainsi
// les clients sans qu'on ait à le prévenir à chaque nouveau déploiement.
export async function GET(request: Request) {
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
	const { clients, error } = readRegistry();
	if (error) return NextResponse.json({ error }, { status: 500 });

	return NextResponse.json({
		clients: clients.map((c) => ({ slug: c.slug, name: c.name })),
	});
}
