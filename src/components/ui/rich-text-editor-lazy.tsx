"use client";

import dynamic from "next/dynamic";

// Tiptap + ProseMirror weigh ~360 KB on the initial bundle. Lazy-load to keep
// pages snappy until the editor actually mounts.
export const RichTextEditor = dynamic(
	() =>
		import("./rich-text-editor").then((m) => ({ default: m.RichTextEditor })),
	{
		ssr: false,
		loading: () => (
			<div className="min-h-[160px] animate-pulse rounded-[var(--radius-md)] border border-[var(--border)] bg-[var(--surface-raised)]" />
		),
	},
);
