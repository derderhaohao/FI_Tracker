import { JAR_COLORS } from './art/palette';
import { jarName, splitWords } from './copy';
import type { Jar, Split } from './math';

const JARS: Jar[] = ['spend', 'save', 'grow'];

/** The split as a coloured bar with two sliders: Spend, then Save; Grow takes the rest. */
export function SplitEditor({ split, onChange }: { split: Split; onChange: (s: Split) => void }) {
  return (
    <div className="flex flex-col gap-3">
      <div className="flex h-8 overflow-hidden rounded-full" aria-hidden>
        {JARS.map((j) => (
          <div key={j} style={{ width: `${split[j]}%`, background: JAR_COLORS[j] }} />
        ))}
      </div>
      <label className="flex flex-col gap-1">
        <span className="font-semibold">
          {jarName('spend')}: {splitWords(split.spend)}
        </span>
        <input
          type="range"
          min={0}
          max={100}
          step={10}
          value={split.spend}
          aria-valuetext={splitWords(split.spend)}
          className="h-10 accent-[#f59e0b]"
          onChange={(e) => {
            const spend = Number(e.target.value);
            const save = Math.min(split.save, 100 - spend);
            onChange({ spend, save, grow: 100 - spend - save });
          }}
        />
      </label>
      <label className="flex flex-col gap-1">
        <span className="font-semibold">
          {jarName('save')}: {splitWords(split.save)}
        </span>
        <input
          type="range"
          min={0}
          max={100 - split.spend}
          step={10}
          value={split.save}
          aria-valuetext={splitWords(split.save)}
          className="h-10 accent-[#3b82f6]"
          onChange={(e) => {
            const save = Number(e.target.value);
            onChange({ spend: split.spend, save, grow: 100 - split.spend - save });
          }}
        />
      </label>
      <p className="font-semibold">
        {jarName('grow')}: {splitWords(split.grow)}
      </p>
    </div>
  );
}
