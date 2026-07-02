# Discovery — DG COACHING Google OAuth + Calendar sync

> Source : agent `explore-codebase` (12 mai 2026). Pattern complet OAuth + multi-comptes + webhook push. À utiliser par `api-designer` (Phase 6 + 7).

## 1. OAuth Flow

**Initiation : `src/app/api/google/start/route.ts`**
1. Vérifie session via `convexAuthNextjsToken()` + `fetchQuery(api.users.current)`
2. Construit `redirectUri = ${NEXT_PUBLIC_CONVEX_SITE_URL}/google/callback` — **jamais l'URL de ton app Next.js**
3. Signe état HMAC : `userId + returnTo + nonce + exp=+10min`
4. Redirige vers `accounts.google.com/o/oauth2/v2/auth` avec `access_type=offline`, `prompt=consent`

**Scopes requis :**
```ts
const GOOGLE_SCOPES = [
  "https://www.googleapis.com/auth/calendar",
  "https://www.googleapis.com/auth/calendar.events",
  "openid", "email", "profile",
].join(" ");
```

**Callback : `convex/http.ts` route `/google/callback`** (httpAction sur `*.convex.site`)
1. Vérifie `state` HMAC (même secret `GOOGLE_OAUTH_STATE_SECRET` des deux côtés)
2. Extrait `redirectUri = url.origin + url.pathname` (recalculé)
3. Appelle `internal.googleActions.handleOAuthCallback` (internalAction Node)

**Échange tokens (`googleActions.ts` L52-144) :**
- POST `https://oauth2.googleapis.com/token`
- **Guard critique** : si `tokens.refresh_token` absent → erreur explicite (fréquent si déjà connecté sans `prompt=consent`)
- `sub` extrait du `id_token` JWT — clé de dédup
- Premier compte → writer auto + conflict-check + subscribe watch
- Comptes suivants → conflict-check seulement, writer inchangé

**Refresh token (L155-197) :**
```ts
// Seuil : tokenExpiryMs > Date.now() + 60s → utilise access token en cache
// Sinon : POST /token grant_type=refresh_token, patch la row en DB
```
Pas de chiffrement (Convex chiffre at rest).

---

## 2. Tables Google

**`userGoogleAccounts`** (schema.ts L1077-1090)
```ts
userId
googleSub: string      // stable Google sub — clé dédup
googleEmail: string
accessToken: string    // CLAIR
refreshToken: string   // CLAIR
tokenExpiryMs: number
scope: string
connectedAt, lastRefreshedAt?
// Indexes:
//   by_userId
//   by_userId_googleSub  ← clé dédup upsert
```

**`userCalendarSettings`** (L1097-1111)
```ts
userId
writerAccountId?: Id<"userGoogleAccounts">
writerCalendarId?: string
writerCalendarSummary?: string
conflictCheckCalendars: Array<{
  accountId: Id<"userGoogleAccounts">,
  calendarId: string,
  calendarSummary?: string,
}>
createdAt, updatedAt
// Index: by_userId
```

---

## 3. Multi-calendars : writer ≠ conflict-check

Découplage dans `userCalendarSettings` :
- **writer** = où on crée events + Meet links (1 seul compte, 1 seul calendar)
- **conflictCheckCalendars** = tableau `{accountId, calendarId}` — tous lus pour vérifier dispo

`getConflictCalendarsForUserInternal` (`userCalendarSettings.ts` L99-121) force toujours writer dans la liste (safety net). UI expose `setWriter` + `setConflictCalendars` séparément.

---

## 4. Création event Google + Meet

**`createGoogleEventForBooking` (`googleActions.ts` L591-722) :**
```ts
const eventPayload = {
  summary: `${event.name} — ${booking.prospectName}`,
  description,  // renderCalendarDescription(greeting/body/signature + booking fields)
  start: { dateTime: new Date(booking.startTime).toISOString(), timeZone: event.timezone },
  end:   { dateTime: new Date(booking.endTime).toISOString(), timeZone: event.timezone },
  attendees: [{ email: booking.prospectEmail, displayName: booking.prospectName }],
  reminders: { useDefault: true },
  conferenceData: {
    createRequest: {
      requestId: `iclone-${bookingId}`,  // idempotency key 24h
      conferenceSolutionKey: { type: "hangoutsMeet" },
    },
  },
};

// URL CRITIQUE : ?conferenceDataVersion=1&sendUpdates=all
const url = `${GOOGLE_CAL_BASE}/calendars/${encodeURIComponent(calendarId)}/events?conferenceDataVersion=1&sendUpdates=all`;
```

