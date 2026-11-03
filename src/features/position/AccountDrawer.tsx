import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { Archive, ArchiveRestore, Trash2 } from 'lucide-react';
import {
  ACCOUNT_TYPES,
  ACCOUNT_TYPE_LABELS,
  ASSET_CLASSES,
  ASSET_CLASS_LABELS,
  LOCATION_LABELS,
  LOCATIONS,
  REGION_LABELS,
  REGIONS,
  type Account,
  type AccountType,
  type Category,
  type Liability,
  type Snapshot,
} from '@/domain/entities';
import { accountDefaults } from '@/domain/accounts';
import { formatMoney, fromMinor, parseMoneyInput } from '@/domain/money';
import { addMonths, monthOf, monthsBetween, today } from '@/domain/dates';
import { formatDate, monthLabel } from '@/lib/format';
import { ensureLoanCategory } from '@/db/loanCategory';
import { db } from '@/db/db';
import { newId, patch, save } from '@/db/repo';
import { useAppData } from '@/app/data';
import { Button } from '@/components/ui/button';
import { Checkbox, Field, Input, Select } from '@/components/ui/input';
import { t, tn } from '@/i18n';
import { loanTerm } from '@/domain/loans';

const formSchema = z
  .object({
    nickname: z.string().trim().min(1, t('Give it a nickname')).max(80),
    institution: z.string().trim().max(80),
    type: z.enum(ACCOUNT_TYPES),
    assetClass: z.enum(ASSET_CLASSES),
    currency: z
      .string()
      .trim()
      .toUpperCase()
      .regex(/^[A-Z]{3}$/, t('Use a 3-letter code such as TWD or USD')),
    investable: z.boolean(),
    accessAge: z.string().regex(/^(\d{1,3})?$/, t('Whole years')),
    interestRate: z.string(),
    monthlyPayment: z.string(),
    region: z.string(),
    location: z.string(),
    /** "US 62, EU 15, JP 6, EM 11, Other 6" */
    exposure: z
      .string()
      .regex(/^(\s*(TW|US|JP|EU|EM|Other)\s+\d{1,3}(\.\d+)?\s*,?)*$/, t('Use pairs like “US 62, EU 15”')),
    floating: z.boolean(),
    propertyAccountId: z.string(),
    cashFlow: z.enum(['included', 'auto']),
    categoryId: z.string(),
  })
  .refine((v) => !/\d{6,}/.test(v.nickname), {
    path: ['nickname'],
    message: t('Do not store account numbers; use a nickname.'),
  });
type FormValues = z.infer<typeof formSchema>;

function emptyForm(): FormValues {
  return {
    nickname: '',
    institution: '',
    type: 'cash',
    assetClass: 'cash',
    currency: 'TWD',
    investable: true,
    accessAge: '',
    interestRate: '',
    monthlyPayment: '',
    region: '',
    location: '',
    exposure: '',
    floating: false,
    propertyAccountId: '',
    cashFlow: 'included',
    categoryId: '',
  };
}

function exposureText(e: Account['exposure']): string {
  return e
    ? Object.entries(e)
        .filter(([, v]) => (v ?? 0) > 0)
        .map(([k, v]) => `${k} ${Math.round((v ?? 0) * 1000) / 10}`)
        .join(', ')
    : '';
}

function parseExposure(text: string): Account['exposure'] {
  const out: Record<string, number> = {};
  for (const m of text.matchAll(/(TW|US|JP|EU|EM|Other)\s+(\d{1,3}(?:\.\d+)?)/g))
    out[m[1]] = Number(m[2]) / 100;
  const sum = Object.values(out).reduce((a, b) => a + b, 0);
  if (sum <= 0) return undefined;
  for (const k of Object.keys(out)) out[k] /= sum;
  return out;
}

