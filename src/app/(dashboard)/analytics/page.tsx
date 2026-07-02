"use client";

import { motion } from "framer-motion";
import { useState } from "react";
import { CallsCreatedWidget } from "@/components/analytics/calls-created-widget";
import {
	type DateRange,
	DateRangePicker,
	getDefaultRange,
} from "@/components/analytics/date-range-picker";
import { EventMultiSelect } from "@/components/analytics/event-multi-select";
import { FunnelWidget } from "@/components/analytics/funnel-widget";
import { LossReasonWidget } from "@/components/analytics/loss-reason-widget";
import { OutcomeWidget } from "@/components/analytics/outcome-widget";
import { RevenueWidget } from "@/components/analytics/revenue-widget";
import { ShowUpWidget } from "@/components/analytics/showup-widget";
import { PageHeader } from "@/components/dashboard/page-header";
import type { Id } from "../../../../convex/_generated/dataModel";

// ─── Motion variants ──────────────────────────────────────────────────────────

const containerVariants = {
	hidden: {},
	show: {
		transition: {
			staggerChildren: 0.06,
		},
	},
};

const itemVariants = {
	hidden: { opacity: 0, y: 14 },
	show: {
		opacity: 1,
		y: 0,
		transition: {
			duration: 0.45,
			ease: [0.25, 0.46, 0.45, 0.94] as [number, number, number, number],
		},
	},
};

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function AnalyticsPage() {
	const [dateRange, setDateRange] = useState<DateRange>(getDefaultRange());
	const [eventIds, setEventIds] = useState<Id<"events">[]>([]);

	const sharedProps = {
		eventIds,
		startMs: dateRange.startMs,
		endMs: dateRange.endMs,
	};

	return (
		<div className="animate-fade-in">
			<PageHeader
				title="Analytics"
				description="Pilote tes appels par les chiffres"
				actions={
					<div className="flex items-center gap-2">
						<EventMultiSelect value={eventIds} onChange={setEventIds} />
						<DateRangePicker value={dateRange} onChange={setDateRange} />
					</div>
				}
			/>

			{/* Widget grid */}
			<motion.div
				variants={containerVariants}
				initial="hidden"
				animate="show"
				className="grid grid-cols-1 lg:grid-cols-2 gap-5"
			>
				{/* W1 — Funnel */}
				<motion.div variants={itemVariants}>
					<FunnelWidget {...sharedProps} />
				</motion.div>

				{/* W2 — Appels créés */}
				<motion.div variants={itemVariants}>
					<CallsCreatedWidget {...sharedProps} />
				</motion.div>

				{/* W3 — Résultats appel */}
				<motion.div variants={itemVariants}>
					<OutcomeWidget {...sharedProps} />
				</motion.div>

				{/* W4 — Raisons perte */}
				<motion.div variants={itemVariants}>
					<LossReasonWidget {...sharedProps} />
				</motion.div>

				{/* W5 — Revenue */}
				<motion.div variants={itemVariants}>
					<RevenueWidget {...sharedProps} />
				</motion.div>

				{/* W6 — Show-up */}
				<motion.div variants={itemVariants}>
					<ShowUpWidget {...sharedProps} />
				</motion.div>
			</motion.div>
		</div>
	);
}
