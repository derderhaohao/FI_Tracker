import type { ReactNode } from 'react';
import { daysBetween, today } from '@/domain/dates';
import { downloadBackup } from '@/lib/backupActions';
import { resumeAutosave, useAutosave } from '@/lib/autosave';
import { Button } from '@/components/ui/button';
import { useAppData } from './data';

const BACKUP_REMINDER_DAYS = 30;

function Banner({ message, action }: { message: string; action: ReactNode }) {
  return (
    <div
      role="status"
      className="flex flex-wrap items-center justify-between gap-2 border-b bg-warning-bg px-4 py-2 text-sm md:px-8"
    >
      <span>{message}</span>
      {action}
    </div>
  );
}

/**
 * Reminds to back up when the last backup is over 30 days old, and after each snapshot.
 * An active auto-save file counts as a backup.
 */
export function BackupBanner() {
  const { settings, accounts } = useAppData();
  const autosave = useAutosave();
  if (accounts.length === 0) return null;
  if (autosave.status === 'needs-permission') {
    return (
      <Banner
        message={`Auto-save to ${autosave.fileName ?? 'your file'} is paused until you allow it again.`}
        action={
          <Button size="sm" variant="outline" onClick={() => void resumeAutosave()}>
            Resume auto-save
          </Button>
        }
      />
    );
  }
  if (autosave.status === 'error') {
    return (
      <Banner
        message={`Auto-save failed: ${autosave.error ?? 'unknown error'}. Export a backup manually.`}
        action={
          <Button size="sm" variant="outline" onClick={() => void downloadBackup()}>
            Export backup
          </Button>
        }
      />
    );
  }
  if (autosave.status === 'active' || autosave.status === 'saving') return null;
  const last = settings.lastBackupAt?.slice(0, 10);
  const age = last ? daysBetween(last, today()) : undefined;
  const stale = age === undefined || age > BACKUP_REMINDER_DAYS;
  if (!stale && !settings.snapshotSinceBackup) return null;
  const message = settings.snapshotSinceBackup
    ? 'New snapshot saved. Export a backup so it is safe outside this browser.'
    : age === undefined
      ? 'No backup yet. Your data only lives in this browser until you export it.'
      : `Last backup was ${age} days ago.`;
  return (
    <Banner
      message={message}
      action={
        <Button size="sm" variant="outline" onClick={() => void downloadBackup()}>
          Export backup
        </Button>
      }
    />
  );
}
