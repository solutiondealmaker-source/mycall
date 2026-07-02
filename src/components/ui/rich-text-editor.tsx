"use client";

import CharacterCount from "@tiptap/extension-character-count";
import Link from "@tiptap/extension-link";
import Placeholder from "@tiptap/extension-placeholder";
import Underline from "@tiptap/extension-underline";
import { EditorContent, useEditor } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import {
	Bold,
	Italic,
	Link2,
	Link2Off,
	List,
	ListOrdered,
	RemoveFormatting,
	Underline as UnderlineIcon,
} from "lucide-react";
import { useEffect, useState } from "react";
import { cn } from "@/lib/utils";

interface RichTextEditorProps {
	value: string;
	onChange: (html: string) => void;
	placeholder?: string;
	maxLength?: number;
	className?: string;
	minHeight?: number;
}

export function RichTextEditor({
	value,
	onChange,
	placeholder = "Écris ici…",
	maxLength = 1500,
	className,
	minHeight = 160,
}: RichTextEditorProps) {
	const [focused, setFocused] = useState(false);

	const editor = useEditor({
		extensions: [
			StarterKit.configure({
				heading: false,
				codeBlock: false,
				blockquote: false,
				horizontalRule: false,
			}),
			Underline,
			Link.configure({
				openOnClick: false,
				autolink: true,
				HTMLAttributes: {
					class: "text-[var(--brand)] underline underline-offset-2",
					target: "_blank",
					rel: "noreferrer noopener",
				},
			}),
			Placeholder.configure({
				placeholder,
				emptyEditorClass: "is-editor-empty",
			}),
			CharacterCount.configure({ limit: maxLength }),
		],
		content: value || "",
		onUpdate: ({ editor }) => {
			const html = editor.getHTML();
			onChange(html === "<p></p>" ? "" : html);
		},
		onFocus: () => setFocused(true),
		onBlur: () => setFocused(false),
		editorProps: {
			attributes: {
				class: cn(
					"tiptap max-w-none overflow-y-auto px-4 py-3 outline-none focus:outline-none",
					"text-sm leading-relaxed text-[var(--ink)]",
					"[&_p]:my-2 [&_ul]:my-2 [&_ol]:my-2",
					"[&_ul]:list-disc [&_ul]:pl-5 [&_ol]:list-decimal [&_ol]:pl-5",
					"[&_strong]:text-[var(--ink)] [&_strong]:font-semibold",
					"[&_a]:text-[var(--brand)] [&_a]:underline",
					"[&_.is-editor-empty:first-child]:before:content-[attr(data-placeholder)] [&_.is-editor-empty:first-child]:before:float-left [&_.is-editor-empty:first-child]:before:text-[var(--ink-ghost)] [&_.is-editor-empty:first-child]:before:pointer-events-none [&_.is-editor-empty:first-child]:before:h-0",
				),
				style: `min-height: ${minHeight}px; max-height: 360px;`,
			},
		},
		immediatelyRender: false,
	});

	// biome-ignore lint/correctness/useExhaustiveDependencies: only re-sync when external value differs
	useEffect(() => {
		if (!editor) return;
		if (editor.getHTML() === value) return;
		if (!value && editor.getHTML() === "<p></p>") return;
		editor.commands.setContent(value || "");
	}, [value, editor]);

	if (!editor) {
		return (
			<div
				className={cn(
					"rounded-[var(--radius-md)] border border-[var(--border)] bg-[var(--surface-raised)]",
					className,
				)}
			>
				<div className="h-[38px] border-b border-[var(--border)] bg-[var(--surface-muted)]/40" />
				<div style={{ minHeight }} />
			</div>
		);
	}

	const chars = editor.storage.characterCount.characters() as number;
	const pct = chars / maxLength;
	const countTone =
		pct >= 1
			? "text-[var(--destructive)]"
			: pct >= 0.9
				? "text-amber-600"
				: "text-[var(--ink-ghost)]";

	const isLinkActive = editor.isActive("link");

	const handleLink = () => {
		const prev = editor.getAttributes("link").href as string | undefined;
		const url = window.prompt("URL du lien", prev ?? "https://");
		if (url === null) return;
		if (url.trim() === "") {
			editor.chain().focus().extendMarkRange("link").unsetLink().run();
			return;
		}
		const href = /^(https?:\/\/|mailto:|tel:)/i.test(url.trim())
			? url.trim()
			: `https://${url.trim()}`;
		editor.chain().focus().extendMarkRange("link").setLink({ href }).run();
	};

	return (
		<div
			className={cn(
				"rounded-[var(--radius-md)] border bg-[var(--surface-raised)] transition-all",
				focused
					? "border-[var(--brand)] ring-2 ring-[var(--brand)]/20"
					: "border-[var(--border)] hover:border-[var(--ink-muted)]/40",
				className,
			)}
		>
			<div className="sticky top-0 z-10 flex flex-wrap items-center gap-0.5 rounded-t-[var(--radius-md)] border-b border-[var(--border)] bg-[var(--surface-muted)]/50 px-1.5 py-1 backdrop-blur">
				<ToolbarGroup>
					<ToolbarButton
						active={editor.isActive("bold")}
						onClick={() => editor.chain().focus().toggleBold().run()}
						label="Gras"
						shortcut="⌘B"
					>
						<Bold className="h-3.5 w-3.5" />
					</ToolbarButton>
					<ToolbarButton
						active={editor.isActive("italic")}
						onClick={() => editor.chain().focus().toggleItalic().run()}
						label="Italique"
						shortcut="⌘I"
					>
						<Italic className="h-3.5 w-3.5" />
					</ToolbarButton>
					<ToolbarButton
						active={editor.isActive("underline")}
						onClick={() => editor.chain().focus().toggleUnderline().run()}
						label="Souligné"
						shortcut="⌘U"
					>
						<UnderlineIcon className="h-3.5 w-3.5" />
					</ToolbarButton>
				</ToolbarGroup>

				<ToolbarDivider />

				<ToolbarGroup>
					<ToolbarButton
						active={editor.isActive("bulletList")}
						onClick={() => editor.chain().focus().toggleBulletList().run()}
						label="Liste à puces"
						shortcut="⌘⇧8"
					>
						<List className="h-3.5 w-3.5" />
					</ToolbarButton>
					<ToolbarButton
						active={editor.isActive("orderedList")}
						onClick={() => editor.chain().focus().toggleOrderedList().run()}
						label="Liste numérotée"
						shortcut="⌘⇧7"
					>
						<ListOrdered className="h-3.5 w-3.5" />
					</ToolbarButton>
				</ToolbarGroup>

				<ToolbarDivider />

				<ToolbarGroup>
					<ToolbarButton
						active={isLinkActive}
						onClick={handleLink}
						label={isLinkActive ? "Modifier le lien" : "Ajouter un lien"}
						shortcut="⌘K"
					>
						<Link2 className="h-3.5 w-3.5" />
					</ToolbarButton>
					{isLinkActive && (
						<ToolbarButton
							onClick={() =>
								editor.chain().focus().extendMarkRange("link").unsetLink().run()
							}
							label="Retirer le lien"
						>
							<Link2Off className="h-3.5 w-3.5" />
						</ToolbarButton>
					)}
				</ToolbarGroup>

				<ToolbarDivider />

				<ToolbarButton
					onClick={() => {
						editor.chain().focus().unsetAllMarks().clearNodes().run();
					}}
					label="Effacer le formatage"
				>
					<RemoveFormatting className="h-3.5 w-3.5" />
				</ToolbarButton>

				<div
					className={cn(
						"ml-auto select-none pr-1.5 text-[11px] tabular-nums",
						countTone,
					)}
					aria-live="polite"
				>
					{chars} / {maxLength}
				</div>
			</div>

			<EditorContent editor={editor} />
		</div>
	);
}

function ToolbarGroup({ children }: { children: React.ReactNode }) {
	return <div className="flex items-center gap-0.5">{children}</div>;
}

function ToolbarButton({
	children,
	active,
	onClick,
	label,
	shortcut,
}: {
	children: React.ReactNode;
	active?: boolean;
	onClick: () => void;
	label: string;
	shortcut?: string;
}) {
	return (
		<button
			type="button"
			onMouseDown={(e) => e.preventDefault()}
			onClick={onClick}
			title={shortcut ? `${label} (${shortcut})` : label}
			aria-label={label}
			aria-pressed={active}
			className={cn(
				"flex h-7 w-7 items-center justify-center rounded-[var(--radius-sm)] transition-colors",
				active
					? "bg-[var(--ink)] text-[var(--surface)]"
					: "text-[var(--ink-muted)] hover:bg-[var(--surface)] hover:text-[var(--ink)]",
			)}
		>
			{children}
		</button>
	);
}

function ToolbarDivider() {
	return <span className="mx-1 h-4 w-px bg-[var(--border)]" />;
}
