import { useRegisterSW } from 'virtual:pwa-register/react';
import { Button } from '@/components/ui/button';

/** Offline support: shows when a new version is ready, instead of switching mid-session. */
export function UpdatePrompt() {
  const {
    needRefresh: [needRefresh, setNeedRefresh],
    offlineReady: [offlineReady, setOfflineReady],
    updateServiceWorker,
  } = useRegisterSW();
  if (!needRefresh && !offlineReady) return null;
  return (
    <div
      role="status"
      className="fixed right-4 bottom-20 z-20 flex max-w-sm items-center gap-3 rounded-lg border bg-surface p-3 text-sm shadow-lg md:bottom-4"
    >
      <span>{needRefresh ? 'A new version of FI Tracker is ready.' : 'FI Tracker now works offline.'}</span>
      {needRefresh && (
        <Button size="sm" onClick={() => void updateServiceWorker(true)}>
          Reload
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
        Dismiss
      </Button>
    </div>
  );
}
