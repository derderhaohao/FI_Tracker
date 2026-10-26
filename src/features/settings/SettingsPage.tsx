import { useEffect, useRef, useState, type ReactNode } from 'react';
import { Navigate, NavLink, useLocation, useNavigate, useParams } from 'react-router-dom';
import { CalendarPlus, Copy, Download, Lock, Plus, Trash2, Upload } from 'lucide-react';
import { downloadMonthlyReminder } from '@/lib/ics';
import {
  ASSET_CLASSES,
  ASSET_CLASS_LABELS,
  type AssumptionSet,
  type Settings,
  type TaiwanSettings,
} from '@/domain/entities';
import { correlationKey, defaultAssumptionSet } from '@/domain/assumptions';
import { today } from '@/domain/dates';
import { db } from '@/db/db';
import { ensureDefaults, requestPersistence } from '@/db/defaults';
import { newId, patch, save } from '@/db/repo';
import {
  backupFileName,
  clearAllData,
  exportBackup,
  importBackup,
  markBackedUp,
  parseBackup,
  type BackupFile,
} from '@/io/backup';
import { exportCsvFiles } from '@/io/csv';
import {
  decryptBackup,
  encryptBackup,
  encryptedBackupFileName,
  isEncryptedBackup,
  type EncryptedBackup,
} from '@/io/encryption';
import { disableAutosave, enableAutosave, resumeAutosave, useAutosave } from '@/lib/autosave';
import { buildDemoBackup } from '@/io/demo';
import { downloadText } from '@/lib/download';
import { cn } from '@/lib/cn';
import { useAppData } from '@/app/data';
import { downloadBackup } from '@/lib/backupActions';
import { MoneyInput, NumberInput, PercentInput } from '@/components/MoneyInput';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader } from '@/components/ui/card';
import { Checkbox, Field, Input, Select } from '@/components/ui/input';
import { Badge, Notice, PageHeader, Table } from '@/components/ui/misc';
import { t } from '@/i18n';
import { ModeSwitch } from '@/components/ModeSwitch';

function Section({
  id,
  title,
  description,
  actions,
  children,
}: {
  id: string;
  title: string;
  description?: ReactNode;
  actions?: ReactNode;
  children: ReactNode;
}) {
  return (
    <Card id={id} className="mb-4 scroll-mt-4">
      <CardHeader title={title} description={description} actions={actions} />
      <CardContent>{children}</CardContent>
    </Card>
  );
}

const grid = 'grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4';

function GeneralSettings({ s }: { s: Settings }) {
  const { assumptionSets } = useAppData();
  const set = (changes: Partial<Settings>) => void patch(db.settings, 'singleton', changes);
  const allocSum = ASSET_CLASSES.reduce((a, c) => a + (s.targetAllocation[c] ?? 0), 0);
  return (
    <>
      <div className={grid}>
        <Field label={t('Birth year')}>
          {(id) => (
            <NumberInput
              id={id}
              value={s.birthYear}
              min={1900}
              max={2100}
              onCommit={(v) => v && set({ birthYear: v })}
            />
          )}
        </Field>
        <Field label={t('Horizon age')} hint={t('Projections run to this age')}>
          {(id) => (
            <NumberInput
              id={id}
              value={s.horizonAge}
              min={50}
              max={120}
              onCommit={(v) => v && set({ horizonAge: v })}
            />
          )}
        </Field>
        <Field label={t('Default SWR')} hint="2.5–5%">
          {(id) => (
            <PercentInput
              id={id}
              value={s.defaultSwr}
              min={0.025}
              max={0.05}
              step={0.05}
              onCommit={(v) => v !== undefined && set({ defaultSwr: v })}
            />
          )}
        </Field>
        <Field label={t('Snapshot cadence')}>
          {(id) => (
            <Select
              id={id}
              value={s.snapshotCadence}
              onChange={(e) => set({ snapshotCadence: e.target.value as Settings['snapshotCadence'] })}
            >
              <option value="monthly">{t('Monthly')}</option>
              <option value="quarterly">{t('Quarterly')}</option>
            </Select>
          )}
        </Field>
        <Field label={t('Assumption set in use')}>
          {(id) => (
            <Select
              id={id}
              value={s.activeAssumptionSetId}
              onChange={(e) => set({ activeAssumptionSetId: e.target.value })}
            >
              {assumptionSets.map((a) => (
                <option key={a.id} value={a.id}>
                  {a.name}
                </option>
              ))}
            </Select>
          )}
        </Field>
        <Field label={t('Savings-rate alert below')}>
          {(id) => (
            <PercentInput
              id={id}
              value={s.alerts.targetSavingsRate}
              min={0}
              max={1}
              step={1}
              onCommit={(v) => v !== undefined && set({ alerts: { ...s.alerts, targetSavingsRate: v } })}
            />
          )}
        </Field>
        <Field label={t('Allocation drift alert beyond')} hint={t('Percentage points')}>
          {(id) => (
            <PercentInput
              id={id}
              value={s.alerts.allocationDriftThreshold}
              min={0}
              max={1}
              step={1}
              onCommit={(v) =>
                v !== undefined && set({ alerts: { ...s.alerts, allocationDriftThreshold: v } })
              }
            />
          )}
        </Field>
        <Field label={t('Emergency fund (months)')}>
          {(id) => (
            <NumberInput
              id={id}
              value={s.alerts.emergencyFundMonths}
              min={0}
              max={60}
              onCommit={(v) => v !== undefined && set({ alerts: { ...s.alerts, emergencyFundMonths: v } })}
            />
          )}
        </Field>
      </div>
      <h3 id="allocation" className="mt-5 mb-2 scroll-mt-4 text-sm font-semibold">
        {t('Target allocation for investable assets')}
      </h3>
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4 lg:grid-cols-7">
        {ASSET_CLASSES.map((c) => (
          <Field key={c} label={ASSET_CLASS_LABELS[c]}>
            {(id) => (
              <PercentInput
                id={id}
                value={s.targetAllocation[c] ?? 0}
                min={0}
                max={1}
                step={1}
                onCommit={(v) => set({ targetAllocation: { ...s.targetAllocation, [c]: v ?? 0 } })}
              />
            )}
          </Field>
        ))}
      </div>
      <p className={`mt-2 text-xs ${Math.abs(allocSum - 1) > 0.001 ? 'text-warning' : 'text-subtle'}`}>
        {t('Adds up to {toFixed}%', { toFixed: (allocSum * 100).toFixed(0) })}
        {Math.abs(allocSum - 1) > 0.001 ? t('; it is scaled to 100% in projections.') : '.'}
      </p>
    </>
  );
}

