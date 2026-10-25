# PRD: Playback UX Redesign & Investment Time Machine

Oct 25, 2026. Saved from the PDF so Claude Code can read it; decisions taken during the build are
in [decisions.md](decisions.md).

## Overview

This PRD covers two independent changes to the FI Tracker (repo `derderhaohao/FI_Tracker`, live at
derderhaohao.github.io/FI_Tracker). Part A redesigns the Projection page's Play mode so a first-time
user can set up a story, press Play and understand what happened without reading every control.
Part B adds a standalone Investment Time Machine: put a sum into one or more US stocks at a past
month and watch it grow month by month against a benchmark such as the S&P 500 or a property.

|                 | Part A: Play mode redesign           | Part B: Investment Time Machine   |
| --------------- | ------------------------------------ | --------------------------------- |
| Where           | `#/projection` → Play                | New route `#/tools/time-machine`  |
| Touches FI data | Yes, reads the plan as today         | No: never reads or writes FI data |
| Engine changes  | None; UI and layout only             | New, self-contained module        |
| New data        | None                                 | Bundled monthly US price history  |
| Main files      | `src/features/trajectory/playback/*` | New `src/tools/time-machine/*`    |

Requirement IDs (`PX-n`, `TM-n`) are meant to be quoted in commits and tests. Both parts keep the
existing conventions: React 19 + TypeScript, Tailwind tokens, `t()` for every string with a zh-TW
entry, Vitest unit tests and a Playwright e2e spec, and the offline-only policy in
`docs/decisions.md`.

## Part A — Projection Play mode redesign

Keep every capability of Play mode and the playback engine; change the order and weight of what
the user sees. Put the chart first, turn setup into three plain steps, and move expert settings out
of the way.

### What the review found

| #   | Finding                                                                                        | Effect on the user                                           |
| --- | ---------------------------------------------------------------------------------------------- | ------------------------------------------------------------ |
| F1  | The chart starts below the fold: plan-health card, a notice and the full Story card come first | Pressing Play means scrolling away from the setup to watch   |
| F2  | Two ways to add an event: a form (max 3 "scheduled") and a 29-tile palette ("live")            | The user must learn scheduled vs live before playing         |
| F3  | The palette is a wall of 29 tiles with dense impact text, about 3× taller than the chart card  | Hard to scan; the search box scrolls away                    |
| F4  | Severity is reachable only by right-click or long-press on a tile                              | Most users never find it                                     |
| F5  | A scheduled event's start is edited as a raw "months from now" number                          | People think in ages and years, not month offsets            |
| F6  | The transport bar has 11 controls of equal weight; speed options read "Smart", "6 months/s"    | Play does not stand out; speed labels are jargon             |
| F7  | Rare settings sit at the top: market noise with a story ID, behaviour during events            | First-time users face expert choices before the basics       |
| F8  | The result appears only in the end card, after reaching the horizon                            | No running answer while the story plays                      |
| F9  | Event banners render inside the chart card above the chart                                     | The chart jumps down while playing (layout shift)            |
| F10 | Chart height is 230 px (phone) / 320 px (desktop); event band labels are 10 px                 | The main visual is small for an animation                    |
| F11 | Milestones, fired events and the event log are three separate lists below the chart            | The same events appear in three places, none on one timeline |

### Goals

1. A new user presses Play within 10 seconds of opening Play mode, with no setup.
2. Adding an event works the same way before and during playback.
3. "Does my plan still work, and what changed?" is visible at every moment, not only at the end.
4. The chart is the largest element and stays in view while playing, on desktop and phone.

Non-goals: no change to the playback engine, event library, numbers or the Strategy Lab; no new
events.

### Proposed experience

The page becomes a stage (chart + player) with a setup rail beside it on desktop and a step bar on
phones.

