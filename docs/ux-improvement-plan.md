# UX Improvement Design Doc: what was built

Nov 3, 2026. The design doc (a PDF handoff) reviewed `main` at commit 553c5c1 as a first-time user
and as a returning user with the demo household. Its finding: the maths, privacy and copy were
ahead of most FI tools; volume made the app hard to use. The fix was mostly subtraction and
re-ordering. This page records what shipped for each backlog item.

## Design principles

1. **Answer first, explain on request.** Each screen leads with one sentence and one number.
2. **One job per screen.** A page shows the plan, collects numbers or runs an experiment.
3. **Show the result of every input.** Typing a number visibly moves the FI date.
4. **Warnings are earned.** One banner at a time, only when the user can act on it.
5. **Speak in outcomes and money.** "Stop work at 49" beats "66%".

## Backlog

| ID  | Change                                                        | Where it lives now                                                          |
| --- | ------------------------------------------------------------- | --------------------------------------------------------------------------- |
| T1  | Savings-rate sensitivity rows on the base row's basis         | `domain/sensitivity.ts`; demo-data test: +5 pts is never later than base    |
| T2  | Pre-selected investment mix; errors beside the field          | `setupModel.suggestedMix`, `effectiveMix`                                   |
| T3  | No allocation warnings before the 2nd update; one grouped     | `domain/alerts.groupDriftAlerts`, `allocationGap`                           |
| T4  | Truncated card, setup-card wording, Snapshots default date    | Projection info tip; Monthly update wording; latest month-end               |
| O1  | One welcome screen with a 60-second estimate                  | `features/setup/Welcome.tsx`, focus mode in `app/Layout.tsx`                |
| O2  | Four-step setup with a live FI age; pensions out of setup     | `features/setup/SetupPage.tsx`; 勞退 / 勞保 estimated from pay              |
| O3  | Result screen at the end of setup                             | `features/setup/SetupResult.tsx` (`#/setup/done`)                           |
| N1  | Five menu items; old routes redirect                          | `app/proRoutes.tsx`, `app/SectionTabs.tsx`                                  |
| D1  | Progress hero, three cards, Next step card                    | `features/dashboard/DashboardPage.tsx`, `nextStep.ts`                       |
| A1  | One banner at a time; certainty colours by band               | `domain/planStatus.ts` (Likely / Fairly likely / Uncertain)                 |
| M1  | Pay and spending inside Monthly update, plus a recap          | `features/update/UpdatePage.tsx`, `updateModel.planFlows / buildMonthFlows` |
| M2  | Read-first grids; Accounts and Snapshots merged into Balances | `features/position/BalancesPage.tsx`, `AccountDrawer.tsx`, Cash flow        |
| P1  | My plan page with three live sliders                          | `features/plan/PlanPage.tsx`, `planModel.ts`                                |
| P2  | Plan tabs; no Simple/Advanced or money toggles; one target    | `#/plan/*` tabs, `features/plan/SurePage.tsx`, Settings → General           |

## How to know it worked

The app sends nothing anywhere, so the doc measures with short hallway tests: five people per round,
one round before each phase and one after.

| Task, timed with a stopwatch                              | Target                                |
| --------------------------------------------------------- | ------------------------------------- |
| "Find out roughly when you could stop working."           | Under 5 minutes from an empty browser |
| "It's the start of the month. Bring the app up to date."  | Under 3 minutes with demo data        |
| "What would happen if you saved NT$5,000 more a month?"   | Under 1 minute, without help          |
| "In your own words, how sure is the app about that date?" | The answer matches the word on screen |

The monthly update already records its own duration on the device (`recordUpdateTime`).
