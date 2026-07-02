# iClone — Data Model

Convex schema V1. 20 tables: 1 auth override + 19 business tables.

Source of truth: `convex/schema.ts`.

---

## Table index

| Table | Group | Description |
|-------|-------|-------------|
| `users` | Auth | Convex Auth users + iClone business fields (role, isAdmin, timezone) |
| `events` | Booking core | Event type configuration (slug, duration, availability rules, hosts) |
| `eventHosts` | Booking core | Closers assigned to an event with priority level |
| `eventQuestions` | Booking core | Qualification form questions per event |
| `userAvailability` | Booking core | Weekly availability windows per host (day-of-week + minute range) |
| `partialLeads` | Booking core | Silent capture of a prospect while they fill the booking form |
| `leads` | CRM | Qualified prospect — CRM source of truth |
| `bookings` | Booking core | Confirmed (or historical) booking of a time slot |
| `bookingActivityLog` | Audit | Immutable audit trail of all booking mutations |
| `bookingPageViews` | Analytics | Page view events per event slug for funnel analytics |
| `userGoogleAccounts` | Google sync | Google OAuth accounts connected per user (multi-account) |
| `userCalendarSettings` | Google sync | Writer calendar + conflict-check calendars per user |
| `googleCalendarChannels` | Google sync | Active webhook push channels per user + calendar |
| `hostBusyBlocks` | Google sync | Cached busy blocks from Google (updated via incremental sync) |
| `leadNotes` | CRM | Free-text notes on a lead (timeline) |
| `leadFollowUps` | CRM | Scheduled follow-up tasks on a lead |
| `lossReasons` | Catalogue | Shared catalogue of call loss reasons |
| `leadSources` | Catalogue | Lead source tags for provenance tracking |
| `pipelineSettings` | Catalogue | Singleton pipeline config (silence alert/auto-lose thresholds) |
| `notificationLogs` | Audit | Log of all outbound notifications (email) |

---

## Core tables

### `events`

Configuration for a public booking page. One `events` row = one URL (`/book/[slug]`).

Key fields:

| Field | Type | Notes |
|-------|------|-------|
| `slug` | `string` | Public URL identifier — unique |
| `durationMinutes` | `number` | Call duration |
| `bufferBeforeMinutes` | `number?` | Buffer added before each booking in slot computation |
| `bufferAfterMinutes` | `number?` | Buffer added after each booking in slot computation |
| `slotIncrementMinutes` | `number?` | Step between candidate slots (default: `durationMinutes`) |
| `timezone` | `string` | Presentation timezone, e.g. `"Europe/Paris"` |
| `rangeType` | `"rolling" \| "indefinite"` | Booking window type |
| `rangeDays` | `number?` | Days ahead visible (rolling mode) |
| `alwaysAvailableDays` | `boolean \| number[]?` | DOW indexes that bypass the rolling window (hard cap: 365 days) |
| `minimumNoticeHours` | `number?` | Minimum lead time before a slot can be booked |
| `priorityMode` | `"manual" \| "round_robin"` | Host attribution algorithm |
| `disqualificationRules` | `Array<{questionLabel, answers[]}>`? | OR-evaluated — first match disqualifies |
| `isActive` | `boolean` | Inactive events 404 on the public booking page |

Indexes: `by_slug`, `by_isActive`, `by_setterId`

---

### `bookings`

One row per booked time slot. Created by `reserveBookingInternal`, finalized by `finalizeBookingInternal`.

Key fields:

| Field | Type | Notes |
|-------|------|-------|
| `eventId` | `Id<"events">` | |
| `hostId` | `Id<"users">` | Assigned closer |
| `leadId` | `Id<"leads">?` | Set at finalize — not during seat hold |
| `partialLeadId` | `Id<"partialLeads">?` | Link to the silent capture row |
| `startTime` | `number` | ms epoch UTC |
| `endTime` | `number` | ms epoch UTC |
| `googleSyncStatus` | `"pending" \| "synced" \| "failed" \| "na"` | `pending` = seat hold; `na` = custom location |
| `status` | `"confirmed" \| "cancelled" \| "rescheduled" \| "no_show" \| "completed"` | Booking lifecycle |
| `tenue` | `"planifie" \| "tenu" \| "no_show" \| "annule"` | Call attendance axis (orthogonal to `issue`) |
| `issue` | `"en_attente" \| "follow_up" \| "gagne" \| "perdu"` | Sales outcome axis |
| `cancelToken` | `string` | Opaque UUID-derived token — lookup via `by_cancelToken` |
| `rescheduleToken` | `string` | Opaque UUID-derived token — lookup via `by_rescheduleToken` |

