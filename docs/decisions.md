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

## Not built yet (P2 / later)

- CSV import from bank and broker exports (POS-8); CSV export is in.
- Transaction-level cash flow (ENG-2 P2) and the reconciliation flag (ENG-6).
- Goal-change history (DST-7).
- Historical backtest (LAB-7) and buy vs. rent (LAB-8).
- Auto-save to a file with the File System Access API, encrypted export, PWA install.
- Traditional Chinese UI.
