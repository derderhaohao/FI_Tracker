/* eslint-disable react-refresh/only-export-components -- a test helper, never hot-reloaded */
import { useEffect } from 'react';
import { fireEvent, render, screen } from '@testing-library/react';
import type { UserEvent } from '@testing-library/user-event';
import { MemoryRouter, Routes, useLocation } from 'react-router-dom';
import { ensureDefaults } from '@/db/defaults';
import { clearAllData, importBackup } from '@/io/backup';
import { buildDemoBackup } from '@/io/demo';
import { DataProvider, useAppData, type AppData } from '@/app/data';
import { PlanHealthProvider } from '@/app/planHealth';
import { proRoutes } from '@/app/proRoutes';

/**
 * Renders the Pro app at an address, with the real route tree. Tests that use it mock
 * `@/lib/mcWorker` (jsdom has no Web Workers) and stub ResizeObserver, as `installChartStubs` does.
 */

const latest: { data?: AppData; path?: string } = {};

/** The app data and the address after the last render. */
export function appState(): { data: AppData; path: string } {
  return { data: latest.data!, path: latest.path! };
}

function Spy() {
  const data = useAppData();
  const { pathname } = useLocation();
  useEffect(() => {
    latest.data = data;
    latest.path = pathname;
  });
  return null;
}

export function renderApp(path: string) {
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

/** A fresh demo household. */
export async function resetDemo(): Promise<void> {
  await clearAllData();
  await ensureDefaults();
  await importBackup(buildDemoBackup());
}

// Charts measure their box; jsdom has no layout, so give them one.
class FakeResizeObserver {
  constructor(private cb: ResizeObserverCallback) {}
  observe(el: Element) {
    this.cb([{ target: el, contentRect: { width: 800, height: 300 } } as ResizeObserverEntry], this);
  }
  unobserve() {}
  disconnect() {}
}

export function installChartStubs(): void {
  vi.stubGlobal('ResizeObserver', FakeResizeObserver);
  vi.stubGlobal('scrollTo', () => {});
}

/**
 * From the monthly update's first card to "Pay and spending": keeps every balance and rate.
 * Stops with the card it is stuck on, rather than clicking a disabled button until it runs out.
 */
export async function walkUpdateToFlows(user: UserEvent, date: string): Promise<void> {
  fireEvent.change(screen.getByLabelText('Balances as of'), { target: { value: date } });
  await user.click(screen.getByRole('button', { name: 'Start' }));
  for (let i = 0; i < 40; i++) {
    if (screen.queryByRole('heading', { name: /^Pay and spending in / })) return;
    const button =
      screen.queryByRole('button', { name: 'Same as last month' }) ??
      screen.queryByRole('button', { name: 'All correct' }) ??
      screen.getByRole('button', { name: 'Next' });
    if (button.hasAttribute('disabled')) {
      const card = screen.getAllByRole('heading', { level: 2 }).map((h) => h.textContent);
      throw new Error(`Monthly update stuck on a card waiting for input: ${card.join(' / ')}`);
    }
    await user.click(button);
  }
  throw new Error('Monthly update never reached pay and spending');
}