function AccountForm({ account, onDone }: { account?: Account; onDone: () => void }) {
  const { liabilities, categories, snapshots } = useAppData();

  const terms = account ? liabilities.find((l) => l.accountId === account.id) : undefined;
  const thisMonth = monthOf(today());
  const {
    register,
    handleSubmit,
    watch,
    setValue,
    formState: { errors, isSubmitting },
  } = useForm<FormValues>({
    resolver: zodResolver(formSchema),
    defaultValues: account
      ? {
          nickname: account.nickname,
          institution: account.institution,
          type: account.type,
          assetClass: account.assetClass,
          currency: account.currency,
          investable: account.investable,
          accessAge: account.accessAge?.toString() ?? '',
          interestRate: terms ? String(terms.interestRate * 100) : '',
          monthlyPayment: terms ? String(fromMinor(terms.monthlyPaymentMinor)) : '',
          region: account.region ?? '',
          location: account.location ?? '',
          exposure: exposureText(account.exposure),
          floating: terms?.floating ?? false,
          propertyAccountId: terms?.propertyAccountId ?? '',
          cashFlow: terms?.cashFlow ?? 'included',
          categoryId: terms?.categoryId ?? '',
        }
      : emptyForm(),
  });
  const type = watch('type');
  const assetClass = watch('assetClass');
  const region = watch('region');
  const cashFlow = watch('cashFlow');
  const paymentMinor = parseMoneyInput(watch('monthlyPayment') ?? '') ?? 0;
  const payment = fromMinor(paymentMinor);
  const rateText = watch('interestRate');
  const annualRate = rateText === '' || !Number.isFinite(Number(rateText)) ? 0 : Number(rateText) / 100;
  const currency = watch('currency');
  // The remaining term is worked out from the latest balance in Snapshots, live as terms are typed.
  const draft = (): Liability => ({
    accountId: account?.id ?? '',
    interestRate: annualRate,
    monthlyPaymentMinor: paymentMinor,
    remainingMonths: terms?.remainingMonths ?? 0,
    termsAsOf: terms?.termsAsOf,
    createdAt: terms?.createdAt ?? '',
    updatedAt: terms?.updatedAt ?? '',
  });
  const term = account ? loanTerm(draft(), snapshots) : undefined;
  const termText = (() => {
    if (!term || term.balance === undefined)
      return t('Enter this loan’s balance in Balances and the term is worked out from it.');
    if (term.months === 0) return t('Paid off.');
    if (payment <= 0) return t('Enter the monthly payment and the term is worked out from the balance.');
    if (term.neverRepaid)
      return t(
        '{payment} a month does not cover the interest ({interest}), so this loan is never repaid at this payment.',
        {
          payment: formatMoney(payment, currency),
          interest: formatMoney((term.balance * annualRate) / 12, currency),
        },
      );
    return (
      tn(
        term.months,
        'Paid off in 1 month · last payment {month}.',
        'Paid off in {n} months · last payment {month}.',
        {
          month: monthLabel(addMonths(term.asOf, term.months - 1)),
        },
      ) +
      ' ' +
      t(
        'Worked out from the balance of {balance} on {date}, the rate and the payment; it updates with each new balance.',
        {
          balance: formatMoney(term.balance, currency),
          date: term.date ? formatDate(term.date) : '',
        },
      )
    );
  })();
  const spendingCategories = categories.filter((c) => c.kind === 'expense' && !c.system);
  const { accounts } = useAppData();
  const properties = accounts.filter((a) => a.assetClass === 'property' && a.id !== account?.id);

  const onSubmit = async (v: FormValues) => {
    const id = account?.id ?? newId();
    await save(db.accounts, {
      ...(account ?? { archived: false }),
      id,
      nickname: v.nickname,
      institution: v.institution,
      type: v.type,
      assetClass: v.assetClass,
      currency: v.currency,
      investable: v.type === 'liability' ? false : v.investable,
      accessAge: v.accessAge === '' ? undefined : Number(v.accessAge),
      archived: account?.archived ?? false,
      region: (v.region || undefined) as Account['region'],
      location: v.assetClass === 'property' ? ((v.location || undefined) as Account['location']) : undefined,
      exposure: parseExposure(v.exposure),
    });
    if (v.type === 'liability') {
      // Keep the worked-out term with the loan too, for backups and older versions.
      const worked = account && term?.balance !== undefined ? term : undefined;
      await save(db.liabilities, {
        ...(terms ?? {}),
        accountId: id,
        interestRate: v.interestRate === '' ? 0 : Number(v.interestRate) / 100,
        monthlyPaymentMinor: parseMoneyInput(v.monthlyPayment) ?? 0,
        remainingMonths: worked ? worked.months : (terms?.remainingMonths ?? 0),
        floating: v.floating,
        propertyAccountId: v.propertyAccountId || undefined,
        termsAsOf: worked ? worked.asOf : (terms?.termsAsOf ?? thisMonth),
        cashFlow: v.cashFlow,
        categoryId: v.categoryId || undefined,
      });
      if (v.cashFlow === 'auto' && !v.categoryId) await ensureLoanCategory();
    } else if (terms) {
      await db.liabilities.delete(id);
    }
    onDone();
  };

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
      <Field label={t('Nickname')} error={errors.nickname?.message} hint={t('No account numbers')}>
        {(id) => (
          <Input id={id} {...register('nickname')} aria-invalid={!!errors.nickname || undefined} autoFocus />
        )}
      </Field>
      <Field label={t('Institution')}>{(id) => <Input id={id} {...register('institution')} />}</Field>
      <Field label={t('Type')}>
        {(id) => (
          <Select
            id={id}
            {...register('type', {
              onChange: (e) => {
                const t = e.target.value as AccountType;
                const d = accountDefaults(t);
                setValue('assetClass', d.assetClass);
                setValue('investable', d.investable);
                if (d.accessAge !== undefined) setValue('accessAge', String(d.accessAge));
              },
            })}
          >
            {ACCOUNT_TYPES.map((t) => (
              <option key={t} value={t}>
                {ACCOUNT_TYPE_LABELS[t]}
              </option>
            ))}
          </Select>
        )}
      </Field>
      <Field label={t('Asset class')}>
        {(id) => (
          <Select id={id} {...register('assetClass')}>
            {ASSET_CLASSES.map((c) => (
              <option key={c} value={c}>
                {ASSET_CLASS_LABELS[c]}
              </option>
            ))}
          </Select>
        )}
      </Field>
      <Field label={t('Currency')} error={errors.currency?.message}>
        {(id) => <Input id={id} {...register('currency')} list="currencies" maxLength={3} />}
      </Field>
      {type !== 'liability' && (
        <>
          <Field
            label={t('Access age')}
            hint={t('E.g. 60 for 勞退; blank if usable now')}
            error={errors.accessAge?.message}
          >
            {(id) => <Input id={id} inputMode="numeric" {...register('accessAge')} />}
          </Field>
          <div className="flex items-end pb-2">
            <Checkbox label={t('Investable (can fund withdrawals)')} {...register('investable')} />
          </div>
        </>
      )}
      {type !== 'liability' && (
        <Field label={t('Region')} hint={t('For playback stories; Auto uses class and currency')}>
          {(id) => (
            <Select id={id} {...register('region')}>
              <option value="">{t('Auto')}</option>
              {REGIONS.map((r) => (
                <option key={r} value={r}>
                  {REGION_LABELS[r]}
                </option>
              ))}
            </Select>
          )}
        </Field>
      )}
      {assetClass === 'property' && (
        <Field label={t('Location')}>
          {(id) => (
            <Select id={id} {...register('location')}>
              <option value="">{t('Auto (by currency)')}</option>
              {LOCATIONS.map((l) => (
                <option key={l} value={l}>
                  {LOCATION_LABELS[l]}
                </option>
              ))}
            </Select>
          )}
        </Field>
      )}
      {(region === 'Global' || (assetClass === 'global_equity' && !region)) && (
        <Field
          label={t('Region split (%)')}
          hint={t('Blank = US 62, EU 15, JP 6, EM 11, Other 6')}
          error={errors.exposure?.message}
        >
          {(id) => (
            <Input id={id} placeholder={t('US 62, EU 15, JP 6, EM 11, Other 6')} {...register('exposure')} />
          )}
        </Field>
      )}
      {type === 'liability' && (
        <>
          <div className="flex items-end pb-2">
            <Checkbox label={t('Floating rate (follows rate shocks)')} {...register('floating')} />
          </div>
          {properties.length > 0 && (
            <Field label={t('Secured on')}>
              {(id) => (
                <Select id={id} {...register('propertyAccountId')}>
                  <option value="">—</option>
                  {properties.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.nickname}
                    </option>
                  ))}
                </Select>
              )}
            </Field>
          )}
          <Field label={t('Interest rate (% a year)')}>
            {(id) => <Input id={id} inputMode="decimal" {...register('interestRate')} />}
          </Field>
          <Field label={t('Monthly payment')}>
            {(id) => <Input id={id} inputMode="decimal" {...register('monthlyPayment')} />}
          </Field>
          <div className="flex flex-col gap-1 text-sm sm:col-span-2 lg:col-span-4" data-testid="loan-term">
            <span className="font-medium">{t('Remaining term')}</span>
            <span className={term?.neverRepaid && payment > 0 ? 'text-critical' : 'text-muted-foreground'}>
              {termText}
            </span>
          </div>
          <Field
            label={t('In Cash flow, this payment is')}
            className="sm:col-span-2"
            hint={
              cashFlow === 'auto'
                ? t(
                    'Added to the category below in Cash flow every month until the loan ends, beside what you type there. Leave it out of the amounts you type.',
                  )
                : t(
                    'Nothing to type twice: the plan reads the payment from here, takes it out of everyday spending, and stops it when the loan ends.',
                  )
            }
          >
            {(id) => (
              <Select id={id} {...register('cashFlow')}>
                <option value="included">{t('Already part of my spending')}</option>
                <option value="auto">{t('Not in my cash flow: add it automatically')}</option>
              </Select>
            )}
          </Field>
          <Field
            label={t('In category')}
            hint={
              cashFlow === 'auto'
                ? t('Where Cash flow adds the payment each month')
                : t('Where your monthly spending includes it')
            }
          >
            {(id) => (
              <Select id={id} {...register('categoryId')}>
                <option value="">
                  {cashFlow === 'auto'
                    ? t('A separate “Loan payments” row')
                    : t('— somewhere in my spending —')}
                </option>
                {spendingCategories.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </Select>
            )}
          </Field>
        </>
      )}
      <datalist id="currencies">
        <option value="TWD" />
        <option value="USD" />
        <option value="JPY" />
        <option value="EUR" />
      </datalist>
      <div className="flex items-end gap-2 sm:col-span-2 lg:col-span-4">
        <Button type="submit" disabled={isSubmitting}>
          {account ? t('Save account') : t('Add account')}
        </Button>
        <Button variant="ghost" onClick={onDone}>
          {t('Cancel')}
        </Button>
      </div>
    </form>
  );
}

