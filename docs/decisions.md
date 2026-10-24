# Build decisions

Defaults chosen where the PRD and technical design left a question open. Each is easy to change.

| Question         | Default used                                                                         | Where to change it            |
| ---------------- | ------------------------------------------------------------------------------------ | ----------------------------- |
| Platform         | Web app (React + TypeScript, GitHub Pages), per the technical design                 | —                             |
| Repo / app name  | `FI_Tracker`; Vite `base` is `/FI_Tracker/`                                          | `vite.config.ts`, `VITE_BASE` |
| UI language      | English                                                                              | —                             |
| Default SWR      | 4% (demo data uses 3.5%)                                                             | Settings → General, Goal      |
| Snapshot cadence | Monthly                                                                              | Settings → General            |
| Cash flow        | Monthly totals per category; foreign-currency and lump-sum entries listed separately | —                             |
| Currencies       | Any 3-letter code; FX entered per snapshot date for each foreign currency in use     | Accounts                      |

## Modelling choices

- **Real terms.** Projections run in today's TWD. Nominal returns are converted with
  `(1 + n − fees − tax drag) / (1 + π) − 1`. Salary growth is nominal, so real pay rises by
  `(1 + g) / (1 + π)`.
- **Order of each projection year** (technical design): events → savings or withdrawals → returns
  net of fees and Taiwan frictions → FX → unlocks → FI check → record. Savings are added at the start
  of the year, so the closed-form check uses `s × (1 + r)`.
- **FI target** = (S − G) ÷ SWR + bridge fund. G counts guaranteed streams that run to the horizon;
  the bridge adds, for every year before a stream starts, the part of G not yet paid. Temporary income
  (e.g. part-time work after FI) lowers the bridge. Undiscounted, so slightly conservative.
- **Locked assets** (勞退 before 60) count toward FI only after they unlock (PRD: 勞退 counts only from
  its access age). They are shown separately as "locked".
- **Retirement.** The baseline stops working the year FI is reached. A scenario can set a fixed age
  instead ("Stop working at age").
- **Income streams** apply only after retiring; while working, income comes from cash flow.
- **勞保** insured years grow by one per year worked until retirement. Fewer than the minimum years
  gives no annuity (the lump-sum alternative is not modelled).
- **Taiwan frictions** apply to liquid assets each year: US withholding on dividends of non-TWD
  holdings; domestic dividend tax (combined, separate or the lower) plus NHI supplementary premium on
  TWD `tw_equity` dividends. Thresholds are nominal NT$ amounts compared against nominal dividends.
- **AMT** is a flag only, raised when overseas dividends exceed the threshold.
- **Liabilities** amortise with their payment and rate; payments are assumed to be part of spending.
- **Typical path.** The deterministic projection uses each asset class's median return,
  (1 + m) ÷ √(1 + σ² ÷ (1 + m)²) − 1, the median of the same lognormal Monte Carlo draws from. With
  the arithmetic mean it sat above almost every simulated future, so the Lab's two charts told
  opposite stories. On the demo plan the typical path ends between Monte Carlo's P40 and P60
  (tested). FI dates on every page move later as a result; locked plans keep their saved projection.
- **Monte Carlo** uses lognormal returns with the arithmetic mean and volatility from the assumption
  set, correlated by Cholesky. Inflation and FX are normal and independent of returns. Run _i_ always
  uses seed `(seed, i)`, so scenarios compared with one seed share their random numbers.
- **Plan of record** freezes the projection's investable path, savings and spending at the time it is
  locked; plan vs. actual interpolates the plan between yearly points.

## Phase 5 (P2) and design follow-ups

- **Schema v2.** Adds `CashFlow.date`, `Settings.cashFlowMode` and the `goalHistory` store. Dexie
  `version(2)` upgrades an existing database in place; backup files migrate from v1 to v2 on import.
  Both paths are tested against a real v1 file (`src/io/fixtures/backup-v1.json`).
- **Transaction-level cash flow (ENG-2).** A per-user switch on the Cash flow screen. In
  transaction mode the grid shows read-only sums and each month lists its dated entries. Monthly
  mode keeps the editable grid; dated entries appear below it.
- **CSV import (POS-8).** Column mapping instead of per-bank parsers, since every export differs.
  Detects ISO, 民國 (115/10/22), day-first and month-first dates; signed or debit/credit amounts;
  `(1,234)` and trailing-minus negatives. Transactions are de-duplicated on date + amount + kind +
  description, so re-importing an overlapping statement is safe. Balances match account
  nicknames. The mapping is remembered per header layout, in that browser only. Big5 files must be
  saved as UTF-8 first.
