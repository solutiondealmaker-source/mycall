# Discovery — DG COACHING UI booking + CRM + Admin

> Source : agent `explore-codebase` (12 mai 2026). Patterns UX à reprendre, **design refait 100%** (bleu Endosia premium — cf. `04-design-system.md`).

## 1. Architecture booking publique

```
(book)/book/[slug]/page.tsx        ← Server Component, generateMetadata OG + ConvexHttpClient SSR
  └── BookClient                    ← "use client", useQuery reactive, gère loading/null/hostCount=0
        └── BookFlow
              ├── StepDot ×2        ← stepper inline, Check lucide si done
              ├── FormStep          ← step="form"
              ├── CalendarStep      ← step="calendar"
              └── SuccessStep       ← step="success"
```

**State machine `BookFlow`** :
- `step: "form" | "calendar" | "success"` — useState simple
- `data: BookSessionData` — état partagé Form↔Calendar
- `sessionId` — `crypto.randomUUID()` persisté `sessionStorage["book-session-${slug}"]`
- `trackView` mutation appelée 1× via `useRef(viewTracked)`

⚠️ **Accent color injecté en CSS var `--accent`** + prop string. À remplacer par `--brand` bleu Endosia (cf. design system).

---

## 2. FormStep — capture silencieuse + sous-étapes

**Pattern capture partielle (debounce 600ms exact) :**
```tsx
captureTimer.current = setTimeout(() => {
  capture({ slug, sessionId, firstName, lastName, phone, email, formAnswers })
}, 600);
```

**Sous-étapes :**
- `subStep: "primary" | "questions"`
- `PrimaryFields` : PhoneField + firstName + lastName + email
- `SecondaryFields` : questions custom (email exclu, déjà en primary)

**Types questions (`QuestionInput`) :**
- `email` → null (primary)
- `long_text` → Textarea rows=4
- `single_select` → radio en cards cliquables
- `yes_no` → idem avec `["Oui", "Non"]`
- `multi_select` → checkboxes en cards
- fallback → Input text/number

**Validation** (manuelle, pas Zod) : firstName + lastName non vides, phone ≥ 6 digits, email regex, requireds remplies.

---

## 3. CalendarStep — calendrier custom + slots réactifs

**Pas de lib calendrier externe.** Fait-maison :
- Grid CSS 7 colonnes
- `firstDow = new Date(year, month, 1).getDay()`
- Jours dispos : `useQuery(api.bookings.getAvailableDays, { slug, month, year })`
- Slots : `useQuery(api.bookings.getAvailableSlotsStatic, { slug, dateMs })` — temps réel Convex
- `selectedDayMs = Date.UTC(year, month, day)`

**Toggle 12h/24h** : lu depuis `event.timeFormat`, **pas interactif prospect**.

**Fuseau horaire** : auto `Intl.DateTimeFormat().resolvedOptions().timeZone`, affiché avec `<Globe />`, non modifiable.

**Timer réservation** : `secondsLeft` initialisé `event.reservationTimerMinutes ?? 10`, decrement `setInterval(1s)`, format `mm:ss` monospace.

**Sélection slot pattern** "expand on select" : au clic, slot se split en 2 colonnes `[label | bouton Valider]`. Pas de modal.

**Booking** : `useAction(api.googleActions.createBookingChecked)` — vérifie freebusy live avant mutation.

---

## 4. SuccessStep

Structure :
- Icône `CalendarCheck2` cercle `accent/1A`
- `event.confirmationTitle` (custom)
- `event.confirmationMessage`
- Card récap : date/heure + lien Google Meet (si `booking.googleMeetUrl`)
- Auto-redirect `event.confirmationRedirectUrl` après 4000ms

**Pas de boutons annul/replanif** — routes publiques séparées (tokens).

---

## 5. Stepper + calendrier flou en FormStep

**Stepper inline (book-flow.tsx) :**
```tsx
<StepDot active={step==="form"} done={step !== "form"} label="..." />
<div className="h-px w-10 bg-border" />
<StepDot active={step==="calendar"} done={step==="success"} label="..." />
```

