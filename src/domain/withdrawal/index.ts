import type { WithdrawalRule } from '../entities';
import { t } from '@/i18n';

export interface WithdrawalContext {
  /** Liquid investable portfolio at the start of the year. */
  portfolio: number;
  /** Spending carried from last year (guardrails adjusts it). */
  spending: number;
  /** Planned FI-phase spending S. */
  plannedSpending: number;
  /** Income from guaranteed streams this year. */
  streamIncome: number;
  /** Portfolio dividend yield this year (dividend rule). */
  dividendYield: number;
  swr: number;
}

export interface WithdrawalResult {
  /** Amount taken from the portfolio; negative means surplus income is invested. */
  withdrawal: number;
  /** Spending this year (withdrawal + stream income). */
  spending: number;
}

/**
 * Withdrawal rules (LAB-5). All amounts are real TWD.
 * - fixed_swr: spend S every year, adjusted for inflation (constant in real terms)
 * - guardrails: start at S; when the withdrawal rate drifts more than `band` above
 *   or below the SWR, cut or raise spending by `step`
 * - fixed_percentage: withdraw `rate` × portfolio each year
 * - dividend: withdraw only the portfolio's dividends
 */
export function applyWithdrawalRule(rule: WithdrawalRule, ctx: WithdrawalContext): WithdrawalResult {
  switch (rule.kind) {
    case 'fixed_swr': {
      const spending = ctx.plannedSpending;
      return { spending, withdrawal: spending - ctx.streamIncome };
    }
    case 'guardrails': {
      let spending = ctx.spending;
      const withdrawal = spending - ctx.streamIncome;
      if (ctx.portfolio > 0 && withdrawal > 0) {
        const rate = withdrawal / ctx.portfolio;
        if (rate > ctx.swr * (1 + rule.band)) spending *= 1 - rule.step;
        else if (rate < ctx.swr * (1 - rule.band)) spending *= 1 + rule.step;
      }
      return { spending, withdrawal: spending - ctx.streamIncome };
    }
    case 'fixed_percentage': {
      const withdrawal = Math.max(0, ctx.portfolio) * rule.rate;
      return { withdrawal, spending: withdrawal + ctx.streamIncome };
    }
    case 'dividend': {
      const withdrawal = Math.max(0, ctx.portfolio) * ctx.dividendYield;
      return { withdrawal, spending: withdrawal + ctx.streamIncome };
    }
  }
}

export const WITHDRAWAL_RULE_LABELS: Record<WithdrawalRule['kind'], string> = {
  fixed_swr: t('Fixed real SWR'),
  guardrails: t('Guardrails'),
  fixed_percentage: t('Fixed % of portfolio'),
  dividend: t('Dividends only'),
};

export function defaultWithdrawalRule(kind: WithdrawalRule['kind']): WithdrawalRule {
  switch (kind) {
    case 'fixed_swr':
      return { kind };
    case 'guardrails':
      return { kind, band: 0.2, step: 0.1 };
    case 'fixed_percentage':
      return { kind, rate: 0.04 };
    case 'dividend':
      return { kind };
  }
}