/**
 * Account details in a side drawer (UX doc, M2): institution, type, loan terms, archive and
 * delete. Balances themselves live in the Balances table.
 */
export function AccountDrawer({ account, onClose }: { account?: Account; onClose: () => void }) {
  const { snapshots } = useAppData();
  const hasSnapshots = account ? snapshots.some((s) => s.accountId === account.id) : false;
  return (
    <div className="fixed inset-0 z-40" onClick={onClose}>
      <div className="absolute inset-0 bg-black/30" aria-hidden />
      <div
        role="dialog"
        aria-modal="true"
        aria-label={account ? t('Edit {nickname}', { nickname: account.nickname }) : t('New account')}
        className="absolute inset-y-0 right-0 flex w-full max-w-3xl flex-col gap-4 overflow-y-auto bg-surface p-5 shadow-xl"
        onClick={(e) => e.stopPropagation()}
        onKeyDown={(e) => e.key === 'Escape' && onClose()}
      >
        <div className="flex items-center justify-between gap-2">
          <h2 className="text-lg font-semibold">
            {account ? t('Edit {nickname}', { nickname: account.nickname }) : t('New account')}
          </h2>
          <Button variant="ghost" onClick={onClose}>
            {t('Close')}
          </Button>
        </div>
        <AccountForm key={account?.id ?? 'new'} account={account} onDone={onClose} />
        {account && (
          <div className="flex flex-wrap items-center gap-2 border-t pt-4">
            <Button
              variant="outline"
              onClick={async () => {
                await patch(db.accounts, account.id, { archived: !account.archived });
                onClose();
              }}
            >
              {account.archived ? <ArchiveRestore aria-hidden /> : <Archive aria-hidden />}
              {account.archived
                ? t('Restore {nickname}', { nickname: account.nickname })
                : t('Archive {nickname}', { nickname: account.nickname })}
            </Button>
            {!hasSnapshots && (
              <Button
                variant="ghost"
                onClick={async () => {
                  if (!confirm(t('Delete {nickname}? It has no snapshots.', { nickname: account.nickname })))
                    return;
                  await db.transaction('rw', db.accounts, db.liabilities, async () => {
                    await db.accounts.delete(account.id);
                    await db.liabilities.delete(account.id);
                  });
                  onClose();
                }}
              >
                <Trash2 aria-hidden /> {t('Delete {nickname}', { nickname: account.nickname })}
              </Button>
            )}
            <p className="w-full text-xs text-subtle">
              {t('Accounts with balances can be archived but not deleted, so history stays intact.')}
            </p>
          </div>
        )}
      </div>
    </div>
  );
}

