# FI Tracker — Technical Design

Oct 22, 2026 · @D

The FI Tracker is a React + TypeScript single-page app hosted on GitHub Pages. All financial data stays in the browser (IndexedDB) with JSON file backup, market data is entered manually in v1, and the app serves one user. It implements Doc.

## Architecture

&#91;embedded content: system architecture · static app, local data\]

GitHub builds and hosts the static app; once loaded, the UI, calculations, simulation and storage all run inside the browser, and the only copy of the data outside it is the JSON backup the user exports.

## Key decisions

Each decision favours privacy and low maintenance over features a single user does not need.

| Decision | Chosen | Alternatives considered | Why |
| --- | --- | --- | --- |
| Hosting | GitHub Pages (static site) | Vercel, Cloudflare Pages, own server | Free, deploys from the same repo, no server to run |
| Data storage | IndexedDB in the browser, JSON file export/import | Supabase sync, local SQLite backend | Data never leaves the device; no accounts, no backend |
| Backend | None | FastAPI, Node server | Nothing to secure or keep running; all logic runs client-side |
| Framework | React + TypeScript (Vite) | Vue, Svelte, Python/Streamlit | Large ecosystem for charts, forms, testing; static build fits Pages |
| Routing | Hash routing (`/#/position`) | History routing with a 404 redirect hack | GitHub Pages has no server-side rewrites; hash routes always resolve |
| Market data | Manual entry of FX rate and balances | Free FX API, price APIs | No API keys or CORS issues in v1; an FX fetch adapter can be added later |
| Money | Integer minor units (×100) for stored amounts | Floats, decimal library everywhere | Exact stored balances; projections use floats in TWD, rounded only for display |
| Simulation | Monte Carlo in a Web Worker with a seeded RNG | Main thread | UI stays responsive; same seed gives the same result for comparisons |
| Calculation code | Pure TypeScript domain layer with no React imports | Logic inside components | Unit-testable, reusable by the worker and the UI |

## Tech stack

All libraries are open source and pinned to the latest stable version at project start.

| Concern | Choice | Notes |
| --- | --- | --- |
| Language | TypeScript, `strict` mode | No `any` in the domain layer |
| Build | Vite | `base` set to `/<repo-name>/` for GitHub Pages |
| UI framework | React | Function components and hooks |
| Styling and components | Tailwind CSS + shadcn/ui | Components copied into the repo, no runtime UI dependency |
| Routing | React Router (`HashRouter`) | See Key decisions |
| Local database | Dexie (IndexedDB wrapper) + `dexie-react-hooks` | Live queries re-render the UI when data changes |
| UI state | Zustand | Only for transient state: selected scenario, filters, unsaved edits |
| Validation | Zod | One schema per entity; shared by forms, import and migrations |
| Forms | React Hook Form + Zod resolver |  |
| Charts | Recharts | Line, stacked area, and range areas for P10–P90 bands |
| Dates | date-fns | Months as `YYYY-MM`, days as `YYYY-MM-DD` strings |
| Worker messaging | Comlink | Typed calls into the Monte Carlo worker |
| Unit tests | Vitest + React Testing Library |  |
| End-to-end tests | Playwright | Smoke flows on the built site |
| Lint and format | ESLint + Prettier | Enforced in CI |
| Offline install (P2) | `vite-plugin-pwa` | Installable app, works offline |

## Repository structure

Feature folders mirror the six PRD modules; calculation code lives apart from UI code so it can be tested and run in the worker.

