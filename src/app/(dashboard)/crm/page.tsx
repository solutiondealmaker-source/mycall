"use client";

import { useEffect, useState } from "react";
import { LeadsBulkActionsBar } from "@/components/crm/leads-bulk-actions-bar";
import { LeadsDataTable } from "@/components/crm/leads-data-table";
import { LeadsKpiStrip } from "@/components/crm/leads-kpi-strip";
import {
	type LeadSegment,
	LeadsSegmentRail,
} from "@/components/crm/leads-segment-rail";
import {
	ALL_COLUMNS,
	type ColumnId,
	LeadsToolbar,
} from "@/components/crm/leads-toolbar";
import { PageHeader } from "@/components/dashboard/page-header";
import type { Doc } from "../../../../convex/_generated/dataModel";

const COLUMNS_STORAGE_KEY = "iclone:crm:columns:v1";

const DEFAULT_COLUMNS: Set<ColumnId> = new Set(ALL_COLUMNS.map((c) => c.id));

export default function CrmPage() {
	const [segment, setSegment] = useState<LeadSegment>("all");
	const [search, setSearch] = useState("");
	const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
	const [visibleColumns, setVisibleColumns] =
		useState<Set<ColumnId>>(DEFAULT_COLUMNS);

	// Restore column preferences from localStorage
	useEffect(() => {
		try {
			const stored = localStorage.getItem(COLUMNS_STORAGE_KEY);
			if (stored) {
				const parsed = JSON.parse(stored) as ColumnId[];
				setVisibleColumns(new Set(parsed));
			}
		} catch {}
	}, []);

	function handleColumnToggle(id: ColumnId) {
		setVisibleColumns((prev) => {
			const next = new Set(prev);
			if (next.has(id)) {
				if (next.size > 1) next.delete(id);
			} else {
				next.add(id);
			}
			try {
				localStorage.setItem(COLUMNS_STORAGE_KEY, JSON.stringify([...next]));
			} catch {}
			return next;
		});
	}

	// Derive status filter from segment
	const statusFilter =
		(
			[
				"potentiel",
				"qualifie",
				"rdv_reserve",
				"tenu",
				"gagne",
				"perdu",
				"follow_up",
			] as const
		).find((s) => s === segment) ?? undefined;

	return (
		<>
			{/* Override layout padding — CRM needs full-height layout */}
			<style>{`main { padding: 0 !important; }`}</style>

			<div className="flex flex-col h-full">
				{/* Header zone with padding */}
				<div className="px-8 py-6 border-b border-[var(--border)]">
					<PageHeader
						title="CRM"
						description="Gérez vos contacts et suivez votre pipeline de vente"
						className="mb-6"
					/>
					<LeadsKpiStrip />
				</div>

				{/* Body: sidebar + table */}
				<div className="flex flex-1 min-h-0 overflow-hidden">
					<LeadsSegmentRail active={segment} onChange={setSegment} />

					{/* Main content */}
					<div className="flex flex-col flex-1 min-w-0 overflow-hidden">
						<LeadsToolbar
							search={search}
							onSearchChange={setSearch}
							visibleColumns={visibleColumns}
							onColumnToggle={handleColumnToggle}
						/>

						<LeadsDataTable
							search={search}
							statusFilter={statusFilter}
							visibleColumns={visibleColumns}
							selectedIds={selectedIds}
							onSelectionChange={setSelectedIds}
						/>
					</div>
				</div>
			</div>

			{/* Floating bulk actions */}
			<LeadsBulkActionsBar
				selectedCount={selectedIds.size}
				onClearSelection={() => setSelectedIds(new Set())}
			/>
		</>
	);
}