Indexes: `by_hostId_startTime`, `by_eventId_startTime`, `by_cancelToken`, `by_rescheduleToken`, `by_eventId_email`, `by_eventId_phone`, `by_googleSyncStatus`, `by_leadId_startTime`, `by_status_startTime`, `by_partialLeadId`

---

### `leads`

CRM source of truth for a prospect. Created or upserted by `capturePartialLead` and `commitBookingLead`.

Key fields:

| Field | Type | Notes |
|-------|------|-------|
| `phoneNormalized` | `string?` | E.164 format — dedup key |
| `emailNormalized` | `string?` | Lowercase trimmed — dedup key |
| `status` | `"potentiel" \| "qualifie" \| "rdv_reserve" \| "tenu" \| "gagne" \| "perdu" \| "follow_up"` | Pipeline stage |
| `closerUserId` | `Id<"users">?` | Attribution |
| `setterUserId` | `Id<"users">?` | Attribution |
| `montantContracte` | `number?` | In centimes — set when `issue = "gagne"` |
| `convertedAt` | `number?` | Timestamp of first won booking |

Indexes: `by_phoneNormalized`, `by_emailNormalized`, `by_status`, `by_closerUserId`, `by_setterUserId`, `by_eventId`

Dedup logic: `findLeadByAnyKey` queries `by_phoneNormalized` then `by_emailNormalized`. A match patches the existing lead rather than inserting a duplicate.

---

### `partialLeads`

Silent capture of a prospect while filling the booking form. Created on the first `blur` event of phone/name fields (debounced client-side, idempotent server-side via `sessionId`).

Key fields:

| Field | Type | Notes |
|-------|------|-------|
| `sessionId` | `string` | Browser session dedup key — primary lookup |
| `promotedLeadId` | `Id<"leads">?` | Set when a `leads` row is created/matched |
| `bookingId` | `Id<"bookings">?` | Set at finalize |
| `abandonedNotifiedAt` | `number?` | Timestamp of the abandoned lead notification |
| `firstSeenAt` | `number` | |
| `lastUpdatedAt` | `number` | Patched on each form keystroke save |

Indexes: `by_sessionId`, `by_eventId`, `by_eventId_phoneNormalized`, `by_eventId_emailNormalized`

---

### `bookingActivityLog`

Immutable audit trail. One row per mutation on a booking. Never updated, never deleted.

Key fields:

| Field | Type | Notes |
|-------|------|-------|
| `bookingId` | `Id<"bookings">` | |
| `type` | union | One of 11 event types (`created`, `cancelled`, `rescheduled`, `outcome_recorded`, etc.) |
| `actorType` | `"user" \| "prospect" \| "system" \| "google_sync"` | |
| `payload` | `any` | Free metadata: `previousStartTime`, `newStartTime`, `reason`, `previousHostId`, etc. |
| `createdAt` | `number` | |

Indexes: `by_booking`, `by_booking_type`, `by_lead_date`

---

## Relations

```
events ────────────────── eventHosts (N) ──── users
  │                        priority: high/medium/low
  │
  └───────────────────── eventQuestions (N)

users ──────────────────── userAvailability (N)
  │                         dayOfWeek, startMinute, endMinute
  │
  └───────────────────── userGoogleAccounts (N)
  │                         googleSub (dedup key)
  │
  └───────────────────── userCalendarSettings (1)
                            writerAccountId → userGoogleAccounts
                            conflictCheckCalendars[] → userGoogleAccounts

bookings ───────────────── leads (1)
  │                         upserted at finalize
  │
  ├─────────────────────── partialLeads (1)
  │                         linked at finalize
  │
  ├─────────────────────── bookingActivityLog (N)
  │
  └─────────────────────── users (hostId)

googleCalendarChannels ─── userGoogleAccounts
hostBusyBlocks ──────────── userGoogleAccounts

leads ──────────────────── leadNotes (N)
  │
  └───────────────────── leadFollowUps (N)
  │
  └───────────────────── bookings (N, via leadId)

bookings ───────────────── lossReasons (via issueLossReasonId)
```

---

## Index naming convention

All custom indexes follow `by_<field>` or `by_<field1>_<field2>` naming. The only exception is the `users.email` index, which must be named `"email"` (without `by_`) to satisfy the `@convex-dev/auth` internal lookup convention (see ADR-008).
