"use client";

import { useQuery } from "convex/react";
import { Armchair } from "lucide-react";
import { api } from "@/../convex/_generated/api";
import { cn } from "@/lib/utils";

// Sièges occupés sur l'instance. Une invitation en attente occupe le sien :
// c'est ce qui évite de promettre un accès qui sera refusé à l'acceptation.
export function SeatBanner() {
	const seats = useQuery(api.seats.getSeatUsage, {});
	if (!seats || seats.limit === null) return null;

	const { used, limit, pending, full } = seats;
	const almostFull = !full && limit - used <= 1;

	return (
		<div
			className={cn(
				"flex items-start gap-3 rounded-[var(--radius-md)] border px-4 py-3 mb-6 text-sm",
				full
					? "border-[var(--warning)] bg-[var(--warning-soft)] text-[var(--ink)]"
					: "border-[var(--border)] bg-[var(--surface-raised)] text-[var(--ink-muted)]",
			)}
		>
			<Armchair
				className={cn(
					"w-4 h-4 mt-0.5 shrink-0",
					full ? "text-[var(--warning)]" : "text-[var(--brand)]",
				)}
				strokeWidth={1.75}
			/>
			<div className="min-w-0">
				<p>
					<strong className="text-[var(--ink)]">
						{used} siège{used > 1 ? "s" : ""} sur {limit}
					</strong>{" "}
					{pending > 0 && (
						<span>
							· dont {pending} invitation{pending > 1 ? "s" : ""} en attente{" "}
						</span>
					)}
				</p>
				{full && (
					<p className="mt-0.5">
						Tous les sièges sont occupés : les nouvelles invitations sont
						refusées. Retire un membre, ou contacte ton conseiller pour ajouter
						des sièges.
					</p>
				)}
				{almostFull && (
					<p className="mt-0.5">
						Il reste un siège. Au-delà, il faudra en ajouter.
					</p>
				)}
			</div>
		</div>
	);
}
