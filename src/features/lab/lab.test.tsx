import { fireEvent, screen, waitFor, within } from '@testing-library/react';
import userEvent, { type UserEvent } from '@testing-library/user-event';
import { db } from '@/db/db';
import { runMonteCarlo } from '@/domain/montecarlo/runner';
import type { MonteCarloOptions } from '@/domain/montecarlo/runner';
import { monteCarloChance, solveLever, type SolveLever } from '@/domain/montecarlo/solve';
import type { ProjectionInput } from '@/domain/projection';
import { referenceChecks } from '@/domain/referenceChecks';
import { useUi } from '@/state/ui';
import { installChartStubs, renderApp, resetDemo } from '@/test/renderApp';

/** The Strategy Lab on the demo household: what-ifs, editing, comparing and buy vs. rent. */

vi.setConfig({ testTimeout: 30_000 });

vi.mock('@/lib/mcWorker', async (original) => ({
  ...(await original<typeof import('@/lib/mcWorker')>()),
  monteCarloWorker: () => ({
    run: async (inputs: ProjectionInput[], o: MonteCarloOptions) =>
      inputs.map((i) => runMonteCarlo(i, { ...o, runs: 50 })),
    chances: async (inputs: ProjectionInput[], o: MonteCarloOptions) =>
      inputs.map((i) => runMonteCarlo(i, { ...o, runs: 50 }).successRate),
    solve: async (
      input: ProjectionInput,
      levers: SolveLever[],
      target: number,
      stop: number,
      o: MonteCarloOptions,
    ) => levers.map((lever) => solveLever(input, lever, target, stop, monteCarloChance({ ...o, runs: 50 }))),
    checks: async (input: ProjectionInput) => referenceChecks(input),
  }),
}));

const confirmAnswer = { value: true };
beforeAll(() => {
  installChartStubs();
  vi.stubGlobal('confirm', () => confirmAnswer.value);
  Element.prototype.scrollIntoView = vi.fn();
});
afterAll(() => vi.unstubAllGlobals());
beforeEach(async () => {
  await resetDemo();
  confirmAnswer.value = true;
  localStorage.clear();
  useUi.setState({ selectedScenarioId: undefined, compare: {}, labView: 'simple', labStarter: 'auto' });
});

async function lab() {
  renderApp('/plan/lab');
  await screen.findByRole('heading', { level: 1, name: 'Strategy Lab' }, { timeout: 5000 });
}

/** On a narrow window (jsdom has no media queries) the Lab's controls sit behind Options. */
async function options(user: UserEvent) {
  await user.click(screen.getByText('Options', { exact: true }));
}

const scenario = async (name: string) => (await db.scenarios.toArray()).find((s) => s.name === name);

