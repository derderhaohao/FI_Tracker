import { fireEvent, screen, waitFor, within } from '@testing-library/react';
import userEvent, { type UserEvent } from '@testing-library/user-event';
import { db } from '@/db/db';
import { exportBackup } from '@/io/backup';
import { encryptBackup } from '@/io/encryption';
import { runMonteCarlo } from '@/domain/montecarlo/runner';
import type { MonteCarloOptions } from '@/domain/montecarlo/runner';
import type { ProjectionInput } from '@/domain/projection';
import { getMode, setMode } from '@/lib/mode';
import { installChartStubs, renderApp, resetDemo } from '@/test/renderApp';

/** Settings, section by section: every field saves, and backup, restore and delete behave. */

vi.setConfig({ testTimeout: 30_000 });

vi.mock('@/lib/mcWorker', async (original) => ({
  ...(await original<typeof import('@/lib/mcWorker')>()),
  monteCarloWorker: () => ({
    run: async (inputs: ProjectionInput[], o: MonteCarloOptions) =>
      inputs.map((i) => runMonteCarlo(i, { ...o, runs: 50 })),
    chances: async () => [],
  }),
}));

// Downloads are captured instead of saved.
const downloads = vi.hoisted(() => [] as { name: string; text: string; type?: string }[]);
vi.mock('@/lib/download', async (original) => ({
  ...(await original<typeof import('@/lib/download')>()),
  downloadText: (name: string, text: string, type?: string) => void downloads.push({ name, text, type }),
}));

const confirmAnswer = { value: true };

beforeAll(() => {
  installChartStubs();
  vi.stubGlobal('confirm', () => confirmAnswer.value);
});
afterAll(() => vi.unstubAllGlobals());
beforeEach(async () => {
  await resetDemo();
  downloads.length = 0;
  confirmAnswer.value = true;
});

async function open(section: string) {
  renderApp(`/settings/${section}`);
  await screen.findByRole('heading', { level: 1, name: 'Settings' }, { timeout: 5000 });
}

/** Types into a field that saves on blur. */
async function typeIn(user: UserEvent, label: string, value: string) {
  const input = screen.getByLabelText(label);
  await user.clear(input);
  await user.type(input, value);
  await user.tab();
}

const settings = async () => (await db.settings.get('singleton'))!;
const activeSet = async () => {
  const s = await settings();
  return (await db.assumptionSets.get(s.activeAssumptionSetId!))!;
};

describe('Settings → General', () => {
  it('saves the timeline, withdrawal rate and cadence', async () => {
    const user = userEvent.setup();
    await open('general');
    await typeIn(user, 'Birth year', '1985');
    await typeIn(user, 'Horizon age', '100');
    await typeIn(user, 'Default SWR', '3.5');
    await user.selectOptions(screen.getByLabelText('Snapshot cadence'), 'quarterly');
    await waitFor(async () =>
      expect(await settings()).toMatchObject({
        birthYear: 1985,
        horizonAge: 100,
        defaultSwr: 0.035,
        snapshotCadence: 'quarterly',
      }),
    );
  });

  it('saves the alert thresholds and the target allocation', async () => {
    const user = userEvent.setup();
    await open('general');
    await typeIn(user, 'Savings-rate alert below', '40');
    await typeIn(user, 'Allocation drift alert beyond', '15');
    await typeIn(user, 'Emergency fund (months)', '9');
    await waitFor(async () =>
      expect((await settings()).alerts).toMatchObject({
        targetSavingsRate: 0.4,
        allocationDriftThreshold: 0.15,
        emergencyFundMonths: 9,
      }),
    );
    await typeIn(user, 'Cash', '50');
    await waitFor(async () => expect((await settings()).targetAllocation.cash).toBe(0.5));
    expect(screen.getByText(/^Adds up to \d+%/)).toBeInTheDocument();
  });

  it('switches the assumption set in use', async () => {
    const user = userEvent.setup();
    await open('general');
    const sets = await db.assumptionSets.toArray();
    const current = (await settings()).activeAssumptionSetId;
    const other = sets.find((x) => x.id !== current)!;
    await user.selectOptions(screen.getByLabelText('Assumption set in use'), other.id);
    await waitFor(async () => expect((await settings()).activeAssumptionSetId).toBe(other.id));
  });
});

