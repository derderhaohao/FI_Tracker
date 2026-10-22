import { useEffect, useRef, useState, type ReactNode } from 'react';
import { useLocation } from 'react-router-dom';
import { Copy, Download, Plus, Trash2, Upload } from 'lucide-react';
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
import { ensureDefaults } from '@/db/defaults';
import { newId, patch, save } from '@/db/repo';
import {
  backupFileName,
  clearAllData,
  exportBackup,
  importBackup,
  markBackedUp,
  parseBackupText,
  type BackupFile,
} from '@/io/backup';
import { exportCsvFiles } from '@/io/csv';
import { buildDemoBackup } from '@/io/demo';
import { downloadText } from '@/lib/download';
import { useAppData } from '@/app/data';
import { downloadBackup } from '@/lib/backupActions';
import { MoneyInput, NumberInput, PercentInput } from '@/components/MoneyInput';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader } from '@/components/ui/card';
import { Checkbox, Field, Input, Select } from '@/components/ui/input';
import { Badge, Notice, PageHeader, Table } from '@/components/ui/misc';

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
        <Field label="Birth year">
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
        <Field label="Horizon age" hint="Projections run to this age">
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
        <Field label="Default SWR" hint="2.5–5%">
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
        <Field label="Snapshot cadence">
          {(id) => (
            <Select
              id={id}
              value={s.snapshotCadence}
              onChange={(e) => set({ snapshotCadence: e.target.value as Settings['snapshotCadence'] })}
            >
              <option value="monthly">Monthly</option>
              <option value="quarterly">Quarterly</option>
            </Select>
          )}
        </Field>
        <Field label="Assumption set in use">
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
        <Field label="Savings-rate alert below">
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
        <Field label="Allocation drift alert beyond" hint="Percentage points">
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
        <Field label="Emergency fund (months)">
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
      <h3 className="mt-5 mb-2 text-sm font-semibold">Target allocation for investable assets</h3>
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
        Adds up to {(allocSum * 100).toFixed(0)}%
        {Math.abs(allocSum - 1) > 0.001 ? '; it is scaled to 100% in projections.' : '.'}
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
        <Field label="Name">
          {(id) => (
            <Input
              id={id}
              key={set.id}
              defaultValue={set.name}
              onBlur={(e) => e.target.value.trim() && update((d) => void (d.name = e.target.value.trim()))}
            />
          )}
        </Field>
        <Field label="Inflation">
          {(id) => (
            <PercentInput
              id={id}
              value={set.inflation}
              step={0.1}
              onCommit={(v) => v !== undefined && update((d) => void (d.inflation = v))}
            />
          )}
        </Field>
        <Field label="Inflation volatility">
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
        <Field label="Salary growth (nominal)">
          {(id) => (
            <PercentInput
              id={id}
              value={set.salaryGrowth}
              step={0.1}
              onCommit={(v) => v !== undefined && update((d) => void (d.salaryGrowth = v))}
            />
          )}
        </Field>
        <Field label="FX drift" hint="Yearly change in TWD per USD">
          {(id) => (
            <PercentInput
              id={id}
              value={set.fxDrift}
              step={0.1}
              onCommit={(v) => v !== undefined && update((d) => void (d.fxDrift = v))}
            />
          )}
        </Field>
        <Field label="FX volatility">
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
            <th>Asset class</th>
            <th>Expected return (nominal)</th>
            <th>Volatility</th>
            <th>Fees</th>
            <th>Dividend yield</th>
          </tr>
        </thead>
        <tbody>
          {ASSET_CLASSES.map((c) => (
            <tr key={c}>
              <td className="font-medium">{ASSET_CLASS_LABELS[c]}</td>
              {(['expectedReturn', 'volatility', 'fee', 'dividendYield'] as const).map((k) => (
                <td key={k} className="w-36">
                  <PercentInput
                    aria-label={`${ASSET_CLASS_LABELS[c]} ${k}`}
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
        <summary className="cursor-pointer text-sm font-medium">Correlations between asset classes</summary>
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
                        aria-label={`Correlation ${a} ${b}`}
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
          A matrix that is not positive definite is shrunk toward zero correlation for the simulation.
        </p>
      </details>
    </div>
  );
}

function TaiwanEditor({ set }: { set: AssumptionSet }) {
  const update = useSetUpdater(set);
  const t = set.taiwan;
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
        Rules change: check these values against 勞動部, 勞保局, 健保署 and 財政部 before relying on them.
        Last checked: <strong>{t.asOf}</strong>. Pending changes to watch: NHI supplementary premium on yearly
        totals instead of single payments, and US–Taiwan double-tax relief (would cut US withholding to 15%).
      </Notice>
      <div className={grid}>
        <Field label="Checked as of">
          {(id) => (
            <Input
              id={id}
              type="date"
              value={t.asOf}
              onChange={(e) => e.target.value && tw((x) => void (x.asOf = e.target.value))}
            />
          )}
        </Field>
        {pctField(
          'Marginal income tax rate',
          t.marginalTaxRate,
          (v) => tw((x) => void (x.marginalTaxRate = v)),
          'Voluntary 勞退 deduction; combined dividend tax',
          0.6,
        )}
      </div>
      <h3 className="text-sm font-semibold">勞退 · Labor Pension (new system)</h3>
      <div className={grid}>
        {moneyField('Monthly insured wage', t.laborPension.monthlyInsuredWageMinor, (v) =>
          tw((x) => void (x.laborPension.monthlyInsuredWageMinor = v)),
        )}
        {moneyField('Wage cap', t.laborPension.wageCapMinor, (v) =>
          tw((x) => void (x.laborPension.wageCapMinor = v)),
        )}
        {pctField(
          'Employer contribution',
          t.laborPension.employerRate,
          (v) => tw((x) => void (x.laborPension.employerRate = v)),
          undefined,
          0.2,
        )}
        {pctField(
          'Voluntary contribution now',
          t.laborPension.voluntaryRate,
          (v) => tw((x) => void (x.laborPension.voluntaryRate = v)),
          'Already reflected in your net pay',
          t.laborPension.maxVoluntaryRate,
        )}
        {pctField(
          'Voluntary maximum',
          t.laborPension.maxVoluntaryRate,
          (v) => tw((x) => void (x.laborPension.maxVoluntaryRate = v)),
          undefined,
          0.2,
        )}
        {intField('Access age', t.laborPension.accessAge, (v) =>
          tw((x) => void (x.laborPension.accessAge = v)),
        )}
        {intField(
          'Years for monthly payout',
          t.laborPension.minYearsForMonthly,
          (v) => tw((x) => void (x.laborPension.minYearsForMonthly = v)),
          'Fewer years: lump sum',
        )}
      </div>
      <h3 className="flex items-center gap-3 text-sm font-semibold">
        勞保 · Labor Insurance old-age annuity
        <Checkbox
          label="Include"
          checked={t.laborInsurance.enabled}
          onChange={(e) => tw((x) => void (x.laborInsurance.enabled = e.target.checked))}
        />
      </h3>
      <div className={grid}>
        {moneyField(
          'Average monthly insured salary',
          t.laborInsurance.avgMonthlyInsuredSalaryMinor,
          (v) => tw((x) => void (x.laborInsurance.avgMonthlyInsuredSalaryMinor = v)),
          'Average of your highest 60 months',
        )}
        {moneyField('Insured salary cap', t.laborInsurance.salaryCapMinor, (v) =>
          tw((x) => void (x.laborInsurance.salaryCapMinor = v)),
        )}
        <Field label="Insured years to date">
          {(id) => (
            <Input
              id={id}
              type="number"
              step={0.5}
              min={0}
              defaultValue={t.laborInsurance.insuredYearsToDate}
              onBlur={(e) =>
                Number(e.target.value) >= 0 &&
                tw((x) => void (x.laborInsurance.insuredYearsToDate = Number(e.target.value)))
              }
            />
          )}
        </Field>
        {intField('Years needed for annuity', t.laborInsurance.minYearsForAnnuity, (v) =>
          tw((x) => void (x.laborInsurance.minYearsForAnnuity = v)),
        )}
        {intField('Normal claim age', t.laborInsurance.claimAge, (v) =>
          tw((x) => void (x.laborInsurance.claimAge = v)),
        )}
        {intField('Max years early', t.laborInsurance.maxYearsEarly, (v) =>
          tw((x) => void (x.laborInsurance.maxYearsEarly = v)),
        )}
        {intField('Max years delayed', t.laborInsurance.maxYearsDelay, (v) =>
          tw((x) => void (x.laborInsurance.maxYearsDelay = v)),
        )}
        {pctField(
          'Adjustment per year early / late',
          t.laborInsurance.adjustmentPerYear,
          (v) => tw((x) => void (x.laborInsurance.adjustmentPerYear = v)),
          undefined,
          0.2,
        )}
        {pctField(
          'Formula A rate',
          t.laborInsurance.rateA,
          (v) => tw((x) => void (x.laborInsurance.rateA = v)),
          'salary × years × rate + flat',
          0.1,
        )}
        {moneyField('Formula A flat amount / month', t.laborInsurance.flatAMinor, (v) =>
          tw((x) => void (x.laborInsurance.flatAMinor = v)),
        )}
        {pctField(
          'Formula B rate',
          t.laborInsurance.rateB,
          (v) => tw((x) => void (x.laborInsurance.rateB = v)),
          'salary × years × rate',
          0.1,
        )}
        {pctField(
          'Solvency haircut',
          t.laborInsurance.haircut,
          (v) => tw((x) => void (x.laborInsurance.haircut = v)),
          undefined,
          1,
        )}
      </div>
      <h3 className="text-sm font-semibold">NHI, dividends and overseas income</h3>
      <div className={grid}>
        {pctField(
          'NHI supplementary premium',
          t.nhi.supplementaryRate,
          (v) => tw((x) => void (x.nhi.supplementaryRate = v)),
          undefined,
          0.2,
        )}
        {moneyField('Supplementary threshold (single payment)', t.nhi.supplementaryThresholdMinor, (v) =>
          tw((x) => void (x.nhi.supplementaryThresholdMinor = v)),
        )}
        {intField('Dividend payments per year', t.nhi.dividendPaymentsPerYear, (v) =>
          tw((x) => void (x.nhi.dividendPaymentsPerYear = Math.max(1, Math.min(12, v)))),
        )}
        <Field label="Domestic dividend taxation">
          {(id) => (
            <Select
              id={id}
              value={t.dividendTax.mode}
              onChange={(e) =>
                tw((x) => void (x.dividendTax.mode = e.target.value as TaiwanSettings['dividendTax']['mode']))
              }
            >
              <option value="best">Lower of the two</option>
              <option value="combined">Combined, with credit</option>
              <option value="separate">Separate rate</option>
            </Select>
          )}
        </Field>
        {pctField(
          'Dividend credit rate',
          t.dividendTax.creditRate,
          (v) => tw((x) => void (x.dividendTax.creditRate = v)),
          undefined,
          1,
        )}
        {moneyField('Dividend credit cap / year', t.dividendTax.creditCapMinor, (v) =>
          tw((x) => void (x.dividendTax.creditCapMinor = v)),
        )}
        {pctField(
          'Separate dividend tax rate',
          t.dividendTax.separateRate,
          (v) => tw((x) => void (x.dividendTax.separateRate = v)),
          undefined,
          1,
        )}
        {pctField(
          'US dividend withholding',
          t.usWithholdingRate,
          (v) => tw((x) => void (x.usWithholdingRate = v)),
          'Taiwan residents',
          1,
        )}
        {moneyField('AMT overseas income threshold', t.amtOverseasThresholdMinor, (v) =>
          tw((x) => void (x.amtOverseasThresholdMinor = v)),
        )}
      </div>
    </div>
  );
}

function AssumptionSets() {
  const { assumptionSets, settings, scenarios } = useAppData();
  const [selectedId, setSelectedId] = useState(settings.activeAssumptionSetId);
  const selected = assumptionSets.find((a) => a.id === selectedId) ?? assumptionSets[0];
  const duplicate = async () => {
    const { createdAt: _c, updatedAt: _u, ...rest } = structuredClone(selected);
    const id = newId();
    await save(db.assumptionSets, { ...rest, id, name: `${selected.name} (copy)` });
    setSelectedId(id);
  };
  const remove = async () => {
    if (assumptionSets.length <= 1) return;
    if (
      scenarios.some((s) => s.assumptionSetId === selected.id) &&
      !confirm('Scenarios use this set; they will switch to the set in use. Delete?')
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
  return (
    <>
      <Section
        id="assumptions"
        title="Assumption sets"
        description="Expected return, volatility, fees and dividend yield per asset class, plus inflation, salary growth and FX. Shown on every projection."
        actions={
          <>
            <Select
              aria-label="Assumption set to edit"
              className="h-8 w-44"
              value={selected.id}
              onChange={(e) => setSelectedId(e.target.value)}
            >
              {assumptionSets.map((a) => (
                <option key={a.id} value={a.id}>
                  {a.name}
                  {a.id === settings.activeAssumptionSetId ? ' (in use)' : ''}
                </option>
              ))}
            </Select>
            <Button size="sm" variant="outline" onClick={() => void duplicate()}>
              <Copy aria-hidden /> Duplicate
            </Button>
            <Button
              size="sm"
              variant="outline"
              onClick={() =>
                void save(db.assumptionSets, defaultAssumptionSet(newId())).then((s) => setSelectedId(s.id))
              }
            >
              <Plus aria-hidden /> New from defaults
            </Button>
            <Button
              size="sm"
              variant="ghost"
              aria-label="Delete assumption set"
              disabled={assumptionSets.length <= 1}
              onClick={() => void remove()}
            >
              <Trash2 />
            </Button>
          </>
        }
      >
        <AssumptionEditor key={selected.id} set={selected} />
      </Section>
      <Section
        id="taiwan"
        title={`Taiwan settings · ${selected.name}`}
        description="Every rate, threshold and age is a setting, never hard-coded. Part of the assumption set."
      >
        <TaiwanEditor key={selected.id} set={selected} />
      </Section>
    </>
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
      title="Categories"
      description="Income lines and expense categories for cash flow; expense categories also hold the FI budget."
    >
      <Table>
        <thead>
          <tr>
            <th>Name</th>
            <th>Kind</th>
            <th>Essential</th>
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
                    aria-label="Category name"
                    className="h-8"
                    defaultValue={c.name}
                    onBlur={(e) =>
                      e.target.value.trim() &&
                      e.target.value !== c.name &&
                      void patch(db.categories, c.id, { name: e.target.value.trim() })
                    }
                  />
                </td>
                <td>{c.kind}</td>
                <td>
                  {c.kind === 'expense' && (
                    <input
                      type="checkbox"
                      aria-label="Essential"
                      checked={c.essential}
                      onChange={(e) => void patch(db.categories, c.id, { essential: e.target.checked })}
                    />
                  )}
                </td>
                <td className="text-right">
                  <Button
                    size="icon"
                    variant="ghost"
                    aria-label={`Delete ${c.name}`}
                    disabled={used(c.id)}
                    title={used(c.id) ? 'Used by cash flow entries' : undefined}
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
                aria-label="New category name"
                className="h-8"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="New category"
              />
            </td>
            <td>
              <Select
                aria-label="New category kind"
                className="h-8"
                value={kind}
                onChange={(e) => setKind(e.target.value as 'income' | 'expense')}
              >
                <option value="expense">expense</option>
                <option value="income">income</option>
              </Select>
            </td>
            <td />
            <td className="text-right">
              <Button
                size="sm"
                disabled={!name.trim()}
                onClick={() => {
                  void save(db.categories, { id: newId(), name: name.trim(), kind, essential: false });
                  setName('');
                }}
              >
                <Plus aria-hidden /> Add
              </Button>
            </td>
          </tr>
        </tbody>
      </Table>
    </Section>
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
      text: `${label} loaded.${accounts.length > 0 ? ' Your previous data was downloaded first as a backup.' : ''}`,
    });
  };

  const loadDemo = async () => {
    if (
      accounts.length > 0 &&
      !confirm(
        'Replace all current data with the fictional demo data? Your current data is downloaded first.',
      )
    )
      return;
    await replaceWith(buildDemoBackup(), 'Demo data');
  };

  const onFile = async (file: File) => {
    const parsed = parseBackupText(await file.text());
    if (!parsed.ok) {
      setMessage({ tone: 'critical', text: parsed.error });
      return;
    }
    const n = parsed.file.data.accounts.length;
    if (
      !confirm(
        `Replace all data with this backup (${n} accounts, exported ${parsed.file.exportedAt.slice(0, 10)})? Your current data is downloaded first.`,
      )
    )
      return;
    await replaceWith(parsed.file, 'Backup');
  };

  return (
    <Section
      id="backup"
      title="Backup and restore"
      description="Your data lives only in this browser (IndexedDB). The JSON backup is the only copy outside it — keep it somewhere safe, not in the code repository."
    >
      <div className="flex flex-wrap gap-2">
        <Button
          onClick={() =>
            void downloadBackup().then(() => setMessage({ tone: 'info', text: 'Backup downloaded.' }))
          }
        >
          <Download aria-hidden /> Export backup (JSON)
        </Button>
        <Button variant="outline" onClick={() => fileRef.current?.click()}>
          <Upload aria-hidden /> Import backup
        </Button>
        <input
          ref={fileRef}
          type="file"
          accept=".json,application/json"
          className="hidden"
          aria-label="Backup file"
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
          <Download aria-hidden /> Export CSV
        </Button>
        <Button variant="outline" onClick={() => void loadDemo()}>
          Load demo data
        </Button>
      </div>
      {message && (
        <Notice tone={message.tone} className="mt-3">
          {message.text}
        </Notice>
      )}
      <ul className="mt-4 flex flex-col gap-1 text-sm text-muted-foreground">
        <li>
          Last backup:{' '}
          <strong className="text-foreground">
            {settings.lastBackupAt ? settings.lastBackupAt.slice(0, 16).replace('T', ' ') : 'never'}
          </strong>
        </li>
        <li>
          Persistent storage:{' '}
          {persisted === undefined ? (
            'unknown'
          ) : persisted ? (
            <Badge tone="good">granted</Badge>
          ) : (
            <Badge tone="warning">not granted — the browser may clear data under storage pressure</Badge>
          )}
        </li>
        <li>Backups are named *.fi.json; the repository's .gitignore blocks them from being committed.</li>
        <li>
          Safari deletes site data after 7 days without a visit; prefer Chrome or Edge, or back up weekly.
        </li>
      </ul>
    </Section>
  );
}

function DangerZone() {
  return (
    <Section
      id="danger"
      title="Clear data"
      description="Deletes everything stored in this browser. Export a backup first."
    >
      <Button
        variant="destructive"
        onClick={async () => {
          if (!confirm('Delete ALL data in this browser? This cannot be undone.')) return;
          await clearAllData();
          await ensureDefaults();
        }}
      >
        <Trash2 aria-hidden /> Delete all data
      </Button>
    </Section>
  );
}

export function SettingsPage() {
  const { settings } = useAppData();
  const { hash } = useLocation();
  useEffect(() => {
    if (hash) document.getElementById(hash.slice(1))?.scrollIntoView();
  }, [hash]);
  return (
    <>
      <PageHeader
        title="Settings"
        description="General settings, assumptions, Taiwan rules, categories, and backup."
      />
      <Section id="general" title="General">
        <GeneralSettings s={settings} />
      </Section>
      <AssumptionSets />
      <Categories />
      <Backup />
      <DangerZone />
    </>
  );
}