- **Reconciliation (ENG-6).** A period is flagged when the market return left after recorded
  savings and FX falls outside expected return ± 3 standard deviations for the assets held, with
  volatilities added as if fully correlated, plus a tolerance. The band is deliberately wide: it
  catches missing entries, unrecorded transfers and misplaced digits, not small typos. Periods with
  no cash-flow data are not checked.
- **Goal history (DST-7).** Recorded automatically, once an FI budget exists, whenever tier, FI
  spending, guaranteed income, SWR or target age changes. One record per day.
- **Historical backtest (LAB-7).** Robert Shiller's monthly data (S&P composite with dividends,
  CPI-U, 10-year Treasury yield), 1871–2022. It is built into annual January-to-January returns by
  `scripts/build-history.ts`, with bond returns from a 10-year par bond repriced a year later.
  Equities follow US stocks; bonds follow Treasuries; cash, property and other keep their assumed
  real return; FX follows the assumed drift. Uses only start years with a full window (93 for a
  60-year horizon) and wraps around when the horizon is longer than the data. US history is
  kinder than most forward-looking assumptions.
- **Buy vs. rent (LAB-8).** Monthly simulation: the renter invests the up-front cash and any
  monthly difference at the same return. Not modelled: mortgage interest deduction, 自住 tax rates,
  moving costs. "Create scenario" adds the down payment as a one-off event to a new scenario.
- **Auto-save to file (design P1).** File System Access API (Chrome and Edge on desktop). The file
  handle lives in a separate device-only IndexedDB, so it never enters a backup. After a browser
  restart, writing needs one click ("Resume auto-save"). An active auto-save counts as a backup
  for the reminder.
- **Encrypted export (design P2).** AES-GCM-256 with a PBKDF2-SHA-256 key (600,000 iterations,
  random salt and IV per file). Files end in `.encrypted.fi.json`, so `.gitignore` still blocks
  them. A lost passphrase cannot be recovered.
- **Installable / offline (design P2).** `vite-plugin-pwa` precaches the app. A new version waits
  for "Reload" instead of replacing the page mid-session.

## First-time setup

- A browser with no accounts shows a welcome screen instead of an empty Dashboard. It offers the
  setup wizard or the demo data, and comes back after "Delete all data", so it needs no stored flag.
- The wizard (`#/setup`) asks only for what the projection needs. Pay and spending are two monthly
  totals, recorded for the last complete month: pay under "Salary", spending under a new essential
  "Living costs" category that also holds the FI budget. The user splits it later.
- Nothing is written until **Finish**, then everything is saved in one transaction. The draft is
  kept in `sessionStorage` so a refresh does not lose it. The review step runs the real
  projection on the unsaved records.
- The target allocation becomes the user's current mix of usable investments (not 勞退, home,
  insurance or loans). New savings follow it, and the allocation-drift alert does not fire on day
  one against a default the user never chose.
- The one-off "works offline" note now hides itself after 5 seconds, because it covered the
  wizard's Next button.

## Taiwan figures check (2026-10-22)

Each default was checked against public sources (ministry pages and news reports of official
announcements). Re-check before relying on a number; the as-of date is on the Settings screen.

| Setting                        | Default                                                                                                 | Status                                                                                        |
| ------------------------------ | ------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------- |
| 勞退 employer contribution     | 6% of monthly contribution wage                                                                         | Confirmed                                                                                     |
| 勞退 voluntary contribution    | Up to 6%, deductible from taxable income                                                                | Confirmed                                                                                     |
| 勞退 wage cap                  | NT$150,000 / month (2026 table)                                                                         | Confirmed                                                                                     |
| 勞退 access                    | Age 60; 15+ years for a monthly pension, otherwise lump sum                                             | Confirmed                                                                                     |
| 勞保 insured salary cap        | NT$45,800 / month                                                                                       | Confirmed (unchanged for years; raising it is under discussion)                               |
| 勞保 annuity                   | max(salary × years × 0.775% + 3,000, salary × years × 1.55%); salary = average of the highest 60 months | Confirmed                                                                                     |
| 勞保 claim age                 | 65 (born 1962 or later); up to 5 years early at −4%/yr, up to 5 years late at +4%/yr                    | Confirmed                                                                                     |
| 勞保 minimum years for annuity | 15                                                                                                      | Confirmed                                                                                     |
| NHI supplementary premium      | 2.11% on single dividend / interest payments ≥ NT$20,000                                                | Confirmed; a reform to yearly totals is proposed but on hold                                  |
| NHI self-paid (category 6)     | NT$826 / month                                                                                          | Confirmed for 2026; now the default post-employment NHI cost                                  |
| Domestic dividends             | 8.5% credit capped at NT$80,000 per household, or 28% separate taxation                                 | Confirmed                                                                                     |
| US dividend withholding        | 30%                                                                                                     | Confirmed: no US–Taiwan tax treaty; relief bill (15%) passed the House, pending in the Senate |
| Overseas income (AMT)          | Counts in basic income once household overseas income reaches NT$1,000,000                              | Corrected: the flag now starts at the threshold (was "above")                                 |

