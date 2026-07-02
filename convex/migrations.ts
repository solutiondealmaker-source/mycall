// One-off migrations (V8 isolate — pas Node).
import { v } from "convex/values";
import { internalMutation } from "./_generated/server";

// Inspect the latest booking + its emails sent.
export const inspectLatestBooking = internalMutation({
	args: {},
	handler: async (ctx) => {
		const allBookings = await ctx.db.query("bookings").collect();
		const latest = allBookings.sort(
			(a, b) => b._creationTime - a._creationTime,
		)[0];
		if (!latest) return { error: "no bookings" };
		const logs = await ctx.db
			.query("notificationLogs")
			.withIndex("by_booking", (q) => q.eq("bookingId", latest._id))
			.collect();
		return {
			booking: {
				id: latest._id,
				prospect: latest.prospectName,
				startTime: new Date(latest.startTime).toISOString(),
				status: latest.status,
				googleSyncStatus: latest.googleSyncStatus,
				googleEventId: latest.googleEventId ?? null,
				googleMeetUrl: latest.googleMeetUrl ?? null,
				googleCalendarId: latest.googleCalendarId ?? null,
			},
			emailsSent: logs.map((l) => ({
				type: l.type,
				recipient: l.recipient,
				status: l.status,
				error: l.error ?? null,
				sentAt: new Date(l.sentAt).toISOString(),
			})),
		};
	},
});

// List all users with Google accounts.
export const listGoogleAccounts = internalMutation({
	args: {},
	handler: async (ctx) => {
		const accts = await ctx.db.query("userGoogleAccounts").collect();
		const detailed = await Promise.all(
			accts.map(async (a) => {
				const user = await ctx.db.get(a.userId);
				const settings = await ctx.db
					.query("userCalendarSettings")
					.withIndex("by_userId", (q) => q.eq("userId", a.userId))
					.first();
				return {
					accountId: a._id,
					userId: a.userId,
					userEmail: user?.email,
					userName: user?.name,
					googleEmail: a.googleEmail,
					writerSet: settings?.writerAccountId === a._id,
				};
			}),
		);
		return detailed;
	},
});

// Repair: migrate eventHosts.userId from removed → kept user.
export const repairEventHosts = internalMutation({
	args: { keepUserId: v.id("users"), removeUserId: v.id("users") },
	handler: async (ctx, { keepUserId, removeUserId }) => {
		const allHosts = await ctx.db.query("eventHosts").collect();
		let migrated = 0;
		let deletedDup = 0;
		for (const h of allHosts) {
			if (h.userId === removeUserId) {
				// Check duplicate (same event + keepUserId already)
				const dup = await ctx.db
					.query("eventHosts")
					.withIndex("by_eventId_userId", (q) =>
						q.eq("eventId", h.eventId).eq("userId", keepUserId),
					)
					.first();
				if (dup) {
					await ctx.db.delete(h._id);
					deletedDup++;
				} else {
					await ctx.db.patch(h._id, { userId: keepUserId });
					migrated++;
				}
			}
		}
		// Same for bookings.hostId
		const allBookings = await ctx.db.query("bookings").collect();
		let bookingsMigrated = 0;
		for (const b of allBookings) {
			if (b.hostId === removeUserId) {
				await ctx.db.patch(b._id, { hostId: keepUserId });
				bookingsMigrated++;
			}
		}
		return { migrated, deletedDup, bookingsMigrated };
	},
});

