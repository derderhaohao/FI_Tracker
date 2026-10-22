# FI Tracker — Product Requirements

Oct 22, 2026 · @D

## Overview

The FI Tracker answers one question: when can I stop depending on a paycheck, and which strategy gets me there most reliably? It combines a net-worth tracker, a cash-flow log and a strategy simulator in one personal tool, with TWD as the base currency.

**User:** a single user (De). No sharing, roles or multi-user features.

**Problem:** money sits across bank, broker and pension accounts in two currencies (TWD, USD). There is no single view of progress, and no way to test "what if" strategies against real numbers.

**Success criteria (targets):**

- The monthly update takes 30 minutes or less
- Every review shows a projected FI date and, from phase 4, a probability of success
- At least three strategies can be compared side by side on the same real data
- Plan vs. actual is visible at every review

&#91;embedded content: module map · 6 modules\]

Position, Engine and Destination feed the baseline projection; the Strategy Lab tests alternatives, and the chosen plan is checked against actuals at every review.

## Goals and non-goals

The tool turns real data into a decision about strategy; it does not try to be a budgeting app or a broker.

**Goals**

1. Define the FI number, split into Lean and Full tiers
2. Track net worth and cash flow as a time series in TWD
3. Project the FI date under explicit, editable assumptions
4. Compare strategies with deterministic and Monte Carlo simulation
5. Close the loop with a regular plan-vs-actual review

**Non-goals (v1)**

- Automatic bank or broker sync (manual entry, CSV import later)
- Transaction-level budgeting and receipt tracking
- Investment picks or buy/sell recommendations
- Tax filing
- Multi-user or shared access

## Core concepts

These terms are used the same way in every module, screen and formula.

| Term | Definition |
| --- | --- |
| FI number | Annual spending in FI, minus guaranteed income, divided by the safe withdrawal rate |
| Lean / Full / Fat FI | FI number using essentials only / current lifestyle / a richer lifestyle |
| Coast FI | Amount invested today that grows to the FI number by the target age with no more contributions |
| Safe withdrawal rate (SWR) | Share of the portfolio withdrawn in year one, then adjusted for inflation |
| Investable net worth | Assets that can fund withdrawals: cash, brokerage, ETFs; 勞退 counts only from its access age |
| Total net worth | All assets minus all liabilities, including home and insurance cash value |
| FI progress | Investable net worth ÷ FI number, as a percentage |
| Savings rate | (Net income − spending) ÷ net income |
| Real vs. nominal | Projections show today's TWD (real) by default; nominal is a toggle |
| Base currency | TWD; every foreign-currency balance is converted at the FX rate stored with its snapshot |
| Plan of record | The scenario chosen at the last annual reset, used as the yardstick for plan vs. actual |

## Functional requirements

Six modules, each answering one question. Priority: P0 = needed for the first usable version, P1 = needed for strategy decisions, P2 = nice to have.

### 1. Destination — what is FI for me?

| ID | Requirement | Priority |
| --- | --- | --- |
| DST-1 | Define FI-phase spending by category, each flagged essential or lifestyle | P0 |
| DST-2 | Compute the FI number for Lean (essentials only) and Full tiers; Fat tier optional | P0 |
| DST-3 | SWR is a setting (default 4%, range 2.5–5%) | P0 |
| DST-4 | Add guaranteed income streams (勞保 annuity, 勞退 payout, rental, part-time work), each with a start age and amount | P1 |
| DST-5 | Add post-employment costs: self-paid NHI premium, private health insurance, healthcare reserve | P1 |
| DST-6 | Optional target FI age; show the savings needed per month to hit it | P1 |
| DST-7 | Keep a history of goal changes so shifts in the target are visible | P2 |

### 2. Position — where am I now?

| ID | Requirement | Priority |
| --- | --- | --- |
| POS-1 | Account registry: nickname, institution, type, asset class, currency, investable flag, access age | P0 |
| POS-2 | Snapshot entry: one balance per account per period (monthly default), in its native currency | P0 |
| POS-3 | FX rate (USD/TWD, extensible to other currencies) stored per snapshot date; all totals in TWD | P0 |
| POS-4 | Liabilities: balance, interest rate, monthly payment, remaining term | P0 |
| POS-5 | Dashboard: total and investable net worth, FI progress %, allocation by asset class and currency, net worth over time | P0 |
| POS-6 | Optional holdings detail per brokerage account: ticker, units, price, currency | P1 |
| POS-7 | Explain each period's net worth change as contributions + market return + FX effect | P1 |
| POS-8 | CSV import from bank and broker exports | P2 |

### 3. Engine — how fast am I moving?

| ID | Requirement | Priority |
| --- | --- | --- |
| ENG-1 | Monthly entry of income lines (salary, bonus, dividends, other) and expense categories | P0 |
| ENG-2 | Monthly-totals mode as default; transaction-level mode optional | P0 / P2 |
| ENG-3 | Savings rate per month and trailing 12 months | P0 |
| ENG-4 | Trailing-12-month spending feeds Destination as a reality check on the FI budget | P0 |
| ENG-5 | Tag lump sums (year-end bonus, large one-off costs) so they do not distort monthly trends | P1 |
| ENG-6 | Reconciliation flag when savings and net worth change disagree beyond market and FX effects | P2 |

