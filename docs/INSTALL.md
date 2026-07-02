# Install — iClone

A full walkthrough for getting iClone running locally. **TL;DR: `bun install && bun run setup`** — the rest of this doc is the manual version + explanations.

---

## Prerequisites

| Tool | Min. version | Install |
|---|---|---|
| **Bun** | 1.3 | `curl -fsSL https://bun.sh/install \| bash` |
| **Git** | any | `apt install git` / `brew install git` |
| **Convex account** | — | <https://dashboard.convex.dev> (free tier is enough) |
| **Resend account** | — | <https://resend.com> (free tier — 3,000 emails/mo) |
| **Google Cloud project** | — | <https://console.cloud.google.com> (free, optional for calendar sync) |

---

## 1. Clone and install dependencies

```bash
git clone https://github.com/<your-org>/iclone.git
cd iclone
bun install
```

---

## 2. Setup wizard (recommended)

```bash
bun run setup
```

The wizard provisions your Convex deployment, writes `.env.local`, sets Convex-side secrets (Resend, Google), and prints next steps. Skip to §8 if it completes successfully.

The rest of this guide does the same thing manually — useful for production deploys, custom setups, or debugging.

---

## 3. Convex — provision a deployment

```bash
bunx convex dev
```

On first run this command:

1. Opens your browser to authenticate with Convex
2. Asks you to create a project (e.g. `iclone-dev`) or pick an existing one
3. Writes `CONVEX_DEPLOYMENT` and `NEXT_PUBLIC_CONVEX_URL` to `.env.local`
4. Stays running, watching `convex/` for changes — keep it open in a terminal while you develop

> Convex Auth keys (`JWT_PRIVATE_KEY`, `JWKS`) are generated automatically on first deploy. You do **not** need to set them yourself.

Once it's running, copy the **Convex `*.convex.site` URL** (the dev panel shows it, or replace `.convex.cloud` with `.convex.site` in your `NEXT_PUBLIC_CONVEX_URL`) and add it to `.env.local`:

```env
NEXT_PUBLIC_CONVEX_SITE_URL=https://<your-deployment>.convex.site
```

---

## 4. Resend — transactional email

1. Create an account at <https://resend.com>.
2. **API key:** Dashboard → API Keys → Create. Copy the `re_...` key.
3. Set it on Convex:

   ```bash
   bunx convex env set RESEND_API_KEY re_xxxxxxxxxxxx
   ```

4. **From address:**
   - **For dev / first tests:** use `onboarding@resend.dev` — Resend's sandbox. Emails will ONLY reach the email address you signed up with.
   - **For production:** add and verify your sending domain in Resend → Domains (SPF + DKIM + DMARC DNS records).

5. Set the From email on Convex:

   ```bash
   bunx convex env set RESEND_FROM_EMAIL "iClone <noreply@your-domain.com>"
   ```

> The email subject "Replanifier" and "Annuler" links inside the Resend templates use `APP_BASE_URL`. Make sure it's set in `.env.local`.

---

## 5. Google OAuth — Calendar sync (optional but recommended)

Without this, your hosts can't connect a Google Calendar — slot availability will work based on internal `userAvailability` only, and no Google Meet links will be created on booking.

### 5.1 Create the Google Cloud project

1. Go to <https://console.cloud.google.com> and create a project (e.g. `iclone-prod`).
2. **APIs & Services → Library**. Enable:
   - **Google Calendar API**
3. **APIs & Services → OAuth consent screen**:
   - User type: **External**
   - App name, support email, developer contact
   - Scopes: `.../auth/calendar.events`, `.../auth/calendar.readonly`, `userinfo.email`, `userinfo.profile`
   - **Test users:** while the app is in "Testing" state (default), only emails listed here can connect. Add yours.
   - To remove the testing cap, click **Publish App**. For sensitive scopes (Calendar), Google requires you to submit the app for verification — this can take 4–6 weeks. For internal use, "Testing" is fine.

### 5.2 Create the OAuth client

1. **APIs & Services → Credentials → Create Credentials → OAuth client ID**
2. **Application type:** Web application
3. **Authorized redirect URI** — must match this exact pattern:

   ```
   https://<your-deployment>.convex.site/google/callback
   ```

   > **Why convex.site, not your app domain?** Google's OAuth flow silently drops the auth code when the redirect target is a domain it doesn't trust for sensitive scopes. The Convex site domain is registered as a Google-verified property. See [gotcha_google_oauth_convex_site_redirect](../../../.claude/projects/-Users-gregorygiunta/memory/gotcha_google_oauth_convex_site_redirect.md) in our team memory for the incident that led to this discovery.

