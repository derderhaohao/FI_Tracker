import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { db } from '@/db/db';
import { ensureDefaults } from '@/db/defaults';
import { DataProvider } from '@/app/data';
import { PlanHealthProvider } from '@/app/planHealth';
import { Layout } from '@/app/Layout';
import { DashboardPage } from '@/features/dashboard/DashboardPage';
import { getMode, setMode } from '@/lib/mode';
import { SetupPage } from './SetupPage';
import { SetupResult } from './SetupResult';

vi.setConfig({ testTimeout: 20_000 });

// The offline note uses the service-worker register hook, which jsdom does not have.
vi.mock('virtual:pwa-register/react', () => ({
  useRegisterSW: () => ({
    needRefresh: [false, () => {}],
    offlineReady: [false, () => {}],
    updateServiceWorker: async () => {},
  }),
}));

function renderAt(path: string) {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <DataProvider fallback={<p>Loading</p>}>
        <PlanHealthProvider>
          <Routes>
            <Route element={<Layout />}>
              <Route index element={<DashboardPage />} />
              <Route path="setup" element={<SetupPage />} />
              <Route path="setup/done" element={<SetupResult />} />
              <Route path="*" element={<p>Elsewhere</p>} />
            </Route>
          </Routes>
        </PlanHealthProvider>
      </DataProvider>
    </MemoryRouter>,
  );
}

async function type(label: string | RegExp, value: string) {
  const input = screen.getByLabelText(label);
  await userEvent.clear(input);
  await userEvent.type(input, value);
  await userEvent.tab();
}

beforeAll(async () => {
  vi.stubGlobal('scrollTo', () => {});
  await ensureDefaults();
});
afterAll(() => vi.unstubAllGlobals());
beforeEach(() => sessionStorage.clear());

describe('first run (UX doc, phase 1)', () => {
  it('shows one welcome screen in focus mode, with a 60-second estimate', async () => {
    renderAt('/');
    expect(
      await screen.findByRole('heading', { level: 1, name: 'When can you stop working?' }),
    ).toBeInTheDocument();
    // Focus mode: no sidebar navigation while there is no data.
    expect(screen.queryByRole('navigation', { name: 'Main' })).not.toBeInTheDocument();
    expect(screen.getByText('Fill in all four to see a rough FI age.')).toBeInTheDocument();
    await type('Your age', '30');
    await type('Money invested now (TWD)', '1,000,000');
    await type('Monthly take-home pay (TWD)', '80,000');
    await type('Monthly spending (TWD)', '40,000');
    expect(await screen.findByText('Roughly, you could stop work at')).toBeInTheDocument();
    expect(screen.getByText(/^Age \d+ · \w{3} \d{4}$/)).toBeInTheDocument();

    // "Make it accurate" carries the four answers into setup.
    await userEvent.click(screen.getByRole('button', { name: 'Make it accurate' }));
    expect(await screen.findByRole('heading', { name: 'About you' })).toBeInTheDocument();
    expect(screen.getByLabelText('Birth year')).toHaveValue(new Date().getFullYear() - 30);
    expect(screen.getByRole('link', { name: 'Exit setup' })).toBeInTheDocument();
  });

  it('offers Beginner mode as a quiet link', async () => {
    setMode('pro');
    renderAt('/');
    await userEvent.click(await screen.findByRole('button', { name: 'Try Beginner mode.' }));
    expect(getMode()).toBe('beginner');
    expect(window.location.hash).toBe('#/kids');
    setMode('pro');
    window.location.hash = '';
  });

  it('sets up in four steps with a live FI age, then shows the result screen', async () => {
    renderAt('/setup');
    // 1. About you
    expect(await screen.findByRole('heading', { name: 'About you' })).toBeInTheDocument();
    expect(screen.getByRole('list', { name: 'Setup steps' }).querySelectorAll('li')).toHaveLength(4);
    await userEvent.click(screen.getByRole('button', { name: 'Next' }));
    expect(screen.getByText('Enter your birth year.')).toBeInTheDocument();
    await type('Birth year', '1990');
    await userEvent.click(screen.getByRole('button', { name: 'Next' }));

    // 2. What you have: a tile adds a row with only a nickname and a balance.
    expect(await screen.findByRole('heading', { name: 'What you have' })).toBeInTheDocument();
    const live = screen.getByRole('region', { name: 'Estimated FI age' });
    expect(within(live).getByText('Appears once you add pay and spending.')).toBeInTheDocument();
    await type('Balance today', '500,000');
    await userEvent.click(screen.getByRole('button', { name: /TW broker/ }));
    expect(screen.getAllByLabelText('Nickname')[1]).toHaveValue('TW broker');
    const balances = screen.getAllByLabelText('Balance today');
    await userEvent.type(balances[1], '1,500,000');
    await userEvent.tab();
    expect(screen.queryByLabelText('Currency')).not.toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Next' }));

    // 3. Money in and out: FI spending follows spending × 12; the date appears and moves.
    expect(await screen.findByRole('heading', { name: 'Money in and out' })).toBeInTheDocument();
    await type('Monthly take-home pay', '90,000');
    await type('Monthly spending', '50,000');
    expect(screen.getByLabelText('Yearly spending once you stop working')).toHaveValue('600,000');
    const first = within(live).getByText(/in [\d.]+ years$/).textContent;
    await userEvent.click(screen.getByRole('radio', { name: 'Yes' }));
    const withPension = within(live).getByText(/in [\d.]+ years$/).textContent;
    expect(withPension).not.toBe(first);
    expect(screen.getByLabelText('Safe withdrawal rate')).not.toBeVisible();
    await userEvent.click(screen.getByRole('button', { name: 'Next' }));

    // 4. How you invest: pre-selected, so Finish works at once.
    expect(await screen.findByRole('heading', { name: 'How you invest' })).toBeInTheDocument();
    expect(screen.getByRole('radio', { name: /Mostly shares/ })).toBeChecked();
    await userEvent.click(screen.getByRole('button', { name: 'Finish and see my result' }));

    // The result screen: the age first, a progress bar, three next steps.
    expect(await screen.findByText('At this pace you could stop work at')).toBeInTheDocument();
    expect(screen.getByRole('heading', { level: 1, name: /^Age \d+$/ })).toBeInTheDocument();
    expect(
      screen.getByRole('progressbar', { name: 'Progress to financial independence' }),
    ).toBeInTheDocument();
    const next = screen.getByRole('heading', { name: 'Next steps' }).parentElement!;
    expect(within(next).getAllByRole('link')).toHaveLength(3);
    expect(screen.getByRole('link', { name: 'Go to my dashboard' })).toBeInTheDocument();

    const settings = await db.settings.get('singleton');
    expect(settings?.pensionEstimated).toBe(true);
    // 90,000 take-home ≈ 100,000 gross: the 勞退 wage, and 勞保 at its cap.
    const sets = await db.assumptionSets.toArray();
    expect(sets.some((a) => a.taiwan.laborPension.monthlyInsuredWageMinor === 100_000_00)).toBe(true);
    expect(sets.some((a) => a.taiwan.laborInsurance.avgMonthlyInsuredSalaryMinor === 45_800_00)).toBe(true);
  });
});