**Calendrier flou pendant FormStep** :
```tsx
<div className="relative border-t border-border bg-muted/20 p-5">
  <MiniCalendarPreview />  {/* mini-cal statique, opacity-60 select-none */}
  <div className="pointer-events-none absolute inset-0 flex items-center justify-center px-6">
    <div className="pointer-events-auto max-w-[260px] rounded-xl border ...">
      {subStep === "primary" ? "Merci de remplir le formulaire..." : "Réponds aux dernières questions..."}
    </div>
  </div>
</div>
```

---

## 6. Disqualification overlay

```tsx
{disqualified && (
  <div className="pointer-events-none absolute inset-0 z-20 flex items-center justify-center p-6">
    <div className="pointer-events-auto max-w-[360px] rounded-2xl border border-destructive/30 bg-card px-6 py-6 text-center shadow-xl">
      <Ban className="h-5 w-5" />
      <p>{disqualificationMessage}</p>
      <button onClick={onBack}>Modifier mes réponses</button>
    </div>
  </div>
)}
<div className={disqualified ? "pointer-events-none select-none opacity-40 blur-[1.5px]" : ""}>
  {/* Calendrier rendu mais blur */}
</div>
```

**Pattern exact** : `blur-[1.5px] opacity-40` + `pointer-events-none` + overlay `z-20`. Si `disqualificationRedirectUrl` → `window.location.href` après 2000ms.

---

## 7. Routes publiques manage/reschedule

**Sécurité** : `useQuery(api.bookings.getByCancelToken, { token })` / `getByRescheduleToken`. Tokens opaques côté Convex, jamais session/auth client. Retourne `null` si invalide.

**États** :
- `undefined` → `<Loader2 animate-spin />`
- `null` → "Lien invalide"
- `booking.status === "cancelled"` → "Réservation annulée"
- `event.allowReschedule === false` → "Reprogrammation désactivée"

**Reschedule** : même queries que booking initial avec `mode: "reschedule"` + `restrictToHostUserId` si `event.rescheduleWithSameHost`. Succès → success inline (pas de redirect).

**Cancel** : textarea raison optionnel, `cancelByToken({ token, reason })`, icône `CalendarX2`.

---

## 8. CRM tableau

**Architecture** :
```
CrmPage
├── PageHeader (title + description + actions)
├── LeadsKpiStrip
├── CrmTabsBar (Contacts | Appels | Transactions)
└── [tab="contacts"]
    ├── LeadsSegmentRail (sidebar collapsible 260px → 56px icon-only)
    └── div flex-1
        ├── LeadsToolbar (search + filtres + column picker + views)
        └── LeadsDataTable (TanStack Table v8)
```

**Pagination** : `usePaginatedQuery(api.leadsCrm.listPaginated, args, { initialNumItems: 25 })` + "Charger plus".

**Recherche** : ≥2 chars → bascule `useQuery(api.leadsCrm.searchTopN, { search, ..., limit: 50 })` non paginé.

**Persistance** : `localStorage["galden:crm:columns:v1"]`, `sort:v1`.

**Bulk actions** : `LeadsBulkActionsBar` flottant si `selection.size > 0`.

**Preview drawer** : clic ligne → Sheet shadcn `side="right" max-w-[480px]`.

---

## 9. Fiche lead — tabs avec Framer Motion

**Onglets** : `"parcours" | "appels" | "notes" | "paiements"`

**Pattern tabs animés** :
```tsx
<div className="inline-flex items-center rounded-xl border border-border/60 bg-card p-1 shadow-sm">
  {visibleTabs.map((tab) => (
    <button onClick={() => setActiveTab(tab.id)}>
      {active && (
        <motion.div
          layoutId="lead-tab-indicator"
          className="absolute inset-0 rounded-lg bg-muted"
          transition={{ type: "spring", stiffness: 500, damping: 35 }}
        />
      )}
    </button>
  ))}
</div>
<AnimatePresence mode="wait">
  <motion.div
    key={activeTab}
    initial={{ opacity: 0, y: 4 }}
    animate={{ opacity: 1, y: 0 }}
    exit={{ opacity: 0 }}
    transition={{ duration: 0.15 }}
  />
</AnimatePresence>
```

