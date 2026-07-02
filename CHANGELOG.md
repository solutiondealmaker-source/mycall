# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/).

---

## [1.0.0] - 2026-05-12

### Added

**Booking**
- Public booking page `/book/[slug]` — 4-field form + custom qualification questions + date/time picker
- Silent lead capture: `partialLeads` created 600ms after first keystroke on name/phone fields
- Server-side disqualification rules — OR-evaluated against form answers, with custom redirect on disqualify
- Host attribution: round-robin and manual modes, priority tiers (high/medium/low), tiebreak by `userId` for determinism under concurrent requests
- Seat hold: server-side 60-second lock via `googleSyncStatus: "pending"` — prevents double-booking without optimistic locking
- Anti-orphan cron: `cleanupOrphanBookings` flags pending bookings older than 2 minutes as failed
- Cancel link: `/book/manage/[token]` — opaque token, no auth required
- Reschedule link: `/book/reschedule/[token]` — opaque token, uses `rescheduleRangeDays` window, preserves host preference when `rescheduleWithSameHost: true`
- Booking confirmation redirect or custom confirmation page per event

**CRM**
- Lead table `/crm` — filterable by status, closer, source, date range
- Lead fiche `/crm/[id]` — full timeline, notes, follow-ups, booking history
- Dual outcome axes per booking: `tenue` (attendance) + `issue` (sales result)
- Outcome recording: won amount in centimes, loss reason (from catalogue), follow-up scheduling
- `bookingActivityLog` immutable audit trail — all booking mutations tracked with actor and metadata
- Lead pipeline: 7 statuses (`potentiel` → `qualifie` → `rdv_reserve` → `tenu` → `gagne`/`perdu`/`follow_up`)
- Silence auto-lose: daily cron marks leads without interaction after N days as lost (configurable via `pipelineSettings`)

**Events**
- Event list `/events` — active/inactive toggle, slug display, host count
- Event editor `/events/[id]/edit` — full configuration: duration, buffers, slot increment, timezone, availability window, host assignment, question builder
- New event `/events/new`
- Per-event Google Calendar invitation templates (greeting, body, signature)
- Per-event confirmation page config and redirect URL

**Availability**
- Host weekly availability editor in Settings — per-day start/end minute windows
- `userAvailability` table: `dayOfWeek` (0=Sun, 6=Sat) + `startMinute`/`endMinute` in host local timezone
- Slot computation: pure function `computeSlotsForDay` with zero Convex dependencies, unit-testable in isolation
- Rolling window + `alwaysAvailableDays` override (DOW bypass with hard 365-day cap)
- Minimum notice hours enforcement

**Google Calendar sync**
- Multi-account Google OAuth connect per host (separate from sign-in)
- Writer calendar config: one calendar per host where events and Meet links are created
- Conflict-check calendars: multiple calendars scanned for busy blocks
- Google Meet link generation on booking (`conferenceDataVersion=1`)
- Incremental sync via push webhooks on `*.convex.site` — `syncToken`-based, 410-recovery full resync
- Daily channel renew cron (04:00 UTC) with 48h expiry threshold and jitter
- Daily full resync cron (04:15 UTC) — correction for missed push notifications
- `hostBusyBlocks` cache: `transparency: "transparent"` events excluded from conflict check
- Fail-closed host selection: hosts without an active webhook channel on all configured calendars are excluded from attribution

**Notifications**
- Booking confirmation email to prospect (Resend)
- Booking notification email to host (Resend)
- Booking reminder email H-2 (Resend, cron every 5 min in ±15 min window)
- Cancellation email to prospect
- Reschedule confirmation email to prospect
- `notificationLogs` table with daily truncation to 200 rows

**Analytics**
- Funnel dashboard `/analytics` — views → contacts → confirmed calls, per event and date range
- Conversion rates per funnel step
- Loss reason breakdown chart
- Built with Recharts

**Auth**
- Email + password sign-in via Convex Auth (`@convex-dev/auth` Password provider)
- Roles: `closer`, `setter`, `coach`, `head_of_sales`, `ceo`, `ops`, `admin`
- `isAdmin` boolean for UI privilege gates (independent of `role`)
- Password reset flow `/reset`

### Architecture

- Convex Auth instead of Better Auth (see ADR-001) — tighter integration, no adapter layer
- `users` table overrides `authTables.users` to add business fields without a separate relation (see ADR-008)
- Google OAuth callback and Calendar webhooks on `*.convex.site` httpActions (see ADR-003)
- Google OAuth tokens stored in plain text V1 — Convex at-rest encryption only (see ADR-002)
- Convex region `eu-west-1.convex.cloud` — full regional URL required in `NEXT_PUBLIC_CONVEX_URL` (see ADR-007)
- Seat hold implemented server-side via `isActiveSeatHold` check on 60-second `pending` window (see ADR-004)
- CRM built-in — no external CRM integration (see ADR-005)
- Convex `--prod` deploy via deploy key environment variable, not `--prod` CLI flag (see ADR-006)

### Infrastructure

- Docker multi-stage build — `output: "standalone"` Next.js, minimal image
- GitHub Actions CI/CD pipeline: quality (Biome + tsc + bun test) → Convex deploy → Docker build + GHCR push → SSH VPS deploy
- Healthcheck-gated deploy with automatic rollback to previous image SHA on failure
- Caddy / Nginx / Coolify reverse proxy options documented
- VPS setup guide for Ubuntu 22.04+

---

[1.0.0]: https://github.com/endosia/iclone/releases/tag/v1.0.0
