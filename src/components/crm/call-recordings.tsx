"use client";

import { useQuery } from "convex/react";
import { ChevronDown, ExternalLink, Video } from "lucide-react";
import { useState } from "react";
import { api } from "@/../convex/_generated/api";
import type { Id } from "@/../convex/_generated/dataModel";
import { cn } from "@/lib/utils";

function fmt(ms: number): string {
	return new Intl.DateTimeFormat("fr-FR", {
		weekday: "short",
		day: "numeric",
		month: "short",
		hour: "2-digit",
		minute: "2-digit",
	}).format(new Date(ms));
}

// Appels enregistrés (Fathom) d'un lead, dans l'onglet Appels de sa fiche.
export function CallRecordings({ leadId }: { leadId: Id<"leads"> }) {
	const recordings = useQuery(api.fathom.listForLead, { leadId });
	if (!recordings || recordings.length === 0) return null;

	return (
		<div className="space-y-2 pt-4">
			<p className="text-xs font-semibold uppercase tracking-wider text-[var(--ink-muted)]">
				Enregistrements ({recordings.length})
			</p>
			{recordings.map((r) => (
				<Recording key={r._id} recording={r} />
			))}
		</div>
	);
}

function Recording({
	recording: r,
}: {
	recording: {
		_id: Id<"callRecordings">;
		title: string;
		url: string | null;
		startedAt: number;
		endedAt: number | null;
		recordedByName: string | null;
		summaryMarkdown: string | null;
		actionItems: Array<{
			description: string;
			completed?: boolean;
			assignee?: string;
		}>;
		hasTranscript: boolean;
	};
}) {
	const [open, setOpen] = useState(false);
	const [showTranscript, setShowTranscript] = useState(false);
	const transcript = useQuery(
		api.fathom.getTranscript,
		showTranscript ? { recordingId: r._id } : "skip",
	);
	const minutes =
		r.endedAt && r.endedAt > r.startedAt
			? Math.round((r.endedAt - r.startedAt) / 60_000)
			: null;

	return (
		<div className="rounded-[var(--radius-md)] border border-[var(--border)]">
			<button
				type="button"
				onClick={() => setOpen((o) => !o)}
				className="w-full flex items-center gap-3 p-3 text-left hover:bg-[var(--surface-raised)] transition-colors"
			>
				<Video className="w-4 h-4 text-[var(--brand)] shrink-0" />
				<div className="flex-1 min-w-0">
					<p className="text-sm font-medium text-[var(--ink)] truncate">
						{r.title}
					</p>
					<p className="text-xs text-[var(--ink-muted)]">
						{fmt(r.startedAt)}
						{minutes ? ` · ${minutes} min` : ""}
						{r.recordedByName ? ` · ${r.recordedByName}` : ""}
					</p>
				</div>
				<ChevronDown
					className={cn(
						"w-4 h-4 text-[var(--ink-ghost)] transition-transform shrink-0",
						open && "rotate-180",
					)}
				/>
			</button>

			{open && (
				<div className="border-t border-[var(--border)] p-3 space-y-3 text-sm">
					{r.url && (
						<a
							href={r.url}
							target="_blank"
							rel="noreferrer"
							className="inline-flex items-center gap-1.5 text-xs text-[var(--brand)] underline"
						>
							<ExternalLink className="w-3.5 h-3.5" />
							Voir l'enregistrement sur Fathom
						</a>
					)}
					{r.summaryMarkdown && (
						<div>
							<p className="text-xs font-semibold text-[var(--ink-muted)] mb-1">
								Résumé
							</p>
							<p className="text-sm text-[var(--ink)] whitespace-pre-wrap leading-relaxed">
								{r.summaryMarkdown.replace(/\*\*/g, "").replace(/^#+\s*/gm, "")}
							</p>
						</div>
					)}
					{r.actionItems.length > 0 && (
						<div>
							<p className="text-xs font-semibold text-[var(--ink-muted)] mb-1">
								À faire
							</p>
							<ul className="space-y-1">
								{r.actionItems.map((a, i) => (
									<li
										key={`${i}-${a.description.slice(0, 20)}`}
										className={cn(
											"text-sm text-[var(--ink)]",
											a.completed && "line-through text-[var(--ink-ghost)]",
										)}
									>
										• {a.description}
										{a.assignee && (
											<span className="text-xs text-[var(--ink-muted)]">
												{" "}
												— {a.assignee}
											</span>
										)}
									</li>
								))}
							</ul>
						</div>
					)}
					{r.hasTranscript && (
						<div>
							<button
								type="button"
								onClick={() => setShowTranscript((s) => !s)}
								className="text-xs text-[var(--brand)] underline"
							>
								{showTranscript
									? "Masquer la transcription"
									: "Voir la transcription"}
							</button>
							{showTranscript && (
								<pre className="mt-2 max-h-80 overflow-y-auto whitespace-pre-wrap text-xs text-[var(--ink)] bg-[var(--surface-raised)] rounded-[var(--radius-sm)] p-3 font-sans leading-relaxed">
									{transcript === undefined
										? "Chargement…"
										: (transcript ?? "")}
								</pre>
							)}
						</div>
					)}
				</div>
			)}
		</div>
	);
}
