import type { ReactNode } from "react";
import { Sidebar } from "@/components/dashboard/sidebar";

export default function DashboardLayout({ children }: { children: ReactNode }) {
	return (
		<div className="flex h-screen overflow-hidden bg-[var(--background)] relative">
			<div className="top-accent-line" aria-hidden="true" />

			<div
				className="pointer-events-none fixed inset-0 overflow-hidden"
				aria-hidden="true"
			>
				<div className="mesh-blob mesh-blob-a animate-blob-a" />
				<div className="mesh-blob mesh-blob-b animate-blob-b" />
				<div className="mesh-blob mesh-blob-c animate-blob-c" />
			</div>

			<Sidebar />

			<div className="flex flex-col flex-1 min-w-0 overflow-hidden relative z-10">
				<main className="flex-1 overflow-y-auto">
					<div className="w-full px-6 lg:px-10 xl:px-14 2xl:px-20 py-8">
						{children}
					</div>
				</main>
			</div>
		</div>
	);
}
