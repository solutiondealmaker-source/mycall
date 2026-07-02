import { ChevronLeft } from "lucide-react";
import Link from "next/link";
import { LeadDetail } from "@/components/crm/lead-detail";
import type { Id } from "../../../../../convex/_generated/dataModel";

interface LeadPageProps {
	params: Promise<{ id: string }>;
}

/**
 * Fiche lead full-page.
 * Next.js 16 — params est une Promise.
 */
export default async function LeadPage({ params }: LeadPageProps) {
	const { id } = await params;

	return (
		<div className="flex flex-col h-full -mx-8 -my-8">
			{/* Breadcrumb */}
			<div className="flex items-center gap-2 px-8 py-4 border-b border-[var(--border)] bg-[var(--surface)] shrink-0">
				<Link
					href="/crm"
					className="flex items-center gap-1 text-sm text-[var(--ink-muted)] hover:text-[var(--brand)] transition-colors"
				>
					<ChevronLeft className="w-4 h-4" />
					CRM
				</Link>
				<span className="text-[var(--ink-ghost)]">/</span>
				<span className="text-sm text-[var(--ink)] font-medium">
					Fiche lead
				</span>
			</div>

			{/* Lead detail — full height */}
			<div className="flex-1 overflow-hidden">
				<LeadDetail leadId={id as Id<"leads">} />
			</div>
		</div>
	);
}
