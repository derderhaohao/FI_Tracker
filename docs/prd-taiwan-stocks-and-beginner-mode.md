# PRD: Taiwan Stocks in Time Machine & Beginner (Kids) Mode

Oct 25, 2026. Saved from the PDF so Claude Code can read it; decisions taken during the build are
in [decisions.md](decisions.md).

## Overview

This PRD adds two things to the live FI Tracker. Part C extends the Investment Time Machine to
Taiwan Stock Exchange (TWSE) stocks and ETFs, so a portfolio can mix US and Taiwan holdings. Part D
adds a **Beginner mode** for elementary school children (about ages 7–12) beside today's app, which
becomes **Pro mode**: a simpler, picture-led space that teaches what financial independence means
through jars, goals and a money tree.

|                             | Part C: Taiwan stocks                                                               | Part D: Beginner mode                        |
| --------------------------- | ----------------------------------------------------------------------------------- | -------------------------------------------- |
| Where                       | `#/tools/time-machine`                                                              | New `#/kids/*` routes with own layout        |
| Touches FI plan data        | No                                                                                  | No: its own local database                   |
| Main code                   | `scripts/prices-universe.ts`, `scripts/build-prices.ts`, `src/tools/time-machine/*` | New `src/kids/*`, mode switch in `src/app/*` |
| Changes an earlier decision | Yes: amounts can now be entered in TWD, not only shown in TWD                       | No                                           |
| Size                        | Small                                                                               | Large                                        |

**Naming:** the Strategy Lab's "Simple / Advanced" toggle stays inside Pro mode. The new top-level
choice is always called **Beginner / Pro**.

Treat Part C and Part D as separate branches and PRs, Part C first. Requirement IDs are `TW-n` and
`KD-n`. Keep the conventions: `t()` with zh-TW for every string, Vitest and Playwright tests, the
offline-only CSP, and decisions logged in `docs/decisions.md`.

## Part C — Taiwan stocks in the Time Machine

Add about 100 TWSE-listed stocks and ETFs, priced in TWD, next to the existing ~150 US tickers. A
portfolio can hold both; every line is valued in one **scenario currency** (USD or TWD) chosen next
to the amount, with each foreign holding converted at that month's exchange rate.

### Universe

| Group            | Contents                                                                                      | About |
| ---------------- | --------------------------------------------------------------------------------------------- | ----- |
| Taiwan 50        | Current FTSE TWSE Taiwan 50 members (2330 TSMC, 2317 Hon Hai, 2454 MediaTek, 2308 Delta…)     | 50    |
| Popular mid caps | Well-known names outside the Taiwan 50 (2912 President Chain Store, 9921 Giant, 2207 Hotai…)  | 30    |
| ETFs             | 0050, 006208, 0056, 00878, 00919, 00929, 00713, 00692, 00881, 00850, bond ETFs 00679B, 00687B | 15–20 |
| Benchmarks       | TAIEX total return index, TAIEX price index                                                   | 2     |

- Kept in `scripts/prices-universe.ts` with a new market field; Yahoo symbols use `.TW` (`2330.TW`).
- Each entry has a code, an English and a Chinese name (`2330`, "TSMC", "台積電").
- Out of scope: TPEx (`.TWO`), emerging board, leveraged and inverse ETFs.
- Survivorship bias: today's members only.

### Currency model

- **Per-ticker currency:** index entries and price files gain `c: 'USD' | 'TWD'` (missing = USD)
  and `m: 'US' | 'TW'`.
- **Scenario currency:** a USD / TWD selector on the amount. Default TWD when the UI is zh-TW or
  the first holding added is Taiwanese, otherwise USD.
- **Conversion:** `1 + r_base = (1 + r_local) × FX_t / FX_{t−1}`, FX being TWD per USD for a US
  holding in TWD and its inverse for a Taiwan holding in USD; 1 when currencies match. Top-ups and
  rebalancing happen in the scenario currency.
- **Month-end rates:** Yahoo `TWD=X` month-end is primary, FRED's daily `DEXTAUS` (last value of
  the month) the fallback, replacing the monthly average `EXTAUS`.
- **Benchmarks** convert the same way; cash, fixed-return and property lines grow in the scenario
  currency.
- **Currency effect:** the results table adds a "from exchange rates" column: gain in the
  scenario currency minus gain in local currency.

### Search and display

- Search matches code, Chinese and English name, with an All / US / Taiwan filter.
- Each holding shows a market badge and its local currency; names follow the UI language.
- New benchmarks: TAIEX total return and Taiwan 50 (0050); the TAIEX price index only with the
  label "price only, dividends not included".

