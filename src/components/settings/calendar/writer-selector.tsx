"use client";

import { useAction, useMutation, useQuery } from "convex/react";
import { motion } from "framer-motion";
import { Calendar, Check, ChevronDown, Loader2, RefreshCw } from "lucide-react";
import { useState } from "react";
import { cn } from "@/lib/utils";
import { api } from "../../../../convex/_generated/api";
import type { Id } from "../../../../convex/_generated/dataModel";

interface CalendarOption {
	accountId: Id<"userGoogleAccounts">;
	accountEmail: string;
	calendarId: string;
	summary: string;
	primary?: boolean;
}

interface WriterSelectorProps {
	currentWriterAccountId: Id<"userGoogleAccounts"> | null;
	currentWriterCalendarId: string | null;
	currentWriterCalendarSummary: string | null;
}

export function WriterSelector({
	currentWriterAccountId,
	currentWriterCalendarId,
	currentWriterCalendarSummary,
}: WriterSelectorProps) {
	const [open, setOpen] = useState(false);
	const [calendars, setCalendars] = useState<CalendarOption[] | null>(null);
	const [loading, setLoading] = useState(false);
	const [saving, setSaving] = useState(false);

	const listCalendars = useAction(
		api.googleActions.listCalendarsAcrossMyAccounts,
	);
	const setWriter = useMutation(api.userCalendarSettings.setWriter);

	const fetchCalendars = async () => {
		if (calendars) {
			setOpen(!open);
			return;
		}
		setLoading(true);
		try {
			const result = await listCalendars({});
			setCalendars(result);
			setOpen(true);
		} catch (e) {
			console.error(e);
		} finally {
			setLoading(false);
		}
	};

	const selectWriter = async (cal: CalendarOption) => {
		setSaving(true);
		try {
			await setWriter({
				accountId: cal.accountId,
				calendarId: cal.calendarId,
				calendarSummary: cal.summary,
			});
			setOpen(false);
		} catch (e) {
			console.error(e);
		} finally {
			setSaving(false);
		}
	};

	const isSelected = (cal: CalendarOption) =>
		cal.accountId === currentWriterAccountId &&
		cal.calendarId === currentWriterCalendarId;

	return (
		<div className="space-y-2">
			<label className="block text-xs font-semibold uppercase tracking-wide text-[var(--ink-muted)]">
				Calendrier writer (création des events)
			</label>

			<button
				type="button"
				onClick={fetchCalendars}
				disabled={loading || saving}
				className={cn(
					"w-full flex items-center justify-between gap-3 px-4 py-3 rounded-[var(--radius-sm)]",
					"bg-[var(--surface-raised)] hover:bg-[var(--surface-muted)] transition-colors",
					"text-sm text-left ring-1 ring-[var(--border)]",
				)}
			>
				<div className="flex items-center gap-2 min-w-0">
					{loading || saving ? (
						<Loader2 className="w-4 h-4 animate-spin text-[var(--brand)] shrink-0" />
					) : (
						<Calendar className="w-4 h-4 text-[var(--brand)] shrink-0" />
					)}
					<div className="min-w-0">
						{currentWriterCalendarId ? (
							<>
								<span className="font-medium text-[var(--ink)] truncate block">
									{currentWriterCalendarSummary ?? currentWriterCalendarId}
								</span>
							</>
						) : (
							<span className="text-[var(--ink-ghost)]">
								Aucun calendrier sélectionné
							</span>
						)}
					</div>
				</div>
				<ChevronDown
					className={cn(
						"w-4 h-4 text-[var(--ink-ghost)] shrink-0 transition-transform",
						open && "rotate-180",
					)}
				/>
			</button>

			{open && calendars && (
				<motion.div
					initial={{ opacity: 0, y: -4 }}
					animate={{ opacity: 1, y: 0 }}
					exit={{ opacity: 0, y: -4 }}
					transition={{ duration: 0.15 }}
					className="rounded-[var(--radius-sm)] ring-1 ring-[var(--border)] bg-[var(--surface-raised)] overflow-hidden"
				>
					{calendars.length === 0 ? (
						<p className="px-4 py-3 text-sm text-[var(--ink-ghost)]">
							Aucun calendrier trouvé
						</p>
					) : (
						<ul className="divide-y divide-[var(--border)]">
							{calendars.map((cal) => (
								<li key={`${cal.accountId}-${cal.calendarId}`}>
									<button
										type="button"
										onClick={() => selectWriter(cal)}
										disabled={saving}
										className={cn(
											"w-full flex items-center gap-3 px-4 py-3 text-sm text-left",
											"hover:bg-[var(--surface-muted)] transition-colors",
											isSelected(cal) && "bg-[var(--brand-soft)]",
										)}
									>
										{isSelected(cal) ? (
											<Check className="w-4 h-4 text-[var(--brand)] shrink-0" />
										) : (
											<div className="w-4 h-4 shrink-0" />
										)}
										<div className="min-w-0">
											<p className="font-medium text-[var(--ink)] truncate">
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
									</button>
								</li>
							))}
						</ul>
					)}
				</motion.div>
			)}
		</div>
	);
}
