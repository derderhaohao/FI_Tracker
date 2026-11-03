import { useEffect } from 'react';
import { useRegisterSW } from 'virtual:pwa-register/react';
import { Button } from '@/components/ui/button';
import { t } from '@/i18n';

/**
 * Offline support: shows when a new version is ready, instead of switching mid-session.
 * The one-off "works offline" note hides itself so it never covers buttons for long, and waits
 * while `holdOffline` is set (first run and setup).
 */
export function UpdatePrompt({ holdOffline = false }: { holdOffline?: boolean }) {
  const {
    needRefresh: [needRefresh, setNeedRefresh],
    offlineReady: [offlineReady, setOfflineReady],
    updateServiceWorker,
  } = useRegisterSW();
  useEffect(() => {
    if (!offlineReady || needRefresh || holdOffline) return;
    const timer = setTimeout(() => setOfflineReady(false), 5000);
    return () => clearTimeout(timer);
  }, [offlineReady, needRefresh, setOfflineReady, holdOffline]);
  // The "works offline" note waits until setup is done (UX doc, O1).
  if (!needRefresh && (!offlineReady || holdOffline)) return null;
  return (
    <div
      role="status"
      className="fixed right-4 bottom-20 z-20 flex max-w-sm items-center gap-3 rounded-lg border bg-surface p-3 text-sm shadow-lg md:bottom-4"
    >
      <span>
        {needRefresh ? t('A new version of FI Tracker is ready.') : t('FI Tracker now works offline.')}
      </span>
      {needRefresh && (
        <Button size="sm" onClick={() => void updateServiceWorker(true)}>
          {t('Reload')}
        </Button>
      )}
      <Button
        size="sm"
        variant="ghost"
        onClick={() => {
          setNeedRefresh(false);
          setOfflineReady(false);
        }}
      >
        {t('Dismiss')}
      </Button>
    </div>
  );
}
