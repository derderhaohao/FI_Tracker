import { lazy, Suspense, useEffect, useState } from 'react';
import { HashRouter, Navigate, Route, Routes } from 'react-router-dom';
import { db } from '@/db/db';
import { ensureDefaults } from '@/db/defaults';
import { loadDemo } from '@/io/demo';
import { DataProvider } from './data';
import { PlanHealthProvider } from './planHealth';
import { ErrorBoundary } from './ErrorBoundary';
import { GoalHistoryRecorder } from './GoalHistoryRecorder';
import { AutoSaver } from './AutoSaver';
import { UpdatePrompt } from './UpdatePrompt';
import { initAutosave } from '@/lib/autosave';
import { proRoutes } from './proRoutes';
import { t } from '@/i18n';
import { getMode, setMode, useMode } from '@/lib/mode';

// Beginner mode is its own lazy app with its own database (KD-2).
const KidsApp = lazy(() => import('@/kids/KidsApp').then((m) => ({ default: m.KidsApp })));

/**
 * Beginner or Pro before anything opens (KD-1). A link into `#/kids` is Beginner; everything
 * else opens Pro, whose one welcome screen offers Beginner mode as a quiet link (UX doc, O1).
 */
function chooseMode(): void {
  if (getMode()) return;
  const path = window.location.hash.replace(/^#/, '').split('?')[0];
  setMode(path.startsWith('/kids') ? 'beginner' : 'pro');
}

/** `npm run demo` opens `#/settings?demo=1`: load the demo data when the database is empty. */
async function loadDemoIfRequested(): Promise<void> {
  if (!window.location.hash.includes('demo=1')) return;
  window.history.replaceState(null, '', window.location.href.replace(/[?&]demo=1/, ''));
  if ((await db.accounts.count()) === 0) await loadDemo();
}

function Loading({ error }: { error?: string }) {
  return (
    <div className="grid min-h-screen place-items-center p-6 text-sm text-muted-foreground">
      {error ?? t('Loading…')}
    </div>
  );
}

export function App() {
  // Pick the mode before the first render, so nothing flashes.
  useState(chooseMode);
  const mode = useMode();
  const [proReady, setProReady] = useState(false);
  const [error, setError] = useState<string>();
  const fail = (e: unknown) =>
    setError(
      t('Could not open the local database ({v}). Private browsing may block storage.', {
        v: e instanceof Error ? e.message : String(e),
      }),
    );

  // The plan database gets its defaults only in Pro: Beginner mode never writes to it.
  useEffect(() => {
    if (mode !== 'pro' || proReady) return;
    ensureDefaults()
      .then(loadDemoIfRequested)
      .then(() => setProReady(true))
      .catch(fail);
    void initAutosave();
  }, [mode, proReady]);

  if (error) return <Loading error={error} />;
  if (!mode) return <Loading />;
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
          <HashRouter>
            <Routes>{proRoutes(<Loading />)}</Routes>
          </HashRouter>
        </PlanHealthProvider>
      </DataProvider>
    </ErrorBoundary>
  );
}
