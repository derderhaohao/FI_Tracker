# UI Handoff Spec: FI Tracker Design Polish

Oct 26, 2026. Exported from the handoff PDF.

## Overview

This spec turns the Oct 26 design critique into changes Claude Code can build. It is a polish
pass:

- no new features
- no change to any calculation
- no change to information architecture beyond Settings sub-navigation and page section order

The work fixes four things across the app:

- Low-contrast text and controls fail WCAG AA.
- Chart axes use uneven tick values.
- Some page layouts leave large empty areas or squeeze tables.
- The same kind of control looks different from page to page.

**Reviewed:**

- Build: the `main` build at commit `d630a90`, with the demo data.
- Viewports: 1280×800 and 390×844, light theme.
- Pages: Dashboard, Monthly update, Accounts, Snapshots, Cash flow, Goal, Projection (Summary and
  Play a story), Strategy Lab, Reviews, Settings, Time Machine and Beginner mode.

| Priority | Theme                                                                | Requirement IDs |
| -------- | -------------------------------------------------------------------- | --------------- |
| P0       | Accessibility: text, form and selected-state contrast; touch targets | UI-1 to UI-6    |
| P0       | Charts: round axis ticks, label collisions                           | UI-7 to UI-9    |
| P1       | Layout: Lab, Dashboard, Time Machine and Settings structure          | UI-10 to UI-17  |
| P1       | Consistency: dates, selects, inputs, status strip                    | UI-18 to UI-22  |
| P2       | Beginner mode details                                                | UI-23 to UI-25  |

**Stack:**

- React 19.
- Tailwind v4, with tokens in `src/index.css` (`@theme inline`).
- Shared UI in `src/components/ui/*` and `src/components/charts/*`.
- Recharts for charts.

Prefer changing a shared component or token over patching a page.

## Design tokens

### Changed colour tokens

