"use client";

import { motion } from "framer-motion";
import { Plus } from "lucide-react";

interface AddGoogleButtonProps {
	returnTo?: string;
	className?: string;
}

export function AddGoogleButton({
	returnTo = "/settings/calendar",
	className,
}: AddGoogleButtonProps) {
	const href = `/api/google/start?returnTo=${encodeURIComponent(returnTo)}`;

	return (
		<motion.a
			href={href}
			whileHover={{ scale: 1.02 }}
			whileTap={{ scale: 0.98 }}
			transition={{ duration: 0.15, ease: [0.16, 1, 0.3, 1] }}
			className={[
				"inline-flex items-center gap-2 px-4 py-2.5 rounded-[var(--radius-sm)]",
				"bg-[var(--brand)] text-white font-medium text-sm",
				"hover:bg-[var(--brand-hover)] transition-colors",
				"ring-1 ring-[var(--brand-glow)]",
				className ?? "",
			]
				.filter(Boolean)
				.join(" ")}
		>
			{/* Google icon SVG inline */}
			<svg
				width="16"
				height="16"
				viewBox="0 0 24 24"
				fill="none"
				aria-hidden="true"
			>
				<path
					d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
					fill="white"
					opacity="0.9"
				/>
				<path
					d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
					fill="white"
					opacity="0.8"
				/>
				<path
					d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"
					fill="white"
					opacity="0.7"
				/>
				<path
					d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"
					fill="white"
					opacity="0.75"
				/>
			</svg>
			Connecter un compte Google
			<Plus className="w-4 h-4 ml-0.5" strokeWidth={2} />
		</motion.a>
	);
}
