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
- **Pro pages** (`src/app/pages.test.tsx`):
  - Every page opens with the demo plan.
  - Plan health shows.
  - The Goal page shows the FI number the domain gives.
  - A story plays to its end card with a scheduled crisis.
  - Accounts opens its form.
  - Unknown addresses show the not-found page.
- **Time Machine fields and the playback player bar and story cards.**
- **Beginner mode** (`src/kids/KidsApp.test.tsx`, `src/kids/ui.test.tsx`):
  - Profiles, jars and spending with the Savings check, goals, the money tree and Freedom
    Quest, and a lesson with its badge.
  - The grown-ups corner: the PIN with its lockout, the settings steppers, start again and
    delete.

## Accessibility checks

`tests/e2e/a11y.spec.ts` runs the UI polish acceptance checks against the built app:

- **Contrast:** axe-core `color-contrast` on every Pro route, Settings section, the Time Machine
  and the Beginner screens, in light and dark themes.
- **Text size:** no text under 12 px.
- **Target size:** no control under 24 × 24 px at 1280×800, and none under 44 × 44 px in the page or
  the bottom nav at 390×844. The page must also never scroll sideways at that width.
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
