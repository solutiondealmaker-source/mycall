# iClone — Architecture Decision Records

Short-form ADRs for non-obvious decisions made during V1. Each record explains why, not what.

---

## ADR-001: Convex Auth instead of Better Auth

**Date:** 2026-05-12  
**Status:** accepted

### Context

The original stack spec used Better Auth with the `@better-auth-kit/convex` adapter. During Phase 2, the adapter broke during setup — the Convex adapter package had a compatibility bug with the current `better-auth` version that prevented the auth tables from being created correctly.

### Decision

Replace Better Auth with `@convex-dev/auth` (Convex Auth). Use the `Password` provider only (email + password). Google sign-in was not needed — Google OAuth is used exclusively for Calendar sync through a separate flow.

### Consequences

- Auth is tightly coupled to Convex (simpler architecture, no adapter layer).
- The `users` table in `convex/schema.ts` overrides `authTables.users` with business fields (see ADR-008).
- Session management, token rotation, and sign-in routes are handled by Convex Auth's built-in `httpRouter` integration.
- Migrating to a different auth system later requires a schema migration on the `users` table.
- The `INSTALL.md` references `BETTER_AUTH_SECRET` — this is a documentation artifact from Phase 14 that should be updated to `CONVEX_AUTH_PRIVATE_KEY` for new deployments.

---

## ADR-002: Google OAuth tokens stored in plain text (V1)

**Date:** 2026-05-12  
**Status:** accepted, superseded by V1.5 plan

### Context

Google `accessToken` and `refreshToken` are stored in the `userGoogleAccounts` table without application-level encryption. The rationale in V1: Convex encrypts data at rest, and application-level encryption adds key management complexity (key rotation, encrypted field querying) that was out of scope for V1.

### Decision

Store tokens in plain text. Convex at-rest encryption is the sole protection at V1.

### Consequences

- A compromised Convex deployment key exposes all Google tokens.
- V1.5 adds `APP_ENCRYPTION_KEY` and encrypts `accessToken` and `refreshToken` before writing to the database.
- No index-based lookup is done on token fields — only on `googleSub`, `userId`, `channelId` — so application-level encryption in V1.5 will not break query patterns.

---

## ADR-003: Google Calendar OAuth callback on `*.convex.site`

**Date:** 2026-05-12  
**Status:** accepted

### Context

Google silently drops the OAuth authorization code when redirecting to third-party domains for unverified apps requesting sensitive scopes (`calendar`, `calendar.events`). This is a known Google behavior, not a bug. Any redirect URI on `yourdomain.com` or `localhost` causes a silent code drop — the user is redirected but the code is missing.

### Decision

The OAuth callback MUST be a Convex `httpAction` on `*.convex.site`. The Next.js route `/api/google/start` initiates the flow but builds the `redirectUri` from `NEXT_PUBLIC_CONVEX_SITE_URL`, not from the Next.js app URL.

```
/api/google/start (Next.js)
  → redirectUri = ${NEXT_PUBLIC_CONVEX_SITE_URL}/google/callback
  → Google accounts.google.com
  → /google/callback (Convex httpAction on *.convex.site)
  → redirect back to app
```

### Consequences

- Two environment variables must carry the same Convex deployment base URL: `NEXT_PUBLIC_CONVEX_SITE_URL` (Next.js) and `CONVEX_SITE_URL` (Convex). If either is wrong or points to `.convex.cloud` instead of `.convex.site`, OAuth silently fails.
- The Google Cloud Console authorized redirect URI list must contain the `*.convex.site` URL, not the app domain.
- This pattern applies to all future OAuth providers that have the same Google-style redirect URI restriction.

---

## ADR-004: Server-side seat hold (60 seconds)

**Date:** 2026-05-12  
**Status:** accepted

### Context

Two prospects can view the same available slot simultaneously. Without a locking mechanism, both can submit the booking form at the same time. The Convex mutation `reserveBookingSlot` is atomic, but the Google Calendar event creation (the action) runs outside the transaction. Between the mutation and the action, the slot appears free to a concurrent request.

### Decision

The `reserveBookingInternal` mutation inserts a booking row with `googleSyncStatus: "pending"`. The `isActiveSeatHold` function treats any booking with `status: "pending"` as active for 60 seconds from `_creationTime`. Slot computation queries count pending-within-60s bookings as occupied.

```ts
function isActiveSeatHold(b): boolean {
  if (b.googleSyncStatus !== "pending") return true; // synced/failed/na always active
  return Date.now() - b._creationTime < 60_000;      // pending: active for 60s only
}
```

The cron `cleanupOrphanBookings` (every 5 min) flags any `pending` booking older than 2 min as `failed` — catching action crashes before rollback.

### Consequences

- A slot can appear locked for up to 60s even if the booking ultimately fails. This is acceptable: 60s is shorter than the time a user takes to fill the form.
- Optimistic locking (reserve-then-check) was not used because Convex mutations cannot call external APIs.
- The `rollbackBookingInternal` mutation only deletes a booking if it is still in `pending` state — preventing a rollback from deleting a finalized booking in a race.

