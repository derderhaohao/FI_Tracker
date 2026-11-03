import { Link } from 'react-router-dom';
import { ASSET_CLASS_LABELS, type AssetClass } from '@/domain/entities';
import { allocationGap } from '@/domain/alerts';
import { useAppData } from '@/app/data';
import { ShareBars } from '@/components/charts/ShareBars';
import { Card, CardContent, CardHeader } from '@/components/ui/card';
import { EmptyState, PageHeader } from '@/components/ui/misc';
import { twd, twdCompact } from '@/lib/format';
import { t } from '@/i18n';

/** Allocation and currency, moved from the dashboard to My money (UX doc, D1). */
export function MixPage() {
  const { settings, ctx, accounts } = useAppData();
  const nw = ctx.netWorth;
  if (accounts.length === 0)
    return (
      <>
        <PageHeader title={t('Portfolio mix')} />
        <EmptyState title={t('Add an account first')} to="/money/accounts" action={t('Add an account')}>
          {t('The mix shows how your investments split between asset classes and currencies.')}
        </EmptyState>
      </>
    );
  const targetSum = Object.values(settings.targetAllocation).reduce((a, b) => a + (b ?? 0), 0);
  const byClass = (Object.keys(nw.byAssetClass) as AssetClass[])
    .filter((c) => nw.balances.some((b) => b.account.assetClass === c && b.bucket === 'liquid'))
    .map((c) => {
      const value = nw.balances
        .filter((b) => b.account.assetClass === c && b.bucket === 'liquid')
        .reduce((s, b) => s + b.twd, 0);
      return {
        label: ASSET_CLASS_LABELS[c],
        value,
        target: targetSum > 0 ? (settings.targetAllocation[c] ?? 0) / targetSum : undefined,
      };
    })
    .sort((a, b) => b.value - a.value);
  const byCurrency = Object.entries(nw.byCurrency)
    .map(([label, value]) => ({ label, value }))
    .sort((a, b) => b.value - a.value);
  const gap = Math.round(allocationGap(settings.targetAllocation, nw) * 100);
  return (
    <>
      <PageHeader
        title={t('Portfolio mix')}
        description={t('How your usable investments split, against the target mix for new savings.')}
      />
      <div className="grid grid-cols-1 items-start gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader
            title={t('Allocation')}
            description={t('Liquid investable assets by class; ticks mark the target')}
          />
          <CardContent>
            <ShareBars rows={byClass} ariaLabel={t('Allocation by asset class')} />
            <p className="mt-3 text-xs text-muted-foreground">
              {t('Total {investable}{v}', {
                investable: twd(nw.investable),
                v:
                  nw.locked > 0 &&
                  t(' · {locked} locked until access age not shown', { locked: twdCompact(nw.locked) }),
              })}
            </p>
            <p className="mt-2 text-sm">
              {t('{points} points off the target mix.', { points: gap })}{' '}
              <Link to="/settings/general#allocation" className="text-primary hover:underline">
                {t('Change the target')}
              </Link>
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader title={t('By currency')} description={t('All assets, converted to TWD')} />
          <CardContent>
            <ShareBars rows={byCurrency} ariaLabel={t('Assets by currency')} />
          </CardContent>
        </Card>
      </div>
    </>
  );
}