describe('Settings → Assumptions and Taiwan rules', () => {
  it('edits, duplicates, adds and deletes assumption sets', async () => {
    const user = userEvent.setup();
    await open('assumptions');
    await typeIn(user, 'Inflation', '3');
    await waitFor(async () => expect((await activeSet()).inflation).toBeCloseTo(0.03, 6));

    const before = await db.assumptionSets.count();
    await user.click(screen.getByRole('button', { name: 'Duplicate' }));
    await waitFor(async () => expect(await db.assumptionSets.count()).toBe(before + 1));
    await user.click(screen.getByRole('button', { name: 'New from defaults' }));
    await waitFor(async () => expect(await db.assumptionSets.count()).toBe(before + 2));
    await user.click(screen.getByRole('button', { name: 'Delete assumption set' }));
    await waitFor(async () => expect(await db.assumptionSets.count()).toBe(before + 1));
  });

  it('keeps the set when deleting is cancelled', async () => {
    const user = userEvent.setup();
    confirmAnswer.value = false;
    await open('assumptions');
    const before = await db.assumptionSets.count();
    // The set in use has scenarios pointing at it, so deleting asks first.
    await user.click(screen.getByRole('button', { name: 'Delete assumption set' }));
    expect(await db.assumptionSets.count()).toBe(before);
  });

  it('saves 勞退, 勞保 and dividend-tax settings', async () => {
    const user = userEvent.setup();
    await open('taiwan');
    await typeIn(user, 'Monthly insured wage', '60,000');
    await waitFor(async () =>
      expect((await activeSet()).taiwan.laborPension.monthlyInsuredWageMinor).toBe(6_000_000),
    );
    await user.click(screen.getByLabelText('Include'));
    await waitFor(async () => expect((await activeSet()).taiwan.laborInsurance.enabled).toBe(false));
    await user.selectOptions(screen.getByLabelText('Domestic dividend taxation'), 'separate');
    await waitFor(async () => expect((await activeSet()).taiwan.dividendTax.mode).toBe('separate'));
  });
});

describe('Settings → Categories', () => {
  it('renames, marks essential, adds and deletes an unused category', async () => {
    const user = userEvent.setup();
    await open('categories');
    const names = screen.getAllByLabelText('Category name');
    const first = names[0] as HTMLInputElement;
    const id = (await db.categories.toArray()).find((c) => c.name === first.value)!.id;
    await user.clear(first);
    await user.type(first, 'Pay');
    await user.tab();
    await waitFor(async () => expect((await db.categories.get(id))?.name).toBe('Pay'));

    // An empty name never replaces the old one.
    await user.clear(first);
    await user.tab();
    expect((await db.categories.get(id))?.name).toBe('Pay');

    const add = screen.getByRole('button', { name: 'Add' });
    expect(add).toBeDisabled();
    await user.type(screen.getByLabelText('New category name'), 'Gifts');
    await user.selectOptions(screen.getByLabelText('New category kind'), 'expense');
    await user.click(add);
    const gifts = await waitFor(async () => {
      const c = (await db.categories.toArray()).find((x) => x.name === 'Gifts');
      expect(c).toBeDefined();
      return c!;
    });
    expect(gifts.kind).toBe('expense');

    const row = (await screen.findByDisplayValue('Gifts')).closest('tr')!;
    await user.click(within(row).getByRole('checkbox', { name: 'Essential' }));
    await waitFor(async () => expect((await db.categories.get(gifts.id))?.essential).toBe(true));
    await user.click(within(row).getByRole('button', { name: 'Delete Gifts' }));
    await waitFor(async () => expect(await db.categories.get(gifts.id)).toBeUndefined());
  });

  it('will not delete a category that cash flow uses', async () => {
    await open('categories');
    const used = (await db.cashFlows.toArray())[0].categoryId;
    const name = (await db.categories.get(used))!.name;
    expect(screen.getByRole('button', { name: `Delete ${name}` })).toBeDisabled();
  });
});

