import { useEffect } from 'react';
import { fireEvent, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Routes } from 'react-router-dom';
import { ensureDefaults } from '@/db/defaults';
import { importBackup } from '@/io/backup';
import { buildDemoBackup } from '@/io/demo';
import { runMonteCarlo } from '@/domain/montecarlo/runner';
import type { ProjectionInput } from '@/domain/projection';
import type { MonteCarloOptions } from '@/domain/montecarlo/runner';
import { DataProvider, useAppData } from './data';
import { PlanHealthProvider } from './planHealth';
import { proRoutes } from './proRoutes';
import { formatMoney } from '@/domain/money';

// Whole screens with many clicks: allow for slower CI runners under coverage.
vi.setConfig({ testTimeout: 20_000 });

// jsdom has no Web Workers: run the plan-health Monte Carlo in the test thread, with fewer runs.
vi.mock('@/lib/mcWorker', async (original) => ({
  ...(await original<typeof import('@/lib/mcWorker')>()),
  monteCarloWorker: () => ({
    run: async (inputs: ProjectionInput[], o: MonteCarloOptions) =>
      inputs.map((i) => runMonteCarlo(i, { ...o, runs: 50 })),
  }),
}));

// Charts measure their box; jsdom has no layout, so give them one.
class FakeResizeObserver {
  constructor(private cb: ResizeObserverCallback) {}
  observe(el: Element) {
    this.cb([{ target: el, contentRect: { width: 800, height: 300 } } as ResizeObserverEntry], this);
  }
  unobserve() {}
  disconnect() {}
}

let seen: ReturnType<typeof useAppData> | undefined;
/** Hands the app data to the test, after each render. */
function Spy() {
  const data = useAppData();
  useEffect(() => {
    seen = data;
  });
  return null;
}

function renderPage(path: string) {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <DataProvider fallback={<p>Loading</p>}>
        <PlanHealthProvider>
          <Spy />
          <Routes>{proRoutes(<p>Loading</p>)}</Routes>
        </PlanHealthProvider>
      </DataProvider>
    </MemoryRouter>,
  );
}

beforeAll(async () => {
  vi.stubGlobal('ResizeObserver', FakeResizeObserver);
  vi.stubGlobal('scrollTo', () => {});
  await ensureDefaults();
  await importBackup(buildDemoBackup());
});

afterAll(() => vi.unstubAllGlobals());