### Data

- The generator fetches `.TW` symbols like US tickers and writes `2330.TW.json` style files.
- TAIEX total return: prefer TWSE's return index (from 2003); otherwise fall back to 0050's total
  return from its June 2003 listing.
- Taiwan validation: check 2330, 2317, 0050, 0056 against published total returns (within 1 point a
  year) and keep the ±60% monthly-move flag.
- About 0.5 MB more; the refresh workflow needs no change beyond the larger list.

### Requirements

| ID    | Requirement                                                                              | Priority |
| ----- | ---------------------------------------------------------------------------------------- | -------- |
| TW-1  | ~100 TWSE stocks and ETFs with code, English and Chinese names, market and currency      | P0       |
| TW-2  | Price files and index carry currency and market; files without them are read as US / USD | P0       |
| TW-3  | Scenario currency selector (USD / TWD) on the amount, with defaults; stored in the URL   | P0       |
| TW-4  | Engine converts each holding and ticker benchmark monthly with month-end rates           | P0       |
| TW-5  | Month-end USD/TWD (Yahoo TWD=X, FRED DEXTAUS fallback) replacing the monthly average     | P0       |
| TW-6  | Search by code, Chinese or English name; market filter; market badges                    | P0       |
| TW-7  | Benchmarks: TAIEX total return, Taiwan 50 (0050), TAIEX price index (labelled)           | P0       |
| TW-8  | Generator validation for Taiwan dividends, stock dividends and capital reductions        | P0       |
| TW-9  | "From exchange rates" column in the results table                                        | P1       |
| TW-10 | Old share links (no currency field) open unchanged: USD, US tickers                      | P1       |
| TW-11 | TPEx (上櫃) stocks                                                                       | P2       |
| TW-12 | Optional 30% dividend withholding on US dividends for a Taiwan resident                  | P2       |

### Acceptance criteria

- NT$100,000 in 0050 from Jan 2010 matches its total return from the data file within 0.1%.
- $10,000 in SPY with the scenario in TWD equals the USD result × FX_end / FX_start within 0.1%.
- A 50/50 SPY + 0050 portfolio in TWD with yearly rebalancing matches a hand check for 2015–2020.
- Searching "台積", "2330" or "tsmc" finds 2330 in both languages.
- A share link created before this change reproduces the same final values.
- The FI plan stays untouched: the boundary test and IndexedDB e2e check still pass.

## Part D — Beginner (Kids) mode

Beginner mode teaches one idea: **when the money your savings earn each year can pay for your
life, you are free to choose whether to work.** A child gets there in small steps (money in, three
jars, goals, a growing money tree, a "freedom number"), using pretend or real pocket money, with
round numbers and pictures. It never shows or uses the adult's real plan.

### Who it is for

- Primary: a child aged 7–12, often with a parent; reading level grade 2–3, one idea per screen.
- Secondary: the parent, who sets it up, chooses allowance and growth rate, and switches back.
- Success: after 3 sessions a 9-year-old can explain the freedom number and why money planted early
  grows more (3-question quiz at the end of the Freedom lesson).

### Mode switch and separation

- First visit asks "Who is using this today?": "A grown-up planning money (Pro)" or "A kid
  learning about money (Beginner)". Switchable from the sidebar footer, Settings or the parent
  corner; stored per device in localStorage (`fi-tracker-mode`).
- Optional 4-digit parent PIN for leaving Beginner mode, stored as a salted hash, labelled "a child
  lock, not a security feature".
- Own IndexedDB database `fi-tracker-kids`; up to 4 child profiles with nickname, avatar and age.
- The main backup gains an optional `kids` section; a child's progress can be saved and loaded
  from the parent corner.
- Code in `src/kids/` with `KidsLayout`, routes under `#/kids/*`, the same ESLint boundary as
  `src/tools/`, lazy loaded.
- Pro unchanged except the mode switch; the Time Machine is not shown in Beginner mode.

### Screens

1. **My Garden (home):** avatar, three jars with coins, a tree sized by the Grow jar, top goal
   progress, badges, and "I got money" / "I spent money".
2. **Jars and Goals:** money in by source card (Allowance 零用錢, Chores, Red envelope 紅包, Gift,
   Other) and coin keypad, split Spend / Save / Grow (default 50 / 30 / 20, 10% steps); spending by
   category card with a Need / Want tag, from Spend (asks before using Save); up to 3 goals with
   pictures, "About 6 more weeks" and a celebration.
