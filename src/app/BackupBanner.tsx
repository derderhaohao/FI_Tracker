import { daysBetween, today } from '@/domain/dates';
import { downloadBackup } from '@/lib/backupActions';
import { Button } from '@/components/ui/button';
import { useAppData } from './data';

const BACKUP_REMINDER_DAYS = 30;

/** Reminds to back up when the last backup is over 30 days old, and after each snapshot. */
export function BackupBanner() {
  const { settings, accounts } = useAppData();
  if (accounts.length === 0) return null;
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
    <div
      role="status"
      className="flex flex-wrap items-center justify-between gap-2 border-b bg-warning-bg px-4 py-2 text-sm md:px-8"
    >
      <span>{message}</span>
      <Button size="sm" variant="outline" onClick={() => void downloadBackup()}>
        Export backup
      </Button>
    </div>
  );
}
