import { fireEvent, screen, waitFor, within } from '@testing-library/react';
import userEvent, { type UserEvent } from '@testing-library/user-event';
import { db } from '@/db/db';
import { patch } from '@/db/repo';
import { runMonteCarlo } from '@/domain/montecarlo/runner';
import type { MonteCarloOptions } from '@/domain/montecarlo/runner';
import type { ProjectionInput } from '@/domain/projection';
import { useAutosave } from '@/lib/autosave';
import { useUi } from '@/state/ui';
import { appState, installChartStubs, renderApp, resetDemo, walkUpdateToFlows } from '@/test/renderApp';

/**
 * The UX redesign's behaviour beyond the page smoke tests (docs/ux-improvement-plan.md): one
 * banner and the right Next step on Home, the monthly update's edge cases, Balances and the
 * account drawer, Cash flow read-first editing, the plan tabs and the money setting.
 */

vi.setConfig({ testTimeout: 20_000 });

// jsdom has no Web Workers: run the simulations in the test thread, with fewer runs.
vi.mock('@/lib/mcWorker', async (original) => ({
  ...(await original<typeof import('@/lib/mcWorker')>()),
  monteCarloWorker: () => ({
    run: async (inputs: ProjectionInput[], o: MonteCarloOptions) =>
      inputs.map((i) => runMonteCarlo(i, { ...o, runs: 50 })),
    chances: async (inputs: ProjectionInput[], o: MonteCarloOptions) =>
      inputs.map((i) => runMonteCarlo(i, { ...o, runs: 50 }).successRate),
  }),
}));

beforeAll(() => installChartStubs());
afterAll(() => vi.unstubAllGlobals());
beforeEach(async () => {
  await resetDemo();
});
afterEach(() => {
  vi.useRealTimers();
});

/** Freezes the calendar only, so IndexedDB and promises keep running. */
function today(date: string) {
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(new Date(`${date}T09:00:00`));
}

const settings = (changes: Parameters<typeof patch<never, never>>[2] | Record<string, unknown>) =>
  patch(db.settings, 'singleton', changes as never);

async function home() {
  renderApp('/');
  return screen.findByRole('region', { name: 'Next step' }, { timeout: 5000 });
}

