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
