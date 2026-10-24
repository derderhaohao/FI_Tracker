import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { Archive, ArchiveRestore, Pencil, Plus, Trash2 } from 'lucide-react';
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
} from '@/domain/entities';
import { accountDefaults } from '@/domain/accounts';
import { formatMoney, fromMinor, parseMoneyInput } from '@/domain/money';
import { db } from '@/db/db';
import { newId, patch, save } from '@/db/repo';
import { useAppData } from '@/app/data';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader } from '@/components/ui/card';
import { Checkbox, Field, Input, Select } from '@/components/ui/input';
import { Badge, EmptyState, PageHeader, Table } from '@/components/ui/misc';
import { t } from '@/i18n';

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
    remainingMonths: z.string().regex(/^(\d{1,4})?$/, t('Whole months')),
    region: z.string(),
    location: z.string(),
    /** "US 62, EU 15, JP 6, EM 11, Other 6" */
    exposure: z
      .string()
      .regex(/^(\s*(TW|US|JP|EU|EM|Other)\s+\d{1,3}(\.\d+)?\s*,?)*$/, t('Use pairs like “US 62, EU 15”')),
    floating: z.boolean(),
    propertyAccountId: z.string(),
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
    remainingMonths: '',
    region: '',
    location: '',
    exposure: '',
    floating: false,
    propertyAccountId: '',
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
  const { liabilities } = useAppData();

  const terms = account ? liabilities.find((l) => l.accountId === account.id) : undefined;
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
          remainingMonths: terms ? String(terms.remainingMonths) : '',
          region: account.region ?? '',
          location: account.location ?? '',
          exposure: exposureText(account.exposure),
          floating: terms?.floating ?? false,
          propertyAccountId: terms?.propertyAccountId ?? '',
        }
      : emptyForm(),
  });
  const type = watch('type');
  const assetClass = watch('assetClass');
  const region = watch('region');
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
      await save(db.liabilities, {
        ...(terms ?? {}),
        accountId: id,
        interestRate: v.interestRate === '' ? 0 : Number(v.interestRate) / 100,
        monthlyPaymentMinor: parseMoneyInput(v.monthlyPayment) ?? 0,
        remainingMonths: v.remainingMonths === '' ? 0 : Number(v.remainingMonths),
        floating: v.floating,
        propertyAccountId: v.propertyAccountId || undefined,
      });
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
          <Field label={t('Remaining term (months)')} error={errors.remainingMonths?.message}>
            {(id) => <Input id={id} inputMode="numeric" {...register('remainingMonths')} />}
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

