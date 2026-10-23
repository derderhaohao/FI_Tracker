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

| Route          | Screen       | What it does                                                                                            |
| -------------- | ------------ | ------------------------------------------------------------------------------------------------------- |
| `#/`           | Dashboard    | Net worth, FI progress, projected FI date, savings rate, alerts, backup                                 |
| `#/accounts`   | Accounts     | Account registry and liability terms                                                                    |
| `#/snapshots`  | Snapshots    | Accounts × dates grid, FX per date, holdings, CSV import, change attribution with reconciliation check  |
| `#/cashflow`   | Cash flow    | Monthly totals or individual transactions, CSV import from bank exports, lump sums, savings-rate trend  |
| `#/goal`       | Goal         | FI budget and tiers, SWR, income streams, post-employment costs, target age, goal history               |
| `#/projection` | Projection   | Baseline projection, FI target, sensitivity, year table                                                 |
| `#/lab`        | Strategy Lab | Scenarios, comparison, Monte Carlo bands, historical backtest (1871–2022), buy vs. rent, plan of record |
| `#/reviews`    | Reviews      | Checklists, plan vs. actual, review log                                                                 |
| `#/settings`   | Settings     | Assumptions, Taiwan settings, categories, backup / restore, encrypted export, auto-save, demo data      |

## Getting started

Requires Node 22.

```bash
npm install
npm run dev        # http://localhost:5173/FI_Tracker/
npm run demo       # opens the app and loads the fictional demo data
```

Or open Settings → **Load demo data** to explore with made-up numbers.

### First real use

A browser with no data opens a **welcome screen** with two choices:

- **Set up my data:** a six-step guided setup (about 10 minutes) asking only what the projection
  needs. Steps: birth year, today's account balances (and the USD rate if needed), monthly
  take-home pay and spending, yearly spending once FI and the withdrawal rate, then optional
  勞退/勞保 details. The last step previews your projected FI date; nothing is saved until you
  press Finish.
- **Look around with demo data:** a fictional household. Settings → _Delete all data_ brings the
  welcome screen back.

After setup, refine at your own pace: split "Living costs" into categories (Cash flow, Goal), set
your target allocation (Settings), back up or turn on auto-save (Settings → Backup), and test
strategies (Strategy Lab). Each month: update balances in Snapshots and last month's cash flow.

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

# Locally, if Playwright's own browser is not downloaded:
PLAYWRIGHT_CHROMIUM_PATH=/path/to/chrome npm run e2e
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
- In Chrome or Edge, Settings → Backup → **Choose auto-save file** keeps a backup file up to date
  after every change. **Export encrypted backup** protects copies kept in cloud drives or email.
- The app can be installed (browser menu → Install) and works offline after the first visit.

## Data sources

- Historical returns for the backtest: Robert Shiller's data (S&P composite with dividends, CPI-U,
  10-year Treasury yield), via [datasets/s-and-p-500](https://github.com/datasets/s-and-p-500).
  Regenerate with `npx tsx scripts/build-history.ts data.csv`.
- Taiwan rules: see the check table in [docs/decisions.md](docs/decisions.md).
