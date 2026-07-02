# iClone — Architecture

Source of truth for the system structure. For setup instructions see [INSTALL.md](INSTALL.md). For deployment see [DEPLOYMENT.md](DEPLOYMENT.md). For data model see [SCHEMA.md](SCHEMA.md). For key decisions see [ADRS.md](ADRS.md).

---

## Stack

| Layer | Technology | Version |
|-------|-----------|---------|
| Frontend runtime | Next.js App Router | 16.2.6 |
| UI library | React | 19.2.4 |
| Language | TypeScript strict | 5.x |
| Styling | Tailwind v4 + shadcn/ui (Nova) | 4.x |
| Animation | Framer Motion | 12.x |
| Backend / DB | Convex | 1.38 |
| Auth | Convex Auth (`@convex-dev/auth`) | 0.0.92 |
| Auth provider | Password (email + password) | — |
| Email | Resend | — |
| Calendar | Google Calendar API v3 | — |
| Linter/formatter | Biome | 2.4 |
| Runtime | Bun | 1.3+ |
| Containerization | Docker multi-stage | — |
| CI/CD | GitHub Actions → GHCR → SSH VPS | — |

Convex deployment region: `eu-west-1.convex.cloud` (see ADR-007).

---

## System overview

```
┌─────────────────────────────────────────────────────────────────────┐
│  Public internet                                                      │
│                                                                       │
│  Prospect ──► /book/[slug]                                            │
│                  │                                                    │
│                  ├─ capturePartialLead (600ms after first keystroke)  │
│                  ├─ reserveBookingInternal (seat hold 60s)            │
│                  ├─ createGoogleEventForBooking (action, Node)        │
│                  ├─ finalizeBookingInternal (commit lead + notify)    │
│                  └─ /book/manage/[token]  ── cancel / reschedule      │
│                                                                       │
└─────────────────────────────────────────────────────────────────────┘
                             │
                    Convex (eu-west-1)
                             │
┌─────────────────────────────────────────────────────────────────────┐
│  Admin / Closer (authenticated)                                       │
│                                                                       │
│  /dashboard    ── upcoming bookings                                   │
│  /events       ── event configuration, availability                   │
│  /crm          ── lead table + fiche + outcomes                       │
│  /analytics    ── funnel vues → contacts → calls + loss reasons       │
│  /settings     ── profile, availability, Google Calendar connect      │
│                                                                       │
└─────────────────────────────────────────────────────────────────────┘
                             │
┌─────────────────────────────────────────────────────────────────────┐
│  External APIs                                                        │
│                                                                       │
│  Google Calendar API ←──── OAuth callback on *.convex.site           │
│                       ──── push webhook on *.convex.site             │
│  Resend               ──── transactional email (5 templates)         │
│                                                                       │
└─────────────────────────────────────────────────────────────────────┘
```

---

## Layers

### Frontend — Next.js App Router

Route groups:

| Group | Routes | Auth |
|-------|--------|------|
| `(auth)` | `/login`, `/signup`, `/reset` | public |
| `(book)` | `/book/[slug]`, `/book/manage/[token]`, `/book/reschedule/[token]` | public |
| `(dashboard)` | `/dashboard`, `/events`, `/events/[id]/edit`, `/crm`, `/crm/[id]`, `/analytics`, `/settings/*` | required |

Client state: Convex reactive queries directly. No Redux, no separate state manager. `useQuery` subscriptions auto-update all open clients when a mutation commits.

### Backend — Convex

All business logic runs in Convex. Four primitive types:

- **`query`** — pure read, reactive, auto-subscribes connected clients.
- **`mutation`** — transactional write, atomic. No external API calls.
- **`action`** — external API calls (Google Calendar, Resend). Can call queries and mutations internally.
- **`httpAction`** — HTTP endpoints on `*.convex.site`. Used for Google OAuth callback and Google Calendar webhook.

Scheduled jobs (crons):

| Job | Schedule | Purpose |
|-----|----------|---------|
| `cleanupOrphanBookings` | every 5 min | Flag `pending` bookings older than 2 min as `failed` |
| `sendReminders` | every 5 min | Email reminder in [+1h45, +2h15] window before booking |
| `detectAbandonedLeads` | every 10 min | Flag `partialLeads` without a booking after 10 min |
| `autoMarkLostLeads` | daily 03:00 UTC | Auto-lose leads silent for N days (from `pipelineSettings`) |
| `truncateNotificationLogs` | daily 04:00 UTC | Keep last 200 notification log rows |

### Auth — Convex Auth

Convex Auth with the `Password` provider only (email + password). Google sign-in was removed — Google OAuth is used exclusively for Calendar sync via a separate flow (see ADR-001).

The `users` table overrides `authTables.users` to add business fields: `role`, `isAdmin`, `defaultTimezone` (see ADR-008).

Session tokens are managed by `@convex-dev/auth`. The Next.js middleware (`convexAuthNextjsMiddleware`) protects the `(dashboard)` route group.

### External APIs

**Google Calendar** — two distinct OAuth flows, both routed through `*.convex.site`:
1. Initiation: `GET /api/google/start` (Next.js route handler) — builds redirect URL, signs HMAC state.
2. Callback: `GET /google/callback` (Convex httpAction) — validates HMAC, exchanges code, stores tokens.
3. Webhooks: `POST /webhooks/google-calendar` (Convex httpAction) — validates channel token, schedules incremental sync.

**Resend** — five email templates sent from Convex actions: booking confirmation (prospect), booking notification (host), booking reminder H-2, cancellation, reschedule.

---

## Booking data flow

The booking flow is the most critical path. It is split into three phases to avoid race conditions.