```
fi-tracker/
├── .github/workflows/
│   ├── ci.yml              # lint, typecheck, unit tests on every push and PR
│   └── deploy.yml          # build and publish to GitHub Pages on main
├── public/
├── sample-data/
│   └── demo.json           # fictional data for development and the public demo
├── src/
│   ├── app/                # router, layout, providers, error boundary
│   ├── features/
│   │   ├── dashboard/
│   │   ├── destination/    # FI budget, FI number, income streams
│   │   ├── position/       # accounts, snapshots, FX, liabilities
│   │   ├── engine/         # monthly cash flow, savings rate
│   │   ├── trajectory/     # baseline projection, sensitivity
│   │   ├── lab/            # scenarios, comparison, Monte Carlo
│   │   ├── review/         # plan vs actual, review log
│   │   └── settings/       # assumptions, Taiwan settings, backup
│   ├── domain/             # pure TypeScript calculations, no React
│   │   ├── money.ts
│   │   ├── fx.ts
│   │   ├── networth.ts
│   │   ├── cashflow.ts
│   │   ├── fiNumber.ts
│   │   ├── projection.ts
│   │   ├── withdrawal/     # fixed SWR, guardrails, percentage, dividend
│   │   ├── montecarlo/     # RNG, correlated returns, runner
│   │   └── taiwan/         # 勞退, 勞保, NHI, dividend tax rules
│   ├── db/                 # Dexie schema, repositories, migrations
│   ├── io/                 # JSON export/import, Zod file schema
│   ├── workers/            # montecarlo.worker.ts
│   ├── components/         # shared UI (shadcn/ui, charts, money input)
│   └── lib/                # formatting, date helpers
├── tests/e2e/              # Playwright specs
├── docs/                   # PRD, this design, decision records
├── .gitignore              # blocks *.fi.json and backups/ from commits
└── README.md
```

## Data layer

One IndexedDB database holds the twelve PRD entities; the JSON backup file is the same data in one versioned document.

### Conventions

- **IDs:** `crypto.randomUUID()` strings
- **Money:** `amountMinor: number`, an integer in minor units (NT$1,234.50 → `123450`), always paired with a `currency` code. Helpers in `domain/money.ts` convert and format
- **FX:** stored as TWD per 1 unit of foreign currency (e.g. `32.15` for USD), one row per currency per snapshot date
- **Dates:** `YYYY-MM` for monthly records, `YYYY-MM-DD` for snapshots; no `Date` objects in storage, so no time-zone drift
- **Percentages:** stored as decimals (`0.04` for 4%)
- **Audit fields:** `createdAt`, `updatedAt` (ISO timestamps) on every record

### Schema

```typescript
type Currency = 'TWD' | 'USD' | string;
type AccountType = 'cash' | 'brokerage' | 'pension' | 'insurance' | 'property' | 'liability';
type AssetClass = 'cash' | 'tw_equity' | 'us_equity' | 'global_equity' | 'bond' | 'property' | 'other';

interface Settings { id: 'singleton'; baseCurrency: 'TWD'; birthYear: number; horizonAge: number;
  defaultSwr: number; snapshotCadence: 'monthly' | 'quarterly'; lastBackupAt?: string }

interface Account { id: string; nickname: string; institution: string; type: AccountType;
  assetClass: AssetClass; currency: Currency; investable: boolean; accessAge?: number; archived: boolean }

interface Snapshot { id: string; date: string; accountId: string; balanceMinor: number; note?: string }

interface FxRate { id: string; date: string; currency: Currency; twdPerUnit: number }

interface Holding { id: string; date: string; accountId: string; ticker: string; units: number;
  priceMinor: number; currency: Currency }

interface Liability { accountId: string; interestRate: number; monthlyPaymentMinor: number; remainingMonths: number }

interface CashFlow { id: string; month: string; categoryId: string; amountMinor: number;
  currency: Currency; lumpSum: boolean; note?: string }

interface Category { id: string; name: string; kind: 'income' | 'expense'; essential: boolean;
  fiAnnualMinor?: number }

interface IncomeStream { id: string; name: string; startAge: number; endAge?: number;
  annualMinor: number; inflationLinked: boolean }

interface AssetAssumption { assetClass: AssetClass; expectedReturn: number; volatility: number; fee: number }

interface AssumptionSet { id: string; name: string; assets: AssetAssumption[];
  correlations: Record<string, number>; inflation: number; salaryGrowth: number;
  fxDrift: number; fxVolatility: number; taiwan: TaiwanSettings }

interface ScenarioEvent { date: string; amountMinor: number; description: string }

interface Scenario { id: string; name: string; assumptionSetId: string;
  overrides: Partial<ScenarioLevers>; events: ScenarioEvent[];
  withdrawalRule: WithdrawalRule; isPlanOfRecord: boolean }

interface Review { id: string; date: string; type: 'monthly' | 'quarterly' | 'annual';
  planOfRecordId?: string; notes: string; decisions: string[] }
```