**Timeline (LeadActivityStream)** : `motion.div` `staggerChildren: 0.03`, items `{ hidden: { opacity:0, y:6 }, show: { opacity:1, y:0 } }`. Ligne verticale `absolute left-[15px] top-8 bottom-0 w-px bg-border`. Icons typés 13 events, couleur propre.

**Pipeline stepper** : chevrons CSS `clipPath polygon()`. Framer Motion `layoutId` spring + pulse dot animé.

---

## 10. Admin event config

**Navigation verticale gauche** :
```tsx
<aside className="space-y-1">
  {SECTIONS.map((s) => (
    <button onClick={() => setSection(s.key)}
      className={`flex w-full items-center gap-2.5 rounded-lg border-l-[3px] px-3 py-2.5
        ${section === s.key ? "border-primary bg-primary/5 font-medium" : "border-transparent"}`}
    />
  ))}
</aside>
```

**SectionShell** : wrapper universel, header icon+title+description, body, sticky bottom bar `onSave` avec dirty tracking. Bouton Enregistrer disabled si `!dirty || saving`.

**9 sections composants isolés** : DetailsSection, HostsSection, SetterSection, BookingsSection, ScheduleSection, QuestionsSection, DisqualificationSection, CalendarInvitationSection, ConfirmationSection.

**Preview** : bouton "Prévisualiser" → `window.open(publicUrl, "_blank")`.

---

## 11. Composants custom à reprendre

**PhoneField** : lib `react-international-phone`, flag emoji codepoints Unicode, Popover shadcn Command, split `[bouton pays] + [input]`.

**TimezoneSelect** : Select shadcn, liste `COMMON_TIMEZONES` (24 zones), offset `Intl.DateTimeFormat(..., { timeZoneName: "shortOffset" })`.

**AvatarCircle** : gradient déterministe (hash nom → 10 paires couleurs Tailwind), initiales 2 lettres, tailles xs/sm/md/lg/xl/2xl.

**KpiCard** : `card-premium` custom class, icon dans carré `bg-primary/10 ring-1 ring-primary/15`, taille hero (52px) ou default (32px).

**PageHeader** : `text-[28px] font-semibold tracking-[-0.03em]`, slot `actions`.

---

## 12. Animations Framer Motion (patterns trouvés)

| Pattern | Usage | Code |
|---|---|---|
| Tab indicator | `layoutId` spring | `stiffness:500, damping:35` |
| Tab content | AnimatePresence mode="wait" | `initial:{opacity:0,y:4} exit:{opacity:0} duration:0.15` |
| Timeline stagger | `staggerChildren:0.03` | items `{hidden:{opacity:0,y:6}, show:{opacity:1,y:0}}` |
| Chevron stepper | initial scale + cascade delay | `scale:0.96, opacity:0.6, delay:i*0.04` |
| Pulse dot | repeat infini | `scale:[1,1.35,1], opacity:[0.85,1,0.85]` |

**CSS animations (globals.css)** :
- `.animate-fade-in` : `fade-in 0.4s ease-out` translateY(8→0) + opacity
- `.animate-scale-in` : scale(0.95→1) + opacity
- `.animate-pulse-glow` : box-shadow pulse

**Transitions globales** : toutes couleurs `200ms cubic-bezier(0.4,0,0.2,1)` (dark mode fluide).

---

## 13. Conventions & gotchas

- **Convex skip pattern** : `useQuery(api.x, condition ? args : "skip")` partout
- **DOMPurify** : `isomorphic-dompurify` sur tout `dangerouslySetInnerHTML` (descriptions admin)
- **Sonner** : `toast.success/error` global
- **lucide-react** : icônes exclusivement
- **`cn()` + `formatEUR()`** : `/src/lib/utils.ts` (clsx+twMerge + formatEUR centimes)
- **LocalStorage persistance** : colonnes CRM, sort, rail-collapsed — clés versionnées (`galden:crm:columns:v1`)
- **Tailwind v4** : `@theme {}` dans globals.css, plus de `tailwind.config.ts`

---

## 14. Dépendances à installer dans iClone

```bash
bun add framer-motion @tanstack/react-table react-international-phone isomorphic-dompurify sonner lucide-react
```

Déjà inclus avec shadcn : `clsx`, `tailwind-merge`.