describe('Strategy Lab: what-ifs', () => {
  it('creates a what-if from a template and opens it for editing', async () => {
    const user = userEvent.setup();
    await lab();
    const templates = screen.getAllByRole('group', { name: 'What-if templates' })[0];
    await user.click(within(templates).getByRole('button', { name: 'Retire earlier or later' }));
    // The field starts from your numbers today.
    expect(screen.getByLabelText('Stop working at age')).not.toHaveValue('');
    await user.clear(screen.getByLabelText('Stop working at age'));
    await user.type(screen.getByLabelText('Stop working at age'), '47');
    await user.click(screen.getByRole('button', { name: 'Create “Retire at 47”' }));
    await waitFor(async () => expect((await scenario('Retire at 47'))?.overrides.targetFiAge).toBe(47));
    expect(await screen.findByRole('heading', { name: 'Edit: Retire at 47' })).toBeInTheDocument();
  });

  it('makes a blank copy of your plan and deletes a what-if', async () => {
    const user = userEvent.setup();
    await lab();
    const before = await db.scenarios.count();
    await user.click(screen.getByRole('button', { name: 'Make a copy to edit' }));
    await waitFor(async () => expect(await db.scenarios.count()).toBe(before + 1));
    expect(await screen.findByRole('heading', { name: 'Edit: My plan (copy)' })).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Delete Save 50%' }));
    await waitFor(async () => expect(await scenario('Save 50%')).toBeUndefined());
  });

  it('keeps a what-if when deleting is cancelled, and ticks scenarios in and out of Compare', async () => {
    const user = userEvent.setup();
    confirmAnswer.value = false;
    await lab();
    await user.click(screen.getByRole('button', { name: 'Delete Save 50%' }));
    expect(await scenario('Save 50%')).toBeDefined();
    const box = screen.getByRole('checkbox', { name: 'Compare Save 50%' });
    const was = (box as HTMLInputElement).checked;
    await user.click(box);
    expect((box as HTMLInputElement).checked).toBe(!was);
  });

  it('shows the starter guide on request and dismisses it', async () => {
    const user = userEvent.setup();
    await lab();
    await options(user);
    await user.click(screen.getByRole('button', { name: 'How this works' }));
    const guide = await screen.findByLabelText('How Strategy Lab works');
    expect(within(guide).getByText('Your plan today')).toBeInTheDocument();
    await user.click(within(guide).getByRole('button', { name: 'Dismiss the starter guide' }));
    expect(screen.queryByLabelText('How Strategy Lab works')).not.toBeInTheDocument();
    expect(useUi.getState().labStarter).toBe('dismissed');
  });

  it('adds the simulation controls under More options', async () => {
    const user = userEvent.setup();
    await lab();
    expect(screen.queryByLabelText('Monte Carlo runs')).not.toBeInTheDocument();
    await options(user);
    await user.click(screen.getByRole('button', { name: 'More options' }));
    await user.selectOptions(screen.getByLabelText('Monte Carlo runs'), '2000');
    expect(useUi.getState().mcRuns).toBe(2000);
    fireEvent.change(screen.getByLabelText('Comparison seed'), { target: { value: '7' } });
    expect(useUi.getState().mcSeed).toBe(7);
    expect(screen.getByRole('button', { name: /^(Rerun|Running…)$/ })).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Fewer options' }));
    expect(screen.queryByLabelText('Monte Carlo runs')).not.toBeInTheDocument();
  });

  it('jumps to a section from the phone picker', async () => {
    const user = userEvent.setup();
    await lab();
    await user.selectOptions(screen.getByLabelText('Strategy Lab section'), 'lab-past');
    expect(Element.prototype.scrollIntoView).toHaveBeenCalled();
  });
});

async function editSave50(user: UserEvent) {
  await lab();
  await user.click(screen.getByRole('button', { name: 'Save 50%' }));
  return screen.findByRole('heading', { name: 'Edit: Save 50%' });
}

describe('Strategy Lab: editing a what-if', () => {
  it('renames it, changes the withdrawal rule and sets it as my plan', async () => {
    const user = userEvent.setup();
    await editSave50(user);
    const name = screen.getByLabelText('Name');
    await user.clear(name);
    await user.type(name, 'Save half');
    await user.tab();
    await waitFor(async () => expect(await scenario('Save half')).toBeDefined());

    // The withdrawal rule is one of the More options (UX doc, P2).
    expect(screen.queryByLabelText('Rule')).not.toBeInTheDocument();
    await options(user);
    await user.click(screen.getByRole('button', { name: 'More options' }));
    await user.selectOptions(screen.getByLabelText('Rule'), 'guardrails');
    await waitFor(async () => expect((await scenario('Save half'))?.withdrawalRule.kind).toBe('guardrails'));
    expect(await screen.findByLabelText('Guardrail band')).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Set as my plan' }));
    await waitFor(async () => expect((await scenario('Save half'))?.isPlanOfRecord).toBe(true));
    expect((await scenario('Save half'))?.lockedAt).toBeDefined();
    // Only one plan of record at a time.
    expect((await db.scenarios.toArray()).filter((s) => s.isPlanOfRecord)).toHaveLength(1);
  });

  it('adds and removes a one-off event', async () => {
    const user = userEvent.setup();
    await editSave50(user);
    const row = screen.getByLabelText('Event date').closest('tr')!;
    const add = within(row).getByRole('button', { name: 'Add' });
    expect(add).toBeDisabled();
    fireEvent.change(screen.getByLabelText('Event date'), { target: { value: '2030-06-01' } });
    await user.type(screen.getByLabelText('Event description'), 'Wedding');
    await user.type(screen.getByLabelText('Event amount'), '-500,000');
    await user.click(add);
    await waitFor(async () =>
      expect((await scenario('Save 50%'))?.events).toEqual([
        { date: '2030-06-01', amountMinor: -50_000_000, description: 'Wedding' },
      ]),
    );
    await user.click(await screen.findByRole('button', { name: 'Remove event' }));
    await waitFor(async () => expect((await scenario('Save 50%'))?.events).toEqual([]));
  });

  it('changes a lever and saves it', async () => {
    const user = userEvent.setup();
    await editSave50(user);
    const age = screen.getByLabelText('Stop working at age');
    await user.clear(age);
    await user.type(age, '52');
    await user.tab();
    await waitFor(async () => expect((await scenario('Save 50%'))?.overrides.targetFiAge).toBe(52));
  });
});