describe('Home (UX doc, D1 and A1)', () => {
  it('asks for the monthly update once a month-end has passed without one', async () => {
    // The demo's latest balances are on 30 Sep 2026.
    today('2026-11-04');
    const step = await home();
    expect(within(step).getByRole('heading', { name: 'Oct 2026 update due' })).toBeInTheDocument();
    expect(within(step).getByRole('link', { name: /Start the update/ })).toHaveAttribute('href', '/update');
  });

  it('then a backup, the real 勞保 figures, else a what-if', async () => {
    today('2026-10-05');
    await settings({ backupPrompt: 'setup', pensionEstimated: true });
    let step = await home();
    expect(within(step).getByRole('heading', { name: 'Save a backup' })).toBeInTheDocument();

    await settings({ backupPrompt: undefined, lastBackupAt: '2026-10-04T10:00:00.000Z' });
    await waitFor(() =>
      expect(
        within(screen.getByRole('region', { name: 'Next step' })).getByRole('heading', {
          name: 'Add your 勞保 details to sharpen the date',
        }),
      ).toBeInTheDocument(),
    );

    await settings({ pensionEstimated: undefined });
    step = await screen.findByRole('region', { name: 'Next step' });
    await waitFor(() =>
      expect(within(step).getByRole('heading', { name: 'Try a what-if' })).toBeInTheDocument(),
    );
    expect(within(step).getByRole('link', { name: /Open My plan/ })).toHaveAttribute('href', '/plan');
  });

  it('shows at most one banner, and the mix as one line once it drifts (A1, T3)', async () => {
    // Raise every threshold: low savings, a thin emergency fund and a drifted mix all apply.
    const s = await db.settings.get('singleton');
    await settings({
      alerts: { ...s!.alerts, targetSavingsRate: 0.99, emergencyFundMonths: 1000 },
      targetAllocation: { cash: 1 },
    });
    await home();
    expect(screen.getAllByRole('alert')).toHaveLength(1);
    expect(screen.getByText(/^Your mix is \d+ points off target\.$/)).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Review' })).toHaveAttribute('href', '/money/mix');
  });

  it('says the line starts here with one month of balances', async () => {
    const latest = (await db.snapshots.orderBy('date').last())!.date;
    await db.snapshots.filter((x) => x.date !== latest).delete();
    await home();
    expect(
      screen.getByText('Your line starts here. Do next month’s update to see it grow.'),
    ).toBeInTheDocument();
    expect(screen.getByText('First month')).toBeInTheDocument();
  });

  it('switches the chart between total and investments', async () => {
    await home();
    const chart = screen.getByRole('radiogroup', { name: 'Show' });
    expect(within(chart).getByRole('radio', { name: 'Total' })).toHaveAttribute('aria-checked', 'true');
    await userEvent.click(within(chart).getByRole('radio', { name: 'Investments' }));
    expect(within(chart).getByRole('radio', { name: 'Investments' })).toHaveAttribute('aria-checked', 'true');
    expect(screen.getByRole('figure', { name: 'Net worth over time' })).toBeInTheDocument();
  });

  it('stops asking for 勞保 figures once they are edited in Settings (O2)', async () => {
    await settings({ pensionEstimated: true });
    renderApp('/settings/taiwan');
    const field = await screen.findByLabelText('Insured years to date', {}, { timeout: 5000 });
    fireEvent.change(field, { target: { value: '12' } });
    fireEvent.blur(field);
    await waitFor(async () => expect((await db.settings.get('singleton'))?.pensionEstimated).toBeUndefined());
  });

  it('shows the auto-save banner only when auto-save has stopped', async () => {
    await home();
    expect(screen.queryByText(/Auto-save/)).not.toBeInTheDocument();
    useAutosave.setState({ status: 'needs-permission', fileName: 'plan.fi.json' });
    expect(
      await screen.findByText('Auto-save to plan.fi.json is paused until you allow it again.'),
    ).toBeInTheDocument();
    useAutosave.setState({ status: 'error', error: 'disk full' });
    expect(
      await screen.findByText('Auto-save failed: disk full. Export a backup manually.'),
    ).toBeInTheDocument();
    useAutosave.setState({ status: 'off', error: undefined, fileName: undefined });
  });
});

/** Opens the monthly update and walks it to the pay-and-spending card. */
async function toFlows(user: UserEvent, date: string) {
  renderApp('/update');
  await screen.findByRole('heading', { level: 1, name: 'Monthly update' }, { timeout: 5000 });
  await walkUpdateToFlows(user, date);
}

describe('Monthly update edge cases (UX doc, M1)', () => {
  it('leaves a month that already has entries alone', async () => {
    const user = userEvent.setup();
    const before = (await db.cashFlows.toArray()).length;
    await toFlows(user, '2026-09-30');
    expect(
      screen.getByText(/^Already entered for Sep 2026: pay .*, spending .*\. Change them in Cash flow\.$/),
    ).toBeInTheDocument();
    expect(screen.queryByLabelText('Take-home pay (TWD)')).not.toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Next' }));
    await user.click(screen.getByRole('button', { name: 'Save and see the recap' }));
    await screen.findByText('Saved this month', {}, { timeout: 5000 });
    expect(await db.cashFlows.count()).toBe(before);
    // September is a quarter end: the recap asks for the quarterly check, not the year-end one.
    expect(screen.getByText(/^Quarter end: your mix is \d+ points off target/)).toBeInTheDocument();
    expect(screen.queryByText(/^Year end:/)).not.toBeInTheDocument();
  });

  it('points to Cash flow when the household records transactions', async () => {
    const user = userEvent.setup();
    await settings({ cashFlowMode: 'transactions' });
    const before = await db.cashFlows.count();
    await toFlows(user, '2026-10-31');
    expect(screen.getByText(/You record individual transactions/)).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Next' }));
    await user.click(screen.getByRole('button', { name: 'Save and see the recap' }));
    await screen.findByText('Saved this month', {}, { timeout: 5000 });
    expect(await db.cashFlows.count()).toBe(before);
  });

  it('saves a one-off in the category chosen, as a lump sum', async () => {
    const user = userEvent.setup();
    await toFlows(user, '2026-10-31');
    await user.click(screen.getByRole('button', { name: 'Add a bonus or one-off' }));
    const expense = appState().data.categories.find((c) => c.kind === 'expense' && !c.system)!;
    await user.selectOptions(screen.getByLabelText('One-off'), expense.id);
    await user.type(screen.getByLabelText('Amount (TWD)'), '30000');
    await user.tab();
    await user.click(screen.getByRole('button', { name: 'Next' }));
    await user.click(screen.getByRole('button', { name: 'Save and see the recap' }));
    await screen.findByText('Saved this month', {}, { timeout: 5000 });
    const lump = (await db.cashFlows.toArray()).filter((f) => f.month === '2026-10' && f.lumpSum);
    expect(lump).toHaveLength(1);
    expect(lump[0]).toMatchObject({ categoryId: expense.id, amountMinor: 3_000_000 });
    // A one-off can also be removed before saving: covered by its own button.
  });
});

