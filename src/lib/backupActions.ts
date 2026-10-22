import { backupFileName, exportBackup, markBackedUp } from '@/io/backup';
import { downloadText } from './download';

/** Downloads a full JSON backup and records the backup time. */
export async function downloadBackup(): Promise<void> {
  const file = await exportBackup();
  downloadText(backupFileName(), JSON.stringify(file, null, 2));
  await markBackedUp();
}
