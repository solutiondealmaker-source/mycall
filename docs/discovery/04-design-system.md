# iClone — Design System

> Refined editorial premium SaaS. Linear (clarté) × Stripe (polish) × Endosia (chaleur cream).
> Stack : Next.js 15 + Tailwind CSS 4 + shadcn/ui + Framer Motion + Convex.

---

## 1. Foundations

### 1.1 Color Tokens (CSS Custom Properties — `globals.css`)

```css
:root {
  /* Backgrounds */
  --background:    #FAFBFE; /* cream — surface principale */
  --surface:       #FFFFFF; /* white — cards, panels */
  --surface-raised: #F6F7FB; /* warm — inputs, hover rows */
  --surface-muted: #EEF0F6; /* mist — disabled, dividers */

  /* Brand */
  --brand:         #2563EB; /* Endosia blue */
  --brand-bright:  #3B82F6; /* hover state du brand */
  --brand-light:   #60A5FA; /* accents, underlines */
  --brand-soft:    rgba(37, 99, 235, 0.08); /* bg chips, badges */
  --brand-glow:    rgba(37, 99, 235, 0.18); /* glow rings, focus */

  /* Ink */
  --ink:           #0F172A; /* titres, texte principal */
  --ink-soft:      #1E293B; /* sous-titres */
  --ink-muted:     #64748B; /* helper text, labels */
  --ink-ghost:     #94A3B8; /* placeholders, disabled */

  /* Border */
  --border:        rgba(15, 23, 42, 0.08);
  --border-strong: rgba(15, 23, 42, 0.14);

  /* Semantic */
  --success:       #10B981;
  --success-soft:  rgba(16, 185, 129, 0.08);
  --warning:       #F59E0B;
  --warning-soft:  rgba(245, 158, 11, 0.08);
  --destructive:   #F43F5E;
  --destructive-soft: rgba(244, 63, 94, 0.08);

  /* Spacing scale (3 main + 2 xl) */
  --space-xs: 4px;
  --space-sm: 8px;
  --space-md: 16px;
  --space-lg: 24px;
  --space-xl: 48px;
  --space-2xl: 80px;

  /* Radius */
  --radius-sm: 8px;   /* badges, chips */
  --radius-md: 12px;  /* inputs, buttons */
  --radius-lg: 16px;  /* cards */
  --radius-xl: 24px;  /* panels, booking card */

  /* Shadows — border-only philosophy, réservé floating */
  --shadow-card:  0 1px 2px rgba(15,23,42,0.04), 0 4px 16px rgba(15,23,42,0.04);
  --shadow-float: 0 8px 32px rgba(15,23,42,0.08), 0 1px 4px rgba(15,23,42,0.06);
  --shadow-brand: 0 4px 20px rgba(37,99,235,0.22);
}
```

**Tailwind mapping (`tailwind.config.ts`)** :
```ts
colors: {
  brand:    'var(--brand)',
  'brand-soft': 'var(--brand-soft)',
  ink:      'var(--ink)',
  'ink-muted': 'var(--ink-muted)',
  'ink-ghost': 'var(--ink-ghost)',
  cream:    'var(--background)',
  surface:  'var(--surface)',
  mist:     'var(--surface-muted)',
  border:   'var(--border)',
}
```

---

### 1.2 Typography Scale

| Rôle | Font | Size | Weight | Line-height | Tracking |
|------|------|------|--------|-------------|---------|
| Display / H1 | Outfit | `text-3xl` (30px) | 800 | 1.15 | -0.02em |
| H2 / Section | Outfit | `text-xl` (20px) | 700 | 1.3 | -0.01em |
| H3 / Card title | Outfit | `text-base` (16px) | 700 | 1.4 | 0 |
| Body | Manrope | `text-sm` (14px) | 400/500 | 1.6 | 0 |
| Caption / Label | Manrope | `text-xs` (12px) | 500 | 1.5 | 0.01em |

```css
/* globals.css — font-face via Google Fonts */
@import url('https://fonts.googleapis.com/css2?family=Outfit:wght@600;700;800&family=Manrope:wght@400;500;600;700&display=swap');

body         { font-family: 'Manrope', sans-serif; }
h1,h2,h3,h4 { font-family: 'Outfit', sans-serif; }
```

