"use client";

import {
	type ColumnDef,
	flexRender,
	getCoreRowModel,
	getSortedRowModel,
	type SortingState,
	useReactTable,
} from "@tanstack/react-table";
import { usePaginatedQuery, useQuery } from "convex/react";
import { ArrowUpDown, ChevronDown, ChevronUp, Users } from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import { AvatarCircle } from "@/components/dashboard/avatar-circle";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import {
	Table,
	TableBody,
	TableCell,
	TableHead,
	TableHeader,
	TableRow,
} from "@/components/ui/table";
import { cn, formatRelativeDate } from "@/lib/utils";
import { api } from "../../../convex/_generated/api";
import type { Doc, Id } from "../../../convex/_generated/dataModel";
import { LeadStatusBadge } from "./lead-status-badge";
import type { ColumnId } from "./leads-toolbar";

const SORT_STORAGE_KEY = "iclone:crm:sort:v1";

type Lead = Doc<"leads">;

interface LeadsDataTableProps {
	search: string;
	statusFilter?: Lead["status"];
	visibleColumns: Set<ColumnId>;
	selectedIds: Set<string>;
	onSelectionChange: (ids: Set<string>) => void;
}

export function LeadsDataTable({
	search,
	statusFilter,
	visibleColumns,
	selectedIds,
	onSelectionChange,
}: LeadsDataTableProps) {
	const router = useRouter();
	const [sorting, setSorting] = useState<SortingState>(() => {
		try {
			const stored = localStorage.getItem(SORT_STORAGE_KEY);
			return stored ? (JSON.parse(stored) as SortingState) : [];
		} catch {
			return [];
		}
	});

	// Persist sort state
	useEffect(() => {
		try {
			localStorage.setItem(SORT_STORAGE_KEY, JSON.stringify(sorting));
		} catch {}
	}, [sorting]);

	const isSearching = search.length >= 2;

	// Search mode — non-paginated
	const searchResults = useQuery(
		api.leads.searchTopN,
		isSearching ? { q: search, limit: 50 } : "skip",
	);

	// Paginated mode — normal browsing
	const { results, status, loadMore } = usePaginatedQuery(
		api.leads.listPaginated,
		isSearching ? "skip" : { status: statusFilter },
		{ initialNumItems: 25 },
	);

	const rows: Lead[] = isSearching ? (searchResults ?? []) : results;
	const isLoading = isSearching
		? searchResults === undefined
		: status === "LoadingFirstPage";

	// Column definitions
	const columns = useMemo<ColumnDef<Lead>[]>(
		() => [
			// Checkbox
			{
				id: "select",
				header: ({ table }) => (
					<input
						type="checkbox"
						checked={table.getIsAllPageRowsSelected()}
						ref={(el) => {
							if (el) {
								el.indeterminate = table.getIsSomePageRowsSelected();
							}
						}}
						onChange={table.getToggleAllPageRowsSelectedHandler()}
						className="rounded border-[var(--border)] accent-[var(--brand)]"
					/>
				),
				cell: ({ row }) => (
					<input
						type="checkbox"
						checked={row.getIsSelected()}
						onChange={row.getToggleSelectedHandler()}
						onClick={(e) => e.stopPropagation()}
						className="rounded border-[var(--border)] accent-[var(--brand)]"
					/>
				),
				size: 40,
				enableSorting: false,
			},
			// Name
			{
				id: "name",
				header: "Nom",
				accessorFn: (row) =>
					`${row.firstName ?? ""} ${row.lastName ?? ""}`.trim(),
				cell: ({ row }) => {
					const name =
						`${row.original.firstName ?? ""} ${row.original.lastName ?? ""}`.trim() ||
						"Sans nom";
					return (
						<div className="flex items-center gap-2.5 min-w-0">
							<AvatarCircle name={name} size="sm" />
							<span className="font-medium text-[var(--ink)] truncate">
								{name}
							</span>
						</div>
					);
				},
				enableSorting: true,
			},
			// Email
			{
				id: "email",
				header: "Email",
				accessorKey: "email",
				cell: ({ getValue }) => (
					<span className="text-[var(--ink-muted)] text-xs truncate">
						{(getValue() as string | undefined) ?? "—"}
					</span>
				),
				enableSorting: false,
			},
			// Phone
			{
				id: "phone",
				header: "Téléphone",
				accessorKey: "phone",
				cell: ({ getValue }) => (
					<span className="text-[var(--ink-muted)] text-xs font-mono">
						{(getValue() as string | undefined) ?? "—"}
					</span>
				),
				enableSorting: false,
			},
			// Status
			{
				id: "status",
				header: "Phase",
				accessorKey: "status",
				cell: ({ getValue }) => (
					<LeadStatusBadge status={getValue() as Lead["status"]} />
				),
				enableSorting: true,
			},
			// Planning
			{
				id: "planning",
				header: "Planification",
				accessorKey: "phase",
				cell: ({ getValue }) => (
					<span className="text-xs text-[var(--ink-muted)]">
						{(getValue() as string | undefined) ?? "—"}
					</span>
				),
				enableSorting: false,
			},
			// Closer
			{
				id: "closer",
				header: "Closer",
				accessorKey: "closerUserId",
				cell: () => <span className="text-xs text-[var(--ink-muted)]">—</span>,
				enableSorting: false,
			},
			// Last activity
			{
				id: "lastActivity",
				header: "Dernière activité",
				accessorKey: "lastInteractionAt",
				cell: ({ getValue }) => {
					const ts = getValue() as number | undefined;
					return (
						<span className="text-xs text-[var(--ink-muted)]">
							{ts ? formatRelativeDate(ts) : "—"}
						</span>
					);
				},
				enableSorting: true,
			},
		],
		[],
	);

	// Filter by visible columns
	const visibleCols = useMemo(
		() =>
			columns.filter(
				(col) =>
					col.id === "select" ||
					(col.id && visibleColumns.has(col.id as ColumnId)),
			),
		[columns, visibleColumns],
	);

	// Row selection state synced with parent
	const rowSelection = useMemo(() => {
		const sel: Record<string, boolean> = {};
		for (const id of selectedIds) sel[id] = true;
		return sel;
	}, [selectedIds]);

	const table = useReactTable({
		data: rows,
		columns: visibleCols,
		state: { sorting, rowSelection },
		getRowId: (row) => row._id,
		enableRowSelection: true,
		onSortingChange: setSorting,
		onRowSelectionChange: (updater) => {
			const newSel =
				typeof updater === "function" ? updater(rowSelection) : updater;
			onSelectionChange(new Set(Object.keys(newSel).filter((k) => newSel[k])));
		},
		getCoreRowModel: getCoreRowModel(),
		getSortedRowModel: getSortedRowModel(),
		manualPagination: true,
	});

	if (isLoading) {
		return <LeadsTableSkeleton />;
	}

	if (rows.length === 0) {
		return <LeadsEmptyState />;
	}

	return (
		<div className="flex flex-col flex-1 min-h-0">
			<div className="flex-1 overflow-auto">
				<Table>
					<TableHeader className="sticky top-0 bg-[var(--surface)] z-10">
						{table.getHeaderGroups().map((headerGroup) => (
							<TableRow
								key={headerGroup.id}
								className="border-b border-[var(--border)]"
							>
								{headerGroup.headers.map((header) => (
									<TableHead
										key={header.id}
										className="h-10 px-4 text-xs font-semibold text-[var(--ink-muted)] uppercase tracking-wide"
										style={{
											width:
												header.getSize() !== 150 ? header.getSize() : undefined,
										}}
									>
										{header.isPlaceholder ? null : header.column.getCanSort() ? (
											<button
												type="button"
												onClick={header.column.getToggleSortingHandler()}
												className="flex items-center gap-1 hover:text-[var(--ink)] transition-colors"
											>
												{flexRender(
													header.column.columnDef.header,
													header.getContext(),
												)}
												{header.column.getIsSorted() === "asc" ? (
													<ChevronUp className="w-3 h-3" />
												) : header.column.getIsSorted() === "desc" ? (
													<ChevronDown className="w-3 h-3" />
												) : (
													<ArrowUpDown className="w-3 h-3 opacity-40" />
												)}
											</button>
										) : (
											flexRender(
												header.column.columnDef.header,
												header.getContext(),
											)
										)}
									</TableHead>
								))}
							</TableRow>
						))}
					</TableHeader>
					<TableBody>
						{table.getRowModel().rows.map((row) => (
							<TableRow
								key={row.id}
								onClick={() => router.push(`/crm/${row.id}`)}
								className={cn(
									"cursor-pointer transition-colors duration-100",
									"hover:bg-[var(--surface-raised)]",
									row.getIsSelected() && "bg-[var(--brand-soft)]",
								)}
							>
								{row.getVisibleCells().map((cell) => (
									<TableCell key={cell.id} className="px-4 py-2.5">
										{flexRender(cell.column.columnDef.cell, cell.getContext())}
									</TableCell>
								))}
							</TableRow>
						))}
					</TableBody>
				</Table>
			</div>

			{/* Load more */}
			{!isSearching && status === "CanLoadMore" && (
				<div className="flex items-center justify-center py-4 border-t border-[var(--border)]">
					<Button variant="outline" size="sm" onClick={() => loadMore(25)}>
						Charger plus
					</Button>
				</div>
			)}
			{!isSearching && status === "LoadingMore" && (
				<div className="flex items-center justify-center py-4 border-t border-[var(--border)]">
					<span className="text-xs text-[var(--ink-muted)]">Chargement...</span>
				</div>
			)}
		</div>
	);
}