**Extraction Meet URL :**
```ts
const meetUrl = data.hangoutLink
  ?? data.conferenceData?.entryPoints?.find(e => e.entryPointType === "video")?.uri
  ?? null;
```

Retour : `{ googleEventId, googleMeetUrl, googleCalendarId, googleAccountId }`.

---

## 5. Webhook push — création channel

**`subscribeCalendarWatchForAccount` (`googleActions.ts` L1295-1386) :**
```ts
// Body POST /calendar/v3/calendars/{id}/events/watch
{
  id: crypto.randomUUID(),           // channelId
  type: "web_hook",
  address: `${convexSiteUrl()}/webhooks/google-calendar`,
  token: crypto.randomUUID().replace(/-/g, ""),  // shared secret en DB
  params: { ttl: "2592000" },        // 30 jours max
}
```

`convexSiteUrl()` = `CONVEX_SITE_URL` ou `CONVEX_CLOUD_URL.replace(".convex.cloud", ".convex.site")`.

Avant create : stop + delete tout channel existant pour `(user, calendarId)`.
Après create : lance `runFullSyncForAccount` immédiatement.

---

## 6. Webhook handler

**Validation X-Goog-Channel-Token (`http.ts` L183-223) :**
```ts
// Route intentionnellement fail-open sur channel inconnu (200 stop retries Google)
const channel = await ctx.runQuery(internal.googleCalendarChannels.getChannelByIdInternal, { channelId });
if (!channel) { console.warn(...); return new Response(null, { status: 200 }); }
if (channel.token !== token) return new Response("Forbidden", { status: 403 });
// "sync" = handshake initial, no action
if (state === "sync") return new Response(null, { status: 200 });
// Sinon : schedule async
await ctx.scheduler.runAfter(0, internal.googleActions.runIncrementalSyncForChannel, { channelId });
return new Response(null, { status: 200 });  // répondre immédiatement
```

**Sync incrémental (`runIncrementalSyncForChannel` L1624-1750) :**
- Utilise `syncToken` stocké en DB : `?syncToken=xxx&singleEvents=true&showDeleted=true`
- `status === "cancelled"` → `toDelete[]` puis `deleteBusyBlocksByEventIdsInternal` + `cancelBookingsByGoogleEventIdsInternal`
- `transparency === "transparent"` géré dans `upsertOne` — event transparent = suppression busy block
- **410 Gone** → syncToken expiré → full resync auto
- Pagination : pages suivantes, `syncToken` doit être SUPPRIMÉ des params (sinon Google erreur)

---

## 7. Crons

**`crons.ts` L20-25 — renew (04h00 UTC daily) :**
```ts
crons.daily("renew-google-calendar-channels", { hourUTC: 4, minuteUTC: 0 }, ...)
```

**`renewExpiringChannels` (L1765-1838) :**
- Seuil : `expirationMs < now + 48h`
- Jitter par channel : `500 + random(750)ms` entre renewals (anti-spam)
- Channel expiré + échec → suppression DB → host exclu fail-closed
- Retry auto à `now + 10min` si échec (via `retryFailedChannelRenewals`)
- Max 5 tentatives avant abandon (`renewAttempts >= 5`)

**`crons.ts` L33-38 — daily resync (04h15 UTC) :**
```ts
crons.daily("daily-resync-google-calendars", { hourUTC: 4, minuteUTC: 15 }, ...)
```
Tourne **15min après** renew (04h00) pour que les channels frais soient actifs.

**Pourquoi nécessaire :** Google rate silencieusement des push notifs. Sans resync, `hostBusyBlocks` dérive → bookings sur créneaux occupés. Chaque channel actif → full-resynced. Jitter `750 + random(750)ms`.

---

## 8. Gotchas critiques

**G1 — redirect_uri DOIT être sur `*.convex.site`**
Google silent-drop le code sur domaines tiers (apps unverified, scopes sensibles). `/api/google/start` construit `redirectUri` depuis `NEXT_PUBLIC_CONVEX_SITE_URL`, jamais Next.js.

**G2 — refresh_token absent après reconnexion**
Si user déjà accordé l'accès et pas `prompt=consent` → pas de refresh_token. Guard L86-89 `handleOAuthCallback` : erreur explicite avec instruction révoquer.

**G3 — Channels orphelins après suppression user**
User supprimé sans `disconnect` → channels + busy blocks orphelins. `devSeed:wipeOrphanGoogleArtifacts` nettoie manuellement. En prod : toujours `unsubscribeAccountForUser` avant delete user.

