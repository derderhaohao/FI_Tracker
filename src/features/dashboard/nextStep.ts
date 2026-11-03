import { backupNudge } from '@/domain/backupNudge';
import { defaultUpdateDate } from '@/features/update/updateModel';

export type NextStep = 'update' | 'backup' | 'pension' | 'what-if';

/** The backup reminder waits until there are this many monthly snapshots (UX doc, A1). */
export const BACKUP_AFTER_SNAPSHOTS = 2;

export interface NextStepInput {
  /** `YYYY-MM-DD` */
  today: string;
  /** Latest snapshot date. */
  asOfDate: string;
  snapshotDateCount: number;
  backupPrompt?: 'setup' | 'review';
  lastBackupAt?: string;
  firstDataDate?: string;
  /** An auto-save file is active, which counts as a backup. */
  autosaving: boolean;
  pensionEstimated?: boolean;
}

/**
 * The one action the Home page suggests (UX doc, D1), in priority order: the monthly update
 * when a month-end has passed without one, then a backup once there are two months of data,
 * then the real 勞保 figures when setup estimated them, else a what-if.
 */
export function nextStep(i: NextStepInput): NextStep {
  if (i.asOfDate < defaultUpdateDate(i.today)) return 'update';
  if (
    !i.autosaving &&
    i.snapshotDateCount >= BACKUP_AFTER_SNAPSHOTS &&
    backupNudge(i.backupPrompt, i.lastBackupAt?.slice(0, 10), i.firstDataDate, i.today)
  )
    return 'backup';
  if (i.pensionEstimated) return 'pension';
  return 'what-if';
}