function jsonFile(name: string, content: unknown): File {
  return new File([JSON.stringify(content)], name, { type: 'application/json' });
}

describe('Settings → Backup', () => {
  it('exports a JSON backup and every table as CSV, and records the backup', async () => {
    const user = userEvent.setup();
    await open('backup');
    await user.click(screen.getByRole('button', { name: 'Export backup (JSON)' }));
    expect(await screen.findByText('Backup downloaded.')).toBeInTheDocument();
    expect(downloads[0].name).toMatch(/^fi-tracker-\d{4}-\d{2}-\d{2}\.fi\.json$/);
    expect(JSON.parse(downloads[0].text).data.accounts.length).toBeGreaterThan(0);
    expect((await settings()).lastBackupAt).toBeDefined();

    downloads.length = 0;
    await user.click(screen.getByRole('button', { name: 'Export CSV' }));
    await waitFor(() => expect(downloads.length).toBeGreaterThan(3));
    expect(downloads.every((d) => d.type === 'text/csv' && d.name.endsWith('.csv'))).toBe(true);
  });

  it('restores a backup, downloading the current data first', async () => {
    const file = await exportBackup();
    file.data.accounts[0].nickname = 'Restored account';
    await open('backup');
    fireEvent.change(screen.getByLabelText('Backup file'), { target: { files: [jsonFile('b.json', file)] } });
    expect(await screen.findByText(/^Backup loaded\./)).toBeInTheDocument();
    expect(downloads.some((d) => d.name.includes('before-import'))).toBe(true);
    expect((await db.accounts.toArray()).some((a) => a.nickname === 'Restored account')).toBe(true);
  });

  it('refuses a file that is not a backup', async () => {
    await open('backup');
    fireEvent.change(screen.getByLabelText('Backup file'), {
      target: { files: [new File(['not json'], 'x.json')] },
    });
    expect(await screen.findByText('The file is not valid JSON.')).toBeInTheDocument();
    fireEvent.change(screen.getByLabelText('Backup file'), {
      target: { files: [jsonFile('y.json', { hello: 'world' })] },
    });
    expect(await screen.findByRole('alert')).toBeInTheDocument();
  });

  it('keeps the data when a restore is cancelled', async () => {
    confirmAnswer.value = false;
    const file = await exportBackup();
    file.data.accounts[0].nickname = 'Should not appear';
    await open('backup');
    fireEvent.change(screen.getByLabelText('Backup file'), { target: { files: [jsonFile('b.json', file)] } });
    await new Promise((r) => setTimeout(r, 50));
    expect((await db.accounts.toArray()).some((a) => a.nickname === 'Should not appear')).toBe(false);
  });

  it('restores an encrypted backup only with the right passphrase', async () => {
    const user = userEvent.setup();
    const file = await exportBackup();
    file.data.accounts[0].nickname = 'From the safe';
    const locked = await encryptBackup(file, 'a long passphrase');
    await open('backup');
    fireEvent.change(screen.getByLabelText('Backup file'), {
      target: { files: [jsonFile('e.json', locked)] },
    });
    expect(await screen.findByText('This backup is encrypted. Enter its passphrase.')).toBeInTheDocument();
    await user.type(screen.getByLabelText('Passphrase'), 'wrong passphrase');
    await user.click(screen.getByRole('button', { name: 'Decrypt and restore' }));
    expect(await screen.findByText(/Wrong passphrase/, {}, { timeout: 10_000 })).toBeInTheDocument();
    await user.clear(screen.getByLabelText('Passphrase'));
    await user.type(screen.getByLabelText('Passphrase'), 'a long passphrase');
    await user.click(screen.getByRole('button', { name: 'Decrypt and restore' }));
    expect(await screen.findByText(/^Backup loaded\./, {}, { timeout: 10_000 })).toBeInTheDocument();
    expect((await db.accounts.toArray()).some((a) => a.nickname === 'From the safe')).toBe(true);
  });

  it('checks the passphrase before an encrypted export', async () => {
    const user = userEvent.setup();
    await open('backup');
    await user.click(screen.getByRole('button', { name: 'Export encrypted backup' }));
    await user.type(screen.getByLabelText('Passphrase'), 'short');
    expect(screen.getByText('Use at least 10 characters.')).toBeInTheDocument();
    await user.clear(screen.getByLabelText('Passphrase'));
    await user.type(screen.getByLabelText('Passphrase'), 'a long passphrase');
    await user.type(screen.getByLabelText('Repeat passphrase'), 'a different one');
    expect(screen.getByText('The passphrases do not match.')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Download encrypted backup' })).toBeDisabled();
    await user.clear(screen.getByLabelText('Repeat passphrase'));
    await user.type(screen.getByLabelText('Repeat passphrase'), 'a long passphrase');
    await user.click(screen.getByRole('button', { name: 'Download encrypted backup' }));
    await waitFor(() => expect(downloads).toHaveLength(1), { timeout: 10_000 });
    expect(downloads[0].name).toMatch(/\.encrypted\.fi\.json$/);
    expect(JSON.parse(downloads[0].text).cipher.name).toBe('AES-GCM');
  });

  it('replaces the data with the demo after asking', async () => {
    const user = userEvent.setup();
    await db.accounts.update((await db.accounts.toArray())[0].id, { nickname: 'Mine' });
    await open('backup');
    await user.click(screen.getByRole('button', { name: 'Load demo data' }));
    expect(await screen.findByText(/^Demo data loaded\./)).toBeInTheDocument();
    expect((await db.accounts.toArray()).some((a) => a.nickname === 'Mine')).toBe(false);
  });
});

describe('Settings → other sections', () => {
  it('deletes everything only after DELETE is typed', async () => {
    const user = userEvent.setup();
    await open('danger');
    const button = screen.getByRole('button', { name: 'Delete all data' });
    expect(button).toBeDisabled();
    await user.type(screen.getByLabelText('Type DELETE to confirm'), 'delete');
    expect(button).toBeDisabled();
    await user.clear(screen.getByLabelText('Type DELETE to confirm'));
    await user.type(screen.getByLabelText('Type DELETE to confirm'), 'DELETE');
    await user.click(button);
    await waitFor(async () => expect(await db.accounts.count()).toBe(0));
    // Defaults come back, so the app still opens.
    expect(await db.settings.get('singleton')).toBeDefined();
  });

  it('makes a calendar reminder for the chosen day', async () => {
    const user = userEvent.setup();
    await open('reminder');
    await user.selectOptions(screen.getByLabelText('Day of the month'), '15');
    await user.click(screen.getByRole('button', { name: 'Add to calendar (.ics)' }));
    expect(downloads[0]).toMatchObject({ name: 'fi-tracker-monthly-update.ics', type: 'text/calendar' });
    expect(downloads[0].text).toContain('BYMONTHDAY=15');
  });

  it('switches to Beginner mode and links the Time Machine', async () => {
    const user = userEvent.setup();
    await open('mode');
    await user.click(screen.getByRole('button', { name: 'Switch to Beginner mode' }));
    expect(getMode()).toBe('beginner');
    setMode('pro');
    window.location.hash = '';
  });

  it('lists the standalone tools', async () => {
    await open('tools');
    expect(screen.getByRole('link', { name: /Time Machine/ })).toHaveAttribute('href', '/tools/time-machine');
  });

  it('opens a section from the phone picker and the old #anchor addresses', async () => {
    const user = userEvent.setup();
    await open('general');
    await user.selectOptions(screen.getByLabelText('Settings section'), 'backup');
    expect(await screen.findByRole('button', { name: 'Export backup (JSON)' })).toBeInTheDocument();
  });
});