1. **Pick a story.** Story cards replace the backdrop dropdown and the one-tap story buttons:
   Normal markets, Lucky decade, Unlucky decade, Lost decades, Perfect storm, Taiwan double hit,
   Lucky streak, then saved stories and "Build your own". Each card shows a name, one plain
   sentence and a tiny shape of the path. Normal is pre-selected, so Play works immediately.
2. **Add events (optional).** One event timeline track sits under the chart on the same age axis.
   Scheduled events show as chips at their start age; dragging a chip moves it (snaps to months,
   shows age and year while dragging). "+ Add event" opens the event picker, the only place to
   choose an event, before or during play.
3. **Play.** One large Play button. While playing, the picker's action reads "Fire now at age 47"
   instead of "Add at age…", so live firing is the same gesture.

**Event picker** (drawer on desktop, bottom sheet on phone): search, category tabs (All, Bad
markets, Good markets, Personal, Taiwan & region, My events, Favourites), and compact cards: icon,
name, one plain line. Tapping a card expands it in place: the full impact text, severity as a
visible 3-way control (Mild / Typical / Severe), timing (age slider plus presets: next year, a year
before I stop work, just after I stop work, at 60), and the Add or Fire button. The 3-event cap on
scheduled events stays and is shown as "2 of 3 scheduled".

**Result strip** (top of the stage, always visible): date and age · investments now · stop-work
age: 49 → 52 (+3 years vs normal) · money lasts: to 95 ✓ or "runs out at 83". The detailed
counters move to the chart tooltip and the "At this moment" panel.

**Stage:** chart at least 420 px on desktop and 300 px on phones; event bands labelled at 12 px
with their icon. Event and recovery messages appear as a toast overlaid on the chart, never
pushing content down.