Contrast figures are measured against `--background` (#f9f9f7) and `--surface-2` (#f2f1ee).

| Token      | Light now → new       | Dark now → new        | Why                                                                                                                                         |
| ---------- | --------------------- | --------------------- | ------------------------------------------------------------------------------------------------------------------------------------------- |
| `--subtle` | #898781 → **#6b6a65** | #898781 (keep)        | It is 3.4:1 on the background and used for 11–12 px captions in 77 places. The new value is 5.1:1 on the background and 4.8:1 on surface-2. |
| `--input`  | #d6d5ce → **#8a8981** | #3a3a37 → **#6e6d68** | Field borders are 1.4:1; WCAG 1.4.11 needs 3:1 for a control's boundary.                                                                    |
| `--border` | keep                  | keep                  | Cards and dividers are decoration.                                                                                                          |

### New tokens

| Token                | Value                                                                        | Use                               |
| -------------------- | ---------------------------------------------------------------------------- | --------------------------------- |
| `--segment-selected` | Light: `var(--surface)` + `shadow-xs` + a 1 px `--input` ring. Dark: #2f2f2c | Selected option in `Segmented`    |
| `--chart-tick`       | `var(--muted-foreground)`                                                    | Axis tick labels                  |
| `--focus-ring`       | 2 px `var(--ring)`, 2 px offset                                              | One focus style for every control |

### Type scale

| Role        | Class                                                              |
| ----------- | ------------------------------------------------------------------ |
| Page title  | `text-2xl font-semibold`                                           |
| Hero number | `text-4xl font-semibold tabular`                                   |
| KPI value   | `text-2xl font-semibold tabular`                                   |
| Card title  | `text-base font-semibold`                                          |
| Body        | `text-sm`                                                          |
| Caption     | `text-xs` (12 px is the minimum for any text a user needs to read) |
| Chart tick  | 12 px                                                              |

Remove all `text-[10px]` and `text-[11px]`.

### Size scale

| Element          | Desktop                                     | Touch (coarse pointer or narrower than 768 px) |
| ---------------- | ------------------------------------------- | ---------------------------------------------- |
| Control height   | 32 px                                       | 44 px                                          |
| Minimum hit area | 24 × 24 px                                  | 44 × 44 px                                     |
| Card padding     | 16 px; 20 px at 1024 px and up              | —                                              |
| Section gap      | 16 px between cards; 24 px between sections | —                                              |

## Shared components

**Segmented (UI-3)**

- The track is `bg-surface-2`.
- The selected option uses `--segment-selected` with `font-semibold`.
- Options are 28 px tall on desktop and 40 px on touch.

**Select (UI-19)**

- Keep the native element.
- Add `appearance-none` and a 16 px chevron 8 px from the right.
- Same height and border as Input.

**Input (UI-20)**

- No spin buttons on number inputs.
- The currency goes to the label or column header; only the `%` suffix stays inside the field.

**Button (UI-4, UI-5)**

- `sm` and `icon` buttons are 44 px on touch.
- Disabled buttons use `opacity-50 cursor-not-allowed` with a tooltip saying why.

**Stat (UI-21)**

- Label in `text-sm text-muted-foreground`, then the KPI value.
- A two-line sub-line with the full text in `title`.

**Charts (UI-7 to UI-9)**

- `niceTicks(min, max, count = 5)` uses steps of 1, 2, 2.5 or 5 × 10ⁿ. The domain ends on the last
  tick.
- Ages tick every 5 years on round values. Months tick on January or on quarters.
- Reference labels sit in a 20 px band above the plot. Labels that would overlap are staggered onto
  a second row.
- Tick text is 12 px in `--chart-tick`. Gridlines appear at 0 only.
- A chart card never stretches to match a taller sibling.

**Plan status strip (UI-22)**

- Keep the strip, and move its explainer behind the "Details" popover.
- The status badge carries an icon (`AlertTriangle` or `CheckCircle2`).

## Page specs

### Dashboard (UI-10, UI-11)

- **Order:** plan hero → KPI row → allocation alert → net worth beside allocation and currency → "Why
  did my FI date move?" → Backup.
- **FI date move:** a month passing uses `--warning` text with a `--series-4` bar; earlier-moving bars
  use `--good-mark`.
- **Allocation rows:**
  - label 96 px · bar (min 120 px, 8 px tall) · value
  - the target tick is 2 × 14 px with a legend
- **Allocation alert:** gets a "Review allocation" link.
- **Phones:** KPI tiles are 2 × 2, and the hero wraps after the age.

### Projection (UI-12)

- The AMT tile shows a status chip, not hero type.
- The toolbar Select is 32 px.
- **Play a story:**
  - The scrubber milestone labels follow the stagger rule.
  - After Play, the story list collapses to the selected card plus "Change story".

### Strategy Lab (UI-13)

- **In-page nav:** a sticky in-page nav: Your plan · Compare · Range · Make it safer · Past markets ·
  Assumptions.
- **Range of futures:** "Range of futures" is full width.
- **Make a copy to edit:** moves into the "Your plan today" row.
- **Toggles:** the three segmented controls get visible labels: Tool, Detail, Show amounts in.
- **Past-markets chart:** its domain comes from the 90th-percentile band edge.

### Goal (UI-14)

- **FI budget column:** "TWD" moves into the header "FI budget / year (TWD)". Numbers are
  right-aligned, and "Budget vs now" stays on one line.
- **Loan note:** moves to an info tooltip.
- **Goal history:** uses the app date format.

### Settings (UI-15)

- **Sub-nav:** a left sub-nav (sticky, 200 px), and a section picker on phones.
- **Sections:** General · Beginner / Pro · Assumptions · Taiwan rules · Categories · Backup · Reminder ·
  Danger zone.
- **Deep links:** each section has its own URL hash (`#/settings/backup`).
- **Language switch:** stays in the sidebar only.
- **Delete all data:** moves to Danger zone, with a typed confirmation.

### Time Machine (UI-16)

- **Results card:** full width below both columns, with the date or year on a second line, unwrapped.
- **Lead counter:** the amount on line one, "vs S&P 500" on line two.
- **Play button at the end:** reads "Replay" with a `RotateCcw` icon.
- **Phone order:** setup → stage → results. After the first run, setup collapses to a one-line
  summary.
- **Event bands:** `--series-8` at 10% opacity, with a 12 px label when a band is at least 24 px
  wide.

### Beginner mode (UI-23 to UI-25)

- **UI-23:** one 3-segment jar-split bar with two draggable, keyboard-operable handles.
- **UI-24:** "1 coin" uses the singular. The jar is "Savings" everywhere.
- **UI-25:** the Grown-ups corner shows the child's split with a "Use for new children too"
  checkbox.

## Responsive, edge cases, motion and accessibility

### Breakpoints

- **≥ 1280 px:** content max 1280 px; Lab and Settings sub-navs are sticky.
- **1024–1279 px:** the Settings sub-nav is 160 px.
- **768–1023 px:** two-column grids become one column.
- **< 768 px:**
  - controls are 44 px
  - KPI tiles are 2 × 2
  - tables scroll inside their card with a sticky first column
  - the Lab and Settings navs become a Select

### Edge cases

- Long zh-TW strings: segmented labels never wrap.
- KPI values up to NT$999.9M fit their tiles.
- The empty plan keeps the setup prompt.
- The page never scrolls sideways at 390 px.

### Motion

| Element                 | Motion                         |
| ----------------------- | ------------------------------ |
| Segmented selected pill | slides, 150 ms, ease-out       |
| Section nav click       | smooth scroll                  |
| Status popover          | fades with a 4 px rise, 120 ms |

All motion is off under `prefers-reduced-motion`.

### Accessibility

- **UI-1, text contrast:** at least 4.5:1, or 3:1 at 18 px and up.
- **UI-2, control boundaries:** at least 3:1.
- **UI-3, selected segments:** differ by more than colour.
- **UI-4, targets:** at least 24 × 24 on desktop and 44 × 44 on touch.
- **UI-5, disabled controls:** use `opacity-50` and `aria-disabled`, with a reason.
- **UI-6, focus:** one visible `--focus-ring` on every element.
- **Status and series:** status is never colour-only.
- **In-page navs:** use `<nav aria-label>` with `aria-current`.

### App-wide consistency (UI-17, UI-18)

- **UI-17:** card grids use `items-start`.
- **UI-18:** one formatter in `lib/format.ts`:
  - months: "Sep 2026" (zh-TW "2026年9月")
  - full dates: "30 Sep 2026" (zh-TW "2026/9/30")
  - ISO only in file names and exports

## Acceptance criteria

- axe-core finds no colour-contrast violations on any route, in light or dark theme.
- No element computes a font size below 12 px, except chart tick labels on phones under 400 px.
- No interactive element is under 24 × 24 at 1280×800, or under 44 × 44 at 390×844 inside `main`
  and the bottom nav.
- Every y-axis tick is a multiple of 1, 2, 2.5 or 5 × 10ⁿ.
- The Dashboard KPI row is fully visible at 1280×800.
- Settings sections are reachable by URL hash, and the Lab nav highlights the section in view.
- Time Machine result cells wrap to at most 2 lines at 1280 px, and setup comes before results on
  phones.
- No calculation, stored data or existing test result changes.
- Every new string goes through `t()` with a zh-TW entry.