function useSetUpdater(set: AssumptionSet) {
  return (mutate: (draft: AssumptionSet) => void) => {
    const draft = structuredClone(set);
    mutate(draft);
    draft.updatedAt = new Date().toISOString();
    void db.assumptionSets.put(draft);
  };
}

function AssumptionEditor({ set }: { set: AssumptionSet }) {
  const update = useSetUpdater(set);
  const asset = (c: (typeof ASSET_CLASSES)[number]) => set.assets.find((a) => a.assetClass === c);
  const setAsset = (
    c: (typeof ASSET_CLASSES)[number],
    key: 'expectedReturn' | 'volatility' | 'fee' | 'dividendYield',
    v: number,
  ) =>
    update((d) => {
      const a = d.assets.find((x) => x.assetClass === c);
      if (a) a[key] = v;
      else
        d.assets.push({
          assetClass: c,
          expectedReturn: 0,
          volatility: 0,
          fee: 0,
          dividendYield: 0,
          [key]: v,
        });
    });
  return (
    <div className="flex flex-col gap-4">
      <div className={grid}>
        <Field label={t('Name')}>
          {(id) => (
            <Input
              id={id}
              key={set.id}
              defaultValue={set.name}
              onBlur={(e) => e.target.value.trim() && update((d) => void (d.name = e.target.value.trim()))}
            />
          )}
        </Field>
        <Field label={t('Inflation')}>
          {(id) => (
            <PercentInput
              id={id}
              value={set.inflation}
              step={0.1}
              onCommit={(v) => v !== undefined && update((d) => void (d.inflation = v))}
            />
          )}
        </Field>
        <Field label={t('Inflation volatility')}>
          {(id) => (
            <PercentInput
              id={id}
              value={set.inflationVolatility}
              min={0}
              step={0.1}
              onCommit={(v) => v !== undefined && update((d) => void (d.inflationVolatility = v))}
            />
          )}
        </Field>
        <Field label={t('Salary growth (nominal)')}>
          {(id) => (
            <PercentInput
              id={id}
              value={set.salaryGrowth}
              step={0.1}
              onCommit={(v) => v !== undefined && update((d) => void (d.salaryGrowth = v))}
            />
          )}
        </Field>
        <Field label={t('FX drift')} hint={t('Yearly change in TWD per USD')}>
          {(id) => (
            <PercentInput
              id={id}
              value={set.fxDrift}
              step={0.1}
              onCommit={(v) => v !== undefined && update((d) => void (d.fxDrift = v))}
            />
          )}
        </Field>
        <Field label={t('FX volatility')}>
          {(id) => (
            <PercentInput
              id={id}
              value={set.fxVolatility}
              min={0}
              step={0.1}
              onCommit={(v) => v !== undefined && update((d) => void (d.fxVolatility = v))}
            />
          )}
        </Field>
      </div>
      <Table>
        <thead>
          <tr>
            <th>{t('Asset class')}</th>
            <th>{t('Expected return (nominal)')}</th>
            <th>{t('Volatility')}</th>
            <th>{t('Fees')}</th>
            <th>{t('Dividend yield')}</th>
          </tr>
        </thead>
        <tbody>
          {ASSET_CLASSES.map((c) => (
            <tr key={c}>
              <td className="font-medium">{ASSET_CLASS_LABELS[c]}</td>
              {(['expectedReturn', 'volatility', 'fee', 'dividendYield'] as const).map((k) => (
                <td key={k} className="w-36">
                  <PercentInput
                    aria-label={`${ASSET_CLASS_LABELS[c]} ${COLUMN_LABELS[k]}`}
                    value={asset(c)?.[k] ?? 0}
                    step={0.1}
                    min={k === 'expectedReturn' ? -1 : 0}
                    onCommit={(v) => v !== undefined && setAsset(c, k, v)}
                  />
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </Table>
      <details>
        <summary className="cursor-pointer text-sm font-medium">
          {t('Correlations between asset classes')}
        </summary>
        <Table className="mt-2 min-w-max">
          <thead>
            <tr>
              <th />
              {ASSET_CLASSES.map((c) => (
                <th key={c} className="text-right">
                  {ASSET_CLASS_LABELS[c]}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {ASSET_CLASSES.map((a, i) => (
              <tr key={a}>
                <td className="font-medium">{ASSET_CLASS_LABELS[a]}</td>
                {ASSET_CLASSES.map((b, j) => (
                  <td key={b} className="w-24">
                    {j <= i ? (
                      <span className="block text-right text-subtle">
                        {i === j ? '1' : (set.correlations[correlationKey(a, b)] ?? 0).toFixed(2)}
                      </span>
                    ) : (
                      <input
                        aria-label={t('Correlation {a} {b}', {
                          a: ASSET_CLASS_LABELS[a],
                          b: ASSET_CLASS_LABELS[b],
                        })}
                        type="number"
                        step={0.05}
                        min={-1}
                        max={1}
                        className="h-8 w-full rounded-md border border-input bg-surface px-2 text-right text-sm"
                        defaultValue={set.correlations[correlationKey(a, b)] ?? 0}
                        onBlur={(e) => {
                          const v = Math.max(-1, Math.min(1, Number(e.target.value)));
                          if (Number.isFinite(v))
                            update((d) => void (d.correlations[correlationKey(a, b)] = v));
                        }}
                      />
                    )}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </Table>
        <p className="mt-1 text-xs text-subtle">
          {t('A matrix that is not positive definite is shrunk toward zero correlation for the simulation.')}
        </p>
      </details>
    </div>
  );
}

function TaiwanEditor({ set }: { set: AssumptionSet }) {
  const update = useSetUpdater(set);
  const tx = set.taiwan;
  const tw = (mutate: (t: TaiwanSettings) => void) => update((d) => mutate(d.taiwan));
  const pctField = (
    label: string,
    value: number,
    apply: (v: number) => void,
    hint?: string,
    max?: number,
  ) => (
    <Field label={label} hint={hint}>
      {(id) => (
        <PercentInput
          id={id}
          value={value}
          min={0}
          max={max}
          step={0.01}
          onCommit={(v) => v !== undefined && apply(v)}
        />
      )}
    </Field>
  );
  const intField = (label: string, value: number, apply: (v: number) => void, hint?: string) => (
    <Field label={label} hint={hint}>
      {(id) => <NumberInput id={id} value={value} min={0} onCommit={(v) => v !== undefined && apply(v)} />}
    </Field>
  );
  const moneyField = (label: string, value: number, apply: (v: number) => void, hint?: string) => (
    <Field label={label} hint={hint}>
      {(id) => <MoneyInput id={id} value={value} currency="TWD" onCommit={(v) => apply(v ?? 0)} />}
    </Field>
  );
  return (
    <div className="flex flex-col gap-5">
      <Notice tone="warning">
        {t(
          'Rules change: check these values against 勞動部, 勞保局, 健保署 and 財政部 before relying on them. Last checked:',
        )}{' '}
        <strong>{tx.asOf}</strong>
        {t(
          '. Pending changes to watch: NHI supplementary premium on yearly totals instead of single payments, and US–Taiwan double-tax relief (would cut US withholding to 15%).',
        )}
      </Notice>
      <div className={grid}>
        <Field label={t('Checked as of')}>
          {(id) => (
            <Input
              id={id}
              type="date"
              value={tx.asOf}
              onChange={(e) => e.target.value && tw((x) => void (x.asOf = e.target.value))}
            />
          )}
        </Field>
        {pctField(
          t('Marginal income tax rate'),
          tx.marginalTaxRate,
          (v) => tw((x) => void (x.marginalTaxRate = v)),
          t('Voluntary 勞退 deduction; combined dividend tax'),
          0.6,
        )}
      </div>
      <h3 className="text-sm font-semibold">{t('勞退 · Labor Pension (new system)')}</h3>
      <div className={grid}>
        {moneyField(t('Monthly insured wage'), tx.laborPension.monthlyInsuredWageMinor, (v) =>
          tw((x) => void (x.laborPension.monthlyInsuredWageMinor = v)),
        )}
        {moneyField(t('Wage cap'), tx.laborPension.wageCapMinor, (v) =>
          tw((x) => void (x.laborPension.wageCapMinor = v)),
        )}
        {pctField(
          t('Employer contribution'),
          tx.laborPension.employerRate,
          (v) => tw((x) => void (x.laborPension.employerRate = v)),
          undefined,
          0.2,
        )}
        {pctField(
          t('Voluntary contribution now'),
          tx.laborPension.voluntaryRate,
          (v) => tw((x) => void (x.laborPension.voluntaryRate = v)),
          t('Already reflected in your net pay'),
          tx.laborPension.maxVoluntaryRate,
        )}
        {pctField(
          t('Voluntary maximum'),
          tx.laborPension.maxVoluntaryRate,
          (v) => tw((x) => void (x.laborPension.maxVoluntaryRate = v)),
          undefined,
          0.2,
        )}
        {intField(t('Access age'), tx.laborPension.accessAge, (v) =>
          tw((x) => void (x.laborPension.accessAge = v)),
        )}
        {intField(
          t('Years for monthly payout'),
          tx.laborPension.minYearsForMonthly,
          (v) => tw((x) => void (x.laborPension.minYearsForMonthly = v)),
          t('Fewer years: lump sum'),
        )}
      </div>
      <h3 className="flex items-center gap-3 text-sm font-semibold">
        {t('勞保 · Labor Insurance old-age annuity')}
        <Checkbox
          label={t('Include')}
          checked={tx.laborInsurance.enabled}
          onChange={(e) => tw((x) => void (x.laborInsurance.enabled = e.target.checked))}
        />
      </h3>
      <div className={grid}>
        {moneyField(
          t('Average monthly insured salary'),
          tx.laborInsurance.avgMonthlyInsuredSalaryMinor,
          (v) => tw((x) => void (x.laborInsurance.avgMonthlyInsuredSalaryMinor = v)),
          t('Average of your highest 60 months'),
        )}
        {moneyField(t('Insured salary cap'), tx.laborInsurance.salaryCapMinor, (v) =>
          tw((x) => void (x.laborInsurance.salaryCapMinor = v)),
        )}
        <Field label={t('Insured years to date')}>
          {(id) => (
            <Input
              id={id}
              type="number"
              step={0.5}
              min={0}
              defaultValue={tx.laborInsurance.insuredYearsToDate}
              onBlur={(e) =>
                Number(e.target.value) >= 0 &&
                tw((x) => void (x.laborInsurance.insuredYearsToDate = Number(e.target.value)))
              }
            />
          )}
        </Field>
        {intField(t('Years needed for annuity'), tx.laborInsurance.minYearsForAnnuity, (v) =>
          tw((x) => void (x.laborInsurance.minYearsForAnnuity = v)),
        )}
        {intField(t('Normal claim age'), tx.laborInsurance.claimAge, (v) =>
          tw((x) => void (x.laborInsurance.claimAge = v)),
        )}
        {intField(t('Max years early'), tx.laborInsurance.maxYearsEarly, (v) =>
          tw((x) => void (x.laborInsurance.maxYearsEarly = v)),
        )}
        {intField(t('Max years delayed'), tx.laborInsurance.maxYearsDelay, (v) =>
          tw((x) => void (x.laborInsurance.maxYearsDelay = v)),
        )}
        {pctField(
          t('Adjustment per year early / late'),
          tx.laborInsurance.adjustmentPerYear,
          (v) => tw((x) => void (x.laborInsurance.adjustmentPerYear = v)),
          undefined,
          0.2,
        )}
        {pctField(
          t('Formula A rate'),
          tx.laborInsurance.rateA,
          (v) => tw((x) => void (x.laborInsurance.rateA = v)),
          t('salary × years × rate + flat'),
          0.1,
        )}
        {moneyField(t('Formula A flat amount / month'), tx.laborInsurance.flatAMinor, (v) =>
          tw((x) => void (x.laborInsurance.flatAMinor = v)),
        )}
        {pctField(
          t('Formula B rate'),
          tx.laborInsurance.rateB,
          (v) => tw((x) => void (x.laborInsurance.rateB = v)),
          t('salary × years × rate'),
          0.1,
        )}
        {pctField(
          t('Solvency haircut'),
          tx.laborInsurance.haircut,
          (v) => tw((x) => void (x.laborInsurance.haircut = v)),
          undefined,
          1,
        )}
      </div>
      <h3 className="text-sm font-semibold">{t('NHI, dividends and overseas income')}</h3>
      <div className={grid}>
        {pctField(
          t('NHI supplementary premium'),
          tx.nhi.supplementaryRate,
          (v) => tw((x) => void (x.nhi.supplementaryRate = v)),
          undefined,
          0.2,
        )}
        {moneyField(t('Supplementary threshold (single payment)'), tx.nhi.supplementaryThresholdMinor, (v) =>
          tw((x) => void (x.nhi.supplementaryThresholdMinor = v)),
        )}
        {intField(t('Dividend payments per year'), tx.nhi.dividendPaymentsPerYear, (v) =>
          tw((x) => void (x.nhi.dividendPaymentsPerYear = Math.max(1, Math.min(12, v)))),
        )}
        <Field label={t('Domestic dividend taxation')}>
          {(id) => (
            <Select
              id={id}
              value={tx.dividendTax.mode}
              onChange={(e) =>
                tw((x) => void (x.dividendTax.mode = e.target.value as TaiwanSettings['dividendTax']['mode']))
              }
            >
              <option value="best">{t('Lower of the two')}</option>
              <option value="combined">{t('Combined, with credit')}</option>
              <option value="separate">{t('Separate rate')}</option>
            </Select>
          )}
        </Field>
        {pctField(
          t('Dividend credit rate'),
          tx.dividendTax.creditRate,
          (v) => tw((x) => void (x.dividendTax.creditRate = v)),
          undefined,
          1,
        )}
        {moneyField(t('Dividend credit cap / year'), tx.dividendTax.creditCapMinor, (v) =>
          tw((x) => void (x.dividendTax.creditCapMinor = v)),
        )}
        {pctField(
          t('Separate dividend tax rate'),
          tx.dividendTax.separateRate,
          (v) => tw((x) => void (x.dividendTax.separateRate = v)),
          undefined,
          1,
        )}
        {pctField(
          t('US dividend withholding'),
          tx.usWithholdingRate,
          (v) => tw((x) => void (x.usWithholdingRate = v)),
          t('Taiwan residents'),
          1,
        )}
        {moneyField(t('AMT overseas income threshold'), tx.amtOverseasThresholdMinor, (v) =>
          tw((x) => void (x.amtOverseasThresholdMinor = v)),
        )}
      </div>
    </div>
  );
}

const COLUMN_LABELS = {
  expectedReturn: t('Expected return (nominal)'),
  volatility: t('Volatility'),
  fee: t('Fees'),
  dividendYield: t('Dividend yield'),
};

/** Assumption sets and their Taiwan rules: two Settings sections that edit the same set. */
function AssumptionSets({ part }: { part: 'assumptions' | 'taiwan' }) {
  const { assumptionSets, settings, scenarios } = useAppData();
  const [selectedId, setSelectedId] = useState(settings.activeAssumptionSetId);
  const selected = assumptionSets.find((a) => a.id === selectedId) ?? assumptionSets[0];
  const duplicate = async () => {
    const { createdAt: _c, updatedAt: _u, ...rest } = structuredClone(selected);
    const id = newId();
    await save(db.assumptionSets, { ...rest, id, name: t('{name} (copy)', { name: selected.name }) });
    setSelectedId(id);
  };
  const remove = async () => {
    if (assumptionSets.length <= 1) return;
    if (
      scenarios.some((s) => s.assumptionSetId === selected.id) &&
      !confirm(t('Scenarios use this set; they will switch to the set in use. Delete?'))
    )
      return;
    const fallback = assumptionSets.find((a) => a.id !== selected.id)!;
    await db.transaction('rw', db.assumptionSets, db.settings, db.scenarios, async () => {
      await db.assumptionSets.delete(selected.id);
      if (settings.activeAssumptionSetId === selected.id)
        await patch(db.settings, 'singleton', { activeAssumptionSetId: fallback.id });
      for (const s of scenarios.filter((x) => x.assumptionSetId === selected.id))
        await patch(db.scenarios, s.id, { assumptionSetId: fallback.id });
    });
    setSelectedId(fallback.id);
  };
  const picker = (
    <Select
      aria-label={t('Assumption set to edit')}
      className="h-8 w-44"
      value={selected.id}
      onChange={(e) => setSelectedId(e.target.value)}
    >
      {assumptionSets.map((a) => (
        <option key={a.id} value={a.id}>
          {a.name}
          {a.id === settings.activeAssumptionSetId ? t(' (in use)') : ''}
        </option>
      ))}
    </Select>
  );
  if (part === 'taiwan')
    return (
      <Section
        id="taiwan"
        title={t('Taiwan settings · {name}', { name: selected.name })}
        description={t(
          'Every rate, threshold and age is a setting, never hard-coded. Part of the assumption set.',
        )}
        actions={picker}
      >
        <TaiwanEditor key={selected.id} set={selected} />
      </Section>
    );
  return (
    <Section
      id="assumptions"
      title={t('Assumption sets')}
      description={t(
        'Expected return, volatility, fees and dividend yield per asset class, plus inflation, salary growth and FX. Shown on every projection.',
      )}
      actions={
        <>
          {picker}
          <Button size="sm" variant="outline" onClick={() => void duplicate()}>
            <Copy aria-hidden /> {t('Duplicate')}
          </Button>
          <Button
            size="sm"
            variant="outline"
            onClick={() =>
              void save(db.assumptionSets, defaultAssumptionSet(newId())).then((s) => setSelectedId(s.id))
            }
          >
            <Plus aria-hidden /> {t('New from defaults')}
          </Button>
          <Button
            size="sm"
            variant="ghost"
            aria-label={t('Delete assumption set')}
            disabled={assumptionSets.length <= 1}
            title={assumptionSets.length <= 1 ? t('Keep at least one assumption set') : undefined}
            onClick={() => void remove()}
          >
            <Trash2 />
          </Button>
        </>
      }
    >
      <AssumptionEditor key={selected.id} set={selected} />
    </Section>
  );
}

function Categories() {
  const { categories, cashFlows } = useAppData();
  const [name, setName] = useState('');
  const [kind, setKind] = useState<'income' | 'expense'>('expense');
  const used = (id: string) => cashFlows.some((c) => c.categoryId === id);
  return (
    <Section
      id="categories"
      title={t('Categories')}
      description={t(
        'Income lines and expense categories for cash flow; expense categories also hold the FI budget.',
      )}
    >
      <Table>
        <thead>
          <tr>
            <th>{t('Name')}</th>
            <th>{t('Kind')}</th>
            <th>{t('Essential')}</th>
            <th />
          </tr>
        </thead>
        <tbody>
          {[...categories]
            .sort((a, b) => a.kind.localeCompare(b.kind) * -1)
            .map((c) => (
              <tr key={c.id}>
                <td>
                  <Input
                    aria-label={t('Category name')}
                    className="h-8"
                    defaultValue={c.name}
                    onBlur={(e) =>
                      e.target.value.trim() &&
                      e.target.value !== c.name &&
                      void patch(db.categories, c.id, { name: e.target.value.trim() })
                    }
                  />
                </td>
                <td>{c.kind === 'income' ? t('income') : t('expense')}</td>
                <td>
                  {c.kind === 'expense' && (
                    <input
                      type="checkbox"
                      aria-label={t('Essential')}
                      checked={c.essential}
                      onChange={(e) => void patch(db.categories, c.id, { essential: e.target.checked })}
                    />
                  )}
                </td>
                <td className="text-right">
                  <Button
                    size="icon"
                    variant="ghost"
                    aria-label={t('Delete {name}', { name: c.name })}
                    disabled={used(c.id) || !!c.system}
                    title={
                      c.system
                        ? t('Filled from loan terms in Accounts')
                        : used(c.id)
                          ? t('Used by cash flow entries')
                          : undefined
                    }
                    onClick={() => void db.categories.delete(c.id)}
                  >
                    <Trash2 />
                  </Button>
                </td>
              </tr>
            ))}
          <tr>
            <td>
              <Input
                aria-label={t('New category name')}
                className="h-8"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder={t('New category')}
              />
            </td>
            <td>
              <Select
                aria-label={t('New category kind')}
                className="h-8"
                value={kind}
                onChange={(e) => setKind(e.target.value as 'income' | 'expense')}
              >
                <option value="expense">{t('expense')}</option>
                <option value="income">{t('income')}</option>
              </Select>
            </td>
            <td />
            <td className="text-right">
              <Button
                size="sm"
                disabled={!name.trim()}
                title={name.trim() ? undefined : t('Enter a name first')}
                onClick={() => {
                  void save(db.categories, { id: newId(), name: name.trim(), kind, essential: false });
                  setName('');
                }}
              >
                <Plus aria-hidden /> {t('Add')}
              </Button>
            </td>
          </tr>
        </tbody>
      </Table>
    </Section>
  );
}

function EncryptedExport({ onDone }: { onDone: (message: string) => void }) {
  const [open, setOpen] = useState(false);
  const [a, setA] = useState('');
  const [b, setB] = useState('');
  const [busy, setBusy] = useState(false);
  const error =
    a.length > 0 && a.length < 10
      ? t('Use at least 10 characters.')
      : b && a !== b
        ? t('The passphrases do not match.')
        : undefined;
  if (!open) {
    return (
      <div className="mt-4">
        <Button variant="outline" onClick={() => setOpen(true)}>
          <Lock aria-hidden /> {t('Export encrypted backup')}
        </Button>
        <p className="mt-1 text-xs text-subtle">
          {t(
            'For backups kept in cloud drives or email. Without the passphrase the file cannot be opened, by anyone.',
          )}
        </p>
      </div>
    );
  }
  return (
    <form
      className="mt-4 flex flex-wrap items-end gap-2 rounded-md border p-3"
      onSubmit={async (e) => {
        e.preventDefault();
        if (error || !a || a !== b) return;
        setBusy(true);
        const enc = await encryptBackup(await exportBackup(), a);
        downloadText(encryptedBackupFileName(today()), JSON.stringify(enc));
        await markBackedUp();
        setBusy(false);
        setOpen(false);
        setA('');
        setB('');
        onDone(t('Encrypted backup downloaded. Keep the passphrase somewhere safe: it cannot be recovered.'));
      }}
    >
      <Field label={t('Passphrase')} error={error}>
        {(id) => (
          <Input
            id={id}
            type="password"
            autoComplete="new-password"
            value={a}
            onChange={(e) => setA(e.target.value)}
            className="w-56"
            autoFocus
          />
        )}
      </Field>
      <Field label={t('Repeat passphrase')}>
        {(id) => (
          <Input
            id={id}
            type="password"
            autoComplete="new-password"
            value={b}
            onChange={(e) => setB(e.target.value)}
            className="w-56"
          />
        )}
      </Field>
      <Button type="submit" disabled={busy || !!error || !a || a !== b}>
        {busy ? t('Encrypting…') : t('Download encrypted backup')}
      </Button>
      <Button variant="ghost" onClick={() => setOpen(false)}>
        {t('Cancel')}
      </Button>
    </form>
  );
}

function AutosaveControls() {
  const autosave = useAutosave();
  const when = autosave.lastSavedAt ? new Date(autosave.lastSavedAt).toLocaleString() : t('not yet');
  return (
    <div className="mt-4 rounded-md border p-3 text-sm">
      <div className="font-medium">{t('Auto-save to a file')}</div>
      {autosave.status === 'unsupported' ? (
        <p className="mt-1 text-muted-foreground">
          {t('Needs Chrome or Edge on a computer. In this browser, export backups by hand.')}
        </p>
      ) : autosave.status === 'off' ? (
        <>
          <p className="mt-1 text-muted-foreground">
            {t(
              'Pick a file once, for example in a synced folder; the app rewrites it after every change. The file is a plain (unencrypted) backup.',
            )}
          </p>
          <Button className="mt-2" variant="outline" onClick={() => void enableAutosave()}>
            {t('Choose auto-save file')}
          </Button>
        </>
      ) : (
        <div className="mt-1 flex flex-wrap items-center gap-2">
          <span className="text-muted-foreground">
            {autosave.status === 'needs-permission'
              ? t('Paused')
              : autosave.status === 'error'
                ? t('Failed')
                : t('Saving')}{' '}
            {t('to')} <strong className="text-foreground">{autosave.fileName}</strong>{' '}
            {t('· last saved {when}', { when })}
          </span>
          {autosave.status === 'needs-permission' && (
            <Button size="sm" variant="outline" onClick={() => void resumeAutosave()}>
              {t('Resume')}
            </Button>
          )}
          <Button size="sm" variant="ghost" onClick={() => void disableAutosave()}>
            {t('Turn off')}
          </Button>
        </div>
      )}
      {autosave.error && <p className="mt-1 text-xs text-critical">{autosave.error}</p>}
    </div>
  );
}

function Backup() {
  const { settings, accounts } = useAppData();
  const fileRef = useRef<HTMLInputElement>(null);
  const [message, setMessage] = useState<{ tone: 'info' | 'critical'; text: string }>();
  const [persisted, setPersisted] = useState<boolean>();

  useEffect(() => {
    void navigator.storage?.persisted?.().then(setPersisted);
  }, []);

  const replaceWith = async (file: BackupFile, label: string) => {
    if (accounts.length > 0) {
      // Automatic backup of the current data before replacing it.
      const current = await exportBackup();
      downloadText(backupFileName(`${today()}-before-import`), JSON.stringify(current, null, 2));
    }
    await importBackup(file);
    await ensureDefaults();
    setMessage({
      tone: 'info',
      text: t('{label} loaded.{v}', {
        label,
        v: accounts.length > 0 ? t(' Your previous data was downloaded first as a backup.') : '',
      }),
    });
  };

  const loadDemo = async () => {
    if (
      accounts.length > 0 &&
      !confirm(
        t('Replace all current data with the fictional demo data? Your current data is downloaded first.'),
      )
    )
      return;
    await replaceWith(buildDemoBackup(), t('Demo data'));
  };

  const [locked, setLocked] = useState<EncryptedBackup>();
  const [passphrase, setPassphrase] = useState('');

  const restoreParsed = async (raw: unknown) => {
    const parsed = parseBackup(raw);
    if (!parsed.ok) {
      setMessage({ tone: 'critical', text: parsed.error });
      return;
    }
    const n = parsed.file.data.accounts.length;
    if (
      !confirm(
        t(
          'Replace all data with this backup ({n} accounts, exported {slice})? Your current data is downloaded first.',
          { n, slice: parsed.file.exportedAt.slice(0, 10) },
        ),
      )
    )
      return;
    await replaceWith(parsed.file, t('Backup'));
  };

  const onFile = async (file: File) => {
    let raw: unknown;
    try {
      raw = JSON.parse(await file.text());
    } catch {
      setMessage({ tone: 'critical', text: t('The file is not valid JSON.') });
      return;
    }
    if (isEncryptedBackup(raw)) {
      setLocked(raw);
      setPassphrase('');
      setMessage({ tone: 'info', text: t('This backup is encrypted. Enter its passphrase.') });
      return;
    }
    await restoreParsed(raw);
  };

  const unlock = async () => {
    if (!locked) return;
    try {
      const raw = await decryptBackup(locked, passphrase);
      setLocked(undefined);
      setPassphrase('');
      await restoreParsed(raw);
    } catch (e) {
      setMessage({ tone: 'critical', text: e instanceof Error ? e.message : String(e) });
    }
  };

  return (
    <Section
      id="backup"
      title={t('Backup and restore')}
      description={t(
        'Your data lives only in this browser (IndexedDB). The JSON backup is the only copy outside it — keep it somewhere safe, not in the code repository.',
      )}
    >
      <div className="flex flex-wrap gap-2">
        <Button
          onClick={() =>
            void downloadBackup().then(() => setMessage({ tone: 'info', text: t('Backup downloaded.') }))
          }
        >
          <Download aria-hidden /> {t('Export backup (JSON)')}
        </Button>
        <Button variant="outline" onClick={() => fileRef.current?.click()}>
          <Upload aria-hidden /> {t('Import backup')}
        </Button>
        <input
          ref={fileRef}
          type="file"
          accept=".json,application/json"
          className="hidden"
          aria-label={t('Backup file')}
          onChange={(e) => {
            const f = e.target.files?.[0];
            e.target.value = '';
            if (f) void onFile(f);
          }}
        />
        <Button
          variant="outline"
          onClick={async () => {
            const files = exportCsvFiles((await exportBackup()).data);
            for (const f of files) downloadText(f.name, f.content, 'text/csv');
            await markBackedUp();
          }}
        >
          <Download aria-hidden /> {t('Export CSV')}
        </Button>
        <Button variant="outline" onClick={() => void loadDemo()}>
          {t('Load demo data')}
        </Button>
      </div>
      {message && (
        <Notice tone={message.tone} className="mt-3">
          {message.text}
        </Notice>
      )}
      {locked && (
        <form
          className="mt-3 flex flex-wrap items-end gap-2"
          onSubmit={(e) => {
            e.preventDefault();
            void unlock();
          }}
        >
          <Field label={t('Passphrase')}>
            {(id) => (
              <Input
                id={id}
                type="password"
                autoComplete="off"
                value={passphrase}
                onChange={(e) => setPassphrase(e.target.value)}
                className="w-64"
                autoFocus
              />
            )}
          </Field>
          <Button type="submit" disabled={!passphrase}>
            {t('Decrypt and restore')}
          </Button>
          <Button variant="ghost" onClick={() => setLocked(undefined)}>
            {t('Cancel')}
          </Button>
        </form>
      )}
      <EncryptedExport onDone={(text) => setMessage({ tone: 'info', text })} />
      <AutosaveControls />
      <ul className="mt-4 flex flex-col gap-1 text-sm text-muted-foreground">
        <li>
          {t('Last backup:')}{' '}
          <strong className="text-foreground">
            {settings.lastBackupAt ? settings.lastBackupAt.slice(0, 16).replace('T', ' ') : t('never')}
          </strong>
        </li>
        <li>
          {t('Persistent storage:')}{' '}
          {persisted === undefined ? (
            t('unknown')
          ) : persisted ? (
            <Badge tone="good">{t('granted')}</Badge>
          ) : (
            <>
              <Badge tone="warning">
                {t('not granted — the browser may clear data under storage pressure')}
              </Badge>{' '}
              <Button size="sm" variant="ghost" onClick={() => void requestPersistence().then(setPersisted)}>
                {t('Ask the browser to keep it')}
              </Button>
            </>
          )}
        </li>
        <li>
          {t("Backups are named *.fi.json; the repository's .gitignore blocks them from being committed.")}
        </li>
        <li>
          {t(
            'Safari deletes site data after 7 days without a visit; prefer Chrome or Edge, or back up weekly.',
          )}
        </li>
      </ul>
    </Section>
  );
}

/** Deleting everything sits in its own section behind a typed confirmation (UI-15). */
function DangerZone() {
  const [typed, setTyped] = useState('');
  const word = t('DELETE');
  const ready = typed.trim() === word;
  return (
    <Section
      id="danger"
      title={t('Danger zone')}
      description={t('Deletes everything stored in this browser. Export a backup first.')}
    >
      <div className="flex flex-wrap items-end gap-2">
        <Field label={t('Type {word} to confirm', { word })}>
          {(id) => (
            <Input
              id={id}
              className="w-44"
              autoComplete="off"
              value={typed}
              onChange={(e) => setTyped(e.target.value)}
            />
          )}
        </Field>
        <Button
          variant="destructive"
          disabled={!ready}
          title={ready ? undefined : t('Type {word} first', { word })}
          onClick={async () => {
            if (!ready) return;
            await clearAllData();
            await ensureDefaults();
            setTyped('');
          }}
        >
          <Trash2 aria-hidden /> {t('Delete all data')}
        </Button>
      </div>
    </Section>
  );
}

function Reminder() {
  const [day, setDay] = useState(1);
  return (
    <Section
      id="reminder"
      title={t('Monthly reminder')}
      description={t(
        'A repeating event for your calendar app, linking to the monthly update. Made on this device; nothing is sent anywhere.',
      )}
    >
      <div className="flex flex-wrap items-end gap-2">
        <Field label={t('Day of the month')}>
          {(id) => (
            <Select id={id} className="w-28" value={day} onChange={(e) => setDay(Number(e.target.value))}>
              {Array.from({ length: 28 }, (_, i) => i + 1).map((d) => (
                <option key={d} value={d}>
                  {d}
                </option>
              ))}
            </Select>
          )}
        </Field>
        <Button variant="outline" onClick={() => downloadMonthlyReminder(today(), day)}>
          <CalendarPlus aria-hidden /> {t('Add to calendar (.ics)')}
        </Button>
      </div>
    </Section>
  );
}

const SECTIONS = [
  { id: 'general', label: t('General') },
  { id: 'mode', label: t('Beginner / Pro') },
  { id: 'assumptions', label: t('Assumptions') },
  { id: 'taiwan', label: t('Taiwan rules') },
  { id: 'categories', label: t('Categories') },
  { id: 'backup', label: t('Backup') },
  { id: 'reminder', label: t('Reminder') },
  { id: 'danger', label: t('Danger zone') },
] as const;
type SectionId = (typeof SECTIONS)[number]['id'];
const isSection = (v: string | undefined): v is SectionId => SECTIONS.some((x) => x.id === v);

/**
 * Settings, one section at a time (UI-15): a sticky sub-nav on wider screens and a section
 * picker on phones. Each section has its own address, `#/settings/backup`, so other pages can
 * link to it; old `#/settings#backup` links still land in the right place.
 */
export function SettingsPage() {
  const { settings } = useAppData();
  const { section } = useParams();
  const { hash } = useLocation();
  const navigate = useNavigate();
  const anchor = hash.slice(1);
  useEffect(() => {
    if (anchor) document.getElementById(anchor)?.scrollIntoView({ behavior: 'smooth' });
  }, [anchor, section]);
  if (!section && isSection(anchor)) return <Navigate to={`/settings/${anchor}`} replace />;
  if (!section && anchor === 'allocation') return <Navigate to="/settings/general#allocation" replace />;
  const current: SectionId = isSection(section) ? section : 'general';
  return (
    <>
      <PageHeader
        title={t('Settings')}
        description={t('General settings, assumptions, Taiwan rules, categories, and backup.')}
      />
      <div className="grid grid-cols-1 items-start gap-4 md:grid-cols-[160px_minmax(0,1fr)] xl:grid-cols-[200px_minmax(0,1fr)]">
        <div className="md:hidden">
          <Select
            aria-label={t('Settings section')}
            value={current}
            onChange={(e) => navigate(`/settings/${e.target.value}`)}
          >
            {SECTIONS.map((x) => (
              <option key={x.id} value={x.id}>
                {x.label}
              </option>
            ))}
          </Select>
        </div>
        <nav aria-label={t('Settings sections')} className="sticky top-4 hidden md:block">
          <ul className="flex flex-col gap-0.5">
            {SECTIONS.map((x) => (
              <li key={x.id}>
                <NavLink
                  to={`/settings/${x.id}`}
                  aria-current={current === x.id ? 'true' : undefined}
                  className={cn(
                    'flex min-h-8 items-center rounded-md px-2.5 text-sm',
                    current === x.id
                      ? 'bg-surface-2 font-semibold text-foreground'
                      : 'text-muted-foreground hover:bg-surface-2 hover:text-foreground',
                    x.id === 'danger' && current !== x.id && 'text-critical',
                  )}
                >
                  {x.label}
                </NavLink>
              </li>
            ))}
          </ul>
        </nav>
        <div className="min-w-0">
          {current === 'general' && (
            <Section id="general" title={t('General')}>
              <GeneralSettings s={settings} />
            </Section>
          )}
          {current === 'mode' && (
            <Section
              id="mode"
              title={t('Beginner / Pro')}
              description={t(
                'Beginner mode is a separate space for children: jars, goals, a money tree and lessons. It keeps its own data and never shows or changes your plan.',
              )}
            >
              <ModeSwitch className="h-10 rounded-md border px-3 text-foreground" />
            </Section>
          )}
          {current === 'assumptions' && <AssumptionSets part="assumptions" />}
          {current === 'taiwan' && <AssumptionSets part="taiwan" />}
          {current === 'categories' && <Categories />}
          {current === 'backup' && <Backup />}
          {current === 'reminder' && <Reminder />}
          {current === 'danger' && <DangerZone />}
        </div>
      </div>
    </>
  );
}