Not modelled: the NT$7.5M basic exemption and 20% basic tax (the app only flags years when overseas
income must be reported), and ETF distributions paid out of capital gains, which are exempt from
income tax and the supplementary premium.

## Strategy Lab: clarity and trust redesign

From the PRD "Strategy Lab — Clarity & Trust Redesign" (R1–R15, all three phases).

- **Your plan today** is a built-in row that always mirrors live data and can't be edited; "Make a
  copy" creates a stored scenario. Every scenario is compared with it ("vs your plan").
- **Simple view** (default) uses the plain glossary labels (`lib/glossary.ts`) with tooltips;
  **Advanced** adds runs, seed, timing, P10–P90, the withdrawal rule, assumption set and Taiwan
  levers. A browser test checks the Simple view contains none of P10, P90, seed, det., SWR or Monte
  Carlo.
- **Verdict**: simulated futures (Monte Carlo) lead; past markets sit beside them. Tiers: On track
  85%+, Borderline 70–84%, At risk under 70%. Failed runs report their median run-out age.
- **Simulations run automatically** (1,000 runs, seed 42) whenever a visible plan changes.
- **"Why these differ"** appears when the two lenses differ by more than 10 points. It compares the
  mix's typical real return under the assumptions with its real return over 1871–2022.
- **Cause lines** appear for chance differences of 5 points or more, naming the first change that
  points the same way: working years, FI spending, a crash, part-time income, one-off events,
  savings, draw rate, return shift, withdrawal rule, mix.
- **Name check** warns when a savings-rate override is below today's rate, or a name says more /
  earlier while the effect is the opposite.
- **Safer variants and solving for a target** keep a "stop as soon as I reach my target" plan on that
  rule. Fixing its stop age instead removed the built-in safety valve: bad futures that stop later
  were forced to stop on time, so "work 1 more year" scored lower than the plan. New levers make
  this possible: `workExtraYears` (keep working N years after reaching the target),
  `targetSpendingMinor` (size the target on other spending, so a spending cut doesn't bring the
  stop date forward) and `baristaIncome.inTarget` (part-time income not counted towards the target).
- **Crash lever**: equities fall by `drop` in total over the first `years` years after stopping,
  in every lens.
- **Reference checks**: zero-volatility Monte Carlo equals the typical path; the classic 4% / 60/40
  / 30-year case over 1871–2022 succeeds in 96% of start years (published: about 95%; the check
  passes from 90% to 99%).

## Product review, "Now" phase: one answer and data safety

From "FI Tracker — Product Review & Roadmap" (24 Oct 2026).

- **One status everywhere.** `PlanHealthProvider` runs the simulated futures for "your plan today"
  once (1,000 runs, seed 42, the Lab's defaults). Dashboard, Projection and Goal show its status
  (On track 85%+, Watch 70–84%, At risk under 70%) and the typical-path stop age; the Lab's "Your
  plan today" row uses the same inputs, runs and seed, so all four agree (browser test).
- **Shared rounding** (`domain/planStatus.ts`): 95% or more is "Nearly all" and ten dots, 5% or
  less is "Almost none"; otherwise the nearest of ten.
- **Past markets are a second opinion**: shown smaller under the simulated futures, with the reason
  they differ; their typical stop-work age names why it differs from the plan's.
- **Guaranteed income is valued at the plan's stop age** (it was valued at today's age, which left
  勞保 at zero for anyone short of 15 insured years today). The FI number and goal history now
  count it.
