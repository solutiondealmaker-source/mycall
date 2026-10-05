// Rôles de l'équipe — source unique côté client.
//
// Doit rester aligné sur convex/schema.ts (union `users.role`) et sur
// ROLE_COPY dans convex/emails.ts, qui décrit les mêmes rôles dans l'email
// d'invitation.

// Proposés à l'invitation. Volontairement court : un menu de huit rôles dont
// deux servent réellement ne fait qu'égarer celui qui invite. Les autres rôles
// restent valables pour les comptes qui les portent déjà (voir LEGACY_ROLES).
export const INVITABLE_ROLES = [
	{
		value: "closer",
		label: "Closer",
		description:
			"Mène les rendez-vous. Ne voit que les leads qui lui sont assignés.",
	},
	{
		value: "integrations",
		label: "Intégrations",
		description:
			"Branche les outils externes : Make, Zapier, webhooks, systeme.io. Ne voit ni les leads, ni les appels, ni les chiffres.",
	},
	{
		value: "viewer",
		label: "Observateur (lecture seule)",
		description:
			"Voit tous les rendez-vous, les leads et le chiffre d'affaires, sans rien pouvoir modifier. Pour un accompagnant externe.",
	},
	{
		value: "admin",
		label: "Admin",
		description: "Accès complet, y compris la gestion des membres.",
	},
] as const;

// Plus proposés, mais toujours portés par des comptes existants : il faut
// pouvoir les nommer à l'écran.
const LEGACY_ROLES: Record<string, string> = {
	setter: "Setter",
	coach: "Coach",
	head_of_sales: "Head of Sales",
	ceo: "CEO",
	ops: "Ops",
};

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

// Branchement des outils externes. Miroir de canManageIntegrations() côté
// serveur, qui reste l'autorité.
export function canManageIntegrations(profile: ProfileLike): boolean {
	if (!profile) return false;
	return canAdminister(profile) || profile.role === "integrations";
}

// Un compte qui ne fait que brancher des outils : tout le reste lui est fermé,
// et l'interface le lui dit au lieu de le laisser buter sur une erreur.
export function isIntegrationsOnly(profile: ProfileLike): boolean {
	return Boolean(profile) && profile?.role === "integrations";
}

export function roleLabel(role: string | null | undefined): string {
	return (
		INVITABLE_ROLES.find((r) => r.value === role)?.label ??
		LEGACY_ROLES[role ?? ""] ??
		"—"
	);
}
