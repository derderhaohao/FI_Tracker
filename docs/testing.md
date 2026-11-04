# Testing

Every push and pull request runs the full suite in GitHub Actions (`.github/workflows/ci.yml`).
The checks run in this order:

1. The personal-data file check, lint, format and typecheck.
2. Unit and component tests with the coverage gate.
3. Audit, build and the Monte Carlo performance budget.
4. The Playwright end-to-end tests.

```bash
npm test           # unit and component tests
npm run coverage   # the same, with the coverage gate; HTML report in coverage/index.html
npm run e2e        # end-to-end, against the built site
```

## Layers

| Layer      | Tools                                          | Where                 | What it proves                                                          |
| ---------- | ---------------------------------------------- | --------------------- | ----------------------------------------------------------------------- |
| Unit       | Vitest                                         | `src/**/*.test.ts`    | Calculations, data, import/export, state                                |
| Component  | Vitest, jsdom, Testing Library, fake IndexedDB | `src/**/*.test.tsx`   | UI pieces and whole screens behave and are accessible by role and label |
| End to end | Playwright (Chromium)                          | `tests/e2e/*.spec.ts` | The built app works offline in a real browser                           |

## FI calculations

`src/domain/fiCalculations.test.ts` checks the calculations against hand-worked answers and
closed forms:

- **FI number:** (S − G) ÷ SWR. Worked examples, the 25× and 33⅓× rules, never negative, and
  infinite at a zero SWR.
- **Real return:** the Fisher formula, (1 + n) ÷ (1 + π) − 1, which round-trips.
- **Years to FI:** recovers n from the future value of savings, for positive, zero and negative
  returns. It agrees with a year-by-year loop, and is 0 or ∞ at the edges.
- **Coast FI and required savings:** discounting the target back, and the inverse of years to FI.
- **Guaranteed income:** the permanent income, the active streams at an age, the bridge fund and
  the full target.
- **The projection compared with the formulas:**
  - Compound growth, and each year's books balancing.
  - The target equalling S ÷ SWR.
  - The FI age matching the closed form under mid-year contributions.
  - Each lever moving the FI age the right way.
  - Withdrawals under the fixed rule, and the money lasting above the SWR and running out below
    it.
  - Monte Carlo with no volatility giving the deterministic answer, and volatility lowering the
    chance.
- **Withdrawal rules, FI progress, savings rate:** the wording of the plan status at each
  threshold.

Other suites cover the rest of the maths:

- Projection details (`projection.test.ts`).
- Monte Carlo and the lever solver (`montecarlo/`).
- Taiwan taxes, insurance and pension (`taiwan/`).
- Loans, cash flow, net worth, backtest and buy vs rent.
- The Time Machine engine.
- The kids' money maths (`src/kids/math.test.ts`).

## Component tests

- **UI primitives** (`src/components/ui/ui.test.tsx`): buttons, cards, notices, stats, empty
  states, the segmented control, tables and form fields.
- **App pieces** (`src/components/components.test.tsx`): the language and Beginner/Pro switches,
  the first-visit mode choice, the assumption badge and the chance dots.
- **Pro pages** (`src/app/pages.test.tsx`), through the real route tree (`app/proRoutes.tsx`):
  - Every page and old address opens with the five-item menu and its tab marked.
  - Home leads with progress, one certainty word and one Next step.
  - Each Settings section opens by address.
  - The whole monthly update runs to its recap and writes the month's flows and review.
  - Balances groups accounts with subtotals, reads first, and opens details in a drawer.
  - Cash-flow groups collapse to totals; one-offs sit behind a button.
  - My plan's sliders move the date live and save a what-if; How sure is this? shows the word.
  - The Goal page shows the FI number the domain gives.
  - A story plays to its end card with a scheduled crisis.
  - Unknown addresses show the not-found page.
- **The redesign's behaviour** (`src/app/redesign.test.tsx`), on a fresh demo household per test:
  - Home's Next step in each case (update due, backup, 勞保 figures, what-if), one banner at a
    time, the mix line, one month of data, and the chart toggle.
  - The 勞保 reminder clears once Settings → Taiwan rules is edited; the auto-save banner.
  - The monthly update when the month already has entries, in transaction mode, and with a one-off.
  - Balances: loan terms, archive and restore, deleting a new account, What changed, and the
    duplicate-month guard.
  - Cash flow on a wide screen and a phone; My plan's tabs, Compare without a duplicate of your
    plan, one target on Goal, and the money setting.
  - `src/test/renderApp.tsx` holds the shared render helper and the monthly-update walk.