### 4. Trajectory — when do I arrive if nothing changes?

| ID | Requirement | Priority |
| --- | --- | --- |
| TRJ-1 | Assumption set: expected return per asset class, inflation, salary growth, fees, FX drift | P0 |
| TRJ-2 | Year-by-year projection from the latest snapshot to a horizon age (default 95), in real TWD | P0 |
| TRJ-3 | Output: projected FI date and age; chart of investable net worth against the FI number | P0 |
| TRJ-4 | Respect access rules: 勞退 locked until 60, 勞保 annuity from its claim age | P1 |
| TRJ-5 | Project the withdrawal phase after FI: balance at horizon age, depletion age if any | P1 |
| TRJ-6 | Sensitivity: FI date shift for ±1% return, ±10% spending, ±5 points savings rate | P1 |

### 5. Strategy Lab — which path suits me best?

| ID | Requirement | Priority |
| --- | --- | --- |
| LAB-1 | A scenario = the baseline plus named overrides, saved and editable | P0 |
| LAB-2 | Levers: savings rate, income changes (raise, job change, career break), spending, allocation, FI age, one-off events (home purchase, large costs), part-time income after FI (Barista FI) | P0 |
| LAB-3 | Compare up to 5 scenarios side by side: FI date, success rate, net worth at FI, balance at horizon | P0 |
| LAB-4 | Monte Carlo: at least 1,000 runs with return, volatility and correlation per asset class plus inflation and FX randomness; P10/P50/P90 bands and success rate | P1 |
| LAB-5 | Withdrawal rules: fixed real SWR, guardrails, fixed percentage of portfolio, dividend-based | P1 |
| LAB-6 | Apply the Taiwan-specific frictions in section 5 inside every simulation | P1 |
| LAB-7 | Historical backtest using real market return sequences | P2 |
| LAB-8 | Buy vs. rent comparison | P2 |

### 6. Feedback loop — am I on track?

| ID | Requirement | Priority |
| --- | --- | --- |
| FBK-1 | Review cadence (monthly snapshot, quarterly review, annual reset) with a checklist for each | P0 |
| FBK-2 | Plan vs. actual: net worth, savings and spending against the plan of record | P0 |
| FBK-3 | Lock a plan of record at each annual reset | P1 |
| FBK-4 | Review log: date, notes, decisions taken | P1 |
| FBK-5 | Alerts: savings rate below target, allocation drift beyond a threshold, emergency fund below N months | P2 |

## Taiwan-specific requirements

Every rate, threshold and age below is a setting, never hard-coded. Values are from general knowledge and must be checked against current rules before the build.

| Area | What the tool must handle | Starting assumption to verify |
| --- | --- | --- |
| Currency | TWD base; USD holdings converted per snapshot; FX as a random variable in simulations | USD/TWD rate entered at each snapshot |
| 勞退 (Labor Pension, new system) | Track the individual account balance; employer contribution and optional voluntary contribution as a Strategy Lab lever; locked until access age | Employer 6% of insured wage; voluntary up to 6%, tax-deductible; access at 60; monthly payout needs 15+ years of contributions, otherwise lump sum |
| 勞保 old-age annuity | Estimate the annuity from insured years and average insured salary; early or delayed claim; a haircut scenario for fund solvency | Claim age 65; up to 5 years early at −4% per year, delay at +4% per year |
| NHI after leaving work | Premium becomes self-paid when no longer employed; supplementary premium on large single dividend payments | Supplementary premium 2.11% on single payments of NT$20,000 or more |
| Domestic dividends | Choice of combined taxation with credit vs. separate taxation | 8.5% credit capped at NT$80,000, or 28% separate rate |
| US dividends | Withholding tax reduces dividend income and total return | 30% withholding for Taiwan residents; keep as a setting in case US–Taiwan double-tax relief changes it |
| Overseas income | Flag when overseas income may trigger the basic income tax (AMT) | Counts toward basic income above NT$1M a year; thresholds configurable |
| Inflation | Default inflation for real-terms projections | About 2% a year |
| Bonus seasonality | Year-end and festival bonuses arrive as lump sums | Tagged separately (ENG-5) |
| Savings insurance (儲蓄險) | Policies with cash value, often USD-denominated, tracked as non-investable or investable by flag | Cash value updated yearly from the policy statement |

## Data model

Twelve entities cover all six modules; each maps to one sheet (spreadsheet) or one table (web app).