describe('Balances and account details (UX doc, M2)', () => {
  it('shows loan terms, archives and restores an account', async () => {
    const user = userEvent.setup();
    renderApp('/money/balances');
    await screen.findByRole('heading', { level: 1, name: 'Balances' }, { timeout: 5000 });
    expect(screen.getByText(/12,500\/mo · \d+ mo · in Loan repayment/)).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Emergency fund' }));
    const drawer = screen.getByRole('dialog', { name: 'Edit Emergency fund' });
    await user.click(within(drawer).getByRole('button', { name: 'Archive Emergency fund' }));
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
    const archived = await screen.findByText('Archived accounts (1)');
    await user.click(archived);
    await user.click(within(archived.closest('details')!).getByRole('button', { name: 'Emergency fund' }));
    await user.click(
      within(screen.getByRole('dialog', { name: 'Edit Emergency fund' })).getByRole('button', {
        name: 'Restore Emergency fund',
      }),
    );
    await waitFor(() => expect(screen.queryByText(/^Archived accounts/)).not.toBeInTheDocument());
  });

  it('opens a new account from the history and deletes it while it has no balance', async () => {
    const user = userEvent.setup();
    vi.stubGlobal('confirm', () => true);
    renderApp('/money/balances');
    await screen.findByRole('heading', { level: 1, name: 'Balances' }, { timeout: 5000 });
    await user.click(screen.getByRole('button', { name: 'Add account' }));
    const form = screen.getByRole('dialog', { name: 'New account' });
    await user.type(within(form).getByLabelText('Nickname'), 'Travel fund');
    await user.click(within(form).getByRole('button', { name: 'Add account' }));
    await user.click(await screen.findByRole('button', { name: 'Details for Travel fund' }));
    const drawer = screen.getByRole('dialog', { name: 'Edit Travel fund' });
    await user.click(within(drawer).getByRole('button', { name: 'Delete Travel fund' }));
    await waitFor(async () =>
      expect((await db.accounts.toArray()).some((a) => a.nickname === 'Travel fund')).toBe(false),
    );
    vi.stubGlobal('confirm', () => false);
  });

  it('explains what changed as bars, with the numbers behind a click', async () => {
    const user = userEvent.setup();
    renderApp('/money/balances');
    await screen.findByRole('heading', { name: 'What changed' }, { timeout: 5000 });
    expect(
      screen.getAllByLabelText(/^\w{3} \d{4}: .*, saved .*, markets .*, exchange rate .*/).length,
    ).toBeGreaterThan(1);
    const numbers = screen.getByText('Show numbers');
    expect(screen.getByRole('columnheader', { name: 'Market return', hidden: true })).not.toBeVisible();
    await user.click(numbers);
    expect(screen.getByRole('columnheader', { name: 'Market return' })).toBeVisible();
  });

  it('will not copy into a month that already exists', async () => {
    const user = userEvent.setup();
    const alert = vi.fn();
    vi.stubGlobal('alert', alert);
    renderApp('/money/balances');
    await screen.findByRole('heading', { level: 1, name: 'Balances' }, { timeout: 5000 });
    fireEvent.change(screen.getByLabelText('Balances as of'), { target: { value: '2026-09-30' } });
    await user.click(screen.getByRole('button', { name: 'Copy last period' }));
    expect(alert).toHaveBeenCalledWith('There is already a month on 30 Sep 2026. Edit it in the table.');
  });
});

