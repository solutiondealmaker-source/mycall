<div align="center">

# iClone

**Open-source booking + CRM for sales teams. Self-hosted, free, no per-seat fees.**

[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](https://opensource.org/licenses/MIT)
[![Built with Convex](https://img.shields.io/badge/built%20with-Convex-orange.svg)](https://www.convex.dev)
[![Next.js 16](https://img.shields.io/badge/Next.js-16-black.svg)](https://nextjs.org)
[![Runtime: Bun](https://img.shields.io/badge/runtime-Bun-fbf0df.svg)](https://bun.sh)

</div>

---

## Why iClone

iClosed charges **$19–$120 per seat per month**. A 10-closer team on Business pays **~€14,400/year** just to book sales calls.

iClone reproduces the parts of iClosed that actually matter — silent lead capture, anti-double-booking, host round-robin, Google Calendar sync, CRM with outcomes, email reminders — as self-hostable code. Clone, set up in ~10 minutes, deploy on any VPS.

## What's inside

- **Public booking page** at `/book/[slug]` — 4 primary fields + custom questions + live calendar + 3-step flow
- **Silent partial lead capture** — phone + first name + last name persisted before the prospect even picks a slot
- **Anti-double-booking** — atomic 60s seat hold, host round-robin by priority, fail-closed on Google sync errors
- **Multi-account Google Calendar** per host — separate writer + conflict-check calendars, push webhooks, daily resync cron
- **Built-in CRM** — leads table with filters, lead drawer with timeline, call outcomes (won / lost / follow-up / no-show)
- **Disqualification rules** — gate the calendar behind custom questions, redirect after N seconds
- **Rich-text event description** — Tiptap editor, rendered safely on the public page (DOMPurify)
- **Resend transactional emails** — confirmation, host notification, H-2 reminder
- **Analytics funnel** — views → captured contacts → confirmed calls + conversion rates + loss reasons
- **Cancel + reschedule** via signed opaque tokens (no auth required for prospects)

## Stack

| Layer | Choice |
|---|---|
| Frontend | Next.js 16 (App Router, Turbopack) + React 19 + TypeScript strict |
| Styling | Tailwind v4 + shadcn/ui + Framer Motion |
| Backend | Convex (DB + queries/mutations/actions + crons + realtime) |
| Auth | Convex Auth (email + password) |
| Email | Resend |
| Calendar | Google Calendar API + push webhooks |
| Runtime | Bun |
| Lint/Format | Biome |
| Deploy | Docker + GitHub Actions + any VPS |

## Quick start

> Requires **Bun ≥ 1.3** and a free Convex account.

```bash
git clone https://github.com/<your-org>/iclone.git
cd iclone
bun install
bun run setup
```

The setup wizard will:

1. Verify your Bun install
2. Launch `bunx convex dev` (opens your browser, creates a Convex project)
3. Generate `.env.local` with the right values
4. Walk you through Google OAuth (optional) and Resend (recommended) — sets the Convex-side env vars for you
5. Print next steps

Then run two terminals:

```bash
# Terminal 1
bunx convex dev

# Terminal 2
bun run dev
```

Open <http://localhost:3000>, sign up, then promote yourself to admin:

```bash
bunx convex run migrations:promoteAdmin '{"email":"you@example.com"}'
```

Configure your calendar, availability, and create your first event. Done.

## Documentation

| Doc | Contents |
|---|---|
| [docs/INSTALL.md](docs/INSTALL.md) | Detailed setup (Convex, Google OAuth, Resend, first admin) |
| [docs/DEPLOYMENT.md](docs/DEPLOYMENT.md) | Production deploy: Docker + GitHub Actions + VPS |
| [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) | System overview + design decisions |
| [docs/SCHEMA.md](docs/SCHEMA.md) | Convex data model (all tables + indexes) |
| [docs/ADRS.md](docs/ADRS.md) | Architecture Decision Records |
| [CHANGELOG.md](CHANGELOG.md) | Release notes |

## Environment variables

A handful of values live in `.env.local` (Next.js side) and a handful on Convex (server side). The setup script handles all of this — see [.env.example](.env.example) for the full reference.

**Next.js (`.env.local`)**
- `NEXT_PUBLIC_CONVEX_URL`, `NEXT_PUBLIC_CONVEX_SITE_URL` — auto-filled
- `APP_BASE_URL` — public URL of the Next app
- `GOOGLE_CLIENT_ID` — for the public booking redirect to Google consent

**Convex (`bunx convex env set …`)**
- `RESEND_API_KEY`, `RESEND_FROM_EMAIL`
- `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, `GOOGLE_OAUTH_STATE_SECRET`

## Roadmap

- **V1** ✅ Booking flow, CRM, Google sync, Resend emails, deploy
- **V1.5** — In-app setup checklist, branding per event, PWA, outbound webhooks
- **V2** — Conditional routing, multi-org, public REST API, i18n

## Contributing

Issues and PRs welcome. If you ship a feature, please:

- Keep the schema additive (don't break existing data)
- Run `bun run lint && bun run typecheck` before opening a PR
- Add a CHANGELOG entry

## License

[MIT](LICENSE) — use it for anything, including commercially. Attribution appreciated but not required.

---

<div align="center">

Built by **[Endosia](https://endosia.com)** · [@endosia](https://github.com/endosia)

</div>
