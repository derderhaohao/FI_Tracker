import { Languages } from 'lucide-react';
import { Segmented } from '@/components/ui/misc';
import { LANGS, setLang, useLang, type Lang } from '@/i18n';

/**
 * English / 繁體中文. The page reloads so every label, chart and saved calculation is
 * rebuilt in the new language; the data itself stays in this browser.
 */
export function LanguageSwitch({ className }: { className?: string }) {
  const lang = useLang();
  const change = (l: Lang) => {
    setLang(l);
    window.location.reload();
  };
  return (
    <div className={className}>
      <span className="mb-1 flex items-center gap-1.5 text-xs text-subtle">
        <Languages className="size-3.5" aria-hidden />
        Language · 語言
      </span>
      <Segmented label="Language · 語言" value={lang} options={LANGS} onChange={change} />
    </div>
  );
}