`TaiwanSettings`, `ScenarioLevers` and `WithdrawalRule` are defined in `domain/` and hold the settings listed in PRD sections 4 and 5.

### Dexie stores and indexes

```typescript
db.version(1).stores({
  settings: 'id',
  accounts: 'id, type, archived',
  snapshots: 'id, date, accountId, [accountId+date]',
  fxRates: 'id, [currency+date]',
  holdings: 'id, [accountId+date]',
  liabilities: 'accountId',
  cashFlows: 'id, month, categoryId, [month+categoryId]',
  categories: 'id, kind',
  incomeStreams: 'id',
  assumptionSets: 'id',
  scenarios: 'id, isPlanOfRecord',
  reviews: 'id, date',
});
```

### Migrations

- Each schema change adds a new `db.version(n)` with an `upgrade()` function; old versions are never edited
- The backup file carries `schemaVersion`; on import, the file is migrated step by step to the current version before writing
- Every migration has a unit test that loads a fixture from the previous version

### Backup and restore

- **Export:** one JSON file, `fi-tracker-YYYY-MM-DD.fi.json`, containing `{ schemaVersion, exportedAt, data: { …all stores } }`
- **Import:** Zod validates the whole file first; on success, replace all data in one transaction, after an automatic backup of the current data
- **Persistence:** call `navigator.storage.persist()` on first run so the browser is less likely to evict the database
- **Reminder:** banner when `lastBackupAt` is older than 30 days, and after every monthly snapshot
- **Auto-save to file (P1):** in Chrome and Edge, the File System Access API can write the backup to a file the user picks, after each change
- **Encrypted export (P2):** optional passphrase using Web Crypto (AES-GCM, PBKDF2-derived key)

## Domain engine

All calculations are pure functions in `src/domain/`: data in, results out, no database or React access. The deterministic projection and Monte Carlo share one yearly step function, so both always apply the same rules.

### Modules

| Module | Responsibility | PRD |
| --- | --- | --- |
| `money.ts` | Minor-unit arithmetic, conversion, TWD formatting | All |
| `fx.ts` | Look up the rate for a date (latest on or before it); convert to TWD | POS-3 |
| `networth.ts` | Total and investable net worth, FI progress, allocation, change attribution | POS-5, POS-7 |
| `cashflow.ts` | Monthly totals, savings rate, trailing-12-month spending, lump-sum handling | ENG-1 to ENG-5 |
| `fiNumber.ts` | Lean / Full / Fat FI numbers, bridge fund, Coast FI, required monthly savings | DST-1 to DST-6 |
| `projection.ts` | Yearly step function and the deterministic projection | TRJ-1 to TRJ-6 |
| `withdrawal/` | Fixed real SWR, guardrails, fixed percentage, dividend-based | LAB-5 |
| `montecarlo/` | Seeded RNG, correlated returns, runner, percentile summary | LAB-4 |
| `taiwan/` | 勞退 accrual and payout, 勞保 annuity estimate, NHI premiums, dividend withholding and tax | LAB-6, PRD section 5 |

### Projection model

The projection runs in annual steps, in real TWD, from the latest snapshot to the horizon age. Portfolio state is held in three buckets:

- **Liquid investable:** cash, brokerage, ETFs, split by asset class
- **Locked:** 勞退 balance and anything with an access age in the future; moves to liquid at its access age
- **Non-investable:** home and insurance cash value; tracked for total net worth only

Each year, in this order:

1. Apply the scenario's events for that year (home purchase, career break, one-off costs)
2. Before FI: add savings (income − spending) to liquid, by target allocation; add 勞退 contributions to locked
3. After FI: withdraw spending, minus active income streams, using the scenario's withdrawal rule
4. Apply returns per asset class, net of fees, US dividend withholding and NHI supplementary premium
5. Apply FX: USD assets move by the scenario's FX drift (deterministic) or a random draw (Monte Carlo)
6. Unlock buckets that reach their access age
7. Check FI: the first year liquid investable covers the FI number plus the bridge fund for years before guaranteed income starts
8. Record the year's state for charts and tables