```
Client                   Convex mutation              Convex action (Node)
──────                   ───────────────              ────────────────────

1. User fills form
   → 600ms after first
     keystroke on phone:

   capturePartialLead ──► upsert partialLeads
                          upsert/patch leads (potentiel)
                          arm abandonedLeads scheduler (once)

2. User picks slot + submits:

   reserveBookingSlot ──► preflightBooking (validation)
                          resolveAvailableHost (round-robin)
                          insert booking { googleSyncStatus: "pending" }
                            ↑ seat hold — counted as active for 60s

                                          createBookingChecked ──► Google Calendar API
                                            ↑ if host has no active channel → reject (fail-closed)
                                            ↑ conferenceDataVersion=1 for Meet link

                          finalizeBookingInternal ──► patch booking { synced, googleEventId, googleMeetUrl }
                                                      commitBookingLead (upsert lead → rdv_reserve)
                                                      bookingActivityLog insert
                                                      scheduleEmails (confirmation + host notif)

                OR on failure:

                          rollbackBookingInternal ──► DELETE booking (only if still "pending")
                                                      lead never touched

3. Cron (every 5 min):
   cleanupOrphanBookings — flags pending > 2 min as "failed"
   (catches crashes between reserve and finalize/rollback)
```

---

## Slot computation

Slot availability is computed by a pure function `computeSlotsForDay` in `convex/lib/slotComputation.ts`. The function has no Convex dependencies and can be unit-tested in isolation.

The query layer pre-fetches per-host context (availability windows, existing bookings, Google busy blocks) and passes it as plain objects. The function applies four filters per candidate slot:

1. Slot does not cross midnight in the host's timezone.
2. `[slotStartMin, slotEndMin]` falls within a `userAvailability` window for that day-of-week.
3. No existing booking with buffer overlaps: `slotStart < booking.endTime + bufferAfter && slotEnd > booking.startTime - bufferBefore`.
4. No `hostBusyBlocks` entry overlaps (from Google Calendar cache).

A booking with `googleSyncStatus: "pending"` is treated as active for 60 seconds (`isActiveSeatHold`). After 60s, the pending seat expires and the slot opens again.

---

## Google Calendar sync

Multi-account design: each host can connect multiple Google accounts. Configuration is split:

- **writer** — one account + one calendar where iClone creates events and Meet links.
- **conflictCheckCalendars** — array of `{accountId, calendarId}` used to detect busy blocks.

The writer calendar is always included in conflict-check (safety net).

Google push notifications are received at `/webhooks/google-calendar` on `*.convex.site`. The handler responds within 200ms (immediately returns 200, schedules the sync async). Incremental sync uses `syncToken`; a 410 Gone response triggers a full resync.

Two daily crons maintain correctness:
- `renewExpiringChannels` (04:00 UTC) — renews webhook channels expiring within 48h.
- `dailyResyncAllCalendars` (04:15 UTC) — full resync per active channel, runs 15 min after renew to ensure fresh channels.

---

## Security model

**Seat hold** — the `isActiveSeatHold` function treats a booking with `googleSyncStatus: "pending"` as active for 60s. Concurrent requests to `reserveBookingSlot` will not see the slot as free during those 60s. No optimistic locking — the Convex mutation transaction provides the atomic guarantee.

**Role-based access** — `users.role` is one of: `closer`, `setter`, `coach`, `head_of_sales`, `ceo`, `ops`, `admin`. `users.isAdmin` is a separate boolean for UI privilege gates. Authorization checks run server-side in every protected query and mutation.

**Public tokens** — cancel and reschedule links use opaque tokens (`crypto.randomUUID().replace(/-/g, "")`). Tokens are generated at booking creation, stored in `bookings.cancelToken` and `bookings.rescheduleToken`, looked up via indexes `by_cancelToken` and `by_rescheduleToken`. They are never regenerated.

**Google OAuth state** — HMAC-signed with `GOOGLE_OAUTH_STATE_SECRET` (same secret in Next.js and Convex). The state carries `userId + returnTo + nonce + exp=+10min`. The callback validates the HMAC before exchanging the code.

**Token storage** — Google access and refresh tokens are stored in plain text in Convex V1. Convex encrypts at rest. Application-level encryption is planned for V1.5 (`APP_ENCRYPTION_KEY`). See ADR-002.

---

## Performance

Convex reactive queries eliminate polling. All dashboard pages subscribe to live queries — updates are pushed when a mutation commits anywhere in the system.

Critical indexes (the five that hit every hot path):

| Index | Table | Query pattern |
|-------|-------|--------------|
| `by_hostId_startTime` | `bookings` | Per-host booking list for slot computation |
| `by_slug` | `events` | Public booking page load |
| `by_cancelToken` | `bookings` | Cancel link lookup |
| `by_rescheduleToken` | `bookings` | Reschedule link lookup |
| `by_userId_start` | `hostBusyBlocks` | Google busy block range scan per host |

Next.js is built as a standalone Docker image (`output: "standalone"` in `next.config.ts`), which strips unused files and reduces container size.

---

## Multi-tenancy

V1 is single-workspace. All data belongs to one deployment. Multi-organization support (workspace isolation, per-org billing) is scoped to V2.

---

## Reference documents

- Booking algorithm + seat hold details: [discovery/01-booking-core.md](discovery/01-booking-core.md)
- Google OAuth + Calendar sync: [discovery/02-google-sync.md](discovery/02-google-sync.md)
- Booking UX patterns: [discovery/03-ui-booking.md](discovery/03-ui-booking.md)
- Design system: [discovery/04-design-system.md](discovery/04-design-system.md)
- Full project spec: [../PROMPT.md](../PROMPT.md) (1290 lines, source of truth)
- Key decisions: [ADRS.md](ADRS.md)
- Data model: [SCHEMA.md](SCHEMA.md)
