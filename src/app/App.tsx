import { lazy, Suspense, useEffect, useState } from 'react';
import { HashRouter, Navigate, Route, Routes } from 'react-router-dom';
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
import { t } from '@/i18n';
import { getMode, setMode, useMode } from '@/lib/mode';
import { WelcomeMode } from './WelcomeMode';

// Standalone tools load on demand, so the main bundle does not grow (TM-1).
const TimeMachinePage = lazy(() =>
  import('@/tools/time-machine/TimeMachinePage').then((m) => ({ default: m.TimeMachinePage })),
);
// Beginner mode is its own lazy app with its own database (KD-2).
const KidsApp = lazy(() => import('@/kids/KidsApp').then((m) => ({ default: m.KidsApp })));

/**
 * Beginner or Pro before anything opens (KD-1). A device with plan data, a demo link or a deep
 * link to a Pro page is Pro without asking; a link into `#/kids` is Beginner; otherwise the
 * welcome screen asks.
 */
async function chooseMode(): Promise<void> {
  if (getMode()) return;
  const path = window.location.hash.replace(/^#/, '').split('?')[0];
  if (path.startsWith('/kids')) setMode('beginner');
  else if (window.location.hash.includes('demo=1') || (path && path !== '/')) setMode('pro');
  else if ((await db.accounts.count()) > 0) setMode('pro');
}

/** `npm run demo` opens `#/settings?demo=1`: load the demo data when the database is empty. */
async function loadDemoIfRequested(): Promise<void> {
  if (!window.location.hash.includes('demo=1')) return;
  window.history.replaceState(null, '', window.location.href.replace(/[?&]demo=1/, ''));
  if ((await db.accounts.count()) === 0) await importBackup(buildDemoBackup());
}

function Loading({ error }: { error?: string }) {
  return (
    <div className="grid min-h-screen place-items-center p-6 text-sm text-muted-foreground">
      {error ?? t('Loading…')}
    </div>
  );
}

export function App() {
  const mode = useMode();
  const [started, setStarted] = useState(false);
  const [proReady, setProReady] = useState(false);
  const [error, setError] = useState<string>();
  const fail = (e: unknown) =>
    setError(
      t('Could not open the local database ({v}). Private browsing may block storage.', {
        v: e instanceof Error ? e.message : String(e),
      }),
    );

  useEffect(() => {
    chooseMode()
      .then(() => setStarted(true))
      .catch(fail);
  }, []);

  // The plan database gets its defaults only in Pro: Beginner mode never writes to it.
  useEffect(() => {
    if (!started || mode !== 'pro' || proReady) return;
    ensureDefaults()
      .then(loadDemoIfRequested)
      .then(() => setProReady(true))
      .catch(fail);
    void initAutosave();
  }, [started, mode, proReady]);

  if (error) return <Loading error={error} />;
  if (!started) return <Loading />;
  if (!mode) return <WelcomeMode />;
  if (mode === 'beginner')
    return (
      <ErrorBoundary>
        <UpdatePrompt />
        <HashRouter>
          <Routes>
            <Route
              path="kids/*"
              element={
                <Suspense fallback={<Loading />}>
                  <KidsApp />
                </Suspense>
              }
            />
            <Route path="*" element={<Navigate to="/kids" replace />} />
          </Routes>
        </HashRouter>
      </ErrorBoundary>
    );

  if (!proReady) return <Loading />;
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
                <Route
                  path="tools/time-machine"
                  element={
                    <Suspense fallback={<Loading />}>
                      <TimeMachinePage />
                    </Suspense>
                  }
                />
                <Route path="kids/*" element={<Navigate to="/" replace />} />
                <Route path="*" element={<NotFound />} />
              </Route>
            </Routes>
          </HashRouter>
        </PlanHealthProvider>
      </DataProvider>
    </ErrorBoundary>
  );
}
