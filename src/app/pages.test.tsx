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
    ['/money/accounts', 'Accounts'],
    ['/money/snapshots', 'Snapshots'],
    ['/money/cashflow', 'Cash flow'],
    ['/money/mix', 'Portfolio mix'],
    ['/plan/goal', 'Goal'],
    ['/plan/projection', 'Projection'],
    ['/update/reviews', 'Reviews'],
    ['/settings', 'Settings'],
    ['/update', 'Monthly update'],
    // Old addresses redirect to the tab that holds the same content (N1).
    ['/accounts', 'Accounts'],
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

  it('marks the menu item and tab for the page in view', async () => {
    renderPage('/money/cashflow');
    await screen.findByRole('heading', { level: 1, name: 'Cash flow' }, { timeout: 5000 });
    const menu = screen.getAllByRole('navigation', { name: 'Main' })[0];
    expect(within(menu).getByRole('link', { name: 'My money' })).toHaveAttribute('aria-current', 'page');
    const tabs = screen.getByRole('navigation', { name: 'My money sections' });
    expect(within(tabs).getByRole('link', { name: 'Cash flow' })).toHaveAttribute('aria-current', 'page');
    expect(within(tabs).getByRole('link', { name: 'Accounts' })).not.toHaveAttribute('aria-current');
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
      '/plan/projection',
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
    await screen.findByRole('heading', { level: 1, name: 'Projection' }, { timeout: 5000 });
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
    await screen.findByRole('heading', { level: 1, name: 'Projection' }, { timeout: 5000 });
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

  it('opens the add-account form from Accounts', async () => {
    renderPage('/money/accounts');
    await screen.findByRole('heading', { level: 1, name: 'Accounts' }, { timeout: 5000 });
    await userEvent.click(screen.getByRole('button', { name: 'Add account' }));
    expect(await screen.findByLabelText('Nickname')).toBeInTheDocument();
  });
});