export function AccountsPage() {
  const { accounts, liabilities, snapshots } = useAppData();
  const [editing, setEditing] = useState<Account | 'new' | undefined>(
    accounts.length === 0 ? 'new' : undefined,
  );
  const [showArchived, setShowArchived] = useState(false);
  const visible = accounts
    .filter((a) => showArchived || !a.archived)
    .sort(
      (a, b) =>
        ACCOUNT_TYPES.indexOf(a.type) - ACCOUNT_TYPES.indexOf(b.type) || a.nickname.localeCompare(b.nickname),
    );
  const hasSnapshots = (id: string) => snapshots.some((s) => s.accountId === id);
  const latest = (id: string) =>
    snapshots.filter((s) => s.accountId === id).sort((x, y) => y.date.localeCompare(x.date))[0];

  return (
    <>
      <PageHeader
        title={t('Accounts')}
        description={t(
          "Every account by nickname. Balances go in Snapshots, in each account's own currency.",
        )}
        actions={
          <Button onClick={() => setEditing('new')}>
            <Plus aria-hidden /> {t('Add account')}
          </Button>
        }
      />
      {editing && (
        <Card className="mb-4">
          <CardHeader
            title={
              editing === 'new' ? t('New account') : t('Edit {nickname}', { nickname: editing.nickname })
            }
          />
          <CardContent>
            <AccountForm
              key={editing === 'new' ? 'new' : editing.id}
              account={editing === 'new' ? undefined : editing}
              onDone={() => setEditing(undefined)}
            />
          </CardContent>
        </Card>
      )}
      {accounts.length === 0 && !editing ? (
        <EmptyState title={t('No accounts yet')}>
          {t('Add your bank, broker, pension and insurance accounts.')}
        </EmptyState>
      ) : (
        <Card>
          <CardHeader
            title={t('{length} account{v}', { length: visible.length, v: visible.length === 1 ? '' : 's' })}
            actions={
              <Checkbox
                label={t('Show archived')}
                checked={showArchived}
                onChange={(e) => setShowArchived(e.target.checked)}
              />
            }
          />
          <CardContent>
            <Table>
              <thead>
                <tr>
                  <th>{t('Nickname')}</th>
                  <th>{t('Institution')}</th>
                  <th>{t('Type')}</th>
                  <th>{t('Asset class')}</th>
                  <th>{t('Currency')}</th>
                  <th className="text-right">{t('Latest balance')}</th>
                  <th>{t('Investable')}</th>
                  <th>{t('Terms')}</th>
                  <th className="w-28" />
                </tr>
              </thead>
              <tbody>
                {visible.map((a) => {
                  const terms = liabilities.find((l) => l.accountId === a.id);
                  return (
                    <tr key={a.id} className={a.archived ? 'opacity-60' : undefined}>
                      <td className="font-medium">
                        {a.nickname} {a.archived && <Badge>{t('Archived')}</Badge>}
                      </td>
                      <td className="text-muted-foreground">{a.institution}</td>
                      <td>{ACCOUNT_TYPE_LABELS[a.type]}</td>
                      <td>{ASSET_CLASS_LABELS[a.assetClass]}</td>
                      <td>{a.currency}</td>
                      <td className="text-right">
                        {latest(a.id) ? (
                          <>
                            {formatMoney(fromMinor(latest(a.id)!.balanceMinor), a.currency)}
                            <div className="text-xs text-subtle">{latest(a.id)!.date}</div>
                          </>
                        ) : (
                          <span className="text-subtle">—</span>
                        )}
                      </td>
                      <td>
                        {a.type === 'liability'
                          ? '—'
                          : a.investable
                            ? a.accessAge
                              ? t('From age {accessAge}', { accessAge: a.accessAge })
                              : t('Yes')
                            : t('No')}
                      </td>
                      <td className="text-muted-foreground">
                        {terms
                          ? t('{toFixed}% · {monthlyPaymentMinor}/mo · {remainingMonths} mo', {
                              toFixed: (terms.interestRate * 100).toFixed(2),
                              monthlyPaymentMinor: formatMoney(
                                fromMinor(terms.monthlyPaymentMinor),
                                a.currency,
                              ),
                              remainingMonths: terms.remainingMonths,
                            })
                          : ''}
                      </td>
                      <td>
                        <div className="flex justify-end gap-1">
                          <Button
                            size="icon"
                            variant="ghost"
                            aria-label={t('Edit {nickname}', { nickname: a.nickname })}
                            onClick={() => setEditing(a)}
                          >
                            <Pencil />
                          </Button>
                          <Button
                            size="icon"
                            variant="ghost"
                            aria-label={
                              a.archived
                                ? t('Restore {nickname}', { nickname: a.nickname })
                                : t('Archive {nickname}', { nickname: a.nickname })
                            }
                            onClick={() => void patch(db.accounts, a.id, { archived: !a.archived })}
                          >
                            {a.archived ? <ArchiveRestore /> : <Archive />}
                          </Button>
                          {!hasSnapshots(a.id) && (
                            <Button
                              size="icon"
                              variant="ghost"
                              aria-label={t('Delete {nickname}', { nickname: a.nickname })}
                              onClick={() => {
                                if (
                                  confirm(
                                    t('Delete {nickname}? It has no snapshots.', { nickname: a.nickname }),
                                  )
                                ) {
                                  void db.transaction('rw', db.accounts, db.liabilities, async () => {
                                    await db.accounts.delete(a.id);
                                    await db.liabilities.delete(a.id);
                                  });
                                }
                              }}
                            >
                              <Trash2 />
                            </Button>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </Table>
            <p className="mt-3 text-xs text-subtle">
              {t('Accounts with snapshots can be archived but not deleted, so history stays intact.')}
            </p>
          </CardContent>
        </Card>
      )}
    </>
  );
}
