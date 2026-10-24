import { daysBetween } from './dates';

export const BACKUP_REMINDER_DAYS = 30;

export type BackupNudge = 'setup' | 'review' | 'stale';

/**
 * When to ask for a backup (product review, issue 11): right after setup, after each review,
 * and when the last backup is over 30 days old. "Later" hides it for a week, so the prompt
 * stays rare enough to be read. An active auto-save file counts as a backup.
 */
export function backupNudge(
  prompt: 'setup' | 'review' | undefined,
  lastBackup: string | undefined,
  firstDataDate: string | undefined,
  todayDate: string,
): BackupNudge | undefined {
  if (prompt) return prompt;
  const since = lastBackup ?? firstDataDate;
  if (since && daysBetween(since, todayDate) > BACKUP_REMINDER_DAYS) return 'stale';
  return undefined;
}
