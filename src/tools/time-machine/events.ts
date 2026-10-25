import { t } from '@/i18n';

/** Dated market periods for chart bands and toasts (TM-18). Hand written, first to last month. */
export interface MarketEvent {
  id: string;
  name: string;
  from: string;
  to: string;
}

export function marketEvents(): MarketEvent[] {
  return [
    { id: 'dotcom', name: t('Dot-com bust'), from: '2000-04', to: '2002-09' },
    { id: 'gfc', name: t('Global financial crisis'), from: '2007-11', to: '2009-02' },
    { id: 'euro', name: t('Euro debt crisis'), from: '2011-05', to: '2011-09' },
    { id: 'china', name: t('China slowdown and oil slump'), from: '2015-08', to: '2016-02' },
    { id: 'q4-2018', name: t('2018 rate scare'), from: '2018-10', to: '2018-12' },
    { id: 'covid', name: t('COVID crash'), from: '2020-02', to: '2020-03' },
    { id: 'rates-2022', name: t('2022 rate rises'), from: '2022-01', to: '2022-09' },
    { id: 'banks-2023', name: t('2023 bank failures'), from: '2023-03', to: '2023-03' },
    { id: 'tariffs-2025', name: t('2025 tariff shock'), from: '2025-02', to: '2025-04' },
  ];
}
