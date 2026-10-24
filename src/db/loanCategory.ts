import { LOAN_CATEGORY } from '@/domain/loans';
import { t } from '@/i18n';
import { db } from './db';
import { newId, save } from './repo';

/** The "Loan payments" expense row that loans added automatically fill; created on first use. */
export async function ensureLoanCategory(): Promise<string> {
  const existing = (await db.categories.toArray()).find((c) => c.system === LOAN_CATEGORY);
  if (existing) return existing.id;
  const id = newId();
  await save(db.categories, {
    id,
    name: t('Loan payments'),
    kind: 'expense',
    essential: true,
    system: LOAN_CATEGORY,
  });
  return id;
}
