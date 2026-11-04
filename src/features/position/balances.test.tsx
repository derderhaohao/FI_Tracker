import { fireEvent, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { db } from '@/db/db';
import { runMonteCarlo } from '@/domain/montecarlo/runner';
import type { MonteCarloOptions } from '@/domain/montecarlo/runner';
import type { ProjectionInput } from '@/domain/projection';
import { installChartStubs, renderApp, resetDemo } from '@/test/renderApp';

/** Balances: holdings, exchange rates and editing past months, on the demo household. */

vi.setConfig({ testTimeout: 30_000 });

vi.mock('@/lib/mcWorker', async (original) => ({
  ...(await original<typeof import('@/lib/mcWorker')>()),
  monteCarloWorker: () => ({
    run: async (inputs: ProjectionInput[], o: MonteCarloOptions) =>
      inputs.map((i) => runMonteCarlo(i, { ...o, runs: 50 })),
    chances: async () => [],
  }),
}));

const confirmAnswer = { value: true };
beforeAll(() => {
  installChartStubs();
  vi.stubGlobal('confirm', () => confirmAnswer.value);
});
afterAll(() => vi.unstubAllGlobals());
beforeEach(async () => {
  await resetDemo();
  confirmAnswer.value = true;
});

async function balances() {
  renderApp('/money/balances');
  await screen.findByRole('heading', { level: 1, name: 'Balances' }, { timeout: 5000 });
  return screen.getByRole('region', { name: 'Monthly history' });
}

const account = async (nickname: string) =>
  (await db.accounts.toArray()).find((a) => a.nickname === nickname)!;
const latest = '2026-09-30';

describe('Balances: holdings', () => {
  it('adds a holding, uses the total as the balance, and removes it', async () => {
    const user = userEvent.setup();
    const history = await balances();
    const tw = await account('TW ETFs');
    const row = within(history).getByRole('button', { name: 'Details for TW ETFs' }).closest('tr')!;
    await user.click(within(row).getByRole('button', { name: 'Holdings' }));
    expect(screen.getByText(/^Holdings · TW ETFs · /)).toBeInTheDocument();

    const add = screen.getByRole('button', { name: 'Add' });
    expect(add).toBeDisabled();
    await user.type(screen.getByLabelText('Ticker'), '0050');
    await user.type(screen.getByLabelText('Units'), '1000');
    await user.type(screen.getByLabelText('Price'), '180');
    await user.click(add);
    await waitFor(async () =>
      expect((await db.holdings.toArray()).filter((h) => h.accountId === tw.id)).toHaveLength(1),
    );
    expect(await screen.findByText('Holdings total')).toBeInTheDocument();

    // 1,000 × NT$180 replaces the typed balance.
    await user.click(screen.getByRole('button', { name: 'Use as balance' }));
    await waitFor(async () => {
      const snap = await db.snapshots.where('[accountId+date]').equals([tw.id, latest]).first();
      expect(snap?.balanceMinor).toBe(18_000_000);
    });
    await waitFor(() =>
      expect(screen.queryByRole('button', { name: 'Use as balance' })).not.toBeInTheDocument(),
    );

    await user.click(screen.getByRole('button', { name: 'Remove 0050' }));
    await waitFor(async () =>
      expect((await db.holdings.toArray()).some((h) => h.accountId === tw.id)).toBe(false),
    );
    await user.click(screen.getByRole('button', { name: 'Close holdings' }));
    expect(screen.queryByText(/^Holdings · /)).not.toBeInTheDocument();
  });

  it('copies last month’s holdings into a new month, and shows a foreign account in TWD too', async () => {
    const user = userEvent.setup();
    const history = await balances();
    const us = await account('US ETFs');
    fireEvent.change(screen.getByLabelText('Balances as of'), { target: { value: '2026-10-31' } });
    await user.click(screen.getByRole('button', { name: 'Copy last period' }));
    await within(history).findByRole('button', { name: 'Edit 30 Sep 2026' });

    // The new month has no holdings yet: bring September's forward.
    const row = within(history).getByRole('button', { name: 'Details for US ETFs' }).closest('tr')!;
    await user.click(within(row).getByRole('button', { name: 'Holdings' }));
    expect(screen.getByText(/^Holdings · US ETFs · 31 Oct 2026/)).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Copy previous holdings' }));
    await waitFor(async () =>
      expect(
        (await db.holdings.toArray()).filter((h) => h.accountId === us.id && h.date === '2026-10-31'),
      ).toHaveLength(2),
    );
    expect(await screen.findByText('VT')).toBeInTheDocument();
    // Valued in USD, with the TWD equivalent at that month's rate.
    expect(screen.getByText('Holdings total').parentElement).toHaveTextContent(/≈ NT\$/);

    await user.selectOptions(screen.getByLabelText('Holdings date'), latest);
    expect(screen.getByText(/^Holdings · US ETFs · 30 Sep 2026/)).toBeInTheDocument();
  });
});

describe('Balances: exchange rates and past months', () => {
  const usd = async (date: string) =>
    (await db.fxRates.where('[currency+date]').equals(['USD', date]).first())?.twdPerUnit;

  it('changes and clears the latest month’s USD rate', async () => {
    const user = userEvent.setup();
    await balances();
    const rate = screen.getByLabelText('USD/TWD on 30 Sep 2026');
    await user.clear(rate);
    await user.type(rate, '32.75{Enter}');
    await waitFor(async () => expect(await usd(latest)).toBe(32.75));

    // Empty removes the month's own rate; the last one carries forward in its place.
    await user.clear(rate);
    await user.tab();
    await waitFor(async () => expect(await usd(latest)).toBeUndefined());
    await waitFor(() =>
      expect(screen.getByLabelText('USD/TWD on 30 Sep 2026')).toHaveAttribute(
        'placeholder',
        expect.stringMatching(/ \(carried\)$/),
      ),
    );
  });

  it('edits an earlier month after Edit, and deletes a month only when confirmed', async () => {
    const user = userEvent.setup();
    const history = await balances();
    const emergency = await account('Emergency fund');
    expect(within(history).queryByRole('textbox', { name: 'Emergency fund on 31 Aug 2026' })).toBeNull();
    await user.click(within(history).getByRole('button', { name: 'Edit 31 Aug 2026' }));
    const cell = within(history).getByRole('textbox', { name: 'Emergency fund on 31 Aug 2026' });
    await user.clear(cell);
    await user.type(cell, '400,000');
    await user.tab();
    await waitFor(async () => {
      const snap = await db.snapshots.where('[accountId+date]').equals([emergency.id, '2026-08-31']).first();
      expect(snap?.balanceMinor).toBe(40_000_000);
    });

    confirmAnswer.value = false;
    await user.click(within(history).getByRole('button', { name: 'Delete 31 Aug 2026' }));
    expect(await db.snapshots.where('date').equals('2026-08-31').count()).toBeGreaterThan(0);
    confirmAnswer.value = true;
    await user.click(within(history).getByRole('button', { name: 'Delete 31 Aug 2026' }));
    await waitFor(async () => expect(await db.snapshots.where('date').equals('2026-08-31').count()).toBe(0));
    expect(await usd('2026-08-31')).toBeUndefined();
  });

  it('starts a new month from the last one, rates included', async () => {
    const user = userEvent.setup();
    const history = await balances();
    fireEvent.change(screen.getByLabelText('Balances as of'), { target: { value: '2026-10-31' } });
    await user.click(screen.getByRole('button', { name: 'Copy last period' }));
    await waitFor(async () => expect(await db.snapshots.where('date').equals('2026-10-31').count()).toBe(8));
    expect(await usd('2026-10-31')).toBe(await usd(latest));
    expect(await within(history).findByRole('button', { name: 'Edit 30 Sep 2026' })).toBeInTheDocument();
  });
});
