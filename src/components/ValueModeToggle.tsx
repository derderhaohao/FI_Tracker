import { useUi } from '@/state/ui';
import { Segmented } from '@/components/ui/misc';
import { t } from '@/i18n';

/** Real / nominal toggle shown on every chart that projects forward. */
export function ValueModeToggle() {
  const { valueMode, setValueMode } = useUi();
  return (
    <Segmented
      label={t("Today's or future money")}
      value={valueMode}
      onChange={setValueMode}
      options={[
        { value: 'real', label: t("Today's money") },
        { value: 'nominal', label: t('Future money') },
      ]}
    />
  );
}
