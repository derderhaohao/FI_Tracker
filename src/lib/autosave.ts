import Dexie, { type EntityTable } from 'dexie';
import { create } from 'zustand';
import { exportBackup } from '@/io/backup';

/**
 * Auto-save to a file (technical design, P1): in Chrome and Edge the File System
 * Access API lets the user pick a file once; the app then rewrites it after every
 * change. The file handle lives in a separate device-only database, so it is never
 * part of a backup.
 */

interface SaveFilePickerOptions {
  suggestedName?: string;
  types?: { description: string; accept: Record<string, string[]> }[];
}
interface PermissionHandle {
  queryPermission(opts: { mode: 'readwrite' }): Promise<PermissionState>;
  requestPermission(opts: { mode: 'readwrite' }): Promise<PermissionState>;
  createWritable(): Promise<{ write(data: string): Promise<void>; close(): Promise<void> }>;
  name: string;
}
type PickerWindow = Window & {
  showSaveFilePicker?: (opts: SaveFilePickerOptions) => Promise<PermissionHandle>;
};

interface DeviceRecord {
  id: 'autosave';
  handle: PermissionHandle;
  fileName: string;
  lastSavedAt?: string;
}

class DeviceDatabase extends Dexie {
  device!: EntityTable<DeviceRecord, 'id'>;
  constructor() {
    super('fi-tracker-device');
    this.version(1).stores({ device: 'id' });
  }
}

const deviceDb = new DeviceDatabase();

export type AutosaveStatus = 'unsupported' | 'off' | 'active' | 'needs-permission' | 'saving' | 'error';

interface AutosaveState {
  status: AutosaveStatus;
  fileName?: string;
  lastSavedAt?: string;
  error?: string;
}

export const useAutosave = create<AutosaveState>(() => ({ status: 'off' }));

export function autosaveSupported(): boolean {
  return typeof window !== 'undefined' && typeof (window as PickerWindow).showSaveFilePicker === 'function';
}

let handle: PermissionHandle | undefined;

async function write(): Promise<void> {
  if (!handle) return;
  useAutosave.setState({ status: 'saving' });
  try {
    const file = await exportBackup();
    const writable = await handle.createWritable();
    await writable.write(JSON.stringify(file, null, 2));
    await writable.close();
    const lastSavedAt = new Date().toISOString();
    await deviceDb.device.update('autosave', { lastSavedAt });
    useAutosave.setState({ status: 'active', lastSavedAt, error: undefined });
  } catch (e) {
    useAutosave.setState({ status: 'error', error: e instanceof Error ? e.message : String(e) });
  }
}

/** Restores the saved handle on start-up; permission usually needs a click after a restart. */
export async function initAutosave(): Promise<void> {
  if (!autosaveSupported()) {
    useAutosave.setState({ status: 'unsupported' });
    return;
  }
  try {
    const rec = await deviceDb.device.get('autosave');
    if (!rec) return;
    handle = rec.handle;
    const permission = await rec.handle.queryPermission({ mode: 'readwrite' });
    useAutosave.setState({
      status: permission === 'granted' ? 'active' : 'needs-permission',
      fileName: rec.fileName,
      lastSavedAt: rec.lastSavedAt,
    });
  } catch {
    // Device storage unavailable: auto-save stays off.
  }
}

/** Asks for a file and starts saving to it. Must run from a click. */
export async function enableAutosave(): Promise<void> {
  const picker = (window as PickerWindow).showSaveFilePicker;
  if (!picker) return;
  try {
    const h = await picker({
      suggestedName: 'fi-tracker-autosave.fi.json',
      types: [{ description: 'FI Tracker backup', accept: { 'application/json': ['.json'] } }],
    });
    handle = h;
    await deviceDb.device.put({ id: 'autosave', handle: h, fileName: h.name });
    useAutosave.setState({ status: 'active', fileName: h.name, error: undefined });
    await write();
  } catch (e) {
    if (e instanceof DOMException && e.name === 'AbortError') return;
    useAutosave.setState({ status: 'error', error: e instanceof Error ? e.message : String(e) });
  }
}

/** Re-grants write permission after a browser restart. Must run from a click. */
export async function resumeAutosave(): Promise<void> {
  if (!handle) return;
  const permission = await handle.requestPermission({ mode: 'readwrite' });
  if (permission === 'granted') {
    useAutosave.setState({ status: 'active' });
    await write();
  }
}

export async function disableAutosave(): Promise<void> {
  handle = undefined;
  await deviceDb.device.delete('autosave');
  useAutosave.setState({
    status: autosaveSupported() ? 'off' : 'unsupported',
    fileName: undefined,
    lastSavedAt: undefined,
  });
}

let timer: ReturnType<typeof setTimeout> | undefined;

/** Called after data changes; writes once the changes settle for two seconds. */
export function scheduleAutosave(): void {
  const { status } = useAutosave.getState();
  if (status !== 'active' && status !== 'saving') return;
  clearTimeout(timer);
  timer = setTimeout(() => void write(), 2000);
}
