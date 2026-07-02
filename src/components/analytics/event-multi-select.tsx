"use client";

import { useQuery } from "convex/react";
import { CheckIcon, ChevronDownIcon, LayersIcon } from "lucide-react";
import { useState } from "react";
import {
	Popover,
	PopoverContent,
	PopoverTrigger,
} from "@/components/ui/popover";
import { cn } from "@/lib/utils";
import { api } from "../../../convex/_generated/api";
import type { Doc, Id } from "../../../convex/_generated/dataModel";

interface EventMultiSelectProps {
	value: Id<"events">[];
	onChange: (ids: Id<"events">[]) => void;
}

export function EventMultiSelect({ value, onChange }: EventMultiSelectProps) {
	const [open, setOpen] = useState(false);
	const events = useQuery(api.events.list, {});

	const label =
		value.length === 0
			? "Tous les événements"
			: value.length === 1
				? (events?.find((e: Doc<"events">) => e._id === value[0])?.name ??
					"1 événement")
				: `${value.length} événements`;

	function toggle(id: Id<"events">) {
		if (value.includes(id)) {
			onChange(value.filter((v) => v !== id));
		} else {
			onChange([...value, id]);
		}
	}

	function selectAll() {
		onChange([]);
	}

	return (
		<Popover open={open} onOpenChange={setOpen}>
			<PopoverTrigger asChild>
				<button
					type="button"
					className={cn(
						"flex items-center gap-2 px-3 h-9 rounded-[var(--radius-sm)]",
						"bg-[var(--surface)] border border-[var(--border)]",
						"text-sm font-medium text-[var(--ink)]",
						"hover:border-[var(--brand)] hover:bg-[var(--brand-soft)]",
						"transition-colors duration-150",
						"focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--brand)]",
					)}
				>
					<LayersIcon className="w-3.5 h-3.5 text-[var(--ink-muted)]" />
					<span>{label}</span>
					{value.length > 0 && (
						<span className="ml-0.5 px-1.5 py-0.5 rounded-full bg-[var(--brand)] text-white text-[10px] font-semibold leading-none">
							{value.length}
						</span>
					)}
					<ChevronDownIcon className="w-3.5 h-3.5 text-[var(--ink-ghost)]" />
				</button>
			</PopoverTrigger>
			<PopoverContent align="start" className="w-64 p-1.5">
				<div className="flex flex-col gap-0.5">
					{/* All option */}
					<button
						type="button"
						onClick={selectAll}
						className={cn(
							"flex items-center gap-2.5 px-3 py-2 rounded-md text-sm text-left w-full",
							"transition-colors duration-100",
							value.length === 0
								? "bg-[var(--brand-soft)] text-[var(--brand)] font-medium"
								: "text-[var(--ink-muted)] hover:bg-[var(--surface-raised)] hover:text-[var(--ink)]",
						)}
					>
						<span className="w-4 h-4 flex items-center justify-center">
							{value.length === 0 && (
								<CheckIcon className="w-3 h-3 text-[var(--brand)]" />
							)}
						</span>
						Tous les événements
					</button>

					{events === undefined && (
						<div className="px-3 py-3 text-xs text-[var(--ink-ghost)]">
							Chargement...
						</div>
					)}

					{events?.map((event: Doc<"events">) => {
						const selected = value.includes(event._id);
						return (
							<button
								key={event._id}
								type="button"
								onClick={() => toggle(event._id)}
								className={cn(
									"flex items-center gap-2.5 px-3 py-2 rounded-md text-sm text-left w-full",
									"transition-colors duration-100",
									selected
										? "bg-[var(--brand-soft)] text-[var(--brand)] font-medium"
										: "text-[var(--ink-muted)] hover:bg-[var(--surface-raised)] hover:text-[var(--ink)]",
								)}
							>
								<span className="w-4 h-4 flex items-center justify-center shrink-0">
									{selected && (
										<CheckIcon className="w-3 h-3 text-[var(--brand)]" />
									)}
								</span>
								<span className="truncate">{event.name}</span>
								{event.color && (
									<span
										className="ml-auto w-2 h-2 rounded-full shrink-0"
										style={{ background: event.color }}
									/>
								)}
							</button>
						);
					})}
				</div>
			</PopoverContent>
		</Popover>
	);
}