---

### 1.3 Grain Texture + Mesh Blobs (globals.css)

```css
/* Grain overlay — 0.035 opacity, mix-blend-mode: multiply */
.grain::after {
  content: ''; position: absolute; inset: 0;
  background: url("data:image/svg+xml,%3Csvg viewBox='0 0 512 512' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.75' numOctaves='5' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23n)'/%3E%3C/svg%3E");
  opacity: 0.035; pointer-events: none; z-index: 1; mix-blend-mode: multiply;
}

/* Top accent line — signature Endosia */
.top-accent-line {
  position: fixed; top: 0; left: 0; width: 100%; height: 2px; z-index: 100;
  background: linear-gradient(90deg, transparent 10%, #2563EB 40%, #60A5FA 60%, transparent 90%);
  opacity: 0.4;
}
```

**Blobs animés (Framer Motion)** — injectés dans `<MeshBackground />` :
```tsx
// Blob A: top-right, brand blue, 25s drift
// Blob B: bottom-left, brand-light, 30s drift
// Blob C: center-left, brand faint, 20s drift
// Tous: filter: blur(100px), opacity blend-mode: screen in dark, multiply in light
// Animation: cubic-bezier(0.16, 1, 0.3, 1) sur transform uniquement
```

---

## 2. Core Component Snippets

### 2.1 Button Premium (3 variants)

```tsx
// components/ui/button.tsx — customisation shadcn

const buttonVariants = cva(
  // base
  "inline-flex items-center justify-center gap-2 font-['Outfit'] font-700 text-sm rounded-[var(--radius-md)] transition-all duration-200 ease-[cubic-bezier(0.16,1,0.3,1)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand focus-visible:ring-offset-2 disabled:opacity-40 disabled:pointer-events-none select-none",
  {
    variants: {
      variant: {
        // Variant 1 — primary (CTA principal)
        primary: [
          "bg-brand text-white shadow-[var(--shadow-brand)]",
          "hover:bg-brand-bright hover:-translate-y-px hover:shadow-[0_6px_24px_rgba(37,99,235,0.3)]",
          "active:translate-y-0 active:shadow-[var(--shadow-brand)]",
        ],
        // Variant 2 — secondary (action standard)
        secondary: [
          "bg-surface text-ink border border-[var(--border-strong)]",
          "hover:bg-surface-raised hover:border-brand/20 hover:-translate-y-px",
          "active:translate-y-0",
        ],
        // Variant 3 — ghost (action légère, nav, sidebar)
        ghost: [
          "text-ink-muted bg-transparent",
          "hover:bg-brand-soft hover:text-brand",
          "active:bg-brand/12",
        ],
      },
      size: {
        sm: "h-8 px-3 text-xs",
        md: "h-9 px-4 text-sm",
        lg: "h-11 px-6 text-base",
      },
    },
    defaultVariants: { variant: "primary", size: "md" },
  }
)
```

---

### 2.2 Card Signature

```tsx
// components/ui/card-premium.tsx
// Règle : border sur --border, PAS de shadow sur card standard.
// Shadow uniquement sur surface floating (drawer, modal, dropdown).

export function CardPremium({
  children,
  className,
  glow = false,
}: {
  children: React.ReactNode
  className?: string
  glow?: boolean
}) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4, ease: [0.16, 1, 0.3, 1] }}
      className={cn(
        // Structure
        "relative bg-surface rounded-[var(--radius-lg)] overflow-hidden",
        // Border — pas de shadow
        "border border-[var(--border)]",
        // Hover uplift subtil
        "transition-shadow duration-200 hover:shadow-[var(--shadow-card)]",
        // Glow optionnel pour CTA cards
        glow && "ring-1 ring-brand/10 hover:ring-brand/20",
        className
      )}
    >
      {/* Grain texture */}
      <div className="grain pointer-events-none absolute inset-0 z-10" />
      {children}
    </motion.div>
  )
}
```

---

### 2.3 Stepper Booking

