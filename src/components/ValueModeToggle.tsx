import { useUi } from '@/state/ui';
import { Segmented } from '@/components/ui/misc';

/** Real / nominal toggle shown on every chart that projects forward. */
export function ValueModeToggle() {
  const { valueMode, setValueMode } = useUi();
  return (
    <Segmented
      label="Today's or future money"
      value={valueMode}
      onChange={setValueMode}
      options={[
        { value: 'real', label: "Today's money" },
        { value: 'nominal', label: 'Future money' },
      ]}
    />
  );
}
