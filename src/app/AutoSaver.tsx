import { useEffect } from 'react';
import { scheduleAutosave } from '@/lib/autosave';
import { useAppData } from './data';

/** Rewrites the auto-save file whenever the data changes (no-op when auto-save is off). */
export function AutoSaver() {
  const data = useAppData();
  useEffect(() => scheduleAutosave(), [data]);
  return null;
}
