// Setup status — boolean checklist surfaced in the dashboard to guide
// fresh installs through the remaining configuration steps.
//
// Only exposes booleans, never secrets.

import { query } from "./_generated/server";
import { requireAuth } from "./lib/auth";

export const getSetupStatus = query({
	args: {},
	handler: async (ctx) => {
		const userId = await requireAuth(ctx);
		const user = await ctx.db.get(userId);

		// 1. Profile completeness
		const profileComplete = Boolean(
			user?.name && user.name.length > 0 && user.defaultTimezone,
		);

		// 2. At least one Google account connected for this user
		const googleAccount = await ctx.db
			.query("userGoogleAccounts")
			.withIndex("by_userId", (q) => q.eq("userId", userId))
			.first();
		const googleConnected = Boolean(googleAccount);

		// 3. Calendar writer + conflict-check configured
		const calSettings = await ctx.db
			.query("userCalendarSettings")
			.withIndex("by_userId", (q) => q.eq("userId", userId))
			.first();
		const calendarConfigured = Boolean(
			calSettings?.writerCalendarId &&
				calSettings.conflictCheckCalendars.length > 0,
		);

		// 4. At least one availability window
		const anyAvailability = await ctx.db
			.query("userAvailability")
			.withIndex("by_userId", (q) => q.eq("userId", userId))
			.first();
		const availabilityDefined = Boolean(anyAvailability);

		// 5. Resend env vars set (Convex-side) — non-secret booleans
		const resendConfigured = Boolean(process.env.RESEND_API_KEY);

		// 6. At least one event created
		const anyEvent = await ctx.db.query("events").first();
		const eventCreated = Boolean(anyEvent);

		// 7. At least one event with at least one host
		const anyHost = await ctx.db.query("eventHosts").first();
		const hostAssigned = Boolean(anyHost);

		const allComplete =
			profileComplete &&
			googleConnected &&
			calendarConfigured &&
			availabilityDefined &&
			resendConfigured &&
			eventCreated &&
			hostAssigned;

		return {
			allComplete,
			profileComplete,
			googleConnected,
			calendarConfigured,
			availabilityDefined,
			resendConfigured,
			eventCreated,
			hostAssigned,
		};
	},
});
