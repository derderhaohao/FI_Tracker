import { db } from '@/db/db';
import { ensureDefaults } from '@/db/defaults';
import { ensureLoanCategory } from '@/db/loanCategory';
import { LOAN_CATEGORY } from '@/domain/loans';
import {
  autosaveSupported,
  disableAutosave,
  enableAutosave,
  initAutosave,
  resumeAutosave,
  scheduleAutosave,
  useAutosave,
} from './autosave';

/**
 * Auto-save to a file (technical design, P1): the only backup that runs without a click, so a
 * silent failure here loses data. The File System Access API is faked; its handle keeps its
 * methods on the class, as a browser's FileSystemFileHandle does, so it can be stored.
 */

class FakeHandle {
  writes: string[] = [];
  permission: PermissionState = 'granted';
  failNext = false;
  constructor(public name: string) {}
  async queryPermission() {
    return this.permission;
  }
  async requestPermission() {
    this.permission = 'granted';
    return this.permission;
  }
  async createWritable() {
    if (this.failNext) {
      this.failNext = false;
      throw new Error('disk full');
    }
    let text = '';
    return {
      write: async (data: string) => void (text += data),
      close: async () => void this.writes.push(text),
    };
  }
}

let file: FakeHandle;
const picker = vi.fn(async () => file);

beforeAll(async () => {
  await ensureDefaults();
});
beforeEach(async () => {
  file = new FakeHandle('plan.fi.json');
  picker.mockClear();
  vi.stubGlobal('showSaveFilePicker', picker);
  await disableAutosave();
});
afterEach(() => vi.unstubAllGlobals());

const state = () => useAutosave.getState();

describe('auto-save to a file', () => {
  it('is unsupported without the File System Access API', async () => {
    vi.stubGlobal('showSaveFilePicker', undefined);
    expect(autosaveSupported()).toBe(false);
    await initAutosave();
    expect(state().status).toBe('unsupported');
    await enableAutosave();
    expect(picker).not.toHaveBeenCalled();
    await disableAutosave();
    expect(state().status).toBe('unsupported');
  });

  it('stays off on start-up until a file is chosen', async () => {
    expect(autosaveSupported()).toBe(true);
    await initAutosave();
    expect(state().status).toBe('off');
    // Nothing to save to: a data change does nothing.
    scheduleAutosave();
    expect(state().status).toBe('off');
  });

  it('writes a full backup to the chosen file at once', async () => {
    await enableAutosave();
    expect(picker).toHaveBeenCalledWith(
      expect.objectContaining({ suggestedName: 'fi-tracker-autosave.fi.json' }),
    );
    expect(state()).toMatchObject({ status: 'active', fileName: 'plan.fi.json' });
    expect(state().lastSavedAt).toBeDefined();
    expect(file.writes).toHaveLength(1);
    const backup = JSON.parse(file.writes[0]);
    expect(backup.app).toBe('fi-tracker');
    expect(backup.data.settings).toHaveLength(1);
  });

  it('rewrites the file once changes settle for two seconds', async () => {
    await enableAutosave();
    scheduleAutosave();
    scheduleAutosave();
    scheduleAutosave();
    expect(file.writes).toHaveLength(1);
    await vi.waitFor(() => expect(file.writes).toHaveLength(2), { timeout: 4000, interval: 100 });
    // Three changes in a row make one write, not three.
    await new Promise((r) => setTimeout(r, 300));
    expect(file.writes).toHaveLength(2);
  });

  it('reports a failed write and stops until the user acts', async () => {
    await enableAutosave();
    file.failNext = true;
    scheduleAutosave();
    await vi.waitFor(() => expect(state().status).toBe('error'), { timeout: 4000, interval: 100 });
    expect(state().error).toBe('disk full');
    // The banner asks for a manual export; further changes do not write behind its back.
    scheduleAutosave();
    await new Promise((r) => setTimeout(r, 50));
    expect(file.writes).toHaveLength(1);
  });

  it('writes again after permission is granted back', async () => {
    await enableAutosave();
    file.permission = 'prompt';
    useAutosave.setState({ status: 'needs-permission' });
    await resumeAutosave();
    expect(state().status).toBe('active');
    expect(file.writes).toHaveLength(2);
  });

  it('does nothing when the picker is cancelled, and reports other picker errors', async () => {
    picker.mockRejectedValueOnce(new DOMException('cancelled', 'AbortError'));
    await enableAutosave();
    expect(state().status).toBe('off');
    picker.mockRejectedValueOnce(new Error('not allowed'));
    await enableAutosave();
    expect(state()).toMatchObject({ status: 'error', error: 'not allowed' });
  });

  it('forgets the file when turned off', async () => {
    await enableAutosave();
    await disableAutosave();
    expect(state()).toMatchObject({ status: 'off', fileName: undefined, lastSavedAt: undefined });
    await resumeAutosave();
    expect(file.writes).toHaveLength(1);
  });
});

describe('the loan payments category', () => {
  it('is created once, as an essential expense, and reused after that', async () => {
    const id = await ensureLoanCategory();
    const again = await ensureLoanCategory();
    expect(again).toBe(id);
    const loans = (await db.categories.toArray()).filter((c) => c.system === LOAN_CATEGORY);
    expect(loans).toHaveLength(1);
    expect(loans[0]).toMatchObject({ name: 'Loan payments', kind: 'expense', essential: true });
  });
});