3. **Money Tree:** coins planted each week, where they go (piggy bank / bank / money tree) and how
   many years (to age 18, 30 or 60); Grow plays year by year with put-in vs grew bars and a
   piggy-vs-tree race; a "Weather" switch adds bumpy years.
4. **Freedom Quest:** picture cards for a grown-up's yearly cost; freedom number = yearly cost × 25
   ("4 coins of fruit for every 100 each year"); "You could be free at 48".
5. **Learn:** 10 short lessons with a quiz and a badge each.
6. **Parent corner** (PIN if set): profiles, allowance and split, growth rates, cost presets,
   reset, save or load progress, switch to Pro.

### Lessons

1 Where money comes from · 2 Needs and wants · 3 Three jars · 4 Goals and patience · 5 Money can
grow · 6 Snowball growth · 7 Ups and downs · 8 Prices go up · 9 Don't put all eggs in one basket ·
10 Freedom. Each is 4–6 screens of one picture and at most two short sentences, then the quiz.
Lessons unlock in order; lesson 10 needs 5 and 6.

### Kid math (`src/kids/math.ts`)

- Whole NT$, rounded each year; no decimals or percent signs on screen.
- Weeks to a goal = (price − saved) ÷ weekly saving, rounded up.
- `tree_y = round(tree_{y−1} × (1 + g)) + 52 × coins per week`.
- Defaults: piggy 0, bank 1%, money tree 6%. "Weather": a fixed repeating 10-year pattern averaging
  about 6% (+15, +8, −10, +20, +4, −5, +12, +6, −2, +12).
- Freedom number = yearly cost × 25; free when the tree ≥ the freedom number.

### Look, language, safety

Body ≥ 18 px, touch targets ≥ 48 px, original inline SVG art, colour always with icon and words,
fresh child copy in zh-TW and English, gentle celebrations respecting reduced motion. No real
money, links, ads or network calls; nicknames only; no real tickers; everything on the device.

### Requirements

| ID    | Requirement                                                                            | Priority |
| ----- | -------------------------------------------------------------------------------------- | -------- |
| KD-1  | Beginner / Pro choice on first visit, switchable; stored per device                    | P0       |
| KD-2  | Separate `fi-tracker-kids` database, `src/kids/`, ESLint boundary, lazy routes, 4 tabs | P0       |
| KD-3  | Child profiles (up to 4): nickname, avatar, age                                        | P0       |
| KD-4  | My Garden home                                                                         | P0       |
| KD-5  | Money in and out, Need / Want, automatic 3-jar split with editable split               | P0       |
| KD-6  | Goals (up to 3) with pictures, weeks-to-go and a celebration                           | P0       |
| KD-7  | Money Tree simulator                                                                   | P0       |
| KD-8  | Freedom Quest                                                                          | P0       |
| KD-9  | Lessons 1–10 with quizzes and badges, English and zh-TW                                | P0       |
| KD-10 | Optional parent PIN for leaving Beginner mode                                          | P1       |
| KD-11 | Parent corner: allowance, split, growth rates, presets, reset, save/load               | P1       |
| KD-12 | "Weather" bumpy-years switch                                                           | P1       |
| KD-13 | Kids section in the main backup file, backward compatible                              | P1       |
| KD-14 | Automatic weekly allowance                                                             | P2       |
| KD-15 | Read-aloud button                                                                      | P2       |
| KD-16 | Junior Time Machine                                                                    | P2       |

### Acceptance criteria

- A new device shows the mode choice; Beginner plus a profile takes under a minute.
- A full Beginner session leaves the plan database byte-for-byte unchanged (e2e).
- NT$100 a week at 6% for 10 years matches the formula; the piggy bank gives 52,000.
- Yearly cost NT$400,000 gives a freedom number of NT$10,000,000; free-at age matches a unit test.
- No Beginner screen shows a percent sign, a decimal or an English-only word in zh-TW.
- Type and touch-target sizes met at 390×844; fully keyboard reachable.
- With a PIN set, leaving Beginner needs it; three wrong tries show a 30-second wait.

## Release plan

1. Release 4 — Taiwan stocks (TW P0, P1).
2. Release 5 — Beginner mode core (KD P0).
3. Release 6 — Beginner polish (KD P1).
4. Later (P2): TPEx, US dividend withholding, auto-allowance, read-aloud, Junior Time Machine.

## Open questions

TAIEX total-return source; the Taiwan universe; default money-tree growth (6% or 5%); freedom rule
(× 25 or the plan's own rate); yearly cost cards (generic or copied from the plan); returning users
default to Pro. The answers are recorded in [decisions.md](decisions.md).
