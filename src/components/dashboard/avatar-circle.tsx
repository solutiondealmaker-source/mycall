import { cn } from "@/lib/utils";

// Palette de 8 gradients déterministes (brand bleu Endosia)
const GRADIENTS = [
	"linear-gradient(135deg, #2563EB 0%, #3B82F6 100%)",
	"linear-gradient(135deg, #1D4ED8 0%, #2563EB 100%)",
	"linear-gradient(135deg, #3B82F6 0%, #60A5FA 100%)",
	"linear-gradient(135deg, #1E40AF 0%, #3B82F6 100%)",
	"linear-gradient(135deg, #2563EB 0%, #818CF8 100%)",
	"linear-gradient(135deg, #0EA5E9 0%, #2563EB 100%)",
	"linear-gradient(135deg, #6366F1 0%, #3B82F6 100%)",
	"linear-gradient(135deg, #2563EB 0%, #10B981 100%)",
];

function hashName(name: string): number {
	let hash = 0;
	for (let i = 0; i < name.length; i++) {
		hash = (hash * 31 + name.charCodeAt(i)) >>> 0;
	}
	return hash;
}

function getGradient(name: string): string {
	return (
		GRADIENTS[hashName(name) % GRADIENTS.length] ?? (GRADIENTS[0] as string)
	);
}

function getInitials(name: string): string {
	const parts = name.trim().split(/\s+/);
	if (parts.length === 0 || !parts[0]) return "?";
	if (parts.length === 1) {
		return (parts[0].slice(0, 2) ?? "?").toUpperCase();
	}
	return `${parts[0][0] ?? ""}${parts[parts.length - 1]?.[0] ?? ""}`.toUpperCase();
}

const SIZE_MAP = {
	xs: { outer: "w-6 h-6", text: "text-[9px]" },
	sm: { outer: "w-7 h-7", text: "text-[10px]" },
	md: { outer: "w-9 h-9", text: "text-xs" },
	lg: { outer: "w-12 h-12", text: "text-sm" },
};

export type AvatarSize = keyof typeof SIZE_MAP;

interface AvatarCircleProps {
	name: string;
	size?: AvatarSize;
	className?: string;
}

export function AvatarCircle({
	name,
	size = "md",
	className,
}: AvatarCircleProps) {
	const { outer, text } = SIZE_MAP[size];
	const gradient = getGradient(name);
	const initials = getInitials(name);

	return (
		<div
			className={cn(
				"flex items-center justify-center rounded-full select-none shrink-0",
				"font-semibold text-white",
				"font-[family-name:var(--font-display)]",
				outer,
				text,
				className,
			)}
			style={{ background: gradient }}
			role="img"
			aria-label={name}
		>
			{initials}
		</div>
	);
}