```tsx
// components/booking/stepper.tsx
// 2 étapes : "Vos infos" → "Choisissez un créneau"
// Style : capsule horizontale, dot + label, connector line

const steps = [
  { id: 1, label: "Vos informations" },
  { id: 2, label: "Choisissez un créneau" },
]

export function BookingStepper({ current }: { current: 1 | 2 }) {
  return (
    <div className="flex items-center gap-0 w-full max-w-sm mx-auto">
      {steps.map((step, i) => (
        <Fragment key={step.id}>
          <div className="flex flex-col items-center gap-1.5">
            {/* Dot */}
            <motion.div
              animate={{
                backgroundColor: current >= step.id ? "var(--brand)" : "var(--surface-muted)",
                scale: current === step.id ? 1.15 : 1,
              }}
              transition={{ duration: 0.3, ease: [0.16, 1, 0.3, 1] }}
              className="w-7 h-7 rounded-full flex items-center justify-center"
            >
              {current > step.id
                ? <Check className="w-3.5 h-3.5 text-white" />
                : <span className="text-[11px] font-bold text-white font-['Outfit']">{step.id}</span>
              }
            </motion.div>
            {/* Label */}
            <span className={cn(
              "text-xs font-['Manrope'] font-500 whitespace-nowrap",
              current >= step.id ? "text-ink" : "text-ink-ghost"
            )}>
              {step.label}
            </span>
          </div>
          {/* Connector */}
          {i < steps.length - 1 && (
            <div className="flex-1 h-px mx-3 relative overflow-hidden bg-[var(--border)]">
              <motion.div
                animate={{ scaleX: current > 1 ? 1 : 0 }}
                initial={{ scaleX: 0 }}
                style={{ originX: 0 }}
                transition={{ duration: 0.5, ease: [0.16, 1, 0.3, 1] }}
                className="absolute inset-0 bg-brand"
              />
            </div>
          )}
        </Fragment>
      ))}
    </div>
  )
}
```

---

## 3. Screens — Specs Visuelles Détaillées

### 3.1 Page Booking Publique `/book/[slug]`

**Layout** : fond `--background` + MeshBackground. Top accent line fixe. Card centrale `max-w-2xl`, `rounded-[var(--radius-xl)]`, `shadow-[var(--shadow-float)]`, `border border-[var(--border)]`, `bg-surface`. Padding interne `p-10`. Stepper en haut de la card.

**Étape 1 — Form prospect (colonne unique)**
- Header card : avatar/photo du coach `w-12 h-12 rounded-full`, nom `text-xl font-outfit font-700`, duration badge `text-xs bg-brand-soft text-brand rounded-full px-2.5 py-0.5`.
- Formulaire : `gap-5`, labels `text-xs font-manrope font-500 text-ink-muted uppercase tracking-widest`, inputs `h-10 rounded-[var(--radius-md)] border-[var(--border)] bg-surface focus:ring-2 focus:ring-brand/30 focus:border-brand transition-all`.
- CTA : `Button variant="primary" size="lg" w-full` — "Suivant →"
- Calendrier droit : `opacity-20 blur-sm pointer-events-none` avec overlay gradient `from-surface/60 to-transparent`, badge "Choisissez un créneau après avoir rempli vos infos" centré.

