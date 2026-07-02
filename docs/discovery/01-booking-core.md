# Discovery — DG COACHING booking core

> Source : agent `explore-codebase` (12 mai 2026). Référence READ-ONLY : `/Users/gregorygiunta/PROJETS DEV/DG COACHING/app/`. À utiliser par `database-architect` (Phase 1 schema) et `api-designer` (Phase 5 mutations).

## 1. Schema condensé — tables booking-related

**`events`** (`convex/schema.ts` L917-1005)
- `slug: string` — identifiant public de l'URL booking
- `durationMinutes`, `bufferBeforeMinutes`, `bufferAfterMinutes`, `slotIncrementMinutes`
- `timeFormat: "h12" | "h24"`
- `timezone: string` — TZ de présentation (ex `"Europe/Paris"`)
- `rangeType: "rolling" | "indefinite"` + `rangeDays?: number`
- `rescheduleRangeDays?: number` — fenêtre élargie pour reschedules (souvent 90j vs 14j)
- `alwaysAvailableDays?: boolean | number[]` — jours DOW bypass fenêtre glissante, capé 365j
- `minimumNoticeHours?: number`
- `businessDaysOnly?: boolean`
- `allowReschedule: boolean`, `preventDoubleBooking: boolean`
- `rescheduleWithSameHost?: boolean`
- `priorityMode: "manual" | "round_robin"`
- `disqualificationRules?: Array<{questionLabel, answers[]}>` + `disqualificationMessage?` + `disqualificationRedirectUrl?`
- `setterId?: Id<"users">`
- `calendarGreeting/Body/Signature` — template invitation Google Calendar
- Indexes : `by_slug`, `by_active`, `by_setterId`

**`eventHosts`** (L1008-1016)
```ts
eventId: Id<"events">
userId: Id<"users">
priority: "high" | "medium" | "low"
createdAt: number
// Indexes: by_eventId, by_userId, by_eventId_userId
```

**`eventQuestions`** (L1021-1041)
```ts
eventId, order, label, required
type: "email" | "short_text" | "long_text" | "single_select" | "multi_select" | "number" | "yes_no"
options?: string[]
```

**`userAvailability`** (L1045-1053)
```ts
userId, dayOfWeek (0=Sun..6=Sat)
startMinute, endMinute  // minutes depuis minuit, TZ locale du user
// Indexes: by_userId, by_userId_dayOfWeek
```

**`hostBusyBlocks`** (L1148-1173) — Cache Google
```ts
userId, calendarId, googleEventId
start, end (ms epoch)
transparency?: "opaque" | "transparent"
// Indexes: by_userId_start, by_userId_end, by_googleEventId
```

**`partialLeads`** (L1194-1216)
```ts
eventId, eventSlug, sessionId (clé dédup session)
firstName, lastName, phone, email?
formAnswers?: string  // JSON
promotedLeadId?, bookingId?
abandonedNotifiedAt?: number
// Indexes: by_sessionId (clé principale), by_eventId, by_phone
```

**`bookings`** (L1219-1329)
```ts
eventId, eventSlug, hostId
leadId?, partialLeadId?
prospectFirstName, prospectLastName, prospectName, prospectEmail?, prospectPhone
startTime, endTime, timezone
googleEventId?, googleMeetUrl?, googleCalendarId?, googleAccountId?
googleSyncStatus: "pending" | "synced" | "failed" | "na"
  // pending = seat hold 60s | synced = OK | failed = retries épuisés | na = location custom
googleSyncStartedAt?, googleSyncedAt?
status: "confirmed" | "cancelled" | "rescheduled" | "no_show" | "completed"
tenue: "planifie" | "tenu" | "no_show" | "annule"
issue: "en_attente" | "follow_up" | "gagne" | "perdu"
issueLossReasonId?, issueAmountCents?, issueOfferId?
cancelToken, rescheduleToken  // crypto.randomUUID().replace(/-/g, "")
bookedBySetterId?  // outbound manual
// Indexes critiques :
//   by_hostId_startTime, by_eventId_startTime,
//   by_cancelToken, by_rescheduleToken,
//   by_eventId_email, by_eventId_phone,
//   by_googleSyncStatus, by_leadId_startTime
```