// Merge duplicate users — moves all references from src userId to target userId.
// CAREFUL: only call after verifying both users are the same human.
export const mergeUsers = internalMutation({
	args: { keepUserId: v.id("users"), removeUserId: v.id("users") },
	handler: async (ctx, { keepUserId, removeUserId }) => {
		if (keepUserId === removeUserId) return { error: "same id" };
		const counts: Record<string, number> = {};
		// userGoogleAccounts
		const accts = await ctx.db
			.query("userGoogleAccounts")
			.withIndex("by_userId", (q) => q.eq("userId", removeUserId))
			.collect();
		for (const a of accts) await ctx.db.patch(a._id, { userId: keepUserId });
		counts.userGoogleAccounts = accts.length;
		// userCalendarSettings — keep the one with writer set if possible
		const srcSet = await ctx.db
			.query("userCalendarSettings")
			.withIndex("by_userId", (q) => q.eq("userId", removeUserId))
			.first();
		const targetSet = await ctx.db
			.query("userCalendarSettings")
			.withIndex("by_userId", (q) => q.eq("userId", keepUserId))
			.first();
		if (srcSet) {
			if (targetSet) {
				// Merge: keep target, but copy writerAccountId if missing
				if (!targetSet.writerAccountId && srcSet.writerAccountId) {
					await ctx.db.patch(targetSet._id, {
						writerAccountId: srcSet.writerAccountId,
						writerCalendarId: srcSet.writerCalendarId,
						writerCalendarSummary: srcSet.writerCalendarSummary,
						conflictCheckCalendars: srcSet.conflictCheckCalendars,
					});
				}
				await ctx.db.delete(srcSet._id);
			} else {
				await ctx.db.patch(srcSet._id, { userId: keepUserId });
			}
		}
		counts.userCalendarSettings = srcSet ? 1 : 0;
		// userAvailability — move
		const avail = await ctx.db
			.query("userAvailability")
			.withIndex("by_userId", (q) => q.eq("userId", removeUserId))
			.collect();
		for (const a of avail) await ctx.db.patch(a._id, { userId: keepUserId });
		counts.userAvailability = avail.length;
		// Google channels + busy blocks
		const channels = await ctx.db
			.query("googleCalendarChannels")
			.withIndex("by_userId", (q) => q.eq("userId", removeUserId))
			.collect();
		for (const c of channels) await ctx.db.patch(c._id, { userId: keepUserId });
		counts.googleCalendarChannels = channels.length;
		// authAccounts (Convex Auth) — full scan (no index by userId in authTables)
		// biome-ignore lint/suspicious/noExplicitAny: dynamic table
		const allAuthAccts = await (ctx.db as any).query("authAccounts").collect();
		let movedAuth = 0;
		for (const a of allAuthAccts) {
			if (a.userId === removeUserId) {
				await ctx.db.patch(a._id, { userId: keepUserId });
				movedAuth++;
			}
		}
		counts.authAccounts = movedAuth;
		// biome-ignore lint/suspicious/noExplicitAny: dynamic table
		const allSessions = await (ctx.db as any).query("authSessions").collect();
		for (const s of allSessions) {
			if (s.userId === removeUserId) {
				await ctx.db.patch(s._id, { userId: keepUserId });
			}
		}
		// Delete the removed user (no FK enforcement in Convex)
		await ctx.db.delete(removeUserId);
		return { ok: true, counts };
	},
});

// Diagnostic — inspect the booking setup for an event slug.
export const inspectEventSetup = internalMutation({
	args: { slug: v.string() },
	handler: async (ctx, { slug }) => {
		const event = await ctx.db
			.query("events")
			.withIndex("by_slug", (q) => q.eq("slug", slug))
			.first();
		if (!event) return { error: "event not found" };
		const hosts = await ctx.db
			.query("eventHosts")
			.withIndex("by_eventId", (q) => q.eq("eventId", event._id))
			.collect();
		const hostsDetail = await Promise.all(
			hosts.map(async (h) => {
				const user = await ctx.db.get(h.userId);
				const avail = await ctx.db
					.query("userAvailability")
					.withIndex("by_userId", (q) => q.eq("userId", h.userId))
					.collect();
				const googleAccts = await ctx.db
					.query("userGoogleAccounts")
					.withIndex("by_userId", (q) => q.eq("userId", h.userId))
					.collect();
				const calSettings = await ctx.db
					.query("userCalendarSettings")
					.withIndex("by_userId", (q) => q.eq("userId", h.userId))
					.first();
				return {
					userId: h.userId,
					email: user?.email,
					name: user?.name,
					priority: h.priority,
					availabilityWindows: avail.length,
					googleAccountsCount: googleAccts.length,
					googleEmails: googleAccts.map((a) => a.googleEmail),
					writerSet: !!calSettings?.writerAccountId,
				};
			}),
		);
		return {
			event: {
				id: event._id,
				name: event.name,
				slug: event.slug,
				isActive: event.isActive,
				duration: event.durationMinutes,
				timezone: event.timezone,
			},
			hosts: hostsDetail,
		};
	},
});