- **Quick estimates retired**: their closed-form "years to FI" disagreed with the projection. The
  Goal page compares the target age with the projection instead.
- **Investment mix is a choice in setup**, offered as the current mix or three presets, with a
  warning above 30% cash.
- **Backups**: the permanent banner is gone. A prompt appears after setup, after each review and
  when the last backup (or, without one, the first data) is over 30 days old; "Later" hides it
  for 7 days. Auto-save is offered first where the browser supports it. Persistent storage is
  requested when setup finishes (and from Settings), not silently on every start.
- **Phone navigation**: Dashboard, Snapshots, Cash flow and Strategy Lab, plus More for the rest.
- Unknown links show "Page not found"; Accounts lists the latest balance.

## Product review, "Next" phase: the monthly habit

- **FI date as a range**: the plan-health card adds "Likely between age A and B (8 in 10 futures)"
  from the simulated FI ages (P10–P90), shown when at least 9 in 10 futures reach FI and the plan
  stops at FI rather than a set age.
- **Why did my FI date move?** (`domain/fiDateMove.ts`): between the last two snapshots, inputs
  are swapped one group at a time from the earlier state to the latest: a month passing, saving,
  markets, exchange rates (balances move along the Snapshots page's split of the net-worth
  change), pay and spending, then the FI goal (from goal history). The parts add up exactly. Both
  dates use today's assumptions, since assumption changes are not stored over time.
- **Monthly update** (`#/update`, a phone tab): one card per account pre-filled with the previous
  balance, "Same as last month" or swipe right, accounts unchanged for three snapshots grouped on
  one card, then each foreign currency's rate. Saved in one transaction; the time taken is kept
  on the device (last 12) for the under-3-minutes goal.
- **No FX fetch**: the app stays fully offline (decided with the owner).
- **Monthly reminder**: an .ics file with a monthly repeat and a link to `#/update`, made on the
  device (Settings, and the end of the update).
- **Inline glossary**: terms can be tapped anywhere; added Coast FI and bridge fund, and used on
  the Dashboard, Projection and Goal pages (Coast FI is back on the Goal page, explained).

## Projection playback and scenario events

From "PRD: Projection Playback & Scenario Events" (24 Oct 2026), all three release phases.

- **Flows land mid-year in the yearly engine.** Savings, withdrawals and 勞退 contributions now
  earn half a year's return (they used to land on 1 January). This is what spreading them over
  twelve months gives, so the new monthly engine matches the yearly projection: on the demo data
  the worst year-end gap is 0.15% (limit 0.5%) and the FI date is the same month (tested). FI dates
  move slightly later everywhere.
- **Monthly engine** (`domain/playback/engine.ts`): account by account, mirroring the yearly rules
  (decisions at each model year's start, unlocks, rebalancing and the FI check at its end, Taiwan
  frictions as yearly rates). Event shocks move twelve market factors (shares by region, bonds,
  property by location, USD and JPY); each account follows its exposures. The state of every
  month is kept, so a live event recomputes only from its month and played months never change.
- **Library** (`domain/playback/library.ts`): the PRD's 29 scenarios with its indicative depths
  and shapes, labelled everywhere as hypothetical stress stories. "Global equity" in the PRD hits
  all share markets; region-specific shocks reach global funds through their region split.
- **Open questions, decided**: geopolitical events default to the PRD's fixed years (movable to
  "just after you stop work"); plain descriptive names; home equity counts in total net worth but
  not in investments; 勞退 follows 30% TW shares, 30% global shares, 40% bonds with its guaranteed
  minimum (1.7% a year, editable) applied when it unlocks; the end card ranks every story against
  the Strategy Lab's simulations for the same plan, whatever the backdrop; firing an event keeps
  playing by default (setting).
- **Data model** (optional fields, no schema version change): account region, a global fund's
  region split (default US 62, EU 15, JP 6, EM 11, other 6) and property location; floating-rate
  loans and the property they are secured on; JPY works like USD with its own FX rate.
- **Strategy Lab** scenarios can include the same events ("World events"); each simulated year's
  draw is bent by the change in the event's shape over that year.
- **Behaviour options**: "pause new investing" sends savings to cash while an event runs; "sell
  after a fall" sells all shares when prices fall that far below the pre-event level and buys back
  when they recover or the events end. The end card compares them, including any change in the
  stop-work age.
- **Saved stories** and **custom events** live in Settings, so backups carry them; a shared story
  file holds events and timing only, never balances.