// ─── Skeleton ────────────────────────────────────────────────────────────────

function LeadsTableSkeleton() {
	return (
		<div className="p-4 space-y-3">
			{Array.from({ length: 8 }).map((_, i) => (
				<div key={i} className="flex items-center gap-4">
					<Skeleton className="h-4 w-4 rounded" />
					<Skeleton className="h-7 w-7 rounded-full" />
					<Skeleton className="h-4 w-36 rounded" />
					<Skeleton className="h-4 w-40 rounded" />
					<Skeleton className="h-4 w-24 rounded" />
					<Skeleton className="h-5 w-20 rounded-full" />
					<Skeleton className="h-4 w-16 rounded ml-auto" />
				</div>
			))}
		</div>
	);
}

// ─── Empty state ─────────────────────────────────────────────────────────────

function LeadsEmptyState() {
	return (
		<div className="flex flex-col items-center justify-center py-20 gap-4">
			<Users className="w-10 h-10 text-[var(--ink-ghost)]" />
			<div className="text-center">
				<h3 className="text-base font-[family-name:var(--font-display)] font-bold text-[var(--ink)]">
					Aucun contact pour l'instant
				</h3>
				<p className="text-sm text-[var(--ink-muted)] mt-1 max-w-xs">
					Les contacts apparaîtront ici au fur et à mesure des réservations.
				</p>
			</div>
		</div>
	);
}
