import { PageSkeleton } from "@/components/dashboard/page-skeleton";

// Les graphiques pèsent 400 Ko à eux seuls : sans squelette, la page reste
// blanche le temps de les télécharger.
export default function AnalyticsLoading() {
	return <PageSkeleton rows={3} />;
}
