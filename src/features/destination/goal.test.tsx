import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { db } from '@/db/db';
import { runMonteCarlo } from '@/domain/montecarlo/runner';
import type { MonteCarloOptions } from '@/domain/montecarlo/runner';
import type { ProjectionInput } from '@/domain/projection';
import { installChartStubs, renderApp, resetDemo } from '@/test/renderApp';

/**
 * Goal and Reviews: the screens that set what FI means and record decisions against it.
 * Every change here moves the FI number, so each test checks what was saved.
 */

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

const settings = async () => (await db.settings.get('singleton'))!;
const category = async (name: string) => (await db.categories.toArray()).find((c) => c.name === name)!;

async function goal() {
  renderApp('/plan/goal');
  await screen.findByRole('heading', { level: 1, name: 'Goal' }, { timeout: 5000 });
}

describe('Goal: the FI budget', () => {
  it('changes a category’s FI budget and whether it is essential', async () => {
    const user = userEvent.setup();
    await goal();
    const travel = screen.getByLabelText('FI budget for Travel');
    await user.clear(travel);
    await user.type(travel, '120,000');
    await user.tab();
    await waitFor(async () => expect((await category('Travel')).fiAnnualMinor).toBe(12_000_000));

    const row = travel.closest('tr')!;
    await user.click(within(row).getByRole('checkbox', { name: 'Essential' }));
    await waitFor(async () => expect((await category('Travel')).essential).toBe(true));
  });

  it('warns and falls back to the last 12 months when no budget is set', async () => {
    const all = await db.categories.toArray();
    await db.categories.bulkPut(all.map((c) => ({ ...c, fiAnnualMinor: undefined })));
    await goal();
    expect(
      screen.getByText(/^No FI budget yet, so FI spending uses your trailing-12-month spending/),
    ).toBeInTheDocument();
  });

  it('switches the tier, the fat multiplier and the target age', async () => {
    const user = userEvent.setup();
    await goal();
    await user.click(screen.getByRole('radio', { name: 'Lean' }));
    await waitFor(async () => expect((await settings()).destination.fiTier).toBe('lean'));
    expect(await screen.findByText('Your target: Lean FI')).toBeInTheDocument();

    const fat = screen.getByLabelText('Fat multiplier');
    await user.clear(fat);
    await user.type(fat, '2');
    await user.tab();
    await waitFor(async () => expect((await settings()).destination.fatMultiplier).toBe(2));
    // Out of range is ignored.
    await user.clear(fat);
    await user.type(fat, '9');
    await user.tab();
    expect((await settings()).destination.fatMultiplier).toBe(2);

    const age = screen.getByLabelText('Target FI age');
    await user.clear(age);
    await user.type(age, '50');
    await user.tab();
    await waitFor(async () => expect((await settings()).destination.targetFiAge).toBe(50));
    expect(await screen.findByRole('heading', { name: 'Your target age: 50' })).toBeInTheDocument();
  });

  it('adds the costs of leaving work to every tier', async () => {
    const user = userEvent.setup();
    await goal();
    const nhi = screen.getByLabelText('Self-paid NHI premium / month');
    await user.clear(nhi);
    await user.type(nhi, '2,000');
    await user.tab();
    await waitFor(async () => expect((await settings()).destination.nhiMonthlyMinor).toBe(200_000));
    const reserve = screen.getByLabelText('Healthcare reserve / year');
    await user.clear(reserve);
    await user.type(reserve, '30,000');
    await user.tab();
    await waitFor(async () =>
      expect((await settings()).destination.healthcareReserveAnnualMinor).toBe(3_000_000),
    );
  });
});

describe('Goal: guaranteed income', () => {
  it('adds a stream only when it is complete, edits it and deletes it', async () => {
    const user = userEvent.setup();
    await goal();
    const add = screen.getByRole('button', { name: 'Add' });
    expect(add).toBeDisabled();
    await user.type(screen.getByLabelText('Stream name'), 'Rental');
    await user.type(screen.getByLabelText('New start age'), '55');
    await user.type(screen.getByLabelText('New annual amount'), '240,000');
    await user.click(screen.getByLabelText('New stream inflation-linked'));
    expect(add).toBeEnabled();
    // A start age that is not a whole number blocks it.
    await user.type(screen.getByLabelText('New end age'), 'x');
    expect(add).toBeDisabled();
    await user.clear(screen.getByLabelText('New end age'));
    await user.type(screen.getByLabelText('New end age'), '80');
    await user.click(add);
    await waitFor(async () =>
      expect(await db.incomeStreams.toArray()).toEqual([
        expect.objectContaining({
          name: 'Rental',
          startAge: 55,
          endAge: 80,
          annualMinor: 24_000_000,
          inflationLinked: false,
        }),
      ]),
    );
    expect(screen.getByLabelText('Stream name')).toHaveValue('');
    // The FI number now counts it.
    expect(await screen.findByText(/− guaranteed NT\$/)).toBeInTheDocument();

    const amount = await screen.findByLabelText('Annual amount');
    await user.clear(amount);
    await user.type(amount, '300,000');
    await user.tab();
    await waitFor(async () => expect((await db.incomeStreams.toArray())[0].annualMinor).toBe(30_000_000));
    await user.click(screen.getByLabelText('Inflation-linked'));
    await waitFor(async () => expect((await db.incomeStreams.toArray())[0].inflationLinked).toBe(true));

    await user.click(screen.getByRole('button', { name: 'Delete Rental' }));
    await waitFor(async () => expect(await db.incomeStreams.count()).toBe(0));
  });
});