describe('Pro pages with the demo plan', () => {
  it.each([
    ['/', 'Home'],
    ['/money/balances', 'Balances'],
    ['/money/cashflow', 'Cash flow'],
    ['/money/mix', 'Portfolio mix'],
    ['/plan/goal', 'Goal'],
    ['/plan', 'My plan'],
    ['/plan/projection', 'Year by year'],
    ['/plan/lab', 'Strategy Lab'],
    ['/plan/sure', 'How sure is this?'],
    ['/update/reviews', 'Reviews'],
    ['/settings', 'Settings'],
    ['/update', 'Monthly update'],
    // Old addresses redirect to the tab that holds the same content (N1).
    ['/accounts', 'Balances'],
    ['/snapshots', 'Balances'],
    ['/goal', 'Goal'],
    ['/reviews', 'Reviews'],
  ])('%s opens with its heading and the five-item menu', async (path, heading) => {
    renderPage(path);
    expect(
      await screen.findByRole('heading', { level: 1, name: heading }, { timeout: 5000 }),
    ).toBeInTheDocument();
    const menu = screen.getAllByRole('navigation', { name: 'Main' })[0];
    expect(
      within(menu)
        .getAllByRole('link')
        .map((l) => l.textContent),
    ).toEqual(['Home', 'Update', 'My money', 'My plan', 'Settings']);
  });

  it.each([
    ['general', 'General'],
    ['mode', 'Beginner / Pro'],
    ['tools', 'Tools'],
    ['assumptions', 'Assumptions'],
    ['taiwan', 'Taiwan rules'],
    ['categories', 'Categories'],
    ['backup', 'Backup'],
    ['reminder', 'Reminder'],
    ['danger', 'Danger zone'],
  ])('Settings opens its %s section by address', async (section, heading) => {
    renderPage(`/settings/${section}`);
    await screen.findByRole('heading', { level: 1, name: 'Settings' }, { timeout: 5000 });
    const nav = screen.getByRole('navigation', { name: 'Settings sections' });
    expect(within(nav).getByRole('link', { name: heading })).toHaveAttribute('aria-current', 'true');
    expect(screen.getAllByRole('heading', { level: 2 }).length).toBeGreaterThan(0);
  });

  it('runs the whole monthly update, pay and spending included, to a recap (M1)', async () => {
    const user = userEvent.setup();
    renderPage('/update');
    await screen.findByRole('heading', { level: 1, name: 'Monthly update' }, { timeout: 5000 });
    fireEvent.change(screen.getByLabelText('Balances as of'), { target: { value: '2026-10-31' } });
    await user.click(screen.getByRole('button', { name: 'Start' }));
    for (let i = 0; i < 30; i++) {
      const same = screen.queryByRole('button', { name: 'Same as last month' });
      if (same) {
        await user.click(same);
        continue;
      }
      const correct = screen.queryByRole('button', { name: 'All correct' });
      if (correct) {
        await user.click(correct);
        continue;
      }
      if (screen.queryByRole('heading', { name: /^Pay and spending in / })) break;
      await user.click(screen.getByRole('button', { name: 'Next' }));
    }
    expect(screen.getByLabelText('Take-home pay (TWD)')).not.toHaveValue('');
    await user.click(screen.getByRole('button', { name: 'Add a bonus or one-off' }));
    await user.type(screen.getByLabelText('Amount (TWD)'), '10000');
    await user.tab();
    await user.click(screen.getByRole('button', { name: 'Next' }));
    await user.click(screen.getByRole('button', { name: 'Save and see the recap' }));
    expect(
      await screen.findByRole('heading', { name: /^Saved \d+ balances for 31 Oct 2026$/ }, { timeout: 5000 }),
    ).toBeInTheDocument();
    expect(screen.getByText('Saved this month')).toBeInTheDocument();
    await user.type(screen.getByLabelText('Note for future you (optional)'), 'Raise next month');
    await user.click(screen.getByRole('button', { name: 'Save note' }));
    expect(await screen.findByRole('button', { name: 'Note saved' })).toBeInTheDocument();
    expect(seen!.cashFlows.some((c) => c.month === '2026-10' && c.lumpSum)).toBe(true);
    expect(seen!.reviews.some((r) => r.date === '2026-10-31' && r.notes === 'Raise next month')).toBe(true);
  });

  it('previews a change on My plan live and saves it as a what-if (P1)', async () => {
    renderPage('/plan');
    await screen.findByRole('heading', { level: 1, name: 'My plan' }, { timeout: 5000 });
    expect(screen.getByRole('figure', { name: 'Investments against money needed' })).toBeInTheDocument();
    const sentence = () =>
      screen.getByText(/^(Investments meet|Stop work at \d|At this pace)/, { selector: 'p' }).textContent;
    const before = sentence();
    expect(screen.getByRole('button', { name: 'Save as a what-if' })).toBeDisabled();
    const sliders = within(screen.getByRole('group', { name: 'What if' })).getAllByRole('slider');
    expect(sliders).toHaveLength(3);
    fireEvent.change(sliders[1], { target: { value: Number(sliders[1].getAttribute('max')) } });
    expect(sentence()).not.toBe(before);
    expect(screen.getByText('what-if')).toBeInTheDocument();
    fireEvent.change(sliders[0], { target: { value: 45 } });
    expect(sentence()).toMatch(/^Stop work at 45 /);
    const count = seen!.scenarios.length;
    await userEvent.click(screen.getByRole('button', { name: 'Save as a what-if' }));
    expect(
      await screen.findByRole('heading', { level: 1, name: 'Strategy Lab' }, { timeout: 5000 }),
    ).toBeInTheDocument();
    expect(seen!.scenarios).toHaveLength(count + 1);
    const saved = seen!.scenarios.find((x) => x.name.startsWith('Stop at 45'));
    expect(saved?.overrides.targetFiAge).toBe(45);
    expect(saved?.overrides.currentSpendingMinor).toBeDefined();
  });

  it('shows how sure the plan is, with safer ideas in money (P2)', async () => {
    renderPage('/plan/sure');
    await screen.findByRole('heading', { level: 1, name: 'How sure is this?' }, { timeout: 5000 });
    const health = screen.getByRole('region', { name: 'Plan health' });
    expect(
      await within(health).findByText(/^(Likely|Fairly likely|Uncertain)$/, {}, { timeout: 5000 }),
    ).toBeInTheDocument();
  });

  it('marks the menu item and tab for the page in view', async () => {
    renderPage('/money/cashflow');
    await screen.findByRole('heading', { level: 1, name: 'Cash flow' }, { timeout: 5000 });
    const menu = screen.getAllByRole('navigation', { name: 'Main' })[0];
    expect(within(menu).getByRole('link', { name: 'My money' })).toHaveAttribute('aria-current', 'page');
    const tabs = screen.getByRole('navigation', { name: 'My money sections' });
    expect(within(tabs).getByRole('link', { name: 'Cash flow' })).toHaveAttribute('aria-current', 'page');
    expect(within(tabs).getByRole('link', { name: 'Balances' })).not.toHaveAttribute('aria-current');
  });

  it('leads Home with progress, one certainty word and one next step (D1)', async () => {
    renderPage('/');
    const hero = await screen.findByRole('region', { name: 'Your progress' }, { timeout: 5000 });
    expect(within(hero).getByText(/^You’re \d+% of the way to financial independence$/)).toBeInTheDocument();
    expect(within(hero).getByRole('progressbar')).toBeInTheDocument();
    expect(
      await within(hero).findByText(/^(Likely|Fairly likely|Uncertain)$/, {}, { timeout: 5000 }),
    ).toBeInTheDocument();
    expect(within(hero).getByRole('link', { name: 'How sure is this?' })).toHaveAttribute(
      'href',
      '/plan/sure',
    );
    expect(screen.getAllByRole('region', { name: 'Next step' })).toHaveLength(1);
    // Allocation and currency moved to My money.
    expect(screen.queryByRole('heading', { name: 'Allocation' })).not.toBeInTheDocument();
  });

  it('shows the plan health on the projection once the simulated futures are in', async () => {
    renderPage('/plan/projection');
    const health = await screen.findByRole('region', { name: 'Plan health' }, { timeout: 5000 });
    expect(
      await within(health).findByText(/^(Likely|Fairly likely|Uncertain)$/, {}, { timeout: 5000 }),
    ).toBeInTheDocument();
  });

  it('shows the FI number the calculations give', async () => {
    renderPage('/plan/goal');
    await screen.findByRole('heading', { level: 1, name: 'Goal' }, { timeout: 5000 });
    expect(seen).toBeDefined();
    const fi = seen!.fiNumberNow;
    expect(fi).toBeGreaterThan(0);
    // The number on screen is the domain's (S − G) ÷ SWR, compact or in full.
    const shown = [formatMoney(fi, 'TWD'), formatMoney(fi, 'TWD', { compact: true })];
    expect(shown.some((s) => screen.queryAllByText(s, { exact: false }).length > 0)).toBe(true);
  });

  it('agrees with the projection: the dashboard progress uses the same target', async () => {
    renderPage('/plan/projection');
    await screen.findByRole('heading', { level: 1, name: 'Year by year' }, { timeout: 5000 });
    const { baseline, baselineInput } = seen!;
    expect(baseline.rows[0].age).toBe(baselineInput.startAge);
    expect(baseline.rows.at(-1)!.age).toBe(baselineInput.horizonAge);
    if (baseline.fiAge !== undefined) {
      const row = baseline.rows.find((r) => r.age === baseline.fiAge)!;
      expect(row.liquid).toBeGreaterThanOrEqual(row.fiTarget * 0.999);
    }
  });

  it('plays a story with a scheduled crisis to its end card', async () => {
    const user = userEvent.setup();
    renderPage('/plan/projection');
    await screen.findByRole('heading', { level: 1, name: 'Year by year' }, { timeout: 5000 });
    await user.click(screen.getByRole('radio', { name: 'Play a story' }));
    expect(
      (await screen.findAllByText('One possible story, not a forecast.', {}, { timeout: 5000 })).length,
    ).toBeGreaterThan(0);

    await user.click(screen.getAllByRole('button', { name: 'Add event' })[0]);
    const picker = await screen.findByRole('dialog', { name: 'Event picker' });
    await user.click(within(picker).getByRole('button', { name: 'Global financial crisis' }));
    await user.click(within(picker).getByRole('radio', { name: 'Typical' }));
    // The age box clamps each keystroke, so set it in one go, as a paste would.
    fireEvent.change(within(picker).getByLabelText('Age'), { target: { value: '50' } });
    await user.click(within(picker).getByRole('button', { name: 'Add at age 50' }));
    expect(
      await screen.findByRole('button', { name: 'Global financial crisis, scheduled at age 50' }),
    ).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'More playback actions' }));
    await user.click(screen.getByRole('menuitem', { name: 'Skip to end' }));
    const end = await screen.findByLabelText('End of the story', {}, { timeout: 5000 });
    expect(within(end).getByRole('heading', { name: 'End of the story, age 95' })).toBeInTheDocument();
    expect(within(end).getByText('Lowest point', { exact: true })).toBeInTheDocument();
  });

  it('shows a not-found page for an unknown address', async () => {
    renderPage('/nowhere');
    expect(
      await screen.findByRole('heading', { level: 1, name: 'Page not found' }, { timeout: 5000 }),
    ).toBeInTheDocument();
  });

  it('groups Balances with subtotals and opens account details in a drawer (M2)', async () => {
    renderPage('/money/balances');
    await screen.findByRole('heading', { level: 1, name: 'Balances' }, { timeout: 5000 });
    for (const group of ['What you own', 'What you owe']) expect(screen.getByText(group)).toBeInTheDocument();
    expect(screen.getByText(/^Locked until \d+$/)).toBeInTheDocument();
    expect(screen.getAllByText('Subtotal').length).toBeGreaterThanOrEqual(2);
    // Read first: only the latest month takes typing; Edit opens an earlier one.
    const history = screen.getByRole('region', { name: 'Monthly history' });
    const before = within(history).getAllByRole('textbox').length;
    await userEvent.click(within(history).getAllByRole('button', { name: /^Edit / })[0]);
    expect(within(history).getAllByRole('textbox').length).toBeGreaterThan(before);
    await userEvent.click(screen.getByRole('button', { name: 'Everyday account' }));
    const drawer = await screen.findByRole('dialog', { name: 'Edit Everyday account' });
    expect(within(drawer).getByLabelText('Nickname')).toHaveValue('Everyday account');
    await userEvent.click(within(drawer).getByRole('button', { name: 'Close' }));
    await userEvent.click(screen.getByRole('button', { name: 'Add account' }));
    expect(await screen.findByRole('dialog', { name: 'New account' })).toBeInTheDocument();
  });

  it('collapses cash-flow groups to totals and keeps one-offs behind a button (M2)', async () => {
    renderPage('/money/cashflow');
    await screen.findByRole('heading', { level: 1, name: 'Cash flow' }, { timeout: 5000 });
    const income = screen.getByRole('button', { name: 'Income' });
    expect(income).toHaveAttribute('aria-expanded', 'false');
    expect(screen.queryByRole('heading', { name: /^Other entries/ })).not.toBeInTheDocument();
    await userEvent.click(income);
    expect(income).toHaveAttribute('aria-expanded', 'true');
    await userEvent.click(screen.getByRole('button', { name: /^Add a one-off or see other entries/ }));
    expect(screen.getByRole('heading', { name: /^Other entries/ })).toBeInTheDocument();
  });
});
