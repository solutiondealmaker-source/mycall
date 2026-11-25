import { PageSkeleton } from "@/components/dashboard/page-skeleton";

// Le CRM charge aussi sa table et ses filtres : c'est la page la plus longue
// à apparaître, donc celle où le squelette compte le plus.
export default function CrmLoading() {
	return (
		<div className="px-4 sm:px-8 py-4 sm:py-6">
			<PageSkeleton rows={8} />
		</div>
	);
}
