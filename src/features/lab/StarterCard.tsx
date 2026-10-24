import { useState } from 'react';
import { X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Field, Input } from '@/components/ui/input';
import { checkTemplateValues, TEMPLATES, type Template, type TemplateResult } from './templates';
import type { LabRow } from './model';
import { t } from '@/i18n';

/** What-if template chips with a small form for the one or two numbers each needs (R2). */
export function TemplatePicker({
  today,
  onCreate,
}: {
  today: LabRow;
  onCreate: (r: TemplateResult) => void | Promise<void>;
}) {
  const [open, setOpen] = useState<Template>();
  const [values, setValues] = useState<Record<string, string>>({});
  const parsed = Object.fromEntries(
    Object.entries(values).map(([k, v]) => [k, Number(v.replace(/[,\s]/g, ''))]),
  );
  const error = open ? checkTemplateValues(open, parsed, today.input) : undefined;
  const preview = open && !error ? open.build(parsed, today) : undefined;
  return (
    <div>
      <div className="flex flex-wrap gap-2" role="group" aria-label={t('What-if templates')}>
        {TEMPLATES.map((t) => (
          <Button
            key={t.kind}
            size="sm"
            variant={open?.kind === t.kind ? 'default' : 'outline'}
            aria-pressed={open?.kind === t.kind}
            onClick={() => {
              if (open?.kind === t.kind) return setOpen(undefined);
              setOpen(t);
              setValues(
                Object.fromEntries(Object.entries(t.defaults(today)).map(([k, v]) => [k, String(v)])),
              );
            }}
          >
            {t.label}
          </Button>
        ))}
      </div>
      {open && (
        <form
          className="mt-3 flex flex-wrap items-end gap-3 rounded-md border p-3"
          onSubmit={(e) => {
            e.preventDefault();
            if (preview) void onCreate(preview);
            setOpen(undefined);
          }}
        >
          {open.fields.map((f) => (
            <Field key={f.key} label={f.label + (f.kind === 'percent' ? ' (%)' : '')} hint={f.hint}>
              {(id) => (
                <Input
                  id={id}
                  className="h-8 w-40 text-right"
                  inputMode={f.kind === 'money' ? 'decimal' : 'numeric'}
                  value={values[f.key] ?? ''}
                  onChange={(e) => setValues({ ...values, [f.key]: e.target.value })}
                />
              )}
            </Field>
          ))}
          <div className="flex flex-col gap-1">
            <Button type="submit" size="sm" disabled={!preview}>
              {t('Create “{v}”', { v: preview?.name ?? '…' })}
            </Button>
            {error && <span className="text-xs text-critical">{error}</span>}
          </div>
        </form>
      )}
    </div>
  );
}

/** Three-step starter shown until the first custom what-if (PRD R1). */
export function StarterCard({
  today,
  todaySentence,
  onCreate,
  onDismiss,
}: {
  today: LabRow;
  todaySentence: string;
  onCreate: (r: TemplateResult) => void | Promise<void>;
  onDismiss: () => void;
}) {
  return (
    <Card className="mb-4" aria-label={t('How Strategy Lab works')}>
      <CardContent className="relative p-5">
        <button
          type="button"
          className="absolute top-3 right-3 rounded p-1 text-muted-foreground hover:bg-surface-2"
          aria-label={t('Dismiss the starter guide')}
          onClick={onDismiss}
        >
          <X className="size-4" />
        </button>
        <ol className="grid grid-cols-1 gap-4 md:grid-cols-3">
          <li>
            <div className="text-xs font-semibold text-primary uppercase">{t('Step 1')}</div>
            <div className="font-semibold">{t('Your plan today')}</div>
            <p className="mt-1 text-sm text-muted-foreground">{todaySentence}</p>
          </li>
          <li className="md:col-span-2">
            <div className="text-xs font-semibold text-primary uppercase">{t('Step 2')}</div>
            <div className="font-semibold">{t('Try a what-if')}</div>
            <p className="mt-1 mb-2 text-sm text-muted-foreground">
              {t('Pick a change; it starts from your numbers today and names itself after what it does.')}
            </p>
            <TemplatePicker today={today} onCreate={onCreate} />
          </li>
          <li className="md:col-span-3">
            <div className="text-xs font-semibold text-primary uppercase">{t('Step 3')}</div>
            <div className="font-semibold">{t('See if it holds up')}</div>
            <p className="mt-1 text-sm text-muted-foreground">
              {t(
                'Each what-if gets the same plain verdict, side by side with your plan, plus the changes that would make it safer.',
              )}
            </p>
          </li>
        </ol>
      </CardContent>
    </Card>
  );
}
