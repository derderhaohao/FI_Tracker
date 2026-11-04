import { fireEvent, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { db } from '@/db/db';
import { runMonteCarlo } from '@/domain/montecarlo/runner';
import type { MonteCarloOptions } from '@/domain/montecarlo/runner';
import type { ProjectionInput } from '@/domain/projection';
import { installChartStubs, renderApp, resetDemo } from '@/test/renderApp';

/** Importing a bank's transactions into Cash flow and a statement's balances into Balances. */

vi.setConfig({ testTimeout: 30_000 });

vi.mock('@/lib/mcWorker', async (original) => ({
  ...(await original<typeof import('@/lib/mcWorker')>()),
  monteCarloWorker: () => ({
    run: async (inputs: ProjectionInput[], o: MonteCarloOptions) =>
      inputs.map((i) => runMonteCarlo(i, { ...o, runs: 50 })),
    chances: async () => [],
  }),
}));

beforeAll(() => installChartStubs());
afterAll(() => vi.unstubAllGlobals());
beforeEach(async () => {
  await resetDemo();
  localStorage.clear();
});

// A Taiwan bank export: 民國 dates, separate money-out and money-in columns, a BOM.
const BOM = String.fromCharCode(0xfeff);
const BANK = `${BOM}交易日期,摘要,支出,存入,餘額
115/10/01,薪資轉入,,"89,960","500,000"
115/10/03,全聯福利中心,"1,250",,"498,750"
115/10/05,台電電費,"1,830",,"496,920"
`;

// A credit-card export: one signed column where positive means spending.
const CARD = `Date,Description,Amount
2026-10-02,Coffee,120
2026-10-04,Refund,-300
not a date,Broken,50
`;

const BALANCES = `Date,Account,Balance
2026-10-31,Everyday account,"80,000"
2026-10-31,Emergency fund,"445,000"
2026-10-31,Unknown broker,1
`;

function pick(text: string, name = 'export.csv') {
  fireEvent.change(screen.getByLabelText('CSV file'), {
    target: { files: [new File([text], name, { type: 'text/csv' })] },
  });
}

async function openTransactions() {
  renderApp('/money/cashflow');
  await screen.findByRole('heading', { level: 1, name: 'Cash flow' }, { timeout: 5000 });
  await userEvent.click(screen.getByRole('button', { name: 'Import CSV' }));
  return screen.getByRole('heading', { name: 'Import transactions from CSV' }).closest('div')!.parentElement!;
}

describe('Transaction import (ENG-2)', () => {
  it('reads a Taiwan bank export, imports it, and skips the rows on a second import', async () => {
    const user = userEvent.setup();
    await openTransactions();
    pick(BANK, 'bank.csv');
    // Columns are guessed from the Chinese headers; 民國 115 is 2026.
    expect(await screen.findByText('3 to import')).toBeInTheDocument();
    expect(screen.getByLabelText('Amounts')).toHaveValue('split');
    expect(screen.getByText('2026-10-01')).toBeInTheDocument();
    expect(screen.getByText('薪資轉入')).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Import 3 transactions' }));
    expect(await screen.findByText(/^Imported 3 transactions from bank\.csv\./)).toBeInTheDocument();
    const imported = (await db.cashFlows.toArray()).filter((c) => c.date?.startsWith('2026-10'));
    expect(imported).toHaveLength(3);
    const cats = await db.categories.toArray();
    const kind = (id: string) => cats.find((c) => c.id === id)?.kind;
    const pay = imported.find((c) => c.note === '薪資轉入')!;
    expect(pay).toMatchObject({ amountMinor: 8_996_000, month: '2026-10', lumpSum: false });
    expect(kind(pay.categoryId)).toBe('income');
    expect(kind(imported.find((c) => c.note === '台電電費')!.categoryId)).toBe('expense');

    // The same file again: everything is already there.
    await user.click(screen.getByRole('button', { name: 'Import another file' }));
    pick(BANK, 'bank.csv');
    expect(await screen.findByText('3 already imported')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Import 0 transactions' })).toBeDisabled();
  });

  it('switches to transaction view after an import', async () => {
    const user = userEvent.setup();
    await openTransactions();
    pick(BANK);
    await user.click(await screen.findByRole('button', { name: 'Import 3 transactions' }));
    await user.click(await screen.findByRole('button', { name: 'Switch to transaction view' }));
    await waitFor(async () =>
      expect((await db.settings.get('singleton'))?.cashFlowMode).toBe('transactions'),
    );
  });

  it('handles a signed column, spending as positive, lump sums and bad rows', async () => {
    const user = userEvent.setup();
    await openTransactions();
    pick(CARD, 'card.csv');
    expect(await screen.findByText('1 rows skipped')).toBeInTheDocument();
    expect(screen.getByText(/^Line 4: /)).toBeInTheDocument();
    await user.click(screen.getByLabelText('Positive amounts are spending (credit card)'));
    await user.click(screen.getByLabelText('Tag all as lump sums'));
    await user.click(screen.getByRole('button', { name: 'Import 2 transactions' }));
    await screen.findByText(/^Imported 2 transactions from card\.csv\./);
    const cats = await db.categories.toArray();
    const kind = (id: string) => cats.find((c) => c.id === id)?.kind;
    const rows = (await db.cashFlows.toArray()).filter((c) => c.date?.startsWith('2026-10'));
    expect(rows.every((r) => r.lumpSum)).toBe(true);
    expect(kind(rows.find((r) => r.note === 'Coffee')!.categoryId)).toBe('expense');
    expect(kind(rows.find((r) => r.note === 'Refund')!.categoryId)).toBe('income');
  });

  it('waits for the needed columns, and remembers a mapping for the same layout', async () => {
    const user = userEvent.setup();
    await openTransactions();
    pick('When,What,How much\n2026-10-02,Tea,80\n');
    expect(
      await screen.findByText('Choose the date and amount columns to see a preview.'),
    ).toBeInTheDocument();
    await user.selectOptions(screen.getByLabelText('Date'), '0');
    await user.selectOptions(screen.getByLabelText('Amount'), '2');
    expect(await screen.findByText('1 to import')).toBeInTheDocument();

    // A file with the same headers starts from the saved choice.
    await user.click(screen.getByRole('button', { name: 'Choose another file' }));
    pick('When,What,How much\n2026-10-09,Cake,90\n');
    expect(await screen.findByText('1 to import')).toBeInTheDocument();
  });

  it('reads a file without a header row', async () => {
    const user = userEvent.setup();
    await openTransactions();
    pick('2026-10-02,Tea,-80\n2026-10-03,Lunch,-150\n');
    await user.click(await screen.findByLabelText('First row is a header'));
    await user.selectOptions(screen.getByLabelText('Date'), '0');
    await user.selectOptions(screen.getByLabelText('Amount'), '2');
    expect(await screen.findByText('2 to import')).toBeInTheDocument();
  });

  it('says so when the file is empty, and closes', async () => {
    const user = userEvent.setup();
    await openTransactions();
    pick('');
    expect(await screen.findByText('The file has no rows.')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Close import' }));
    expect(screen.queryByRole('heading', { name: 'Import transactions from CSV' })).not.toBeInTheDocument();
  });
});

describe('Balance import (POS-8)', () => {
  it('matches account names, imports balances and skips unknown accounts', async () => {
    const user = userEvent.setup();
    renderApp('/money/balances');
    await screen.findByRole('heading', { level: 1, name: 'Balances' }, { timeout: 5000 });
    await user.click(screen.getByRole('button', { name: 'Import CSV' }));
    pick(BALANCES, 'statement.csv');
    expect(await screen.findByText('2 balances')).toBeInTheDocument();
    expect(screen.getByText('1 account names skipped')).toBeInTheDocument();

    // Map the unknown name to an account by hand: now three.
    const match = screen.getByRole('heading', { name: 'Match accounts' }).parentElement!;
    const unknown = within(match).getByLabelText('Unknown broker');
    const broker = (await db.accounts.toArray()).find((a) => a.nickname === 'TW ETFs')!;
    await user.selectOptions(unknown, broker.id);
    expect(await screen.findByText('3 balances')).toBeInTheDocument();
    await user.selectOptions(unknown, '');

    await user.click(screen.getByRole('button', { name: 'Import 2 balances' }));
    expect(await screen.findByText(/^Imported 2 balances from statement\.csv\./)).toBeInTheDocument();
    const emergency = (await db.accounts.toArray()).find((a) => a.nickname === 'Emergency fund')!;
    const snap = await db.snapshots.where('[accountId+date]').equals([emergency.id, '2026-10-31']).first();
    expect(snap?.balanceMinor).toBe(44_500_000);

    // Importing again replaces the same month instead of adding a second one.
    await user.click(screen.getByRole('button', { name: 'Import another file' }));
    pick(BALANCES.replace('445,000', '446,000'), 'statement.csv');
    expect(await screen.findByText(/2\s*replace existing/)).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Import 2 balances' }));
    await screen.findByText(/^Imported 2 balances/);
    const again = await db.snapshots.where('[accountId+date]').equals([emergency.id, '2026-10-31']).toArray();
    expect(again).toHaveLength(1);
    expect(again[0].balanceMinor).toBe(44_600_000);
  });
});
