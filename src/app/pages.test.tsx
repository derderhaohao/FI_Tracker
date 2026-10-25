import { useEffect } from 'react';
import { fireEvent, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { ensureDefaults } from '@/db/defaults';
import { importBackup } from '@/io/backup';
import { buildDemoBackup } from '@/io/demo';
import { runMonteCarlo } from '@/domain/montecarlo/runner';
import type { ProjectionInput } from '@/domain/projection';
import type { MonteCarloOptions } from '@/domain/montecarlo/runner';
import { DataProvider, useAppData } from './data';
import { PlanHealthProvider } from './planHealth';
import { Layout } from './Layout';
import { NotFound } from './NotFound';
import { DashboardPage } from '@/features/dashboard/DashboardPage';
import { AccountsPage } from '@/features/position/AccountsPage';
import { SnapshotsPage } from '@/features/position/SnapshotsPage';
import { CashFlowPage } from '@/features/engine/CashFlowPage';
import { GoalPage } from '@/features/destination/GoalPage';
import { ProjectionPage } from '@/features/trajectory/ProjectionPage';
import { ReviewsPage } from '@/features/review/ReviewsPage';
import { SettingsPage } from '@/features/settings/SettingsPage';
import { UpdatePage } from '@/features/update/UpdatePage';
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
          <Routes>
            <Route element={<Layout />}>
              <Route index element={<DashboardPage />} />
              <Route path="accounts" element={<AccountsPage />} />
              <Route path="snapshots" element={<SnapshotsPage />} />
              <Route path="cashflow" element={<CashFlowPage />} />
              <Route path="goal" element={<GoalPage />} />
              <Route path="projection" element={<ProjectionPage />} />
              <Route path="reviews" element={<ReviewsPage />} />
              <Route path="settings" element={<SettingsPage />} />
              <Route path="update" element={<UpdatePage />} />
              <Route path="*" element={<NotFound />} />
            </Route>
          </Routes>
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
    ['/', 'Dashboard'],
    ['/accounts', 'Accounts'],
    ['/snapshots', 'Snapshots'],
    ['/cashflow', 'Cash flow'],
    ['/goal', 'Goal'],
    ['/projection', 'Projection'],
    ['/reviews', 'Reviews'],
    ['/settings', 'Settings'],
    ['/update', 'Monthly update'],
  ])('%s opens with its heading and navigation', async (path, heading) => {
    renderPage(path);
    expect(
      await screen.findByRole('heading', { level: 1, name: heading }, { timeout: 5000 }),
    ).toBeInTheDocument();
    expect(screen.getAllByRole('link', { name: 'Accounts' }).length).toBeGreaterThan(0);
  });

  it('shows the plan health once the simulated futures are in', async () => {
    renderPage('/');
    const health = await screen.findByRole('region', { name: 'Plan health' }, { timeout: 5000 });
    expect(
      await within(health).findByText(/On track|Watch|At risk/, {}, { timeout: 5000 }),
    ).toBeInTheDocument();
  });

  it('shows the FI number the calculations give', async () => {
    renderPage('/goal');
    await screen.findByRole('heading', { level: 1, name: 'Goal' }, { timeout: 5000 });
    expect(seen).toBeDefined();
    const fi = seen!.fiNumberNow;
    expect(fi).toBeGreaterThan(0);
    // The number on screen is the domain's (S − G) ÷ SWR, compact or in full.
    const shown = [formatMoney(fi, 'TWD'), formatMoney(fi, 'TWD', { compact: true })];
    expect(shown.some((s) => screen.queryAllByText(s, { exact: false }).length > 0)).toBe(true);
  });

  it('agrees with the projection: the dashboard progress uses the same target', async () => {
    renderPage('/projection');
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
    renderPage('/projection');
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
    renderPage('/accounts');
    await screen.findByRole('heading', { level: 1, name: 'Accounts' }, { timeout: 5000 });
    await userEvent.click(screen.getByRole('button', { name: 'Add account' }));
    expect(await screen.findByLabelText('Nickname')).toBeInTheDocument();
  });
});