In a deterministic projection, the run stops being "successful" if liquid investable falls below zero before the horizon age.

### Monte Carlo

- **Runs:** 1,000 by default, up to 10,000; executed in a Web Worker through Comlink
- **RNG:** seeded `mulberry32`; the seed is stored with the scenario so reruns and comparisons are reproducible
- **Returns:** yearly lognormal per asset class, from the assumption set's expected return and volatility
- **Correlation:** Cholesky decomposition of the correlation matrix turns independent normal draws into correlated ones
- **Inflation and FX:** each drawn yearly from a normal distribution around its assumption
- **Output:** P10 / P50 / P90 investable net worth per year, success rate (runs that stay above zero to the horizon age), distribution of FI age
- **Common random numbers:** scenarios in one comparison share the same random draws, so differences come from the strategy, not from luck

### Correctness

- Every Taiwan rate and threshold comes from `TaiwanSettings`, never a literal in the code
- `fiNumber.ts` and `projection.ts` are checked against hand-calculated cases and the closed-form formulas in the PRD
- With volatility set to zero, Monte Carlo must reproduce the deterministic projection exactly

## UI

Nine screens, one per route, with a sidebar on desktop and a bottom bar on narrow screens. Desktop is the primary target; layouts stay usable down to phone width.

| Route | Screen | What it does | PRD |
| --- | --- | --- | --- |
| `/#/` | Dashboard | Net worth, FI progress, projected FI date, savings rate, backup status | POS-5, TRJ-3 |
| `/#/accounts` | Accounts | Add, edit, archive accounts and liabilities | POS-1, POS-4 |
| `/#/snapshots` | Snapshots | Grid of accounts × dates; "copy last period" then edit; FX rate field per date | POS-2, POS-3, POS-6 |
| `/#/cashflow` | Cash flow | Grid of categories × months; lump-sum toggle; savings rate trend | ENG-1 to ENG-5 |
| `/#/goal` | Goal | FI budget by category, FI tiers, income streams, target age | DST-1 to DST-7 |
| `/#/projection` | Projection | Baseline chart against the FI number, year table, sensitivity panel | TRJ-1 to TRJ-6 |
| `/#/lab` | Strategy Lab | Scenario list and editor, side-by-side comparison, Monte Carlo bands | LAB-1 to LAB-8 |
| `/#/reviews` | Reviews | Review checklist, plan vs. actual, review log, plan of record | FBK-1 to FBK-5 |
| `/#/settings` | Settings | Assumption sets, Taiwan settings, categories, export / import, load demo data | DST-3, section 5 |

**Shared UI rules**

- Money inputs accept the account's native currency and show the TWD equivalent beside them
- Every projection screen shows the assumption set in use and links to it
- Real / nominal toggle on every chart that projects forward
- Empty states point to the next step (no accounts → add an account; no snapshot → enter the first one)
- Light and dark themes follow the system setting

## Privacy and security

The app code is published; the user's data never is. GitHub Pages only serves static files, and nothing the user enters is sent anywhere.

- **No network calls with user data:** the built app makes no requests except loading its own files; enforced by a Content-Security-Policy meta tag (`connect-src 'self'`)
- **No analytics, trackers or third-party scripts**
- **Repo safety:** `.gitignore` blocks `*.fi.json`, `backups/` and `.env*`; a CI step fails the build if a file matching those patterns is committed
- **Demo data only in the repo:** `sample-data/demo.json` uses fictional people and amounts
- **No sensitive identifiers:** no account numbers, logins or ID numbers in the schema (PRD data model)
- **Shared-device risk:** IndexedDB is readable by anyone using the same browser profile; use a personal profile, and the encrypted export (P2) for backups stored in cloud drives
- **Dependencies:** Dependabot alerts on, lockfile committed, `npm audit` in CI

## Testing

The calculation layer carries most of the risk, so it gets the deepest tests; the UI gets smoke coverage.