**`bookingEvents`** (L1337-1371) — audit log
```ts
bookingId, leadId?
type: "created" | "rescheduled" | "cancelled" | "no_show_marked" | "completed" | "reminder_sent"
actor: "client" | "closer" | "admin" | "system" | "google_sync"
actorUserId?, actorLabel?
metadata: { previousStartTime?, newStartTime?, reason?, previousHostId?, newHostId? }
```

**`lossReasons`** (L1548-1561) — catalogue
```ts
name (normalized slug), label, archived, usageCount
```

**`pipelineSettings`** (L1614-1631) — singleton
```ts
silenceAlertDays (default 7)
silenceAutoLoseDays (default 30)
followUpReminderHour
silenceAutoLoseReasonId?
```

---

## 2. Algorithme calcul slots

Source : `convex/lib/slotComputation.ts` (PUR, zéro Convex, testable) + `convex/bookings.ts` L190-373.

**Pattern critique** : query Convex pré-fetch contexte par host (windows, bookings, Google busy), passe tout à `computeSlotsForDay` (fonction pure).

```ts
// convex/lib/slotComputation.ts L68-101
export function computeSlotsForDay(input: ComputeSlotsInput): SlotCandidate[] {
  // dayStart = début jour en UTC avec décalage TZ event (startOfDayInTz)
  // cutoff = max(earliestAllowed, now + 30min)
  for (let startMin = 0; startMin + durationMin <= 24 * 60; startMin += slotIncrementMin) {
    const slotStartMs = dayStart + startMin * MS_PER_MIN;
    if (slotStartMs <= cutoff) continue;
    const anyHostAvailable = hosts.some((hc) =>
      isHostFreeForSlot(hc, slotStartMs, slotEndMs, bufferBeforeMs, bufferAfterMs)
    );
    if (anyHostAvailable) slots.push({ time, endTime, display });
  }
}
```

`isHostFreeForSlot` :
1. Slot ne traverse pas minuit dans TZ host (`hStartDow !== hEndDow → false`)
2. `[slotStartMin, slotEndMin]` est dans une window `userAvailability` du DOW du host
3. Aucun booking existant avec buffer : `slotStart < b.endTime + bufferAfter && slotEnd > b.startTime - bufferBefore`
4. Aucun bloc Google busy overlapping

**Fenêtre glissante** (`bookings.ts` L241-248) :
```ts
const alwaysOpenDows = new Set(normalizeAlwaysAvailableDays(event.alwaysAvailableDays));
if (event.rangeType === "rolling" && effectiveRangeDays) {
  const todayStart = startOfDayInTz(now, eventTz);
  const windowEnd = todayStart + effectiveRangeDays * MS_PER_DAY;
  const safetyLimit = todayStart + ALWAYS_AVAILABLE_MAX_DAYS * MS_PER_DAY; // 365j hard cap
  if (dayStart > windowEnd) {
    const { dow } = zonedDowAndMinutes(dayStart + 12h, eventTz);
    if (!alwaysOpenDows.has(dow) || dayStart > safetyLimit) return [];
  }
}
```

**Timezone CRITIQUE** (`convex/lib/tz.ts`) : boundaries jour calculées dans **TZ event** via `startOfDayInTz`, pas en UTC. Availability windows hosts stockées en min-depuis-minuit dans **leur TZ**. Slot traversant minuit dans TZ host = rejeté silencieusement.

---

## 3. Verrou seat hold 60s

```ts
// convex/bookings.ts L77-91
const PENDING_HOLD_MS = 60_000;

function isActiveSeatHold(b: { googleSyncStatus?: string; _creationTime: number }): boolean {
  if (b.googleSyncStatus !== "pending") return true;  // synced/failed/na = toujours actif
  return Date.now() - b._creationTime < PENDING_HOLD_MS; // pending = actif 60s seulement
}
```