**G4 — 410 Gone sur syncToken**
SyncTokens invalides après ~30j inactivité ou changement radical de ressource. Code gère : `if (res.status === 410) → runFullSyncForAccount`. **Obligatoire dans iClone.**

**G5 — fail-closed booking**
`createBookingChecked` (L396-434) refuse tout host sans channel actif sur TOUS conflict-calendars ET writer-calendar. Host avec Google connecté mais channel expiré = "pas de Google". **Ne jamais passer en fail-open** (freebusy live call).

**G6 — Pagination sync incrémental**
Pages suivantes : `syncToken` PAS dans params, seulement `pageToken`. Code gère : `if (pageToken) { params.delete("syncToken"); params.set("pageToken", ...) }`.

**G7 — `transparency === "transparent"` = free**
Event Google `transparency: "transparent"` = hôte "libre" pendant cet event. `upsertOne` détecte et supprime busy block. Sans ce check, events "libre" bloquent créneaux.

---

## 9. Variables d'environnement

| Var | Où | Usage |
|---|---|---|
| `GOOGLE_CLIENT_ID` | Next.js + Convex | Client OAuth |
| `GOOGLE_CLIENT_SECRET` | **Convex uniquement** | Token exchange + refresh |
| `GOOGLE_OAUTH_STATE_SECRET` | Next.js + Convex | HMAC state (mêmes valeurs) |
| `NEXT_PUBLIC_CONVEX_SITE_URL` | Next.js (public) | Construire `redirectUri` |
| `CONVEX_SITE_URL` | Convex | Construire address webhook watch |
| `APP_BASE_URL` | Convex | Redirect post-callback vers app |
| `SITE_URL` | Convex | Liens cancel/reschedule dans description event |

`CONVEX_SITE_URL` côté Convex : calculé si absent = `CONVEX_CLOUD_URL.replace(".convex.cloud", ".convex.site")`. Prod : setter explicitement.

---

## 10. Snippets verbatim à copier

**Token refresh seuil 60s :**
```ts
async function getAccessTokenForAccount(ctx, accountId) {
  const acc = await ctx.runQuery(...getAccountByIdInternal, { accountId });
  if (!acc) throw new Error("Google non connecté");
  if (acc.tokenExpiryMs > Date.now() + 60 * 1000) return acc.accessToken;
  return await refreshAccountToken(ctx, accountId);
}
```

**Watch channel subscribe :**
```ts
body: JSON.stringify({
  id: channelId,
  type: "web_hook",
  address: `${convexSiteUrl()}/webhooks/google-calendar`,
  token: channelToken,
  params: { ttl: "2592000" },
})
// Puis : runFullSyncForAccount immédiatement
```

**Webhook handler fail-open + fail-closed token :**
```ts
if (state === "sync") return new Response(null, { status: 200 });
if (!channel) { console.warn(...); return new Response(null, { status: 200 }); }
if (channel.token !== token) return new Response("Forbidden", { status: 403 });
await ctx.scheduler.runAfter(0, internal.googleActions.runIncrementalSyncForChannel, { channelId });
return new Response(null, { status: 200 });
```

**Incremental sync — 410 + pagination :**
```ts
if (res.status === 410) { await runFullSyncForAccount(...); return; }
if (pageToken) { params.delete("syncToken"); params.set("pageToken", pageToken); }
if (e.status === "cancelled") { toDelete.push(e.id); continue; }
```

**Create event Meet (champs obligatoires) :**
```ts
// URL : ?conferenceDataVersion=1&sendUpdates=all (CRITIQUE)
conferenceData: {
  createRequest: {
    requestId: `iclone-${bookingId}`,
    conferenceSolutionKey: { type: "hangoutsMeet" },
  },
}
const meetUrl = data.hangoutLink
  ?? data.conferenceData?.entryPoints?.find(e => e.entryPointType === "video")?.uri
  ?? null;
```

---

## 11. Fichiers clés DG COACHING

- `src/app/api/google/start/route.ts` — initiation OAuth
- `src/lib/oauth-state.ts` — HMAC signState/verifyState
- `convex/http.ts` — callback `/google/callback` + webhook `/webhooks/google-calendar`
- `convex/googleActions.ts` — core OAuth + Calendar API (1994 lignes, `"use node"`)
- `convex/googleAccount.ts` — CRUD userGoogleAccounts
- `convex/userCalendarSettings.ts` — writer/conflict-check
- `convex/googleCalendarChannels.ts` — CRUD channels + hostBusyBlocks
- `convex/schema.ts` L1077-1173 — 4 tables Google
- `convex/crons.ts` L20-38 — 2 crons (04h00 renew + 04h15 resync)