describe('Cash flow reads first (UX doc, M2)', () => {
  it('shows three months on a wide screen and edits an earlier one after Edit', async () => {
    const user = userEvent.setup();
    vi.stubGlobal('matchMedia', (q: string) => ({
      matches: q.includes('min-width'),
      media: q,
      addEventListener: () => {},
      removeEventListener: () => {},
    }));
    renderApp('/money/cashflow');
    await screen.findByRole('heading', { level: 1, name: 'Cash flow' }, { timeout: 5000 });
    expect(screen.getAllByRole('button', { name: /^Edit \w{3} \d{4}$/ })).toHaveLength(2);
    await user.click(screen.getByRole('button', { name: 'Expenses' }));
    expect(screen.queryByLabelText('Housing 2026-08', { exact: true })).not.toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Edit Aug 2026' }));
    expect(screen.getByLabelText('Housing 2026-08', { exact: true })).toBeInTheDocument();
    expect(screen.getByLabelText('Housing 2026-09', { exact: true })).toBeInTheDocument();
    vi.stubGlobal('matchMedia', undefined);
  });

  it('shows one month on a phone, and transactions without a button', async () => {
    await settings({ cashFlowMode: 'transactions' });
    renderApp('/money/cashflow');
    await screen.findByRole('heading', { level: 1, name: 'Cash flow' }, { timeout: 5000 });
    expect(screen.queryAllByRole('button', { name: /^Edit \w{3} \d{4}$/ })).toHaveLength(0);
    expect(screen.getByRole('heading', { name: /^Transactions · / })).toBeInTheDocument();
  });
});

describe('My plan tabs (UX doc, P2)', () => {
  it('keeps a safer idea as a what-if and opens Compare', async () => {
    const user = userEvent.setup();
    renderApp('/plan/sure');
    await screen.findByRole('heading', { level: 1, name: 'How sure is this?' }, { timeout: 5000 });
    const count = await db.scenarios.count();
    await user.click(screen.getAllByRole('button', { name: 'Save' })[0]);
    expect(
      await screen.findByRole('heading', { level: 1, name: 'Strategy Lab' }, { timeout: 5000 }),
    ).toBeInTheDocument();
    expect(await db.scenarios.count()).toBe(count + 1);
    expect(appState().path).toBe('/plan/lab');
  });

  it('lists your plan once in Compare, not again as an unchanged copy', async () => {
    renderApp('/plan/lab');
    await screen.findByRole('heading', { level: 1, name: 'Strategy Lab' }, { timeout: 5000 });
    expect(appState().data.scenarios.some((s) => s.name === 'Baseline')).toBe(true);
    expect(screen.queryByRole('checkbox', { name: 'Compare Baseline' })).not.toBeInTheDocument();
    expect(screen.getByRole('checkbox', { name: 'Compare Save 50%' })).toBeInTheDocument();
  });

  it('shows one target on Goal, with Lean and Fat as alternatives', async () => {
    renderApp('/plan/goal');
    await screen.findByRole('heading', { level: 1, name: 'Goal' }, { timeout: 5000 });
    expect(screen.getByText('Your target: Full FI')).toBeInTheDocument();
    expect(screen.getByText(/Lean FI NT\$.* · Fat FI NT\$/)).toBeInTheDocument();
  });

  it('sets today’s or future money once, in Settings', async () => {
    const user = userEvent.setup();
    renderApp('/settings/general');
    await screen.findByRole('heading', { level: 1, name: 'Settings' }, { timeout: 5000 });
    await user.click(screen.getByRole('radio', { name: 'Future money' }));
    expect(useUi.getState().valueMode).toBe('nominal');
    expect(localStorage.getItem('fi-tracker-value-mode')).toBe('nominal');
    useUi.getState().setValueMode('real');
  });
});