---

## ADR-005: CRM built-in (no HubSpot/Pipedrive integration at V1)

**Date:** 2026-05-12  
**Status:** accepted

### Context

iClosed integrates with external CRMs (HubSpot, Pipedrive, GoHighLevel). Building and maintaining webhooks for each CRM is significant scope. iClone's target users are small sales teams that do not already have a CRM or want a tighter booking-to-outcome loop.

### Decision

Build a simple CRM directly in iClone: lead pipeline (status + phase), notes, follow-ups, outcomes, loss reasons. No external CRM integration at V1.

### Consequences

- Zero external API dependency for CRM features — simpler deploy, no webhook config.
- Teams already on HubSpot/Pipedrive must manually export or wait for V2 webhooks.
- The `leads` table is the source of truth. If external CRM integration is added later, it maps outbound from `leads` mutations.
- V2 roadmap item: outbound webhooks on lead status changes.

---

## ADR-006: Convex `--prod` deploy via deploy key, not `--prod` CLI flag

**Date:** 2026-05-12  
**Status:** accepted

### Context

Older Convex CLI versions used `CONVEX_DEPLOY_KEY=<key> bunx convex deploy --prod --yes`. The current Convex CLI (1.38+) changed behavior: providing `CONVEX_DEPLOY_KEY` as an environment variable is sufficient to target the production deployment. The `--prod` flag still works but is redundant when the deploy key is already a production key.

In CI, the GitHub Actions workflow sets `CONVEX_DEPLOY_KEY` as a secret. The deploy command is:

```bash
CONVEX_DEPLOY_KEY=${{ secrets.CONVEX_DEPLOY_KEY }} bunx convex deploy --yes
```

### Consequences

- Scripts that rely on `--prod` flag alone (without a deploy key env var) will not target prod — they will deploy to dev.
- The deploy key in `CONVEX_DEPLOY_KEY` must be the **production** deploy key from the Convex Dashboard. Using the dev key with `--prod` is an error.
- See [DEPLOYMENT.md](DEPLOYMENT.md) for the full CI/CD flow.

---

## ADR-007: Convex region `eu-west-1.convex.cloud`

**Date:** 2026-05-12  
**Status:** accepted

### Context

Convex supports regional deployments. The default URL format `<deployment>.convex.cloud` routes to the global region. The production deployment `acme-rabbit-123` was created in `eu-west-1`, which generates a regional URL: `acme-rabbit-123.eu-west-1.convex.cloud`.

Using the global URL pattern (`acme-rabbit-123.convex.cloud`) for an EU-region deployment returns 404 on all HTTP API calls, including Convex Auth routes. The `NEXT_PUBLIC_CONVEX_URL` environment variable must include the regional subdomain.

### Decision

Always use the full regional URL in `NEXT_PUBLIC_CONVEX_URL`:

```
https://acme-rabbit-123.eu-west-1.convex.cloud
```

Not:

```
https://acme-rabbit-123.convex.cloud  ← 404 on auth routes
```

### Consequences

- New deployments must check which region was selected at project creation. The Convex Dashboard shows the deployment URL — copy it verbatim.
- `CONVEX_SITE_URL` follows the same pattern: replace `.convex.cloud` with `.convex.site` on the regional URL, not the global one.

---

## ADR-008: `users` table overrides `authTables.users`

**Date:** 2026-05-12  
**Status:** accepted

### Context

`@convex-dev/auth` exports `authTables` which defines a `users` table with standard auth fields (`name`, `email`, `image`, `phone`, verification timestamps, `isAnonymous`). Convex Auth does not expose a built-in mechanism to extend these fields via a separate relation — the recommended pattern is to re-define the `users` table in `schema.ts` with both the auth fields and the business fields.

### Decision

`convex/schema.ts` spreads `...authTables` (for `authSessions`, `authAccounts`, `authVerificationCodes`, `authRateLimits`) but re-defines `users` with all standard Convex Auth fields plus the iClone business fields:

```ts
users: defineTable({
  // Convex Auth standard fields (same names as authTables.users)
  name, image, email, emailVerificationTime,
  phone, phoneVerificationTime, isAnonymous,

  // iClone business fields
  role: v.optional(v.union(
    v.literal("closer"), v.literal("setter"), v.literal("coach"),
    v.literal("head_of_sales"), v.literal("ceo"), v.literal("ops"),
    v.literal("admin"),
  )),
  isAdmin: v.optional(v.boolean()),
  defaultTimezone: v.optional(v.string()),
}).index("email", ["email"])
```

### Consequences

- The `email` index name is `"email"` (not `"by_email"`) to match the naming convention required by `@convex-dev/auth`. Deviating from this name breaks auth lookups.
- When `@convex-dev/auth` adds new fields to `authTables.users` in a future version, the override must be updated manually.
- `isAdmin` and `role` are independent: `isAdmin` gates UI features, `role` drives attribution and display logic.