4. Copy the **Client ID** and **Client Secret**.

### 5.3 Set the values

```bash
# In .env.local (Next.js needs Client ID for the initial redirect)
GOOGLE_CLIENT_ID=200xxxxxxxx.apps.googleusercontent.com

# On Convex (server-side OAuth exchange + token storage)
bunx convex env set GOOGLE_CLIENT_ID 200xxxxxxxx.apps.googleusercontent.com
bunx convex env set GOOGLE_CLIENT_SECRET GOCSPX-xxxxxxxxxxxx

# HMAC secret for OAuth `state` parameter
bunx convex env set GOOGLE_OAUTH_STATE_SECRET "$(openssl rand -hex 32)"
```

---

## 6. App base URL

`APP_BASE_URL` is used in transactional emails (cancel/reschedule links) and a few server-side places. In dev:

```env
APP_BASE_URL=http://localhost:3000
```

In prod, set it to your public URL: `https://book.your-domain.com`.

---

## 7. Final `.env.local`

After the previous steps, your file should look like this (the wizard would have produced the same):

```env
CONVEX_DEPLOYMENT=dev:acme-rabbit-123
NEXT_PUBLIC_CONVEX_URL=https://acme-rabbit-123.convex.cloud
NEXT_PUBLIC_CONVEX_SITE_URL=https://acme-rabbit-123.convex.site
APP_BASE_URL=http://localhost:3000
GOOGLE_CLIENT_ID=200xxxxxxxx.apps.googleusercontent.com
```

---

## 8. Start the dev servers

Two terminals:

```bash
# Terminal 1 — Convex functions in watch mode
bunx convex dev
```

```bash
# Terminal 2 — Next.js dev server
bun run dev
```

Open <http://localhost:3000>.

---

## 9. Create the first admin

1. Visit <http://localhost:3000/signup> and create your account (email + password).
2. Promote yourself to admin:

   ```bash
   bunx convex run migrations:promoteAdmin '{"email":"you@example.com"}'
   ```

3. Log in at <http://localhost:3000/login>.

---

## 10. In-app configuration

Once logged in:

- **Settings → Calendar** — connect your Google account, choose which calendar receives new events ("writer") and which calendars are checked for conflicts.
- **Settings → Availability** — set your weekly slot ranges (e.g. Mon–Fri 09:00–12:00, 14:00–18:00).
- **Events → New** — create your first booking page. Add yourself as a host. Visit `/book/<slug>` to test it.

---

## Verification checklist

- [ ] `http://localhost:3000` loads without errors
- [ ] `http://localhost:3000/api/health` returns `{"status":"ok",...}`
- [ ] Sign-up + login work
- [ ] Convex dashboard shows your functions deployed (dev environment)
- [ ] Settings → Calendar shows "Connecter un compte Google" button (Google OAuth wired)
- [ ] Settings → Availability has a save button (you can set slots)
- [ ] Creating an event redirects to its edit page and the form loads real data

---

## Common issues

| Symptom | Fix |
|---|---|
| `JWT_PRIVATE_KEY` missing on Convex | `bunx convex dev` once — generates auth keys |
| Google OAuth `access_denied` 403 | App is in "Testing" — add the email as Test User in Google Cloud Console |
| Google OAuth code silently dropped | Redirect URI must be on `*.convex.site`, not your app domain |
| `NEXT_PUBLIC_*` undefined in browser | These are baked at build time — restart `bun dev` after changing them |
| Biome lint errors on save | `bunx biome check --write .` to auto-fix |
| TypeScript errors in `convex/_generated/` | `bunx convex codegen` or keep `bunx convex dev` running |
| Resend emails not received | Check the From address matches a verified Resend domain (or use `onboarding@resend.dev` for testing) |
| Slots not showing on `/book/<slug>` | Verify: event is `Actif`, you have at least one host with Google connected AND availability defined |

For production deployment (Docker + GitHub Actions + VPS), see [DEPLOYMENT.md](DEPLOYMENT.md).
