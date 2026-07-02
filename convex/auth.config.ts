/**
 * Convex auth config — déclare les issuers JWT trusted.
 * Pour Convex Auth, l'issuer est l'URL convex.site du deployment.
 */
// biome-ignore lint/style/noDefaultExport: required by Convex
export default {
	providers: [
		{
			// biome-ignore lint/suspicious/noExplicitAny: process.env available at runtime
			domain: (globalThis as any).process?.env?.CONVEX_SITE_URL,
			applicationID: "convex",
		},
	],
};
