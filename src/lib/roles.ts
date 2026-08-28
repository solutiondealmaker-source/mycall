// Rôles de l'équipe — source unique côté client.
//
// Doit rester aligné sur convex/schema.ts (union `users.role`) et sur
// ROLE_COPY dans convex/emails.ts, qui décrit les mêmes rôles dans l'email
// d'invitation.

export const INVITABLE_ROLES = [
	{
		value: "closer",
		label: "Closer",
		description:
			"Mène les rendez-vous. Ne voit que les leads qui lui sont assignés.",
	},
	{
		value: "setter",
		label: "Setter",
		description:
			"Qualifie les prospects. Ne voit que les leads qui lui sont assignés.",
	},
	{
		value: "coach",
		label: "Coach",
		description: "Accompagne l'équipe sur les leads qui lui sont assignés.",
	},
	{
		value: "viewer",
		label: "Observateur (lecture seule)",
		description:
			"Voit tous les rendez-vous, les leads et le chiffre d'affaires, sans rien pouvoir modifier. Pour un accompagnant externe.",
	},
	{
		value: "head_of_sales",
		label: "Head of Sales",
		description: "Pilote l'équipe. Accès complet, y compris en modification.",
	},
	{
		value: "ceo",
		label: "CEO",
		description: "Accès complet à l'espace de travail.",
	},
	{
		value: "ops",
		label: "Ops",
		description: "Administre la configuration et les intégrations.",
	},
	{
		value: "admin",
		label: "Admin",
		description: "Accès complet, y compris la gestion des membres.",
	},
] as const;

export type RoleValue = (typeof INVITABLE_ROLES)[number]["value"];

// Rôles qui donnent une vision globale (stats, tous les leads, tous les RDV).
// Miroir de canReadAll() côté serveur — le serveur reste l'autorité, ceci ne
// sert qu'à ne pas afficher des widgets qui renverraient une erreur.
const READ_ALL_ROLES = new Set([
	"admin",
	"ceo",
	"ops",
	"head_of_sales",
	"viewer",
]);

// Rôles qui peuvent administrer (inviter, changer les rôles, supprimer).
const ADMIN_ROLES = new Set(["admin", "ceo", "ops", "head_of_sales"]);

type ProfileLike =
	| { role?: string | null; isAdmin?: boolean }
	| null
	| undefined;

export function canReadAll(profile: ProfileLike): boolean {
	if (!profile) return false;
	return profile.isAdmin === true || READ_ALL_ROLES.has(profile.role ?? "");
}

export function canAdminister(profile: ProfileLike): boolean {
	if (!profile) return false;
	return profile.isAdmin === true || ADMIN_ROLES.has(profile.role ?? "");
}

export function roleLabel(role: string | null | undefined): string {
	return INVITABLE_ROLES.find((r) => r.value === role)?.label ?? "—";
}
