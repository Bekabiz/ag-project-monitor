# AG Project Monitor — Full Visual Redesign

You are redesigning the visual layer of AG Project Monitor, a React + Vite PWA
used daily by a Greek civil engineering office.

Run Phase 1, report, then continue straight into Phase 2 unless I say otherwise.

---

## Hard boundaries

You are changing how it looks. You are not changing what it does.

**Do not touch:**
- Any Supabase query, mutation, or `.from()` call
- Any `/api/*` endpoint or its request/response shape
- Any state logic, `useEffect`, event handler, or data transformation
- Authentication, roles, or the owner/team permission split
- The service worker, push notification logic, or `vercel.json`
- Any Greek user-facing string — the UI language stays exactly as it is
- Feature behaviour: no removing buttons, no merging screens

**You may change:**
- `src/styles/tokens.css`, `layout.css`, `components.css`, `pages.css`
- `className` values in JSX
- Icon choices and sizes (lucide-react is already installed)
- Element order *within* a page where it improves hierarchy and changes nothing
  functionally
- `index.html` head — fonts only

**After every step:** run `npx vite build`. It must pass. Commit each step
separately with a clear message so any single step can be reverted alone.

If you think a feature should change, say so in the report. Do not act on it.

---

## Who uses this

**Giorgos (owner)** — phone, on construction sites, strong Greek sunlight,
often one-handed, sometimes dusty or wet fingers. Large targets, high contrast,
few things per screen. He is the primary user.

**Vaso, Konstantina, Gogo (team)** — office desktops, long sessions. Density is
fine, more information visible at once is welcome.

Opposite requirements, currently identical treatment. That is a core problem.

**Product idea:** the permanent memory of an engineering office. Decisions,
problems and evidence that must still be findable in three years. It should
feel like a well-made archive or legal record, not a consumer productivity app.
Serious, precise, quiet.

---

# PHASE 1 — AUDIT

Read the whole frontend, then report. Cite file and line numbers.

## 1. Design system inventory
- Every token in `tokens.css`: what it is, where used, which are unused
- Every distinct font-size, weight and line-height across the CSS — count them
- Every border-radius value in use
- Every shadow in use
- Any hardcoded colour, size or spacing bypassing the tokens
- Every lucide icon used, at what size and stroke width, and whether consistent

## 2. Page by page
For **Login, Today, Projects, Project Detail (all six tabs), Input, Center (all
five sections)** and every modal:
- Each visual section, in order
- Each button, its current appearance and visual weight
- How hierarchy is established, if at all
- How it behaves at 380px versus 1400px
- Where phone and desktop are identical, and whether that hurts
- The single worst thing about the page visually

## 3. Consistency failures
- Same job, different appearance
- Same appearance, different job
- Category colours (problem / decision / material / client_request /
  work_update / note) — consistent across Memory, Timeline, Search, Overview,
  Report?
- Status colours (new / in progress / waiting / done / overdue / urgent) — same
- Spacing following no scale

## 4. Mobile problems
- Touch targets under 44px
- Text under 15px
- Horizontal scroll
- Anything needing two hands or a precise tap
- Contrast that would fail in direct sunlight

## 5. Assessment
- What the current design communicates
- Why it reads as generic, concretely
- The five changes that would most improve perceived quality

---

# PHASE 2 — REDESIGN

## Direction

Restraint borrowed from Apple's product pages, adapted to an information-dense
application.

**Do not copy Apple's marketing scale.** 96px headlines and 120px section gaps
are wrong for a task list. What transfers is the discipline, not the sizes.

**Take:**
- Monochrome surfaces, a single accent reserved strictly for primary actions
- **No shadows.** Separate surfaces with background-colour shifts and hairlines.
  Shadows on every card are the clearest signal of a template.
- Hierarchy from typography and space, not boxes and borders
- Alternating canvas bands instead of dividers
- Tight negative tracking on large text, open line-height on body
- Pill buttons, consistent card radii

**Deliberately differ:**
- App type scale, not landing-page scale
- Semantic colour is required — a problem must look like a problem in every
  view. This is meaning, not decoration.
- Higher contrast than Apple's palette. `#707070` on white is 4.6:1 — fine
  indoors, unreadable on a building site in July.

## Tokens

Rewrite `tokens.css` as the single source of truth. Use these values.

