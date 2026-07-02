"use client";

import { Columns3, Filter, Plus, Search } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import {
	Dialog,
	DialogContent,
	DialogHeader,
	DialogTitle,
} from "@/components/ui/dialog";
import {
	DropdownMenu,
	DropdownMenuCheckboxItem,
	DropdownMenuContent,
	DropdownMenuLabel,
	DropdownMenuSeparator,
	DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
	Popover,
	PopoverContent,
	PopoverTrigger,
} from "@/components/ui/popover";
import { cn } from "@/lib/utils";

const STATUS_OPTIONS = [
	{ value: "potentiel", label: "Potentiel" },
	{ value: "qualifie", label: "Qualifié" },
	{ value: "rdv_reserve", label: "RDV réservé" },
	{ value: "tenu", label: "Tenu" },
	{ value: "gagne", label: "Gagné" },
	{ value: "perdu", label: "Perdu" },
	{ value: "follow_up", label: "Follow-up" },
];

export const ALL_COLUMNS = [
	{ id: "name", label: "Nom" },
	{ id: "email", label: "Email" },
	{ id: "phone", label: "Téléphone" },
	{ id: "status", label: "Phase" },
	{ id: "planning", label: "Planification" },
	{ id: "closer", label: "Closer" },
	{ id: "lastActivity", label: "Dernière activité" },
] as const;

export type ColumnId = (typeof ALL_COLUMNS)[number]["id"];

interface LeadsToolbarProps {
	search: string;
	onSearchChange: (val: string) => void;
	visibleColumns: Set<ColumnId>;
	onColumnToggle: (id: ColumnId) => void;
	onNewContact?: () => void;
}

export function LeadsToolbar({
	search,
	onSearchChange,
	visibleColumns,
	onColumnToggle,
	onNewContact,
}: LeadsToolbarProps) {
	const [cmdOpen, setCmdOpen] = useState(false);
	const [focused, setFocused] = useState(false);
	const inputRef = useRef<HTMLInputElement>(null);

	// Cmd+K handler
	useEffect(() => {
		function handleKeyDown(e: KeyboardEvent) {
			if ((e.metaKey || e.ctrlKey) && e.key === "k") {
				e.preventDefault();
				setCmdOpen(true);
			}
		}
		window.addEventListener("keydown", handleKeyDown);
		return () => window.removeEventListener("keydown", handleKeyDown);
	}, []);

	const handleSearchFocus = useCallback(() => setFocused(true), []);
	const handleSearchBlur = useCallback(() => setFocused(false), []);

	return (
		<>
			<div className="flex items-center gap-2 px-4 py-3 border-b border-[var(--border)] bg-[var(--surface)] sticky top-0 z-20">
				{/* Search */}
				<div
					className={cn(
						"relative flex items-center transition-all duration-300",
						focused ? "w-80" : "w-64",
					)}
				>
					<Search className="absolute left-2.5 w-3.5 h-3.5 text-[var(--ink-ghost)] pointer-events-none" />
					<input
						ref={inputRef}
						type="text"
						placeholder="Rechercher..."
						value={search}
						onChange={(e) => onSearchChange(e.target.value)}
						onFocus={handleSearchFocus}
						onBlur={handleSearchBlur}
						className={cn(
							"w-full h-8 pl-8 pr-16 text-sm rounded-[var(--radius-md)]",
							"border border-[var(--border)] bg-[var(--surface-raised)]",
							"text-[var(--ink)] placeholder:text-[var(--ink-ghost)]",
							"focus:outline-none focus:ring-2 focus:ring-[var(--brand-glow)] focus:border-[var(--brand)]",
							"transition-all duration-150",
						)}
					/>
					<div className="absolute right-2.5 flex items-center gap-0.5 pointer-events-none">
						<kbd className="text-[10px] text-[var(--ink-ghost)] border border-[var(--border)] rounded px-1 py-0.5 leading-none font-mono">
							⌘K
						</kbd>
					</div>
				</div>

				{/* Filters */}
				<Popover>
					<PopoverTrigger asChild>
						<Button variant="outline" size="sm" className="gap-1.5">
							<Filter className="w-3.5 h-3.5" />
							Filtres
						</Button>
					</PopoverTrigger>
					<PopoverContent className="w-56 p-3" align="start">
						<p className="text-xs font-semibold text-[var(--ink-muted)] uppercase tracking-wider mb-2">
							Statut
						</p>
						<div className="space-y-1">
							{STATUS_OPTIONS.map((opt) => (
								<label
									key={opt.value}
									className="flex items-center gap-2 cursor-pointer h-7 px-1.5 rounded hover:bg-[var(--surface-raised)] text-sm text-[var(--ink)]"
								>
									<input type="checkbox" className="rounded" />
									{opt.label}
								</label>
							))}
						</div>
					</PopoverContent>
				</Popover>

				{/* Column picker */}
				<DropdownMenu>
					<DropdownMenuTrigger asChild>
						<Button variant="outline" size="sm" className="gap-1.5">
							<Columns3 className="w-3.5 h-3.5" />
							Colonnes
						</Button>
					</DropdownMenuTrigger>
					<DropdownMenuContent align="start" className="w-44">
						<DropdownMenuLabel className="text-xs text-[var(--ink-muted)] uppercase tracking-wider">
							Colonnes visibles
						</DropdownMenuLabel>
						<DropdownMenuSeparator />
						{ALL_COLUMNS.map((col) => (
							<DropdownMenuCheckboxItem
								key={col.id}
								checked={visibleColumns.has(col.id)}
								onCheckedChange={() => onColumnToggle(col.id)}
							>
								{col.label}
							</DropdownMenuCheckboxItem>
						))}
					</DropdownMenuContent>
				</DropdownMenu>

				{/* Spacer */}
				<div className="flex-1" />

				{/* New contact */}
				<Button size="sm" onClick={onNewContact} className="gap-1.5">
					<Plus className="w-3.5 h-3.5" />
					Nouveau contact
				</Button>
			</div>

			{/* Command palette dialog — V1 UI placeholder */}
			<Dialog open={cmdOpen} onOpenChange={setCmdOpen}>
				<DialogContent className="max-w-lg">
					<DialogHeader>
						<DialogTitle className="text-sm font-medium text-[var(--ink-muted)]">
							Recherche rapide
						</DialogTitle>
					</DialogHeader>
					<div className="relative">
						<Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-[var(--ink-ghost)]" />
						<input
							autoFocus
							placeholder="Rechercher un contact, un appel..."
							className={cn(
								"w-full h-10 pl-9 pr-4 text-sm rounded-[var(--radius-md)]",
								"border border-[var(--border)] bg-[var(--surface-raised)]",
								"text-[var(--ink)] placeholder:text-[var(--ink-ghost)]",
								"focus:outline-none focus:ring-2 focus:ring-[var(--brand-glow)] focus:border-[var(--brand)]",
							)}
						/>
					</div>
					<p className="text-xs text-[var(--ink-ghost)] text-center py-8">
						Fonctionnalité disponible en Phase 11
					</p>
				</DialogContent>
			</Dialog>
		</>
	);
}