/** "2.50% · NT$12,500/mo · 14 mo · in Loan repayment": a loan's terms on one line. */
export function loanTermsText(
  terms: Liability,
  currency: string,
  categories: readonly Category[],
  snapshots: readonly Snapshot[],
): string {
  const c = categories.find((x) => x.id === terms.categoryId && !x.system);
  const where =
    terms.cashFlow === 'auto'
      ? c
        ? t('added to {name} automatically', { name: c.name })
        : t('added to Cash flow automatically')
      : c
        ? t('in {name}', { name: c.name })
        : t('in your spending');
  // Payments left from this month, worked out from the latest balance.
  const term = loanTerm(terms, snapshots);
  let left = '—';
  if (term?.neverRepaid) left = t('never repaid');
  else if (term) {
    const now = monthOf(today());
    const from = term.asOf > now ? term.asOf : now;
    left = t('{n} mo', { n: Math.max(0, monthsBetween(from, addMonths(term.asOf, term.months))) });
  }
  return (
    t('{toFixed}% · {monthlyPaymentMinor}/mo · {remainingMonths}', {
      toFixed: (terms.interestRate * 100).toFixed(2),
      monthlyPaymentMinor: formatMoney(fromMinor(terms.monthlyPaymentMinor), currency),
      remainingMonths: left,
    }) +
    ' · ' +
    where
  );
}
