"use client";

import { motion } from "framer-motion";
import { Check } from "lucide-react";
import { Fragment } from "react";
import { cn } from "@/lib/utils";

interface StepperProps {
	current: 1 | 2;
}

const STEPS = [
	{ id: 1, label: "Vos informations" },
	{ id: 2, label: "Choisissez un créneau" },
] as const;

export function BookingStepper({ current }: StepperProps) {
	return (
		<div
			className="flex items-center justify-center w-full max-w-2xl mx-auto"
			role="list"
			aria-label="Étapes de réservation"
		>
			{STEPS.map((step, i) => {
				const isDone = current > step.id;
				const isActive = current === step.id;

				return (
					<Fragment key={step.id}>
						<div
							className="flex items-center gap-3"
							role="listitem"
							aria-current={isActive ? "step" : undefined}
						>
							<motion.div
								animate={{
									backgroundColor:
										isDone || isActive
											? "var(--brand)"
											: "var(--surface-muted)",
								}}
								transition={{ duration: 0.15, ease: [0.16, 1, 0.3, 1] }}
								className="w-3.5 h-3.5 rounded-full flex items-center justify-center shadow-sm shrink-0"
							>
								{isDone && (
									<Check className="w-2.5 h-2.5 text-white" strokeWidth={3} />
								)}
							</motion.div>

							<span
								className={cn(
									"text-sm font-semibold whitespace-nowrap transition-colors duration-200",
									isDone || isActive
										? "text-[var(--ink)]"
										: "text-[var(--ink-ghost)]",
								)}
								style={{ fontFamily: "var(--font-body)" }}
							>
								{step.label}
							</span>
						</div>

						{i < STEPS.length - 1 && (
							<div className="flex-1 h-px mx-5 relative overflow-hidden bg-[var(--border)] max-w-[120px]">
								<motion.div
									animate={{ scaleX: current > 1 ? 1 : 0 }}
									initial={{ scaleX: 0 }}
									style={{ originX: 0 }}
									transition={{ duration: 0.15, ease: [0.16, 1, 0.3, 1] }}
									className="absolute inset-0 bg-[var(--brand)]"
								/>
							</div>
						)}
					</Fragment>
				);
			})}
		</div>
	);
}
