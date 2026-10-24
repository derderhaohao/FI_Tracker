import { Link } from 'react-router-dom';
import { useAppData } from '@/app/data';
import { Notice } from '@/components/ui/misc';
import { tn } from '@/i18n';

/**
 * Loans whose payment has not been placed yet (saved before loans were linked to cash flow).
 * Until placed they count as already inside spending, which is the usual case.
 */
export function LoanNotice({ className, link = true }: { className?: string; link?: boolean }) {
  const { liabilities, accounts } = useAppData();
  const open = liabilities.filter(
    (l) =>
      l.monthlyPaymentMinor > 0 &&
      l.cashFlow === undefined &&
      accounts.some((a) => a.id === l.accountId && !a.archived),
  ).length;
  if (open === 0) return null;
  return (
    <Notice
      className={className}
      action={
        link && (
          <Link to="/accounts" className="text-sm font-medium text-primary hover:underline whitespace-nowrap">
            {tn(open, 'Open the loan', 'Open the loans')}
          </Link>
        )
      }
    >
      {tn(
        open,
        'Loan payments now come from the loan’s terms in Accounts. Tell it where the payment sits in your cash flow (or let it add the payment for you), so it is never counted twice.',
        'Loan payments now come from each loan’s terms in Accounts. Tell each one where its payment sits in your cash flow (or let it add the payment for you), so none is counted twice.',
      )}
    </Notice>
  );
}