// Add a host to an event by user email.
export const addHostToEvent = internalMutation({
	args: { slug: v.string(), userEmail: v.string() },
	handler: async (ctx, { slug, userEmail }) => {
		const event = await ctx.db
			.query("events")
			.withIndex("by_slug", (q) => q.eq("slug", slug))
			.first();
		if (!event) return { error: "event not found" };
		const user = await ctx.db
			.query("users")
			.withIndex("email", (q) => q.eq("email", userEmail))
			.first();
		if (!user) return { error: "user not found" };
		const existing = await ctx.db
			.query("eventHosts")
			.withIndex("by_eventId_userId", (q) =>
				q.eq("eventId", event._id).eq("userId", user._id),
			)
			.first();
		if (existing) return { ok: true, alreadyExists: true };
		const id = await ctx.db.insert("eventHosts", {
			eventId: event._id,
			userId: user._id,
			priority: "medium",
			createdAt: Date.now(),
		});
		return { ok: true, hostId: id };
	},
});

// Seed default availability Mon-Fri 9-12 + 14-18 for a user.
export const seedDefaultAvailability = internalMutation({
	args: { userEmail: v.string() },
	handler: async (ctx, { userEmail }) => {
		const user = await ctx.db
			.query("users")
			.withIndex("email", (q) => q.eq("email", userEmail))
			.first();
		if (!user) return { error: "user not found" };
		// Clear existing
		const existing = await ctx.db
			.query("userAvailability")
			.withIndex("by_userId", (q) => q.eq("userId", user._id))
			.collect();
		for (const e of existing) await ctx.db.delete(e._id);
		// Mon-Fri: dayOfWeek 1..5, 9h-12h + 14h-18h
		for (let dow = 1; dow <= 5; dow++) {
			await ctx.db.insert("userAvailability", {
				userId: user._id,
				dayOfWeek: dow,
				startMinute: 9 * 60,
				endMinute: 12 * 60,
			});
			await ctx.db.insert("userAvailability", {
				userId: user._id,
				dayOfWeek: dow,
				startMinute: 14 * 60,
				endMinute: 18 * 60,
			});
		}
		return { ok: true, userId: user._id, windowsCreated: 10 };
	},
});

// Promote ALL users matching email to admin.
export const promoteAdmin = internalMutation({
	args: { email: v.string() },
	handler: async (ctx, { email }) => {
		const users = await ctx.db
			.query("users")
			.withIndex("email", (q) => q.eq("email", email))
			.collect();
		for (const u of users) {
			await ctx.db.patch(u._id, { isAdmin: true, role: "admin" });
		}
		return { promoted: users.length, ids: users.map((u) => u._id) };
	},
});

// Wipe ALL Convex Auth state (sessions, accounts, refresh tokens, verifiers).
// Users métier sont PRÉSERVÉS. Run avant de recréer un password account propre.
export const wipeAuthState = internalMutation({
	args: {},
	handler: async (ctx) => {
		const tables = [
			"authSessions",
			"authAccounts",
			"authRefreshTokens",
			"authVerificationCodes",
			"authVerifiers",
			"authRateLimits",
		] as const;
		const counts: Record<string, number> = {};
		for (const table of tables) {
			// biome-ignore lint/suspicious/noExplicitAny: dynamic table iteration
			const rows = await (ctx.db as any).query(table).collect();
			for (const r of rows) await ctx.db.delete(r._id);
			counts[table] = rows.length;
		}
		return counts;
	},
});

// Drop legacy `emailVerified` field from existing users (BA → Convex Auth migration)
export const stripLegacyEmailVerified = internalMutation({
	args: {},
	handler: async (ctx) => {
		const users = await ctx.db.query("users").collect();
		let patched = 0;
		for (const u of users) {
			// biome-ignore lint/suspicious/noExplicitAny: legacy field cleanup
			if ("emailVerified" in (u as any)) {
				// biome-ignore lint/suspicious/noExplicitAny: legacy field cleanup
				const { emailVerified, ...rest } = u as any;
				await ctx.db.replace(u._id, rest);
				patched++;
			}
		}
		return { patched };
	},
});
