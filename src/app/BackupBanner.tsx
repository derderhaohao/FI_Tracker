import { useState, type ReactNode } from 'react';
import { X } from 'lucide-react';
import { addDays, daysBetween, today } from '@/domain/dates';
import { backupNudge } from '@/domain/backupNudge';
import { db } from '@/db/db';
import { patch } from '@/db/repo';
import { downloadBackup } from '@/lib/backupActions';
import { autosaveSupported, enableAutosave, resumeAutosave, useAutosave } from '@/lib/autosave';
import { Button } from '@/components/ui/button';
import { useAppData } from './data';
import { t } from '@/i18n';

const SNOOZE_KEY = 'fi-tracker-backup-snooze';
const SNOOZE_DAYS = 7;

function snoozedUntil(): string | undefined {
  try {
    return localStorage.getItem(SNOOZE_KEY) ?? undefined;
  } catch {
    return undefined;
  }
}

function Banner({ message, children }: { message: ReactNode; children: ReactNode }) {
  return (
    <div
      role="status"
      className="flex flex-wrap items-center justify-between gap-2 border-b bg-warning-bg px-4 py-2 text-sm md:px-8"
    >
      <span>{message}</span>
      <div className="flex flex-wrap items-center gap-2">{children}</div>
    </div>
  );
}

export function BackupBanner() {
  const { settings, accounts } = useAppData();
  const autosave = useAutosave();
  const [snooze, setSnooze] = useState(snoozedUntil);
  if (accounts.length === 0) return null;
  if (autosave.status === 'needs-permission') {
    return (
      <Banner
        message={t('Auto-save to {v} is paused until you allow it again.', {
          v: autosave.fileName ?? t('your file'),
        })}
      >
        <Button size="sm" variant="outline" onClick={() => void resumeAutosave()}>
          {t('Resume auto-save')}
        </Button>
      </Banner>
    );
  }
  if (autosave.status === 'error') {
    return (
      <Banner
        message={t('Auto-save failed: {v}. Export a backup manually.', {
          v: autosave.error ?? t('unknown error'),
        })}
      >
        <Button size="sm" variant="outline" onClick={() => void downloadBackup()}>
          {t('Export backup')}
        </Button>
      </Banner>
    );
  }
  if (autosave.status === 'active' || autosave.status === 'saving') return null;

  const now = today();
  const firstData = accounts.map((a) => a.createdAt.slice(0, 10)).sort()[0];
  const nudge = backupNudge(settings.backupPrompt, settings.lastBackupAt?.slice(0, 10), firstData, now);
  if (!nudge || (snooze && snooze > now)) return null;
  const age = settings.lastBackupAt ? daysBetween(settings.lastBackupAt.slice(0, 10), now) : undefined;
  const message =
    nudge === 'setup'
      ? t('Setup saved. Your data lives only in this browser: keep a copy somewhere safe.')
      : nudge === 'review'
        ? t('Review saved. A good moment to back up.')
        : age === undefined
          ? t('No backup in over 30 days. Your data lives only in this browser.')
          : t('Last backup was {age} days ago.', { age });
  const later = async () => {
    const until = addDays(now, SNOOZE_DAYS);
    try {
      localStorage.setItem(SNOOZE_KEY, until);
    } catch {
      // Without storage the prompt simply returns on the next visit.
    }
    setSnooze(until);
    if (settings.backupPrompt) await patch(db.settings, 'singleton', { backupPrompt: undefined });
  };
  return (
    <Banner message={message}>
      {autosaveSupported() && (
        <Button
          size="sm"
          onClick={async () => {
            await enableAutosave();
            if (useAutosave.getState().status === 'active')
              await patch(db.settings, 'singleton', { backupPrompt: undefined });
          }}
        >
          {t('Turn on auto-save (recommended)')}
        </Button>
      )}
      <Button size="sm" variant="outline" onClick={() => void downloadBackup()}>
        {t('Export backup')}
      </Button>
      <Button size="sm" variant="ghost" aria-label={t('Remind me later')} onClick={() => void later()}>
        <X aria-hidden /> {t('Later')}
      </Button>
    </Banner>
  );
}
