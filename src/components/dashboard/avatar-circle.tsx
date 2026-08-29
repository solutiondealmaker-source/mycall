import { cn } from "@/lib/utils";

// Huit dégradés déterministes : deux personnes différentes gardent des
// pastilles différentes, et la même personne garde toujours la sienne.
//
// Accordés au marine de la marque et au fond crème. La version précédente
// gardait le bleu vif d'origine, resté en place après le rebranding : sur
// crème, ces bleus électriques étaient les seules taches froides vives de
// l'interface.
const GRADIENTS = [
	"linear-gradient(135deg, #192A3B 0%, #33506E 100%)",
	"linear-gradient(135deg, #24384D 0%, #4A6C90 100%)",
	"linear-gradient(135deg, #2E4A63 0%, #5C7FA3 100%)",
	"linear-gradient(135deg, #1F3348 0%, #3F6284 100%)",
	"linear-gradient(135deg, #33506E 0%, #6E8FAF 100%)",
	"linear-gradient(135deg, #1C2E42 0%, #46688B 100%)",
	"linear-gradient(135deg, #2A4560 0%, #7D9AB8 100%)",
	"linear-gradient(135deg, #223A52 0%, #52789C 100%)",
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