**Flow transactionnel prod** :
1. `reserveBookingInternal` (internalMutation) → insert booking `googleSyncStatus="pending"`, ne touche PAS le lead. Via `preflightBooking` + `resolveAvailableHost`.
2. Action `googleActions.createBookingChecked` → appelle Google API hors mutation.
3. Succès → `finalizeBookingInternal` → patch `synced` + googleEventId + googleMeetUrl + `commitBookingLead` (upsert lead + audit).
4. Échec → `rollbackBookingInternal` → DELETE row (lead jamais touché). Seulement si encore `pending`.

Cron `detectOrphanBookings` (5min) flag en `"failed"` les `pending > 2min` (crash action avant rollback).

---

## 4. Attribution & priorité host (`resolveAvailableHost`)

Source : `convex/bookings.ts` L848-1044.

1. Fetch tous `eventHosts` de l'event, triés `PRIORITY_ORDER: { high: 0, medium: 1, low: 2 }`
2. Pour chaque host (ordre priorité) : check window, bookings (avec buffer), Google busy
3. Construire `candidates[]` avec `weekCount` (nb bookings cette semaine)
4. **Priorité = filtre dur** : seuls candidats au tier le plus élevé présent entrent en round-robin
5. `round_robin` : top tier → count bookings sur 7 derniers jours → minimum → tiebreak alphabétique sur `userId` (déterminisme sous concurrence)
6. `manual` : top tier → moins booké cette semaine

```ts
// L994-1035
const topPriority = candidates[0].priority;
const topTier = candidates.filter((c) => c.priority === topPriority);
if (priorityMode === "round_robin") {
  const sevenDaysAgo = startTime - 7 * MS_PER_DAY;
  withCounts.sort((a, b) => a.recentCount !== b.recentCount
    ? a.recentCount - b.recentCount
    : String(a.userId).localeCompare(String(b.userId)));
}
```

**Reschedule** : `rescheduleWithSameHost === true` → `preferredHostId = booking.hostId` prioritaire si éligible. Si host change → audit log `previousHostId` + `newHostId`.

---

## 5. Capture lead silencieuse — `capturePartialLead`

Source : `convex/bookings.ts` L1102-1218.

**Trigger client** : mutation sur `blur` de `phone + firstName + lastName` (debounce client — serveur idempotent).

**Flow** :
1. Upsert `partialLeads` par `sessionId` (insert ou patch). Sur INSERT seulement : `scheduler.runAfter(10min, checkPartialLeadAbandoned)` — armé une seule fois.
2. `findLeadByAnyKey` par phone/email normalisés → patch lead existant (préserve setter, ne régresse pas stage si > "potentiel"). Sinon : insert avec `phase: "potentiel"`.
3. Lier `partialLead.promotedLeadId = leadId`.

---

## 6. Normalisation E.164 phone + email

Source : `convex/lib/leadMatch.ts` (49 lignes, COPIER VERBATIM).

```ts
export function normalizePhone(raw: string | undefined | null): string {
  const cleaned = raw.replace(/[^\d+]/g, "");
  const plus = cleaned.startsWith("+") ? "+" : "";
  const digits = cleaned.replace(/\+/g, "");
  // FR : 0XXXXXXXXX → +33XXXXXXXXX
  if (!plus && digits.startsWith("0") && digits.length === 10) {
    return `+33${digits.slice(1)}`;
  }
  return plus + digits;
}

export function normalizeEmail(raw): string {
  return raw.trim().toLowerCase();
}
```

**Dédup** : indexes `by_phoneNormalized` + `by_emailNormalized`. `findLeadByAnyKey` tente normalized indexes (O(log n)) puis fallback exact-match (legacy). Pour iClone neuf : indexes normalisés dès le départ, supprimer fallback.

---

## 7. Disqualification serveur

Source : `convex/lib/disqualification.ts` + appliqué dans `preflightBooking` L1276-1290.

