import { Link, useLocation } from 'react-router-dom';
import { PageHeader } from '@/components/ui/misc';
import { t } from '@/i18n';

/** Unknown links say so instead of silently showing the Dashboard (product review, issue 12). */
export function NotFound() {
  const { pathname } = useLocation();
  return (
    <>
      <PageHeader title={t('Page not found')} />
      <p className="text-sm text-muted-foreground">
        {t('There is no page at')} <code>#{pathname}</code>.{' '}
        <Link to="/" className="text-primary hover:underline">
          {t('Go to the Dashboard')}
        </Link>
        .
      </p>
    </>
  );
}
