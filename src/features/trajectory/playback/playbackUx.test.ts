import { describe, expect, it } from 'vitest';
import { BACKDROPS, COMBOS, EVENTS, LUMP_EVENT, PALETTE_EVENTS } from '@/domain/playback/library';
import { PLAIN, SHAPES } from './plain';
import { eventsForTab, REGION_EVENTS } from './pickerModel';
import { storyCards } from './stories';
import { assignLanes, monthAt } from './trackModel';

describe('event track geometry (PX-5)', () => {
  it('puts overlapping chips on separate lanes and reuses a lane once it is free', () => {
    expect(
      assignLanes([
        { x: 0, width: 100 },
        { x: 50, width: 100 },
        { x: 200, width: 50 },
        { x: 120, width: 40 },
      ]),
    ).toEqual([0, 1, 0, 0]);
  });

  it('maps a position on the plot to a whole month, clamped to the story', () => {
    expect(monthAt(64, 64, 600, 720)).toBe(0);
    expect(monthAt(364, 64, 600, 720)).toBe(360);
    expect(monthAt(10, 64, 600, 720)).toBe(0);
    expect(monthAt(2000, 64, 600, 720)).toBe(720);
    expect(monthAt(100, 64, 0, 720)).toBe(0);
  });
});

describe('event picker tabs (PX-4)', () => {
  it('splits the library into bad, good and personal tabs without losing events', () => {
    const bad = eventsForTab('bad', PALETTE_EVENTS, []);
    const good = eventsForTab('good', PALETTE_EVENTS, []);
    const personal = eventsForTab('personal', PALETTE_EVENTS, []);
    expect(bad.length + good.length + personal.length).toBe(PALETTE_EVENTS.length);
    expect(bad.map((e) => e.id)).toContain('gfc');
    expect(good.map((e) => e.id)).toContain('ai_boom');
    expect(personal.map((e) => e.id)).toContain('job_loss');
  });

  it('lists only known events in the region tab, and favourites in pin order', () => {
    const ids = new Set(EVENTS.map((e) => e.id));
    for (const id of REGION_EVENTS) expect(ids.has(id), id).toBe(true);
    expect(eventsForTab('favourites', PALETTE_EVENTS, ['windfall', 'gfc', 'nope']).map((e) => e.id)).toEqual([
      'windfall',
      'gfc',
    ]);
  });
});

describe('plain one-liners and story cards (PX-2, PX-13)', () => {
  it('has a plain line for every backdrop, palette event, combination and the lump', () => {
    const ids = [
      ...BACKDROPS.map((b) => b.id),
      ...PALETTE_EVENTS.map((e) => e.id),
      ...COMBOS.map((c) => c.id),
      LUMP_EVENT.id,
    ];
    for (const id of ids) expect(PLAIN[id], id).toBeTruthy();
  });

  it('starts with Normal markets and ends with saved stories', () => {
    const cards = storyCards([
      { id: 's1', name: 'Mine', backdrop: 'normal', events: [], behaviour: { kind: 'keep' } } as never,
    ]);
    expect(cards[0].id).toBe('normal');
    expect(cards[0].name).toBe('Normal markets');
    expect(cards.at(-1)?.id).toBe('saved:s1');
    for (const c of cards) expect(c.shape || SHAPES.saved).toBeTruthy();
  });
});
