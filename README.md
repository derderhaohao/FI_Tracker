# FI Tracker

When can I stop depending on a paycheck, and which strategy gets me there most reliably?

FI Tracker combines a net-worth tracker, a cash-flow log and a strategy simulator in one personal
web app, with TWD as the base currency and Taiwan-specific rules (勞退, 勞保, NHI, dividend tax)
built in as editable settings.

- **Private by design.** A static React app: all data stays in your browser (IndexedDB). Nothing is
  sent anywhere; a Content-Security-Policy blocks network calls to other origins. The only copy
  outside the browser is the JSON backup you export.
- **Specs.** [Product requirements](docs/product-requirements.md) ·
  [Technical design](docs/technical-design.md) · [Build decisions](docs/decisions.md)

## Screens

| Route          | Screen       | What it does                                                                |
| -------------- | ------------ | --------------------------------------------------------------------------- |
| `#/`           | Dashboard    | Net worth, FI progress, projected FI date, savings rate, alerts, backup     |
| `#/accounts`   | Accounts     | Account registry and liability terms                                        |
| `#/snapshots`  | Snapshots    | Accounts × dates grid, FX per date, holdings, net-worth change attribution  |
| `#/cashflow`   | Cash flow    | Categories × months grid, lump sums, savings-rate trend                     |
| `#/goal`       | Goal         | FI budget and tiers, SWR, income streams, post-employment costs, target age |
| `#/projection` | Projection   | Baseline projection, FI target, sensitivity, year table                     |
| `#/lab`        | Strategy Lab | Scenarios, side-by-side comparison, Monte Carlo bands, plan of record       |
| `#/reviews`    | Reviews      | Checklists, plan vs. actual, review log                                     |
| `#/settings`   | Settings     | Assumptions, Taiwan settings, categories, backup / restore, demo data       |

## Getting started

Requires Node 22.

```bash
npm install
npm run dev        # http://localhost:5173/FI_Tracker/
npm run demo       # opens the app and loads the fictional demo data
```

Or open Settings → **Load demo data** to explore with made-up numbers.

### First real use

1. **Settings → General:** birth year, horizon age, target allocation.
2. **Accounts:** add each account by nickname (never account numbers).
3. **Snapshots:** pick a date, press _Copy last period_, enter each balance and the USD/TWD rate.
4. **Cash flow:** enter last month's income and spending; tag bonuses as lump sums.
5. **Goal:** fill in the annual FI budget per category.
6. **Settings → Taiwan settings:** insured wage, 勞保 years and salary. Check every value against
   current rules first.
7. **Settings → Backup:** export a backup and keep it outside the browser.

## Development

```bash
npm run lint           # ESLint
npm run format:check   # Prettier
npm run typecheck      # tsc --noEmit
npm test               # Vitest unit tests (domain, data, components)
npm run coverage       # with coverage
npm run build          # production build into dist/
npm run e2e            # Playwright smoke tests against the built site
npm run perf           # 10,000 Monte Carlo runs must finish in under 5 seconds
npm run demo:generate  # regenerate sample-data/demo.json
```

### Layout

```
src/
  app/          router, layout, data provider, error boundary
  features/     one folder per screen (dashboard, position, engine, destination, trajectory, lab, review, settings)
  domain/       pure TypeScript calculations, no React: money, fx, networth, cashflow, fiNumber,
                projection, withdrawal/, montecarlo/, taiwan/
  db/           Dexie schema (v1), repositories, first-run defaults
  io/           JSON backup + migrations, CSV export, demo data
  workers/      Monte Carlo Web Worker (Comlink)
  components/   shared UI, money inputs, charts
tests/e2e/      Playwright specs
sample-data/    fictional demo data
```

The deterministic projection and Monte Carlo share one yearly step function
(`domain/projection.ts`), so both always apply the same rules; with volatility set to zero, Monte
Carlo reproduces the deterministic projection exactly (tested).

## Deployment (GitHub Pages)

`.github/workflows/deploy.yml` builds and publishes on every push to `main`.

One-time setup: in the repository settings → **Pages**, set the source to **GitHub Actions**. The
site is then served at `https://<username>.github.io/FI_Tracker/`. A private repository needs a paid
plan for Pages.

## Privacy and backups

- Data lives in IndexedDB in this browser profile. Clearing site data deletes it.
- Export a backup after every monthly update. The app reminds you when the last backup is older than
  30 days and after each new snapshot.
- Backups are named `*.fi.json`. `.gitignore` blocks them (and `backups/`, `.env*`), and CI fails if
  one is ever committed. Never put real data in this repository.
- Safari deletes site data after 7 days without a visit; prefer Chrome or Edge.
