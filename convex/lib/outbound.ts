// Point d'émission unique des événements vers l'extérieur.
//
// Appelé depuis les mutations métier, après leur écriture. Il ne fait que
// planifier : les appels réseau partent dans des actions, et une automatisation
// en panne ne peut jamais faire échouer une réservation ou un changement de
// statut.

import { internal } from "../_generated/api";
import type { Id } from "../_generated/dataModel";
import type { MutationCtx } from "../_generated/server";
import type { OutboundEventType } from "./outboundEvents";

export type EventSource = "mycall" | "api" | "stripe";

export async function emitEvent(
	ctx: MutationCtx,
	type: OutboundEventType,
	ref: {
		leadId?: Id<"leads">;
		bookingId?: Id<"bookings">;
		data?: Record<string, string | number | boolean | null>;
		source?: EventSource;
	},
): Promise<void> {
	const occurredAt = Date.now();
	const eventId = `evt_${occurredAt.toString(36)}${Math.random().toString(36).slice(2, 10)}`;
	const data = ref.data ? JSON.stringify(ref.data) : undefined;

	const endpoints = await ctx.db.query("webhookEndpoints").collect();
	for (const endpoint of endpoints) {
		if (!endpoint.active) continue;
		if (!endpoint.events.includes(type) && !endpoint.events.includes("*")) {
			continue;
		}
		await ctx.scheduler.runAfter(0, internal.automations.deliver, {
			endpointId: endpoint._id,
			eventId,
			type,
			occurredAt,
			leadId: ref.leadId,
			bookingId: ref.bookingId,
			data,
			source: ref.source ?? "mycall",
			attempt: 1,
		});
	}

	if (ref.leadId) {
		const settings = await ctx.db
			.query("integrationSettings")
			.withIndex("by_singleton", (q) => q.eq("singleton", "default"))
			.first();
		if (settings?.systemeioApiKey) {
			await ctx.scheduler.runAfter(0, internal.systemeio.syncLead, {
				leadId: ref.leadId,
				bookingId: ref.bookingId,
				type,
				data,
			});
		}
	}
}
