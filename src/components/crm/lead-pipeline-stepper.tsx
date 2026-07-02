"use client";

import { motion } from "framer-motion";
import { cn } from "@/lib/utils";
import type { Doc } from "../../../convex/_generated/dataModel";

type LeadStatus = Doc<"leads">["status"];

interface StepConfig {
	statuses: LeadStatus[];
	label: string;
	activeColor: string;
	inactiveColor: string;
}

const PIPELINE_STEPS: StepConfig[] = [
	{
		statuses: ["potentiel", "qualifie"],
		label: "Prospect",
		activeColor:
			"bg-[var(--brand-soft)] text-[var(--brand)] ring-[var(--brand-glow)]",
		inactiveColor: "bg-[var(--surface-muted)] text-[var(--ink-muted)]",
	},
	{
		statuses: ["rdv_reserve", "tenu"],
		label: "RDV",
		activeColor:
			"bg-[var(--warning-soft)] text-[var(--warning)] ring-[var(--warning-soft)]",
		inactiveColor: "bg-[var(--surface-muted)] text-[var(--ink-muted)]",
	},
	{
		statuses: ["gagne", "perdu", "follow_up"],
		label: "Résultat",
		activeColor:
			"bg-[var(--success-soft)] text-[var(--success)] ring-[var(--success-soft)]",
		inactiveColor: "bg-[var(--surface-muted)] text-[var(--ink-muted)]",
	},
];

interface LeadPipelineStepperProps {
	status: LeadStatus;
}

export function LeadPipelineStepper({ status }: LeadPipelineStepperProps) {
	const activeStep = PIPELINE_STEPS.findIndex((step) =>
		step.statuses.includes(status),
	);

	return (
		<div className="flex items-stretch gap-0 rounded-[var(--radius-sm)] overflow-hidden border border-[var(--border)]">
			{PIPELINE_STEPS.map((step, i) => {
				const isActive = i === activeStep;
				const isPast = i < activeStep;

				return (
					<div
						key={step.label}
						className={cn(
							"relative flex items-center justify-center h-8 flex-1",
							"text-xs font-medium px-4",
							"transition-all duration-200",
							isActive
								? step.activeColor + " ring-1"
								: isPast
									? "bg-[var(--brand-soft)] text-[var(--brand)] opacity-60"
									: step.inactiveColor,
						)}
						style={{
							// Chevron shape using clip-path — all except last
							clipPath:
								i < PIPELINE_STEPS.length - 1
									? "polygon(0 0, calc(100% - 10px) 0, 100% 50%, calc(100% - 10px) 100%, 0 100%, 10px 50%)"
									: i === 0
										? "polygon(0 0, calc(100% - 10px) 0, 100% 50%, calc(100% - 10px) 100%, 0 100%)"
										: "polygon(0 0, 100% 0, 100% 100%, 0 100%, 10px 50%)",
						}}
					>
						{step.label}
						{/* Pulse dot on active */}
						{isActive && (
							<motion.span
								animate={{
									scale: [1, 1.35, 1],
									opacity: [0.85, 1, 0.85],
								}}
								transition={{
									duration: 1.8,
									repeat: Number.POSITIVE_INFINITY,
									ease: "easeInOut",
								}}
								className="absolute right-3 w-1.5 h-1.5 rounded-full bg-current"
							/>
						)}
					</div>
				);
			})}
		</div>
	);
}
