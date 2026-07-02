"use client";

import { useAction, useMutation } from "convex/react";
import { motion } from "framer-motion";
import { Loader2, RefreshCw, Shield } from "lucide-react";
import { useEffect, useState } from "react";
import { cn } from "@/lib/utils";
import { api } from "../../../../convex/_generated/api";
import type { Id } from "../../../../convex/_generated/dataModel";

interface ConflictCalendar {
	accountId: Id<"userGoogleAccounts">;
	calendarId: string;
	calendarSummary?: string | null;
}

interface CalendarOption {
	accountId: Id<"userGoogleAccounts">;
	accountEmail: string;
	calendarId: string;
	summary: string;
	primary?: boolean;
}

interface ConflictCheckListProps {
	conflictCheckCalendars: ConflictCalendar[];
}

export function ConflictCheckList({
	conflictCheckCalendars,
}: ConflictCheckListProps) {
	const [calendars, setCalendars] = useState<CalendarOption[] | null>(null);
	const [loading, setLoading] = useState(false);
	const [saving, setSaving] = useState(false);
	const [selected, setSelected] = useState<Set<string>>(new Set());

	const listCalendars = useAction(
		api.googleActions.listCalendarsAcrossMyAccounts,
	);
	const setConflictCalendars = useMutation(
		api.userCalendarSettings.setConflictCalendars,
	);

	// Sync selected from props
	useEffect(() => {
		const keys = conflictCheckCalendars.map(
			(c) => `${c.accountId}:${c.calendarId}`,
		);
		setSelected(new Set(keys));
	}, [conflictCheckCalendars]);

	const loadCalendars = async () => {
		setLoading(true);
		try {
			const result = await listCalendars({});
			setCalendars(result);
		} catch (e) {
			console.error(e);
		} finally {
			setLoading(false);
		}
	};

	const toggleCalendar = (cal: CalendarOption) => {
		const key = `${cal.accountId}:${cal.calendarId}`;
		setSelected((prev) => {
			const next = new Set(prev);
			if (next.has(key)) {
				next.delete(key);
			} else {
				next.add(key);
			}
			return next;
		});
	};

	const saveSelection = async () => {
		if (!calendars) return;
		setSaving(true);
		try {
			const newList = calendars
				.filter((c) => selected.has(`${c.accountId}:${c.calendarId}`))
				.map((c) => ({
					accountId: c.accountId,
					calendarId: c.calendarId,
					calendarSummary: c.summary,
				}));
			await setConflictCalendars({ calendars: newList });
		} catch (e) {
			console.error(e);
		} finally {
			setSaving(false);
		}
	};

	return (
		<div className="space-y-3">
			<div className="flex items-center justify-between">
				<label className="block text-xs font-semibold uppercase tracking-wide text-[var(--ink-muted)]">
					Calendriers conflict-check (disponibilité)
				</label>
				{!calendars && (
					<button
						type="button"
						onClick={loadCalendars}
						disabled={loading}
						className="inline-flex items-center gap-1 text-xs text-[var(--brand)] hover:text-[var(--brand-hover)] transition-colors"
					>
						{loading ? (
							<Loader2 className="w-3.5 h-3.5 animate-spin" />
						) : (
							<RefreshCw className="w-3.5 h-3.5" />
						)}
						Charger les calendriers
					</button>
				)}
			</div>

			{/* Résumé actuel si pas encore chargé */}
			{!calendars && conflictCheckCalendars.length === 0 && (
				<p className="text-sm text-[var(--ink-ghost)] px-1">
					Aucun calendrier de conflict-check configuré
				</p>
			)}
			{!calendars && conflictCheckCalendars.length > 0 && (
				<div className="flex flex-wrap gap-1.5">
					{conflictCheckCalendars.map((c) => (
						<span
							key={`${c.accountId}:${c.calendarId}`}
							className="inline-flex items-center gap-1 text-xs px-2 py-1 rounded-full bg-[var(--surface-muted)] text-[var(--ink-muted)]"
						>
							<Shield className="w-3 h-3 text-[var(--brand)]" />
							{c.calendarSummary ?? c.calendarId}
						</span>
					))}
				</div>
			)}

			{/* Liste interactive */}
			{calendars && (
				<motion.div
					initial={{ opacity: 0, y: 4 }}
					animate={{ opacity: 1, y: 0 }}
					transition={{ duration: 0.2 }}
					className="space-y-2"
				>
					<div className="rounded-[var(--radius-sm)] ring-1 ring-[var(--border)] bg-[var(--surface-raised)] overflow-hidden">
						{calendars.length === 0 ? (
							<p className="px-4 py-3 text-sm text-[var(--ink-ghost)]">
								Aucun calendrier trouvé
							</p>
						) : (
							<ul className="divide-y divide-[var(--border)]">
								{calendars.map((cal) => {
									const key = `${cal.accountId}:${cal.calendarId}`;
									const isChecked = selected.has(key);
									return (
										<li key={key}>
											<label
												className={cn(
													"flex items-center gap-3 px-4 py-3 cursor-pointer",
													"hover:bg-[var(--surface-muted)] transition-colors",
													isChecked && "bg-[var(--brand-soft)]",
												)}
											>
												<input
													type="checkbox"
													checked={isChecked}
													onChange={() => toggleCalendar(cal)}
													className="w-4 h-4 rounded accent-[var(--brand)]"
												/>
												<div className="min-w-0">
													<p className="text-sm font-medium text-[var(--ink)] truncate">
														{cal.summary}
														{cal.primary && (
															<span className="ml-1.5 text-xs text-[var(--ink-ghost)]">
																(principal)
															</span>
														)}
													</p>
													<p className="text-xs text-[var(--ink-muted)] truncate">
														{cal.accountEmail}
													</p>
												</div>
											</label>
										</li>
									);
								})}
							</ul>
						)}
					</div>

					<div className="flex justify-end">
						<button
							type="button"
							onClick={saveSelection}
							disabled={saving}
							className={cn(
								"inline-flex items-center gap-2 px-4 py-2 rounded-[var(--radius-sm)]",
								"bg-[var(--brand)] text-white text-sm font-medium",
								"hover:bg-[var(--brand-hover)] transition-colors",
								"disabled:opacity-50 disabled:cursor-not-allowed",
							)}
						>
							{saving && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
							Sauvegarder
						</button>
					</div>
				</motion.div>
			)}
		</div>
	);
}