### Surfaces
```
--paper:        #ffffff   /* cards, primary surface */
--canvas:       #f5f5f7   /* alternating bands, page background */
--wash:         #e8e8ed   /* hover, pressed, subtle fills */
--elevated:     #fafafc   /* sticky nav, floating panels */
--hairline:     #d6d6d6   /* borders — used sparingly */
--hairline-soft:#e5e5e7
```
No shadow token except optionally one for modals only.

### Text
```
--ink:            #1d1d1f   /* headings, primary text */
--text-primary:   #1d1d1f
--text-secondary: #525252   /* deliberately darker than Apple's #707070 */
--text-muted:     #6e6e73
--text-inverse:   #ffffff
```
Verify and report the contrast ratio of every pairing. Minimum 4.5:1.

### Accent — exactly one
```
--accent:       #0071e3   /* filled primary buttons, active nav only */
--accent-hover: #0077ed
--accent-link:  #0066cc   /* inline text links only */
--accent-wash:  #e8f2fd
```
Never decorative. Never body text. One filled accent button per screen maximum.

### Semantic categories
Derived from Apple's product-finish family — muted and coherent, not primary
crayon colours. The swatch is the wash; derive a darker foreground for text and
icons, and **verify each foreground reaches 4.5:1 on both paper and its wash**.

```
problem         wash #f5e0d4  (from Ember #b64400)
decision        wash #eef1f6  (from Indigo #596680)
material        wash #f0e4d3  (Starlight)
client_request  wash #f2e2e2  (Blush)
work_update     wash #e3edf2  (Sky)
note            wash #e9eaeb  (Silver)
```
Report the foreground hex you derive for each, with its ratio.

### Status — distinct from categories
```
--danger    overdue, urgent
--warn      waiting, due soon
--success   done, approved
--neutral   not started
```
Choose values in the same muted register. Report ratios.

### Type scale — app scale
```
--text-display   32px / 1.1  / -0.02em / 600
--text-h1        28px / 1.15 / -0.02em / 600
--text-h2        22px / 1.25 / -0.01em / 600
--text-h3        18px / 1.3  / -0.01em / 600
--text-body      16px / 1.5  /  0      / 400
--text-body-sm   15px / 1.5  /  0      / 400
--text-caption   13px / 1.4  /  0      / 400
--text-micro     12px / 1.35 /  0.01em / 500
```
Body must not drop below 16px on phone.

Choose the typeface deliberately and justify it. **It must render Greek
properly — verify, do not assume.** Inter is acceptable if you conclude it is
right, but say why rather than defaulting.

### Spacing — 4px base
```
4, 8, 12, 16, 20, 24, 32, 40, 48, 64
```
Nothing outside this scale.

### Radius — three values only
```
--radius-sm:   10px   /* inputs, small controls */
--radius-card: 20px   /* cards, panels, modals */
--radius-pill: 999px  /* buttons, chips, badges */
```

## Responsive

Same product designed twice, not one layout squeezed.

**Phone (Giorgos):** minimum 48px touch targets, 16px body minimum, one primary
action visible per screen, frequent actions within thumb reach, higher contrast.

**Desktop (team):** more density, multi-column where it genuinely helps, hover
states, visible keyboard focus rings.

## Icons

Audit every icon. One stroke width throughout (1.5). Two sizes maximum (16 and
20). Every icon must earn its place — if a label already says it, the icon is
probably decoration. Same concept, same icon, everywhere.

## Order of work — commit separately, build after each

1. `tokens.css` — this alone changes every page
2. `components.css` — buttons, inputs, cards, pills, modals, toasts
3. `layout.css` — shell, sidebar, bottom nav, safe areas
4. Today
5. Project Detail and its six tabs
6. Input
7. Center and its five sections
8. Projects, Login, remaining modals

## Report after each step
- What changed and why, in design terms
- Contrast ratios for every pairing introduced
- Build passes
- No handler, query or Greek string touched

---

## Answer in the Phase 1 report — do not implement

**Language switching.** UI is Greek. Chrome auto-translate breaks React's DOM
reconciliation, so translation is disabled via `notranslate` — meaning the app
cannot be read in English at all. Proper i18n with a GR/EN toggle is the correct
fix. How many strings, which files, what approach suits this codebase?

**Dark mode.** Worth it for a phone used outdoors, or a distraction?

**Center navigation.** Five sections is a lot to reach on a phone when the owner
mostly wants two. Better structure that removes nothing?