| Entity | Key fields | Used by |
| --- | --- | --- |
| Settings | base currency, birth year, horizon age, default SWR, review cadence | All |
| Account | id, nickname, institution, type (cash / brokerage / pension / insurance / property / liability), asset class, currency, investable flag, access age | Position |
| Snapshot | date, account id, balance (native currency), note | Position, Trajectory |
| FXRate | date, currency pair, rate | Position, Engine |
| Holding | snapshot date, account id, ticker, units, price, currency | Position (P1) |
| Liability | account id, interest rate, monthly payment, remaining term | Position, Trajectory |
| CashFlow | month, category, type (income / expense), amount, currency, lump-sum flag | Engine |
| Category | name, type, essential flag, FI-phase amount | Engine, Destination |
| IncomeStream | name (勞保, 勞退, rental, part-time), start age, end age, annual amount, inflation-linked flag | Destination, Trajectory |
| AssumptionSet | name, return / volatility per asset class, correlations, inflation, salary growth, fees, FX drift, tax and premium settings | Trajectory, Strategy Lab |
| Scenario | name, base assumption set, overrides, events (date, amount, description), withdrawal rule | Strategy Lab |
| Review | date, type (monthly / quarterly / annual), plan-of-record scenario id, notes, decisions | Feedback loop |

Account numbers and logins are never stored; accounts are identified by nickname only.

## Calculations

The closed-form formulas below are for quick estimates and validation; the projection itself runs year by year so income streams, access ages and events can switch on and off.

**FI number**, where S = annual FI spending and G = guaranteed income once it starts:

```latex
\text{FI number} = \frac{S - G}{\text{SWR}}
```

When G starts after the FI date (e.g. 勞保 at 65), the gap years need a bridge fund on top: the sum of S over those years.

**Investable net worth** at time t, summing each investable account's native balance times its FX rate:

```latex
NW_t = \sum_i B_{i,t} \cdot FX_{i,t}
```

**Savings rate:**

```latex
SR = \frac{\text{net income} - \text{spending}}{\text{net income}}
```

**Real return** from nominal return n and inflation π:

```latex
r = \frac{1 + n}{1 + \pi} - 1
```

**Years to FI**, with current investable P, annual savings s, target T and real return r:

```latex
n_{FI} = \frac{\ln\left(\frac{T r + s}{P r + s}\right)}{\ln(1 + r)}
```

**Coast FI** amount today, for current age A and target FI age A\_FI:

```latex
\text{Coast} = \frac{T}{(1 + r)^{A_{FI} - A}}
```

**Net worth change attribution** per period; the FX effect is the prior USD balance times the change in rate, and market return is the remainder:

```latex
\Delta NW = \text{contributions} + \text{market return} + B^{USD}_{t-1}\,(FX_t - FX_{t-1})
```

**Monte Carlo success rate:**

```latex
\text{Success} = \frac{\text{runs where the portfolio stays above 0 to the horizon age}}{\text{total runs}}
```

**Guardrails withdrawal (LAB-5):** start at the SWR; if the current withdrawal rate rises 20% above the start rate, cut spending 10%; if it falls 20% below, raise spending 10%. The 20% band and 10% step are settings.

## Non-functional requirements

The tool must stay cheap to maintain and fully under the user's control, whatever platform is chosen.

| Area | Requirement |
| --- | --- |
| Platform | Works as a spreadsheet (Excel or Google Sheets) or a simple web page; the data model is the same either way. Spreadsheets are faster to start; a web page handles Monte Carlo and charts better |
| Privacy | Data stays in files or storage the user controls; no bank logins, account numbers or ID numbers stored |
| Effort | Monthly update in 30 minutes or less; the quarterly review in about an hour |
| Transparency | Every output traces back to its inputs; the assumption set in use is shown on every projection |
| Performance | 10,000 Monte Carlo runs finish in under 5 seconds (web version) |
| Portability | Full export to CSV; no lock-in to one tool |
| Backup | Versioned backups, at least after each monthly update |

## Release plan

Build real data first, then the goal and projection, then simulation; each phase ends with something usable.

1. **Phase 1 — Foundation:** POS-1 to POS-5, ENG-1 to ENG-4, FBK-1. Exit: first snapshot entered, plus any history available to backfill.
2. **Phase 2 — Goal and baseline:** DST-1 to DST-3, TRJ-1 to TRJ-3, FBK-2. Exit: a projected FI date on the dashboard.
3. **Phase 3 — Strategy Lab v1:** LAB-1 to LAB-3, DST-4 to DST-6, TRJ-4 to TRJ-6, Taiwan settings from section 5. Exit: three scenarios compared side by side.
4. **Phase 4 — Risk and withdrawal:** LAB-4 to LAB-6, POS-6, POS-7, ENG-5, FBK-3, FBK-4. Exit: success rate per scenario; first plan of record locked.
5. **Phase 5 — Polish:** all remaining P2 items.

## Open questions

The first three shape the build and should be settled before phase 1 starts.

- [ ] Platform: Excel, Google Sheets or a simple web page?
- [ ] What does FI mean here: stop working entirely, or work optional? Is there a target age?
- [ ] FI-phase spending: current lifestyle, leaner or richer?
- [ ] Snapshot cadence: monthly or quarterly?
- [ ] Cash flow: monthly totals or individual transactions?
- [ ] Default SWR: 4%, or a more conservative 3.25–3.5% for a horizon of 40+ years?
- [ ] Are property or a home purchase part of the plan?
- [ ] Household scope: individual finances only, or shared ones too?
- [ ] How much history exists to backfill, and from which accounts?
- [ ] Any currencies besides TWD and USD?