**Player bar:** Restart, Play/Pause (primary), the scrubber with ticks at each event, milestone
and stop-work point, and speed as Slow / Normal / Fast (Normal = today's "Smart" pacing). Step
back/forward, Skip to end, Undo and Clear live events move into a "⋯" menu and stay on the keyboard
shortcuts.

**Below the stage:** "At this moment" (collapsed by default on phones) and the end card. The event
log becomes the timeline track: tapping a chip shows its impact, Remove and Go there. Milestone
chips are replaced by scrubber ticks plus labels on the track.

**Advanced** (one collapsed section): behaviour during events, market noise and story ID, playback
settings, save, share and import stories, and the custom event builder.

**Phone layout:** the result strip and chart stick to the top; the step bar (Story · Events · Play)
sits below the chart; the player bar is fixed above the bottom navigation; the picker is a bottom
sheet.

### Requirements

| ID    | Requirement                                                                                                                            | Priority |
| ----- | -------------------------------------------------------------------------------------------------------------------------------------- | -------- |
| PX-1  | Play mode opens with the Normal story selected and the stage (result strip, chart, player bar) above the fold at 1280×800 and 390×844  | P0       |
| PX-2  | Story cards replace the backdrop dropdown and one-tap story buttons; saved stories appear as cards                                     | P0       |
| PX-3  | One event picker serves both scheduling (before play, or while paused) and firing (while playing); scheduled/live is only a chip label | P0       |
| PX-4  | Picker: search, category tabs, compact cards with a plain one-liner, expand-in-place detail with visible severity and timing           | P0       |
| PX-5  | Event timeline track on the chart's age axis; draggable chips; keyboard alternative (arrows move a month, Shift+arrow a year)          | P0       |
| PX-6  | Result strip with live stop-work age and money-lasts age, each compared with the normal story                                          | P0       |
| PX-7  | Event, recovery and milestone messages as an overlay toast inside the chart area; no layout shift                                      | P0       |
| PX-8  | Player bar: Restart, Play/Pause primary, scrubber with ticks, Slow / Normal / Fast; other actions in "⋯"; shortcuts unchanged          | P0       |
| PX-9  | Chart at least 420 px tall on desktop, 300 px on phones; event labels at least 12 px with icons                                        | P1       |
| PX-10 | Advanced section collapsed by default: behaviour, noise, playback settings, story files, custom event builder                          | P1       |
| PX-11 | Event log, fired-event chips and milestone chips merged into the timeline track and scrubber ticks                                     | P1       |
| PX-12 | Phone: sticky result strip and chart, fixed player bar, step bar, picker as a bottom sheet                                             | P1       |
| PX-13 | Plain-language one-liners for all library events and backdrops, in English and zh-TW, beside the impact text                           | P1       |
| PX-14 | First-visit hints: three dismissible pointers (pick a story, add an event, press Play), once per device                                | P2       |
| PX-15 | Rename the toggle "Year by year / Play" to "Summary / Play a story" with a one-line description                                        | P2       |

### Acceptance criteria

- On a fresh demo load, Play mode → Play needs one click and no scrolling at 1280×800.
- Adding a Global financial crisis at age 50, Severe, takes at most 4 interactions in the picker.
- Firing an event while playing uses the same picker and lands at the playhead month.
- The chart's top edge does not move during a full playback with 3 scheduled and 2 live events.
- Stop-work and money-lasts values in the result strip equal the end card's at the last month.
- All numbers match the current build (engine untouched): `src/domain/playback/playback.test.ts`
  passes unchanged.
- `tests/e2e/playback.spec.ts` is updated and keeps the remaining `counter-*` test ids; a new e2e
  covers picker add, drag to move, fire live, undo.
- Every new string goes through `t()` with a zh-TW entry; reduced-motion users can still step and
  scrub.
- Picker cards, chips and the scrubber are keyboard reachable with visible focus.

## Part B — Investment Time Machine

A standalone "what if I had invested?" tool: enter an amount, pick a start month (Jan 2000 or
later), build a portfolio of up to 10 US stocks or ETFs, pick up to 3 benchmarks (S&P 500, a
property with user-entered returns, cash or a fixed rate), and watch every line grow month by month
as an animated playback. It shares the app shell and design system but no data or logic with the
FI Tracker.

### Separation from the FI Tracker

- **Route and navigation:** `#/tools/time-machine`, in a separate "Standalone tools" sidebar group
  below a divider, after Settings, with an hourglass icon and a "Sandbox" badge. On phones it
  appears under More, in its own group.
- **Look:** a distinct `--tool-accent` token (for example indigo, light and dark values) on its
  header band, primary buttons and portfolio line. The band reads "Standalone tool · Uses market
  history only. It does not read or change your FI Tracker data."
- **Hidden app chrome:** no plan-health card, assumption badge, value-mode toggle or backup banner.
- **Code:** everything in `src/tools/time-machine/`. An ESLint `no-restricted-imports` override
  blocks `@/app/*`, `@/db/*`, `@/domain/*`, `@/state/*` and `@/io/*`; allowed shared imports are
  `@/components/ui/*`, `@/components/charts/theme`, `@/lib/cn`, `@/lib/download` and `@/i18n`.
  The route is lazy-loaded.
- **State:** the scenario lives in the URL hash query and the last scenario in localStorage under
  `fi-tracker-tm-last`. Nothing is written to IndexedDB or appears in backups or CSV exports.
- **No setup gate:** the tool works on a fresh browser with no FI data.

### Market data

Prices are never fetched from a market API at runtime (CSP `connect-src 'self'`); they are
generated at build time and served as static files from the site.

| Item          | Decision                                                                                              |
| ------------- | ----------------------------------------------------------------------------------------------------- |
| Granularity   | Monthly, month-end                                                                                    |
| Series        | Total-return index (split- and dividend-adjusted close) and plain close for price-only mode           |
| History       | Jan 2000 (or listing month) to the last complete month at build time                                  |
| Universe (v1) | S&P 500 and Nasdaq-100 members plus ~30 popular ETFs and major ADRs such as TSM                       |
| Files         | `public/data/prices/index.json` and one `public/data/prices/<TICKER>.json` per ticker (~5 KB)         |
| Loading       | Same-origin fetch; Workbox runtime cache (cache-first) so used tickers work offline                   |
| Generator     | `scripts/build-prices.ts`; validates gaps, splits and outliers (a monthly move above ±60% is flagged) |
| Refresh       | Scheduled GitHub Action on the 2nd of each month; commits changed files, which deploys Pages          |
| USD/TWD       | Monthly rate from a public series (for example FRED), used only for the TWD view (TM-15)              |
| Market events | About 10 hand-written dated periods (dot-com bust, financial crisis, COVID crash, 2022 rates…)        |

The page shows the source and "data to <month>" in its footer, and a survivorship-bias note.

### How it works for the user

1. **Amount and dates.** Presets $1k, $10k, $100k, $1M (default $10,000), USD. Start month with
   chips (2000, 2010, 2015, 2020, 5 years ago, 1 year ago); end defaults to the latest month.
2. **Portfolio.** Search by ticker or name; up to 10 holdings; weights with "Equal weights" and a
   total that must reach 100%. Each holding shows its first month. A late listing offers: hold its
   share in cash until it lists, or move the start to the latest listing month.
3. **Options** (collapsed): rebalancing (none, yearly, quarterly); a monthly top-up split by target
   weights; dividends reinvested (default) or price only.
4. **Benchmarks.** Up to 3: S&P 500 (default, SPY), Nasdaq-100 (QQQ), total US market (VTI), cash
   at a fixed rate (default 2%), a fixed annual return, and Property.
5. **Property.** Name, then one average yearly change or a year-by-year table; optional net rental
   yield; optional buying and selling costs. Same starting amount and currency as the portfolio.
6. **Play.** The chart animates month by month; value or growth (all lines start at 100).
7. **Results.** A summary at the end, also as a tab; a share link copies the URL with the scenario.

During playback: live counters (date, value, gain, yearly return so far, fall from the peak, lead
or lag against each benchmark), a holdings race, market-event bands with toasts, and controls
(Play/Pause, scrubber, Slow / Normal / Fast with Normal = 1 year per second, jump to start or end,
Space and arrows).

Results, one row per line: final value, total gain, CAGR, worst fall with dates, months to recover,
best and worst calendar year, volatility; a calendar-year grid and CSV export. Footer: "Past
results, not a forecast or advice."

### Calculations

All lines are computed monthly in `src/tools/time-machine/engine.ts` as pure functions:
`r(i,t) = TR(i,t) / TR(i,t−1) − 1`, `V(i,t) = V(i,t−1) × (1 + r(i,t)) + w(i) × C(t)`.

- Holdings start at weight × amount; top-ups are split by target weight; rebalancing resets to
  target weights at the end of December (yearly) or of each quarter.
- Benchmarks receive the same amount and top-ups at the same months.
- Cash and fixed return: monthly rate (1 + yearly rate)^(1/12) − 1.
- Property: (1 + g)^(1/12) − 1, or geometric interpolation between yearly points; rent = yield ÷ 12
  of the current value; buying cost deducted at the start, selling cost shown as "after selling".
- Yearly return: (end ÷ start)^(12 ÷ months) − 1 for a lump sum; with top-ups, a monthly IRR.
  Worst fall, recovery and volatility use a time-weighted index.
- Currency: USD; the TWD view converts each month at that month's rate.

### Requirements

| ID    | Requirement                                                                                    | Priority |
| ----- | ---------------------------------------------------------------------------------------------- | -------- |
| TM-1  | Route `#/tools/time-machine`, lazy-loaded, "Standalone tools" nav group with a Sandbox badge   | P0       |
| TM-2  | Distinct tool accent and header band; app plan widgets hidden on this page                     | P0       |
| TM-3  | Import boundary enforced by ESLint; no IndexedDB writes; state in URL and one localStorage key | P0       |
| TM-4  | Build-time price generator, static per-ticker files, index file, runtime cache                 | P0       |
| TM-5  | Amount with presets, start and end month pickers with quick chips, bounded by available data   | P0       |
| TM-6  | Portfolio of 1–10 tickers with search, weights, Equal weights, total-must-be-100% validation   | P0       |
| TM-7  | Late-listing handling: cash until listing, or move the start month                             | P0       |
| TM-8  | Benchmarks: S&P 500 (default), Nasdaq-100, total US market, cash at a rate, fixed return; ≤ 3  | P0       |
| TM-9  | Property benchmark with yearly % or year-by-year table, rental yield and buy/sell costs        | P0       |
| TM-10 | Animated monthly playback, scrubber, 3 speeds, keyboard shortcuts, reduced motion              | P0       |
| TM-11 | Live counters and lead/lag versus each benchmark                                               | P0       |
| TM-12 | Results table: final value, gain, CAGR, worst fall, recovery, best/worst year, volatility      | P0       |
| TM-13 | Share link (URL state) and restore of the last scenario                                        | P0       |
| TM-14 | Value / growth (rebased to 100) chart toggle                                                   | P1       |
| TM-15 | TWD view using monthly USD/TWD history                                                         | P1       |
| TM-16 | Rebalancing (none, yearly, quarterly) and monthly top-ups with money-weighted return           | P1       |
| TM-17 | Holdings race bars during playback                                                             | P1       |
| TM-18 | Market-event bands and toasts                                                                  | P1       |
| TM-19 | Calendar-year returns grid and CSV export                                                      | P1       |
| TM-20 | Scheduled monthly data refresh workflow                                                        | P1       |
| TM-21 | Price-only (dividends not reinvested) mode                                                     | P2       |
| TM-22 | Property with a mortgage (down payment, rate, term)                                            | P2       |
| TM-23 | Save named scenarios on the device and compare two side by side                                | P2       |

### Acceptance criteria

- $10,000 in SPY from Jan 2010 to the latest month matches SPY's total return from the data files
  within 0.1%.
- A 50/50 AAPL + MSFT portfolio with yearly rebalancing matches a hand check for 2015–2020 within
  0.1%.
- A property at 3%/year with no rent or costs grows $10,000 to 10,000 × 1.03^n after n years,
  exactly.
- A ticker that lists after the start month shows both options, each tested.
- Offline after one visit, the page opens and replays any ticker used before.
- A shared link in a fresh browser reproduces the same scenario and final values.
- ESLint fails if a file in `src/tools/time-machine/` imports from `@/db` or `@/app`; IndexedDB is
  unchanged after using the tool (e2e).
- The main bundle grows by less than 10 KB gzipped.
- Every string uses `t()` with a zh-TW entry; numbers use the existing money formatting.

### Non-functional requirements

| Area                | Requirement                                                                   |
| ------------------- | ----------------------------------------------------------------------------- |
| Performance         | 60 fps playback; React state updates at most ~15 times a second               |
| Offline and privacy | No new runtime network origins; CSP unchanged; data served from the site only |
| Accessibility       | Keyboard reachable, visible focus, aria-live announcements, reduced motion    |
| Languages           | English and zh-TW for every new string                                        |
| Quality gates       | typecheck, lint, test, e2e and build pass in CI before merge                  |
| Size                | Each price file ≤ 8 KB; the full price folder ≤ 5 MB                          |

### Release plan

1. Release 1 — Play mode redesign (PX).
2. Release 2 — Time Machine core (TM P0).
3. Release 3 — Time Machine depth (TM P1).
4. Later (P2): hints, toggle rename, price-only, mortgage, saved scenarios.

### Open questions

Price data source, universe size, default amount, TWD input, tool accent colour, and which story
cards to keep. The answers are recorded in [decisions.md](decisions.md).
