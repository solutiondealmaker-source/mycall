import Image from "next/image";
import { BRAND_LOGO_ICON, BRAND_NAME } from "@/lib/brand";
import { cn } from "@/lib/utils";

// Logo carré de l'instance. Sans logo configuré, un monogramme à l'initiale du
// business : une instance cliente n'affiche jamais le logo d'une autre marque.
export function BrandMark({
	className,
	priority,
}: {
	className?: string;
	priority?: boolean;
}) {
	if (BRAND_LOGO_ICON) {
		return (
			<Image
				src={BRAND_LOGO_ICON}
				alt={BRAND_NAME}
				width={300}
				height={300}
				priority={priority}
				className={cn("object-contain", className)}
			/>
		);
	}
	return (
		<div
			role="img"
			aria-label={BRAND_NAME}
			className={cn(
				"flex items-center justify-center rounded-[22%] bg-[var(--brand)] text-white font-semibold select-none",
				className,
			)}
			style={{ fontFamily: "var(--font-display)", containerType: "size" }}
		>
			<span style={{ fontSize: "50cqh", lineHeight: 1 }}>
				{BRAND_NAME.trim().charAt(0).toUpperCase()}
			</span>
		</div>
	);
}