describe('Strategy Lab: what would make it safer', () => {
  it('finds what it takes to reach a target chance, and saves one as a what-if', async () => {
    const user = userEvent.setup();
    await lab();
    const card = screen.getByLabelText('What would make it safer');
    await user.click(within(card).getByRole('button', { name: 'Find out' }));
    expect(
      await within(card).findByText(/^To reach \d+%, any one of these on its own:$/, {}, { timeout: 20_000 }),
    ).toBeInTheDocument();
    const before = await db.scenarios.count();
    const save = within(card).queryAllByRole('button', { name: 'Save as scenario' });
    if (save.length) {
      await user.click(save[0]);
      await waitFor(async () => expect(await db.scenarios.count()).toBe(before + 1));
    }
    // Each one-change line can be kept as a what-if too.
    await user.click(within(card).getAllByRole('button', { name: 'Save' })[0]);
    await waitFor(async () => expect(await db.scenarios.count()).toBeGreaterThan(before));
  });
});

describe('Strategy Lab: assumptions and checks', () => {
  it('lists the assumptions and runs the reference tests when opened', async () => {
    await lab();
    const summary = screen.getByText('Assumptions and checks');
    const details = summary.closest('details')!;
    details.open = true;
    fireEvent(details, new Event('toggle'));
    expect(within(details).getByRole('columnheader', { name: 'Typical return' })).toBeInTheDocument();
    expect(within(details).getByText('Simulated futures')).toBeInTheDocument();
    expect(within(details).getByRole('heading', { name: 'Reference tests' })).toBeInTheDocument();
    // The checks run in the worker and come back as a list.
    await waitFor(() => expect(within(details).queryByText('Running…')).not.toBeInTheDocument(), {
      timeout: 10_000,
    });
    expect(within(details).queryByText(/^Checks failed to run/)).not.toBeInTheDocument();
  });
});

describe('Strategy Lab: buy vs. rent', () => {
  it('compares buying with renting and turns it into a what-if', async () => {
    const user = userEvent.setup();
    await lab();
    await options(user);
    await user.click(screen.getByRole('radio', { name: 'Buy vs. rent' }));
    expect(await screen.findByRole('heading', { name: 'Inputs' })).toBeInTheDocument();
    expect(screen.getByText('Break-even')).toBeInTheDocument();
    const price = screen.getByLabelText('Home price');
    await user.clear(price);
    await user.type(price, '20,000,000');
    await user.tab();
    const before = await db.scenarios.count();
    await user.click(screen.getByRole('button', { name: 'Create scenario' }));
    await waitFor(async () => expect(await db.scenarios.count()).toBe(before + 1));
    const created = (await db.scenarios.toArray()).find((s) => /^Buy a /.test(s.name))!;
    expect(created.events.length).toBeGreaterThan(0);
    expect(created.events[0].amountMinor).toBeLessThan(0);
    await user.click(screen.getByRole('button', { name: 'Reset to defaults' }));
  });
});