**Étape 2 — Calendrier actif**
- Gauche sticky : card `bg-surface-raised border border-[var(--border)] rounded-[var(--radius-lg)] p-6` avec résumé (nom, email, type d'event, durée).
- Calendrier droite : grille 7 jours, jour actif `bg-brand text-white rounded-[var(--radius-sm)]`, jour hover `bg-brand-soft text-brand`, jour disabled `text-ink-ghost cursor-not-allowed`. Slots sous le calendrier : pills `h-8 px-3 rounded-full border border-[var(--border)] text-sm font-500`, selected = `bg-brand text-white border-brand`.
- Animation transition étape 1 → 2 : `motion.div` avec `initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }}` et déblur du calendrier via `animate={{ filter: "blur(0px)", opacity: 1 }}` (0.6s ease-spring).

**Footer** : `text-xs text-ink-ghost text-center mt-6` — "Propulsé par **iClone**" — "iClone" en `font-outfit font-700 text-ink-ghost`.

**Responsive** : sous `md`, card full-width, `mx-4`, calendrier passe sous le form. Stepper reste en capsule horizontale.

---

### 3.2 Page Success Post-Booking

**Layout** : fond `--background` + MeshBackground blobs actifs. Pas de sidebar, centré `max-w-lg mx-auto pt-24`.

**Composition** :
1. **Icône success animée** : cercle `w-16 h-16 bg-success-soft rounded-full flex-center`, check Lucide `text-success w-8 h-8`. Animation entrée : `scale(0) → scale(1.1) → scale(1)` via Framer spring `{ type: "spring", stiffness: 260, damping: 20 }`.
2. **Titre** : `text-3xl font-outfit font-800 text-ink tracking-tight` — "Votre appel est confirmé."
3. **Sous-titre** : `text-sm text-ink-muted font-manrope mt-2` — détails datetime + nom du closer.
4. **Card Meet** : `CardPremium glow` avec lien Meet `Button variant="primary"` + icône ExternalLink. Texte "Rejoindre Google Meet".
5. **Actions secondaires** : `flex gap-3 justify-center mt-6` — `Button variant="secondary" size="sm"` × 2 : "Annuler" (destructive ghost) + "Replanifier".
6. **Stagger list** entrée : les éléments 1→5 apparaissent avec `staggerChildren: 0.08`, `initial={{ opacity: 0, y: 12 }}`.

**Confetti** (optionnel, uniquement premier rendu) : 30 particules, couleurs `#2563EB` + `#60A5FA` + `#10B981`, `useEffect` one-shot, `canvas-confetti` ou implémentation légère native.

---

### 3.3 Layout Dashboard

**Structure** :
```
┌─ Sidebar 240px (collapsible → 64px) ─────┬─ Main ─────────────────────────────┐
│  Logo iClone (textmark)                    │  Topbar 56px sticky                │
│  Nav items (icon + label)                  │  Content max-w-[1400px] mx-auto    │
│  ─── separator ───                         │  px-8 py-6                         │
│  Footer : avatar + nom + chevron           └────────────────────────────────────┘
└───────────────────────────────────────────
```

**Sidebar** :
- `bg-surface border-r border-[var(--border)] h-screen sticky top-0 flex flex-col`.
- Logo zone `h-14 px-5 flex items-center border-b border-[var(--border)]`.
- Nav item (base) : `h-9 rounded-[var(--radius-sm)] px-3 flex items-center gap-2.5 text-sm font-manrope font-500 text-ink-muted cursor-pointer transition-all duration-150`.
- Nav item (active) : `bg-brand-soft text-brand font-600`.
- Nav item (hover) : `hover:bg-surface-raised hover:text-ink`.
- Icon : `w-4 h-4`, Lucide. Label disparaît en mode collapsed avec `motion.span` `width: auto → 0, opacity: 1 → 0`.
- Collapse toggle : bouton ghost bottom `w-8 h-8` avec icône `PanelLeftClose / PanelLeftOpen`.
- Footer sidebar : `mt-auto px-4 py-4 border-t border-[var(--border)]` — avatar `w-7 h-7 rounded-full`, nom `text-xs font-500 text-ink`, chevron DropdownMenu.

**Topbar** :
- `h-14 border-b border-[var(--border)] bg-surface/80 backdrop-blur-xl sticky top-0 z-30`.
- Left : Breadcrumb shadcn — séparateur `/` `text-ink-ghost`, segment actif `text-ink font-500`.
- Right : `CommandPalette` trigger `⌘K` (Badge `text-xs border rounded px-1.5`) + `Bell` icon + `Avatar` dropdown.

**Nav items V1** :
```
Dashboard     (LayoutDashboard)
Événements    (CalendarDays)
CRM           (Users)
Calendrier    (Calendar)
Analytics     (BarChart3)
──────────────
Paramètres    (Settings)
```

---

### 3.4 Admin Event Config

**Layout** : 3 colonnes.
```
┌─ Tabs verticaux 200px ─┬─ Formulaire flex-1 ──────────┬─ Preview 280px ─┐
│                         │                               │                 │
│  5 onglets actifs       │  Contenu par onglet           │  Live slots      │
│  6 onglets disabled     │                               │  preview         │
│                         │                               │                 │
│                         ├── Sticky bottom bar ──────────┤                 │
│                         │  Annuler | Enregistrer →      │                 │
└─────────────────────────┴───────────────────────────────┴─────────────────┘
```

**Tabs verticaux** :
- Container `w-[200px] border-r border-[var(--border)] py-4 flex flex-col gap-0.5 px-3`.
- Tab actif : `bg-brand-soft text-brand font-600 rounded-[var(--radius-sm)]`.
- Tab disabled : `opacity-35 cursor-not-allowed pointer-events-none` + badge `text-[10px] bg-mist text-ink-ghost px-1.5 rounded ml-auto` "Bientôt".
- Onglets V1 actifs : **Informations générales**, **Disponibilités**, **Questions prospect**, **Intégrations**, **Notifications**.
- Onglets locked : Routing, A/B Test, Redirections, Paiement, Embed, Workflow.

**Formulaire central** :
- `max-w-[600px] px-8 py-6 overflow-y-auto h-[calc(100vh-56px-56px)]`.
- `SectionHeader` : `text-base font-outfit font-700 text-ink mb-4 pb-3 border-b border-[var(--border)]`.
- Groupes de champs : `space-y-5`.
- Sticky bottom bar : `h-14 border-t border-[var(--border)] bg-surface/95 backdrop-blur px-8 flex items-center justify-end gap-3`.

**Preview droite** :
- `w-[280px] border-l border-[var(--border)] bg-surface-raised p-5`.
- Label `text-xs font-manrope font-500 text-ink-ghost uppercase tracking-wide mb-3` "Aperçu des créneaux".
- Mini-calendrier statique + slots pills `bg-brand-soft text-brand text-xs rounded-full px-2.5 py-1`.
- Se met à jour via `useWatch` react-hook-form (debounce 300ms).

---

### 3.5 CRM Tableau

**Layout** :
```
┌─ Sidebar filtres 240px ─┬─ Contenu principal ────────────────────────────┐
│  Vues intelligentes      │  Topbar : search + filtres rapides + add       │
│  ─── Étiquettes ───      │  Table shadcn (sticky header, hover row)       │
│  ─── Statuts ───         │  Pagination shadcn bottom                      │
│  ─── Closers ───         │                                                │
└──────────────────────────┴────────────────────────────────────────────────┘
```

**Sidebar filtres** :
- `w-60 border-r border-[var(--border)] p-4 space-y-6 overflow-y-auto`.
- Section `text-[11px] font-manrope font-600 text-ink-ghost uppercase tracking-widest mb-2`.
- Vue item : `h-8 rounded-[var(--radius-sm)] px-2.5 flex items-center justify-between text-sm cursor-pointer` + `motion.div` avec `hover:bg-surface-raised`.
- Count badge : `text-xs bg-mist text-ink-muted rounded-full px-1.5 ml-auto`.

**Table** :
- `<Table>` shadcn, header `sticky top-0 bg-surface z-10 border-b border-[var(--border)]`.
- Header cell : `text-xs font-manrope font-600 text-ink-muted uppercase tracking-wide h-10 px-4`. Clic = tri, `ArrowUpDown` icon `w-3 h-3` inline.
- Row hover : `hover:bg-surface-raised cursor-pointer transition-colors duration-100`.
- Row click → ouvre `<LeadDrawer />` via `Sheet` shadcn (côté droit, 580px).
- Status badge : pill `text-xs font-500 px-2 py-0.5 rounded-full` — 4 couleurs sémantiques : `brand-soft/brand` (qualifié), `success-soft/success` (gagné), `warning-soft/warning` (en cours), `mist/ink-muted` (perdu).

**Topbar search** :
- `Input` shadcn `pl-9` avec `Search` icon absolute. `w-64 focus:w-80 transition-all duration-300`.
- Filtres rapides : `Button variant="secondary" size="sm"` avec icône `Filter`.
- Add CTA : `Button variant="primary" size="sm"` "Nouveau lead" + `Plus` icon.

**Pagination** : shadcn `Pagination`, compact `sm`, `text-xs`, `border border-[var(--border)] rounded-[var(--radius-md)]`.

**Empty state** :
- Icône `Users` Lucide `w-10 h-10 text-ink-ghost mx-auto`, H3 "Aucun lead pour l'instant", body `text-sm text-ink-muted`, CTA `Button variant="primary"` "Ajouter un lead".

**Loading skeleton** :
- 8 rows, chaque cell = `<Skeleton className="h-4 rounded" />`, widths variés (w-32, w-24, w-16...) pour simuler la distribution réelle.

---

### 3.6 Fiche Lead — Drawer

**Composant** : `<Sheet side="right" className="w-[580px]">` shadcn.

**Structure interne** :
```
┌─ Panel gauche 220px ──────┬─ Panel principal ──────────────┐
│  Avatar initiales          │  Tabs : Parcours / Appels /    │
│  Nom + email               │  Notes / Balises UTM           │
│  Score badge               │                                │
│  ─── Actions rapides ───   │  Contenu tab actif             │
│  Calendly link copy        │                                │
│  Envoyer email             │                                │
│  ─── Statut ───            │                                │
│  Stage dropdown            │                                │
│  Setter dropdown           │                                │
│  Closer dropdown           │                                │
└───────────────────────────┴────────────────────────────────┘
```

**Panel gauche** (`w-[220px] border-r border-[var(--border)] p-6 flex flex-col gap-6`) :
- Avatar : `w-12 h-12 rounded-full bg-brand-soft flex items-center justify-center text-brand font-outfit font-700 text-lg`.
- Nom `text-base font-outfit font-700 text-ink`, email `text-xs text-ink-muted`.
- Score : badge `text-xs rounded-full px-2 py-0.5` dynamique selon score.
- Actions : `Button variant="ghost" size="sm" w-full justify-start gap-2`.
- Dropdowns (Stage/Setter/Closer) : `Select` shadcn, `h-8 text-xs rounded-[var(--radius-sm)]`.

**Panel principal** :
- `Tabs` shadcn, liste `border-b border-[var(--border)]`, trigger `text-sm font-manrope font-500 pb-3 border-b-2 border-transparent data-[state=active]:border-brand data-[state=active]:text-brand`.
- Tab Parcours : timeline verticale — `div.relative pl-6 border-l-2 border-[var(--border)]` — chaque événement = dot `w-2 h-2 rounded-full bg-brand absolute -left-[5px]` + timestamp `text-xs text-ink-ghost` + description `text-sm text-ink`.
- Tab Appels : liste de sessions enregistrées avec durée, date, transcript snippet, `Button ghost size="sm"` "Voir le replay".
- Tab Notes : `Textarea` pleine largeur, `text-sm font-manrope`, auto-save indicator `text-xs text-ink-ghost` "Sauvegardé automatiquement".
- Tab UTM : `dl` grid 2-col, `dt text-xs text-ink-ghost`, `dd text-sm font-500 text-ink font-mono`.

**Animation d'entrée** :
```tsx
// Sheet s'ouvre depuis la droite — Framer Motion wrapping interne
initial={{ opacity: 0, x: 24 }}
animate={{ opacity: 1, x: 0 }}
exit={{ opacity: 0, x: 24 }}
transition={{ duration: 0.35, ease: [0.16, 1, 0.3, 1] }}
```

---

### 3.7 Analytics

**Layout** : `max-w-[1400px] mx-auto px-8 py-6`.

**Filtres globaux** (`sticky top-14 z-20 bg-surface/90 backdrop-blur border-b border-[var(--border)] py-3 px-8 flex items-center gap-4`) :
- `DateRangePicker` custom (shadcn Calendar + Popover). Label `text-xs font-500 text-ink-muted`.
- Multi-select événements : `Button variant="secondary" size="sm"` + Popover avec checkboxes.
- Reset : `Button variant="ghost" size="sm"` "Réinitialiser".

**Grid KPIs** : `grid grid-cols-2 lg:grid-cols-3 gap-5 mb-8`.
- KPI Card : `CardPremium p-6`.
- Label `text-xs font-manrope font-500 text-ink-muted mb-1`.
- Valeur `text-3xl font-outfit font-800 text-ink tracking-tight`.
- Delta : `text-xs font-500` — `text-success` si positif, `text-destructive` si négatif, avec icône `TrendingUp/Down w-3 h-3`.
- Pas d'icône par KPI. Pas de gradient dans la card.

**Widgets charts** (Tremor ou Recharts) :
- Couleur principale : `#2563EB`. Couleur secondaire : `#60A5FA`. Jamais plus de 2 couleurs par chart.
- Line chart taux de conversion : fond transparent, stroke brand, dot `r=3` filled white + brand stroke.
- Bar chart CA mensuel : `fill: var(--brand)`, radius top bars `4px`.
- Distribution statuts : Donut chart, `colors: ["#2563EB", "#10B981", "#F59E0B", "#94A3B8"]`.
- Fond chart : `bg-surface rounded-[var(--radius-lg)] border border-[var(--border)] p-6`.

---

## 4. Micro-interactions Clés

| Composant | Hover | Focus | Transition |
|-----------|-------|-------|------------|
| Button primary | `-translate-y-px`, shadow uplift | ring-2 ring-brand/30 | 200ms ease-spring |
| Input | border-brand + glow ring 0.5px | ring-2 ring-brand/20 | 150ms |
| Nav item sidebar | bg-surface-raised | — | 150ms |
| Table row | bg-surface-raised | — | 100ms |
| Calendar slot | bg-brand-soft text-brand | border-brand | 100ms |
| Card | shadow-[var(--shadow-card)] | — | 200ms |
| Drawer | x: 24 → 0, opacity 0 → 1 | — | 350ms spring |
| Page transition | opacity 0 → 1, y: 12 → 0 | — | 400ms spring |

---

## 5. States Systémiques

### Loading Skeletons
```tsx
// Skeleton qui matche la forme réelle
<div className="animate-pulse space-y-4">
  <Skeleton className="h-4 w-48 rounded" />        // titre
  <Skeleton className="h-3 w-32 rounded" />        // label
  <div className="grid grid-cols-3 gap-3">
    {[...Array(3)].map((_, i) => (
      <Skeleton key={i} className="h-24 rounded-[var(--radius-lg)]" />
    ))}
  </div>
</div>
// Couleur skeleton : bg-mist animate-pulse
// Jamais de spinner pour < 400ms
```

### Toast / Erreur
- shadcn `Sonner` — position `bottom-right`.
- Success : icône `CheckCircle2 text-success`, background `surface`, border `border-success/20`.
- Erreur : icône `AlertCircle text-destructive`, border `border-destructive/20`, action "Réessayer" `Button ghost size="sm"`.
- Durée : 4s success, 8s erreur.

### Empty States
- Container `flex flex-col items-center justify-center py-20 gap-4`.
- Icône Lucide `w-10 h-10 text-ink-ghost`.
- Titre `text-base font-outfit font-700 text-ink`.
- Description `text-sm text-ink-muted text-center max-w-xs`.
- CTA `Button variant="primary"`.

---

## 6. Responsive

| Breakpoint | Adaptation |
|-----------|-----------|
| `< 640px` (mobile) | Sidebar en drawer (Sheet bottom), topbar icon-only, booking card full-width `mx-4` |
| `640–768px` (sm) | Sidebar collapsée par défaut (64px), table scroll horizontal |
| `768–1024px` (md) | Layout complet mais grid analytics 2 col |
| `> 1024px` (lg) | Full layout, sidebar 240px, grid analytics 3 col |

Booking page mobile : card unique scroll vertical, stepper devient `position: sticky top-0 bg-surface z-10 py-3`.

---

## 7. Logo iClone — Textmark

**Recommandation** : Wordmark pur, pas d'icône. Mots composés.

```
i  Clone
```

- **"i"** : `font-outfit font-800`, couleur `--brand` (`#2563EB`).
- **"Clone"** : `font-outfit font-700`, couleur `--ink`.
- Taille sidebar : `text-lg tracking-tight`.
- Taille header public : `text-xl`.
- Traitement optionnel : point bleu après le "i" (`i.Clone`) pour rappeler le symbolisme de lien.

**Favicon** : carré 32×32 — lettre "i" en `font-outfit font-800 white` sur fond `#2563EB` `border-radius: 6px`. Variante dark : fond `#0F172A` + "i" brand.

---

## 8. Gradients Premium (Accents, CTA, Backgrounds)

```css
/* 1 — Brand fill (bouton CTA, badge actif) */
--grad-brand: linear-gradient(135deg, #2563EB 0%, #3B82F6 100%);

/* 2 — Brand soft (section hero, card accent) */
--grad-brand-soft: linear-gradient(135deg,
  rgba(37, 99, 235, 0.06) 0%,
  rgba(96, 165, 250, 0.03) 100%);

/* 3 — Cream wash (page background overlay) */
--grad-cream: linear-gradient(180deg,
  #FAFBFE 0%,
  #F6F7FB 100%);

/* 4 — Success (confirmation, statut gagné) */
--grad-success: linear-gradient(135deg,
  rgba(16, 185, 129, 0.10) 0%,
  rgba(16, 185, 129, 0.04) 100%);

/* 5 — Glow conic (trace-rotate, cadre animé) — usage très ponctuel */
--grad-glow-conic: conic-gradient(from var(--angle, 0deg),
  #2563EB, #60A5FA, rgba(96,165,250,0.15), transparent, transparent, #2563EB);
```

**Règle d'usage** : `--grad-brand` uniquement sur bouton primary et sur la top accent line. `--grad-brand-soft` sur section hero et cards featured. Jamais de gradient sur fond de page entière (seulement mesh blobs + grain).

---

## 9. Hero Compositions (README / Marketing)

### Option A — "Clarity"
Fond `--background` pur. Capture du booking widget en `CardPremium` centré, ombre légère. Mesh blobs discrets en arrière-plan. Tagline `text-3xl font-outfit font-800` alignée gauche. Sobre, Linear-like.

### Option B — "Editorial"
Split layout. Gauche `bg-ink` (dark section), blobs brand amplifiés `opacity: 0.25`. Logo blanc + tagline white. Droite : `bg-surface`, screenshot dashboard avec card ombre. Ligne de séparation verticale brand blue 2px. Contraste éditorial fort.

### Option C — "Ambient"
Full-bleed fond `--background` avec 3 blobs géants (800px, 650px, 400px). Overlay grain `opacity: 0.04`. Au centre : stepper booking animé (Framer Motion path draw), entouré d'icônes flottantes (Calendar, Users, BarChart). Top accent line animée. Le plus vivant, le plus Endosia-natif.

---

## 10. shadcn/ui — Composants à installer

```bash
bunx shadcn@latest add button card input label select textarea
bunx shadcn@latest add sheet dialog popover dropdown-menu
bunx shadcn@latest add table pagination tabs
bunx shadcn@latest add badge skeleton separator avatar
bunx shadcn@latest add form command breadcrumb calendar
bunx shadcn@latest add sonner tooltip
```

Personnalisations post-install :
- `components/ui/button.tsx` → remplacer `cva` selon § 2.1.
- `components/ui/input.tsx` → ajouter `transition-all duration-150 focus:ring-2 focus:ring-brand/20`.
- `components/ui/tabs.tsx` → `data-[state=active]:border-b-2 data-[state=active]:border-brand data-[state=active]:text-brand` (variant "underline").

---

## 11. MotionConfig Global

```tsx
// app/layout.tsx
import { MotionConfig } from 'framer-motion'

export default function RootLayout({ children }) {
  return (
    <MotionConfig reducedMotion="user" transition={{ ease: [0.16, 1, 0.3, 1], duration: 0.35 }}>
      {children}
    </MotionConfig>
  )
}
```

`reducedMotion="user"` : toutes les animations Framer Motion s'éteignent automatiquement si l'utilisateur a activé `prefers-reduced-motion`. Respect WCAG 2.2 AA.

---

*Design System iClone v1.0 — Endosia direction artistique, 2026.*