async function reviews() {
  renderApp('/update/reviews');
  await screen.findByRole('heading', { level: 1, name: 'Reviews' }, { timeout: 5000 });
}

describe('Reviews', () => {
  it('saves a quarterly review with its checklist, notes and decisions', async () => {
    const user = userEvent.setup();
    await reviews();
    const before = await db.reviews.count();
    await user.click(screen.getByRole('radio', { name: 'Quarterly' }));
    await user.click(screen.getByLabelText('Check the emergency fund'));
    await user.type(screen.getByLabelText('Notes'), 'Markets fell');
    await user.type(screen.getByLabelText('Decisions'), 'Keep buying{Enter}{Enter}  Rebalance in Q1  ');
    await user.click(screen.getByRole('button', { name: 'Save review' }));
    await waitFor(async () => expect(await db.reviews.count()).toBe(before + 1));
    const saved = (await db.reviews.toArray()).find((r) => r.notes === 'Markets fell')!;
    expect(saved).toMatchObject({
      type: 'quarterly',
      decisions: ['Keep buying', 'Rebalance in Q1'],
      checklist: { emergency: true },
    });
    // A finished review asks for a backup, and the form is cleared.
    await waitFor(() => expect(screen.getByLabelText('Notes')).toHaveValue(''));
    expect((await settings()).backupPrompt).toBe('review');
  });

  it('locks a new plan of record in an annual reset', async () => {
    const user = userEvent.setup();
    await reviews();
    await user.click(screen.getByRole('radio', { name: 'Annual reset' }));
    expect(screen.getByText(/^Current: .*, locked /)).toBeInTheDocument();
    const target = (await db.scenarios.toArray()).find((s) => s.name === 'Save 50%')!;
    await user.selectOptions(screen.getByLabelText('Lock plan of record'), target.id);
    const before = await db.reviews.count();
    await user.click(screen.getByRole('button', { name: 'Save review' }));
    // The plan is locked first, then the review is saved pointing at it.
    await waitFor(async () => expect(await db.reviews.count()).toBe(before + 1));
    expect((await db.scenarios.get(target.id))?.isPlanOfRecord).toBe(true);
    expect((await db.scenarios.toArray()).filter((s) => s.isPlanOfRecord)).toHaveLength(1);
    const saved = await db.reviews.toArray();
    expect(saved.filter((r) => r.type === 'annual' && r.planOfRecordId === target.id)).toHaveLength(1);
    expect(await screen.findByText('Plan of record: Save 50%')).toBeInTheDocument();
  });

  it('compares the plan with what happened, and says so when there is no plan', async () => {
    await reviews();
    expect(screen.getByRole('heading', { name: 'Plan vs. actual' })).toBeInTheDocument();
    expect(screen.getByText(/^Latest \(.*\): actual NT\$.* vs\. plan NT\$/)).toBeInTheDocument();
  });

  it('shows an empty state without a plan of record, and deletes a review only when confirmed', async () => {
    const user = userEvent.setup();
    const all = await db.scenarios.toArray();
    await db.scenarios.bulkPut(all.map((s) => ({ ...s, isPlanOfRecord: false })));
    await reviews();
    expect(await screen.findByText('No plan of record yet')).toBeInTheDocument();
    expect(screen.getByText('Lock one in the Strategy Lab')).toBeInTheDocument();

    const count = await db.reviews.count();
    expect(count).toBeGreaterThan(0);
    const del = screen.getAllByRole('button', { name: /^Delete review / })[0];
    confirmAnswer.value = false;
    await user.click(del);
    expect(await db.reviews.count()).toBe(count);
    confirmAnswer.value = true;
    await user.click(del);
    await waitFor(async () => expect(await db.reviews.count()).toBe(count - 1));
  });
});
