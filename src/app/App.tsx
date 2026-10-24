import { useEffect, useState } from 'react';
import { HashRouter, Route, Routes } from 'react-router-dom';
import { db } from '@/db/db';
import { ensureDefaults } from '@/db/defaults';
import { importBackup } from '@/io/backup';
import { buildDemoBackup } from '@/io/demo';
import { DashboardPage } from '@/features/dashboard/DashboardPage';
import { AccountsPage } from '@/features/position/AccountsPage';
import { SnapshotsPage } from '@/features/position/SnapshotsPage';
import { CashFlowPage } from '@/features/engine/CashFlowPage';
import { GoalPage } from '@/features/destination/GoalPage';
import { ProjectionPage } from '@/features/trajectory/ProjectionPage';
import { LabPage } from '@/features/lab/LabPage';
import { ReviewsPage } from '@/features/review/ReviewsPage';
import { SettingsPage } from '@/features/settings/SettingsPage';
import { SetupPage } from '@/features/setup/SetupPage';
import { UpdatePage } from '@/features/update/UpdatePage';
import { DataProvider } from './data';
import { PlanHealthProvider } from './planHealth';
import { ErrorBoundary } from './ErrorBoundary';
import { GoalHistoryRecorder } from './GoalHistoryRecorder';
import { AutoSaver } from './AutoSaver';
import { UpdatePrompt } from './UpdatePrompt';
import { initAutosave } from '@/lib/autosave';
import { Layout } from './Layout';
import { NotFound } from './NotFound';

/** `npm run demo` opens `#/settings?demo=1`: load the demo data when the database is empty. */
async function loadDemoIfRequested(): Promise<void> {
  if (!window.location.hash.includes('demo=1')) return;
  window.history.replaceState(null, '', window.location.href.replace(/[?&]demo=1/, ''));
  if ((await db.accounts.count()) === 0) await importBackup(buildDemoBackup());
}

function Loading({ error }: { error?: string }) {
  return (
    <div className="grid min-h-screen place-items-center p-6 text-sm text-muted-foreground">
      {error ?? 'Loading…'}
    </div>
  );
}

export function App() {
  const [ready, setReady] = useState(false);
  const [error, setError] = useState<string>();

  useEffect(() => {
    ensureDefaults()
      .then(loadDemoIfRequested)
      .then(() => setReady(true))
      .catch((e: unknown) =>
        setError(
          `Could not open the local database (${e instanceof Error ? e.message : String(e)}). Private browsing may block storage.`,
        ),
      );
    void initAutosave();
  }, []);

  if (!ready) return <Loading error={error} />;
  return (
    <ErrorBoundary>
      <DataProvider fallback={<Loading />}>
        <PlanHealthProvider>
          <GoalHistoryRecorder />
          <AutoSaver />
          <UpdatePrompt />
          <HashRouter>
            <Routes>
              <Route element={<Layout />}>
                <Route index element={<DashboardPage />} />
                <Route path="accounts" element={<AccountsPage />} />
                <Route path="snapshots" element={<SnapshotsPage />} />
                <Route path="cashflow" element={<CashFlowPage />} />
                <Route path="goal" element={<GoalPage />} />
                <Route path="projection" element={<ProjectionPage />} />
                <Route path="lab" element={<LabPage />} />
                <Route path="reviews" element={<ReviewsPage />} />
                <Route path="settings" element={<SettingsPage />} />
                <Route path="setup" element={<SetupPage />} />
                <Route path="update" element={<UpdatePage />} />
                <Route path="*" element={<NotFound />} />
              </Route>
            </Routes>
          </HashRouter>
        </PlanHealthProvider>
      </DataProvider>
    </ErrorBoundary>
  );
}