- **Settings** (`src/features/settings/settings.test.tsx`): every General field saves; assumption
  sets are edited, duplicated, added and deleted (or kept when cancelled); 勞退, 勞保 and dividend-tax
  fields; categories are renamed, marked essential, added and deleted, and a used one cannot be;
  JSON and CSV export, restore (with a download of the current data first), a rejected file, a
  cancelled restore, an encrypted restore with a wrong and a right passphrase, the encrypted export's
  passphrase checks, loading the demo; Delete all data after typing DELETE; the calendar reminder;
  Beginner mode and Tools; the phone section picker. Downloads are captured, not saved.
- **CSV import** (`src/features/import/csvImport.test.tsx`): a Taiwan bank export (民國 dates,
  separate out / in columns, a BOM) imported and then skipped as duplicates; switching to the
  transaction view; a signed credit-card file with spending as positive, lump sums and a bad row;
  waiting for columns and remembering a mapping; a file without a header; an empty file; balances
  matched by account name, mapped by hand, imported, and replaced on a second import.
- **Playback** (`src/features/trajectory/playback/playback.test.tsx`): the playback state fires an
  event that lowers the path only after its month, refuses an unknown event, a running one and a
  sixth at once, removes one, undoes exactly and clears all, and starts over on a new story; the
  view splits the chart by class, region and currency, shows and exports the history, saves a story
  with its settings, imports a story file and rejects others, toggles the event pause, and answers
  Space, the arrow keys, number keys and Ctrl+Z.
- **Strategy Lab** (`src/features/lab/lab.test.tsx`): a what-if from a template, a blank copy, delete
  (and a cancelled delete), Compare ticks, the starter guide, More options, the phone section picker;
  editing a what-if (name, rule, a lever, a one-off event) and setting it as my plan; what it takes
  to reach a target chance, saved as a what-if; the assumptions and reference tests; buy vs. rent
  turned into a what-if. The worker mock runs the real simulations, solver and checks with 50 runs.
- **First run** (`src/features/setup/firstRun.test.tsx`): the welcome screen in focus mode, the
  60-second estimate carried into setup, four steps with the live FI age, and the result screen.
- **Time Machine fields and the playback player bar and story cards.**
- **Beginner mode** (`src/kids/KidsApp.test.tsx`, `src/kids/ui.test.tsx`):
  - Profiles, jars and spending with the Savings check, goals, the money tree and Freedom
    Quest, and a lesson with its badge.
  - The grown-ups corner: the PIN with its lockout, the settings steppers, start again and
    delete.

## Accessibility checks

`tests/e2e/a11y.spec.ts` runs the UI polish acceptance checks against the built app:

- **Contrast:** axe-core `color-contrast` on every Pro route and tab, Settings section, the Time
  Machine and the Beginner screens, in light and dark themes.
- **Text size:** no text under 12 px.
- **Target size:** no control under 24 × 24 px at 1280×800, and none under 44 × 44 px in the page or
  the bottom nav at 390×844. The page must also never scroll sideways at that width.
- **Banners:** no page shows more than one warning.
- **Chinese on a phone:** no page scrolls sideways at 390 px in 繁體中文.
- **Layout:**
  - The Dashboard KPI row is in view at 1280×800.
  - Settings sections open by address, and the Lab nav marks the section in view.
  - Time Machine result cells stay on two lines.

Round axis ticks are unit-tested in `src/components/charts/ticks.test.ts`.

## Coverage gate

`vite.config.ts` measures every file in `src`. It leaves out the entry point, the worker shell
and test files, which only a real browser reaches. CI fails when coverage drops below these
levels:

| Scope                               | Statements | Branches | Functions | Lines |
| ----------------------------------- | ---------: | -------: | --------: | ----: |
| All of `src`                        |        75% |      63% |       64% |   77% |
| `src/domain` (the calculations)     |        94% |      81% |       95% |   95% |
| `src/io` (backups, CSV, encryption) |        95% |      85% |       94% |   96% |
| Kids coin logic, PIN and backups    |        97% |      88% |       98% |   98% |

The job summary shows a coverage table by area. The HTML report is kept as the
`coverage-report` artifact for seven days.

## Writing tests

- Build projection inputs with `makeInput()` and `withReturn()` from `src/domain/testFixtures.ts`.
  The defaults are one TWD cash bucket and zero returns and inflation, so the expected values can
  be worked out by hand.
- Find elements by role and accessible name, as a screen reader would, not by class names.
- Give each test its own database name (`new FiDatabase('…')`, `new KidsDatabase('…')`), or
  clear the tables in `beforeEach`.
- Every `t()` text needs a zh-TW entry; `src/i18n/i18n.test.ts` fails otherwise.
