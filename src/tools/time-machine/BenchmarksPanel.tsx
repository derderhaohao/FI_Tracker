import { X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Checkbox, Field, Input, Select } from '@/components/ui/input';
import { Segmented } from '@/components/ui/misc';
import { t } from '@/i18n';
import { monthIndex, type Benchmark, type PropertyBenchmark, type Scenario } from './engine';
import { NumberInput } from './fields';
import { benchmarkLabel, TICKER_BENCHMARKS } from './labels';
import { MAX_BENCHMARKS } from './state';

type AddKind = (typeof TICKER_BENCHMARKS)[number] | 'cash' | 'fixed' | 'property';

function newBenchmark(kind: AddKind): Benchmark {
  if (kind === 'cash') return { kind: 'cash', rate: 0.02 };
  if (kind === 'fixed') return { kind: 'fixed', rate: 0.07 };
  if (kind === 'property')
    return { kind: 'property', name: '', growth: 0.03, rent: 0, rentMode: 'cash', buyCost: 0, sellCost: 0 };
  return { kind: 'ticker', ticker: kind };
}

/** The property benchmark (TM-9) with an optional mortgage (TM-22). */
function PropertyEditor({
  b,
  start,
  end,
  onChange,
}: {
  b: PropertyBenchmark;
  start: string;
  end: string;
  onChange: (b: PropertyBenchmark) => void;
}) {
  const set = (patch: Partial<PropertyBenchmark>) => onChange({ ...b, ...patch });
  const years: number[] = [];
  for (let y = Math.floor(monthIndex(start) / 12); y <= Math.floor(monthIndex(end) / 12); y++) years.push(y);
  return (
    <div className="mt-2 flex flex-col gap-2.5">
      <Field label={t('Name')}>
        {(id) => (
          <Input
            id={id}
            value={b.name}
            maxLength={60}
            placeholder={t('Kaohsiung apartment')}
            onChange={(e) => set({ name: e.target.value })}
          />
        )}
      </Field>
      <div className="grid grid-cols-2 gap-2">
        <Field label={t('Price change a year')}>
          {() => (
            <NumberInput
              label={t('Price change a year')}
              value={b.growth}
              scale={100}
              min={-50}
              max={100}
              suffix="%"
              onChange={(growth) => set({ growth })}
            />
          )}
        </Field>
        <Field label={t('Net rental yield')}>
          {() => (
            <NumberInput
              label={t('Net rental yield')}
              value={b.rent}
              scale={100}
              min={0}
              max={50}
              suffix="%"
              onChange={(rent) => set({ rent })}
            />
          )}
        </Field>
        <Field label={t('Buying costs')}>
          {() => (
            <NumberInput
              label={t('Buying costs')}
              value={b.buyCost}
              scale={100}
              min={0}
              max={50}
              suffix="%"
              onChange={(buyCost) => set({ buyCost })}
            />
          )}
        </Field>
        <Field label={t('Selling costs')}>
          {() => (
            <NumberInput
              label={t('Selling costs')}
              value={b.sellCost}
              scale={100}
              min={0}
              max={50}
              suffix="%"
              onChange={(sellCost) => set({ sellCost })}
            />
          )}
        </Field>
      </div>
      {b.rent > 0 && (
        <Segmented
          label={t('Rent')}
          value={b.rentMode}
          onChange={(rentMode) => set({ rentMode })}
          options={[
            { value: 'cash', label: t('Rent kept as cash') },
            { value: 'reinvest', label: t('Rent reinvested') },
          ]}
        />
      )}
      <details className="rounded-md border px-2.5 py-1.5">
        <summary className="cursor-pointer text-sm">{t('Year by year (optional)')}</summary>
        <p className="mt-1 text-xs text-muted-foreground">
          {t('Enter the price change for any year you know; the others use the yearly change above.')}
        </p>
        <div className="mt-2 grid grid-cols-2 gap-x-3 gap-y-1.5 sm:grid-cols-3">
          {years.map((y) => (
            <label key={y} className="flex items-center gap-1.5 text-xs">
              <span className="w-9 shrink-0 tabular">{y}</span>
              <Input
                type="number"
                step="any"
                className="h-8"
                aria-label={t('Price change in {year}', { year: y })}
                placeholder={String(Math.round(b.growth * 1000) / 10)}
                value={b.years?.[y] !== undefined ? String(Math.round(b.years[y] * 1e6) / 1e4) : ''}
                onChange={(e) => {
                  const next = { ...(b.years ?? {}) };
                  const v = Number(e.target.value);
                  if (e.target.value.trim() === '' || !Number.isFinite(v)) delete next[y];
                  else next[y] = v / 100;
                  set({ years: Object.keys(next).length ? next : undefined });
                }}
              />
              <span aria-hidden>%</span>
            </label>
          ))}
        </div>
      </details>
      <Checkbox
        label={t('Bought with a mortgage')}
        checked={!!b.mortgage}
        onChange={(e) =>
          set({ mortgage: e.target.checked ? { down: 0.2, rate: 0.025, years: 30 } : undefined })
        }
      />
      {b.mortgage && (
        <>
          <div className="grid grid-cols-3 gap-2">
            <Field label={t('Down payment')}>
              {() => (
                <NumberInput
                  label={t('Down payment')}
                  value={b.mortgage!.down}
                  scale={100}
                  min={1}
                  max={100}
                  suffix="%"
                  onChange={(down) => set({ mortgage: { ...b.mortgage!, down } })}
                />
              )}
            </Field>
            <Field label={t('Loan rate')}>
              {() => (
                <NumberInput
                  label={t('Loan rate')}
                  value={b.mortgage!.rate}
                  scale={100}
                  min={0}
                  max={50}
                  suffix="%"
                  onChange={(rate) => set({ mortgage: { ...b.mortgage!, rate } })}
                />
              )}
            </Field>
            <Field label={t('Term (years)')}>
              {() => (
                <NumberInput
                  label={t('Term (years)')}
                  value={b.mortgage!.years}
                  min={1}
                  max={50}
                  onChange={(years) => set({ mortgage: { ...b.mortgage!, years } })}
                />
              )}
            </Field>
          </div>
          <p className="text-xs text-muted-foreground">
            {t(
              'The amount is the down payment. The line shows your equity: the price less the loan, less the payments you made, plus any rent kept.',
            )}
          </p>
        </>
      )}
    </div>
  );
}