| Layer | Tool | What is tested | Target |
| --- | --- | --- | --- |
| Domain | Vitest | Hand-calculated cases, closed-form formula checks, edge cases (zero savings, negative returns, depletion) | 90%+ line coverage |
| Monte Carlo | Vitest | Seeded determinism, zero-volatility equals deterministic, sample mean and correlation within tolerance over 10,000 runs | All pass |
| Data | Vitest + `fake-indexeddb` | Repositories, each migration from a fixture, export → import round trip with no data change | All pass |
| Components | React Testing Library | Money input, snapshot grid, scenario editor | Key components |
| End to end | Playwright | Load demo data → add a snapshot → see the projection → export and re-import | Runs on every PR |

## Build, CI and deployment

Every push runs checks; a merge to `main` publishes the site to `https://<username>.github.io/<repo-name>/`.

**`ci.yml`** (push and pull request):

1. Install with `npm ci`
2. Lint and format check
3. Typecheck with `tsc --noEmit`
4. Unit tests with coverage
5. Build
6. Playwright smoke tests against the built site
7. Fail if any file matches the blocked data patterns

**`deploy.yml`** (push to `main`): build, then `actions/upload-pages-artifact` and `actions/deploy-pages`.

**One-time setup**

- In the repo settings, set Pages source to GitHub Actions
- Set `base: '/<repo-name>/'` in `vite.config.ts`
- Optional custom domain later via a `CNAME` file

**Local development:** `npm run dev` serves the app at `localhost:5173` with hot reload; `npm run demo` loads the fictional demo data.

## Implementation milestones

Milestone 0 sets up the project skeleton; milestones 1–5 follow the PRD's five phases, each ending in a deployed, usable version.

1. **M0 — Skeleton:** Vite + React + TypeScript project, Tailwind and shadcn/ui, routing, Dexie with schema v1, CI and deploy workflows, empty screens live on GitHub Pages. Done when: the site loads from the Pages URL and CI is green.
2. **M1 — Foundation (PRD phase 1):** accounts, snapshot grid with FX, liabilities, cash-flow grid, dashboard basics, export / import, backup reminder. Done when: a real snapshot and a month of cash flow are entered and survive an export → import round trip.
3. **M2 — Goal and baseline (phase 2):** FI budget and tiers, assumption sets, deterministic projection and chart, plan vs. actual. Done when: the dashboard shows a projected FI date.
4. **M3 — Strategy Lab v1 (phase 3):** scenarios, side-by-side comparison, income streams, Taiwan settings, access ages, sensitivity. Done when: three scenarios compare on the same data.
5. **M4 — Risk and withdrawal (phase 4):** Monte Carlo worker, withdrawal rules, holdings detail, change attribution, plan of record, review log. Done when: each scenario shows a success rate and P10–P90 bands.
6. **M5 — Polish (phase 5):** CSV import, alerts, historical backtest, buy vs. rent, PWA install, encrypted export.

## Risks and open questions

Data loss from the browser is the biggest risk of a no-backend design; backups are the mitigation.

| Risk | Impact | Mitigation |
| --- | --- | --- |
| Browser clears site data (cleanup tools, "clear browsing data", storage pressure) | All data lost | `storage.persist()`, backup reminders, auto-save to file in Chrome/Edge |
| Safari deletes script-written storage for sites not visited for 7 days | Data lost if used in Safari | Prefer Chrome or Edge, or install as a home-screen app; weekly backups if Safari is used |
| Personal data committed to the public repo | Privacy breach | `.gitignore` patterns plus a CI check; data never stored inside the project folder |
| Taiwan rules change or were wrong at start | Misleading projections | All rules are settings; verify before M3; note the as-of date on the Taiwan settings screen |
| Scope creep in the Strategy Lab | Delayed usefulness | Strict P0 → P1 → P2 order; each milestone ships something usable |
| Float error in long projections | Small drift in results | Stored values exact; projections rounded only at display; tolerance-based tests |

**Open questions (defaults in brackets)**

- [ ] Repo visibility: public or private? A private repo can only use GitHub Pages on a paid plan \[public\]
- [ ] Repo and app name \[`fi-tracker`\]
- [ ] Main browser: Chrome/Edge or Safari? Affects auto-save and storage risk \[Chrome\]
- [ ] UI language: English, Traditional Chinese, or both \[English, with i18n-ready strings\]
