import { lazy, Suspense, type ReactNode } from 'react';
import { Navigate, Route } from 'react-router-dom';
import { DashboardPage } from '@/features/dashboard/DashboardPage';
import { MixPage } from '@/features/dashboard/MixPage';
import { BalancesPage } from '@/features/position/BalancesPage';
import { CashFlowPage } from '@/features/engine/CashFlowPage';
import { GoalPage } from '@/features/destination/GoalPage';
import { ProjectionPage } from '@/features/trajectory/ProjectionPage';
import { LabPage } from '@/features/lab/LabPage';
import { PlanPage } from '@/features/plan/PlanPage';
import { SurePage } from '@/features/plan/SurePage';
import { ReviewsPage } from '@/features/review/ReviewsPage';
import { SettingsPage } from '@/features/settings/SettingsPage';
import { SetupPage } from '@/features/setup/SetupPage';
import { SetupResult } from '@/features/setup/SetupResult';
import { UpdatePage } from '@/features/update/UpdatePage';
import { Layout } from './Layout';
import { NotFound } from './NotFound';
import { Moved, SectionTabs } from './SectionTabs';
import { t } from '@/i18n';

// Standalone tools load on demand, so the main bundle does not grow (TM-1).
const TimeMachinePage = lazy(() =>
  import('@/tools/time-machine/TimeMachinePage').then((m) => ({ default: m.TimeMachinePage })),
);

export const MONEY_TABS = [
  { to: '/money/balances', label: t('Balances') },
  { to: '/money/cashflow', label: t('Cash flow') },
  { to: '/money/mix', label: t('Portfolio mix') },
] as const;

export const PLAN_TABS = [
  { to: '/plan', label: t('My plan') },
  { to: '/plan/goal', label: t('Goal details') },
  { to: '/plan/lab', label: t('Compare what-ifs') },
  { to: '/plan/sure', label: t('How sure is this?') },
  { to: '/plan/projection', label: t('Year by year') },
] as const;

export const UPDATE_TABS = [
  { to: '/update', label: t('This month') },
  { to: '/update/reviews', label: t('Reviews') },
] as const;

/**
 * The Pro pages under five destinations (UX doc, N1): Home, Update, My money, My plan and
 * Settings. Old addresses redirect to the tab that holds the same content.
 */
export function proRoutes(loading: ReactNode) {
  return (
    <Route element={<Layout />}>
      <Route index element={<DashboardPage />} />
      <Route element={<SectionTabs label={t('Update sections')} tabs={UPDATE_TABS} />}>
        <Route path="update" element={<UpdatePage />} />
        <Route path="update/reviews" element={<ReviewsPage />} />
      </Route>
      <Route path="money" element={<Navigate to="/money/balances" replace />} />
      <Route element={<SectionTabs label={t('My money sections')} tabs={MONEY_TABS} />}>
        <Route path="money/balances" element={<BalancesPage />} />
        <Route path="money/cashflow" element={<CashFlowPage />} />
        <Route path="money/mix" element={<MixPage />} />
      </Route>
      <Route element={<SectionTabs label={t('My plan sections')} tabs={PLAN_TABS} />}>
        <Route path="plan" element={<PlanPage />} />
        <Route path="plan/sure" element={<SurePage />} />
        <Route path="plan/projection" element={<ProjectionPage />} />
        <Route path="plan/goal" element={<GoalPage />} />
        <Route path="plan/lab" element={<LabPage />} />
      </Route>
      {/* Accounts and Snapshots are one Balances page now (UX doc, M2). */}
      <Route path="money/accounts" element={<Moved to="/money/balances" />} />
      <Route path="money/snapshots" element={<Moved to="/money/balances" />} />
      <Route path="accounts" element={<Moved to="/money/balances" />} />
      <Route path="snapshots" element={<Moved to="/money/balances" />} />
      <Route path="cashflow" element={<Moved to="/money/cashflow" />} />
      <Route path="goal" element={<Moved to="/plan/goal" />} />
      <Route path="projection" element={<Moved to="/plan/projection" />} />
      <Route path="lab" element={<Moved to="/plan/lab" />} />
      <Route path="reviews" element={<Moved to="/update/reviews" />} />
      <Route path="settings" element={<SettingsPage />} />
      <Route path="settings/:section" element={<SettingsPage />} />
      <Route path="setup" element={<SetupPage />} />
      <Route path="setup/done" element={<SetupResult />} />
      <Route
        path="tools/time-machine"
        element={
          <Suspense fallback={loading}>
            <TimeMachinePage />
          </Suspense>
        }
      />
      <Route path="kids/*" element={<Navigate to="/" replace />} />
      <Route path="*" element={<NotFound />} />
    </Route>
  );
}
