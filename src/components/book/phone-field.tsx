"use client";

import { ChevronDown, Search } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import {
	defaultCountries,
	FlagImage,
	parseCountry,
} from "react-international-phone";
import { cn } from "@/lib/utils";

interface PhoneFieldProps {
	value: string;
	onChange: (value: string) => void;
	error?: string;
	id?: string;
}

// Default to France
const DEFAULT_COUNTRY = "fr";

function getCountryDialCode(iso2: string): string {
	const found = defaultCountries.find((c) => {
		const parsed = parseCountry(c);
		return parsed.iso2 === iso2;
	});
	if (!found) return "";
	return `+${parseCountry(found).dialCode}`;
}

function getAllCountries() {
	return defaultCountries.map((c) => {
		const parsed = parseCountry(c);
		return {
			iso2: parsed.iso2,
			name: parsed.name,
			dialCode: `+${parsed.dialCode}`,
		};
	});
}

export function PhoneField({
	value,
	onChange,
	error,
	id = "phone",
}: PhoneFieldProps) {
	const [selectedIso2, setSelectedIso2] = useState(DEFAULT_COUNTRY);
	const [localNumber, setLocalNumber] = useState("");
	const [isOpen, setIsOpen] = useState(false);
	const [search, setSearch] = useState("");
	const dropdownRef = useRef<HTMLDivElement>(null);
	const searchRef = useRef<HTMLInputElement>(null);

	const allCountries = useMemo(() => getAllCountries(), []);

	const filtered = useMemo(() => {
		if (!search) return allCountries;
		const q = search.toLowerCase();
		return allCountries.filter(
			(c) =>
				c.name.toLowerCase().includes(q) ||
				c.dialCode.includes(q) ||
				c.iso2.toLowerCase().includes(q),
		);
	}, [allCountries, search]);

	const selectedCountry = useMemo(
		() => allCountries.find((c) => c.iso2 === selectedIso2),
		[allCountries, selectedIso2],
	);

	// Sync external value → internal state on mount
	useEffect(() => {
		if (value && !localNumber) {
			// If value starts with +, try to parse the country code
			if (value.startsWith("+")) {
				const matchedCountry = allCountries.find(
					(c) => value.startsWith(c.dialCode) && c.dialCode.length > 1,
				);
				if (matchedCountry) {
					setSelectedIso2(matchedCountry.iso2);
					setLocalNumber(value.slice(matchedCountry.dialCode.length).trim());
					return;
				}
			}
			setLocalNumber(value);
		}
		// eslint-disable-next-line react-hooks/exhaustive-deps
	}, []);

	// Propagate changes
	function handleLocalChange(raw: string) {
		// Only digits, spaces, dashes
		const cleaned = raw.replace(/[^\d\s\-()]/g, "");
		setLocalNumber(cleaned);
		const dialCode = selectedCountry?.dialCode ?? "";
		onChange(cleaned ? `${dialCode} ${cleaned}` : "");
	}

	function handleSelectCountry(iso2: string) {
		setSelectedIso2(iso2);
		setIsOpen(false);
		setSearch("");
		const dialCode = getCountryDialCode(iso2);
		onChange(localNumber ? `${dialCode} ${localNumber}` : "");
	}

	// Close on outside click
	useEffect(() => {
		function handleClickOutside(e: MouseEvent) {
			if (
				dropdownRef.current &&
				!dropdownRef.current.contains(e.target as Node)
			) {
				setIsOpen(false);
				setSearch("");
			}
		}
		document.addEventListener("mousedown", handleClickOutside);
		return () => document.removeEventListener("mousedown", handleClickOutside);
	}, []);

	// Focus search on open
	useEffect(() => {
		if (isOpen) {
			setTimeout(() => searchRef.current?.focus(), 50);
		}
	}, [isOpen]);

	return (
		<div className="relative" ref={dropdownRef}>
			<div
				className={cn(
					"flex h-10 rounded-[var(--radius-md)] border overflow-hidden transition-all duration-150",
					"bg-[var(--surface)] focus-within:ring-2 focus-within:ring-[var(--brand)]/20 focus-within:border-[var(--brand)]",
					error
						? "border-[var(--destructive)] ring-2 ring-[var(--destructive)]/20"
						: "border-[var(--border-strong)]",
				)}
			>
				{/* Country selector button */}
				<button
					type="button"
					onClick={() => setIsOpen((o) => !o)}
					className={cn(
						"flex items-center gap-1.5 px-3 border-r border-[var(--border)] shrink-0",
						"bg-[var(--surface-raised)] hover:bg-[var(--surface-muted)] transition-colors",
						"text-xs font-medium text-[var(--ink)] min-w-[72px]",
					)}
					aria-label="Sélectionner l'indicatif pays"
					aria-haspopup="listbox"
					aria-expanded={isOpen}
				>
					{selectedCountry && (
						<FlagImage
							iso2={selectedCountry.iso2}
							className="w-4 h-3 rounded-sm object-cover"
						/>
					)}
					<span>{selectedCountry?.dialCode ?? "+33"}</span>
					<ChevronDown
						className={cn(
							"w-3 h-3 text-[var(--ink-ghost)] transition-transform duration-150",
							isOpen && "rotate-180",
						)}
					/>
				</button>

				{/* Phone number input */}
				<input
					id={id}
					type="tel"
					inputMode="numeric"
					value={localNumber}
					onChange={(e) => handleLocalChange(e.target.value)}
					placeholder="6 12 34 56 78"
					className={cn(
						"flex-1 px-3 py-2 text-sm bg-transparent outline-none",
						"text-[var(--ink)] placeholder:text-[var(--ink-ghost)]",
					)}
					autoComplete="tel-national"
					aria-label="Numéro de téléphone"
				/>
			</div>

			{/* Error message */}
			{error && (
				<p className="mt-1 text-xs text-[var(--destructive)]" role="alert">
					{error}
				</p>
			)}

			{/* Country dropdown */}
			{isOpen && (
				<div
					className={cn(
						"absolute top-full left-0 mt-1 z-50 w-72",
						"bg-[var(--surface)] border border-[var(--border)] rounded-[var(--radius-lg)]",
						"shadow-[var(--shadow-float)] overflow-hidden",
					)}
					role="listbox"
					aria-label="Pays"
				>
					{/* Search */}
					<div className="p-2 border-b border-[var(--border)]">
						<div className="relative">
							<Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-[var(--ink-ghost)]" />
							<input
								ref={searchRef}
								type="text"
								value={search}
								onChange={(e) => setSearch(e.target.value)}
								placeholder="Rechercher un pays..."
								className={cn(
									"w-full pl-8 pr-3 py-1.5 text-xs rounded-[var(--radius-sm)]",
									"bg-[var(--surface-raised)] border border-[var(--border)]",
									"text-[var(--ink)] placeholder:text-[var(--ink-ghost)] outline-none",
									"focus:ring-1 focus:ring-[var(--brand)]/30 focus:border-[var(--brand)]",
								)}
							/>
						</div>
					</div>

					{/* Country list */}
					<div className="max-h-48 overflow-y-auto">
						{filtered.length === 0 ? (
							<p className="py-4 text-center text-xs text-[var(--ink-ghost)]">
								Aucun pays trouvé
							</p>
						) : (
							filtered.map((country) => (
								<button
									key={country.iso2}
									type="button"
									role="option"
									aria-selected={country.iso2 === selectedIso2}
									onClick={() => handleSelectCountry(country.iso2)}
									className={cn(
										"w-full flex items-center gap-2.5 px-3 py-2 text-sm text-left",
										"transition-colors hover:bg-[var(--surface-raised)]",
										country.iso2 === selectedIso2 &&
											"bg-[var(--brand-soft)] text-[var(--brand)]",
									)}
								>
									<FlagImage
										iso2={country.iso2}
										className="w-5 h-3.5 rounded-sm object-cover shrink-0"
									/>
									<span className="flex-1 truncate text-xs">
										{country.name}
									</span>
									<span className="text-xs text-[var(--ink-ghost)] shrink-0">
										{country.dialCode}
									</span>
								</button>
							))
						)}
					</div>
				</div>
			)}
		</div>
	);
}