/** Up to three benchmarks (TM-8), each getting the same money at the same months. */
export function BenchmarksPanel({
  scenario,
  onChange,
}: {
  scenario: Scenario;
  onChange: (s: Scenario) => void;
}) {
  const list = scenario.benchmarks;
  const setAt = (i: number, b: Benchmark) =>
    onChange({ ...scenario, benchmarks: list.map((x, j) => (j === i ? b : x)) });
  const used = (k: AddKind) => list.some((b) => b.kind === 'ticker' && b.ticker === k);
  return (
    <section aria-labelledby="tm-benchmarks" className="flex flex-col gap-2">
      <div className="flex items-baseline justify-between gap-2">
        <h2 id="tm-benchmarks" className="font-semibold">
          {t('3 · Benchmarks')}
        </h2>
        <span className="text-xs text-muted-foreground">
          {t('{n} of {max}', { n: list.length, max: MAX_BENCHMARKS })}
        </span>
      </div>
      <ul className="flex flex-col gap-1.5" aria-label={t('Benchmarks')}>
        {list.map((b, i) => (
          <li key={i} className="rounded-md border px-2.5 py-1.5">
            <div className="flex items-center gap-2">
              <span className="min-w-0 flex-1 truncate text-sm font-medium">{benchmarkLabel(b)}</span>
              {(b.kind === 'cash' || b.kind === 'fixed') && (
                <NumberInput
                  label={b.kind === 'cash' ? t('Cash rate') : t('Fixed return')}
                  className="w-24"
                  value={b.rate}
                  scale={100}
                  min={-50}
                  max={100}
                  suffix="%"
                  onChange={(rate) => setAt(i, { ...b, rate })}
                />
              )}
              <Button
                size="icon"
                variant="ghost"
                aria-label={t('Remove {name}', { name: benchmarkLabel(b) })}
                onClick={() => onChange({ ...scenario, benchmarks: list.filter((_, j) => j !== i) })}
              >
                <X />
              </Button>
            </div>
            {b.kind === 'property' && (
              <PropertyEditor b={b} start={scenario.start} end={scenario.end} onChange={(p) => setAt(i, p)} />
            )}
          </li>
        ))}
      </ul>
      <Select
        aria-label={t('Add a benchmark')}
        value=""
        disabled={list.length >= MAX_BENCHMARKS}
        onChange={(e) => {
          const k = e.target.value as AddKind;
          if (k) onChange({ ...scenario, benchmarks: [...list, newBenchmark(k)] });
        }}
      >
        <option value="">
          {list.length >= MAX_BENCHMARKS ? t('Up to 3 benchmarks') : t('Add a benchmark…')}
        </option>
        {TICKER_BENCHMARKS.map((k) => (
          <option key={k} value={k} disabled={used(k)}>
            {benchmarkLabel({ kind: 'ticker', ticker: k })}
          </option>
        ))}
        <option value="cash">{t('Cash at a fixed rate')}</option>
        <option value="fixed">{t('A fixed yearly return')}</option>
        <option value="property">{t('Property')}</option>
      </Select>
    </section>
  );
}