```ts
// Sémantique OR — dès qu'une règle matche, disqualifié
export function isDisqualified(rules, answers): boolean {
  for (const rule of rules) {
    const answer = answers[rule.questionLabel];
    if (Array.isArray(answer)) {
      if (answer.some((a) => rule.answers.includes(a))) return true;
    } else if (rule.answers.includes(answer)) return true;
  }
  return false;
}
```

Évalué serveur sur `formAnswers` JSON. Bypass closers via `bypassClientGuards: true` (admin / relance no-show).

---

## 8. Cancel + reschedule via tokens publics

**Génération** : `randomToken() = crypto.randomUUID().replace(/-/g, "")` — 2 tokens distincts, insérés à création, jamais regénérés.

**Cancel** (`cancelByToken` L1866-1917) : lookup `by_cancelToken`, patch `status="cancelled"`, patch lead `etapeClosing="annule"`, logBookingEvent, schedule `deleteCalendarEvent` + notif.

**Reschedule** (`rescheduleByToken` L1919-2039) :
- `validateSlotGuards` avec `mode="reschedule"` (utilise `rescheduleRangeDays`)
- `resolveAvailableHost` avec `excludeBookingId` (s'exclut du conflict check) + `preferredHostId` si `rescheduleWithSameHost`
- Host changé : delete old Google event, create new (cascade `createCalendarEvent`)
- Sinon : `updateCalendarEvent`

---

## 9. Outcomes appel — modèle

Source : `convex/bookingOutcomes.ts`.

**Deux axes orthogonaux sur `bookings`** :
- `tenue: "planifie" | "tenu" | "no_show" | "annule"`
- `issue: "en_attente" | "follow_up" | "gagne" | "perdu"` (si `tenue=tenu`)

Validations :
- `tenu` sans `issue` → erreur
- `issue` sans `tenu=tenu` → erreur
- `perdu` → `issueLossReasonId` requis
- `gagne` → `issueAmountCents > 0` requis
- `follow_up` → `{ dueAt, reason, channel }` requis, `dueAt` futur

**Atomique** `setBookingOutcome` : patch booking + patch lead `montantContracte` (si gagné) + bump `lossReason.usageCount` (si perdu) + insert `leadFollowUp` (si follow_up) + `applyAutoPhase(ctx, leadId)`.

---

## 10. Gotchas observés

| # | Gotcha | Fix |
|---|---|---|
| G1 | TZ boundary : `dayStart` UTC au lieu de TZ event → slot 00:00 affiché mauvais jour | `startOfDayInTz` via `Intl.DateTimeFormat` |
| G2 | `alwaysAvailableDays` UI ≠ serveur → slot affiché mais rejeté | mirror dans `validateSlotGuards` L1079-1085 |
| G3 | Race condition double booking | `isActiveSeatHold` traite `pending<60s` comme actif |
| G4 | Slot traversant minuit en TZ host → rejeté silencieusement | designer windows avec marge |
| G5 | Pending orphan si action crashe | cron `detectOrphanBookings` 5min flag `failed` après 2min |
| G6 | Indexes normalisés + fallback legacy | iClone : tout normaliser dès départ, pas de fallback |
| G7 | `closerId` gelé post-conversion | upsert ne met pas à jour `closerId` si `convertedAt` posé |

---

## 11. Fichiers à copier VERBATIM dans iClone

- `convex/lib/slotComputation.ts` — pur, zéro dépendance Convex
- `convex/lib/tz.ts` — pure Intl
- `convex/lib/leadMatch.ts`
- `convex/lib/disqualification.ts`

## 12. Architecture à recoder (mêmes patterns)

- `resolveAvailableHost` — round-robin avec `isActiveSeatHold`
- `preflightBooking` — validation centralisée
- `insertBookingRow` + `commitBookingLead` — séparation reserve/finalize
- `capturePartialLead` + `findLeadByAnyKey` + `upsertLeadForBooking` — pipeline capture silencieuse
