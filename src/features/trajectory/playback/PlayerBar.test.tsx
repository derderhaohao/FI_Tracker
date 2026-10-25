import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { Story } from '@/domain/entities';
import type { PlaybackPath } from '@/domain/playback/engine';
import { stamp } from '@/domain/testFixtures';
import { PlayerBar } from './PlayerBar';
import { StoryCards } from './StoryCards';

function setup(patch: Partial<Parameters<typeof PlayerBar>[0]> = {}) {
  const props = {
    month: 24,
    months: 600,
    playing: false,
    reduced: false,
    speed: 'normal' as const,
    ticks: [
      { month: 120, kind: 'event' as const },
      { month: 300, kind: 'stop' as const },
    ],
    canUndo: false,
    hasLive: true,
    onToggle: vi.fn(),
    onRestart: vi.fn(),
    onJump: vi.fn(),
    onSpeed: vi.fn(),
    onUndo: vi.fn(),
    onClearLive: vi.fn(),
    ...patch,
  };
  render(<PlayerBar {...props} />);
  return props;
}

describe('PlayerBar', () => {
  it('plays, pauses and restarts', async () => {
    const p = setup();
    await userEvent.click(screen.getByRole('button', { name: 'Play' }));
    expect(p.onToggle).toHaveBeenCalled();
    await userEvent.click(screen.getByRole('button', { name: 'Restart' }));
    expect(p.onRestart).toHaveBeenCalled();
  });

  it('shows Pause while playing and cannot play with reduced motion', () => {
    setup({ playing: true, reduced: true });
    expect(screen.getByRole('button', { name: 'Pause' })).toBeDisabled();
  });

  it('places the scrubber at the month and changes speed', async () => {
    const p = setup();
    const slider = screen.getByRole('slider', { name: 'Playhead month' });
    expect(slider).toHaveValue('24');
    expect(slider).toHaveAttribute('max', '600');
    await userEvent.click(screen.getByRole('radio', { name: 'Fast' }));
    expect(p.onSpeed).toHaveBeenCalledWith('fast');
  });

  it('moves by a month or a year from the menu and closes it', async () => {
    const p = setup();
    const more = screen.getByRole('button', { name: 'More playback actions' });
    await userEvent.click(more);
    expect(more).toHaveAttribute('aria-expanded', 'true');
    await userEvent.click(screen.getByRole('menuitem', { name: 'Forward one year' }));
    expect(p.onJump).toHaveBeenCalledWith(36);
    expect(screen.queryByRole('menu')).not.toBeInTheDocument();
    await userEvent.click(more);
    await userEvent.click(screen.getByRole('menuitem', { name: 'Back one month' }));
    expect(p.onJump).toHaveBeenCalledWith(23);
    await userEvent.click(more);
    await userEvent.click(screen.getByRole('menuitem', { name: 'Skip to end' }));
    expect(p.onJump).toHaveBeenCalledWith(600);
  });

  it('enables undo and clear only when there is something to undo or clear', async () => {
    const p = setup({ canUndo: false, hasLive: true });
    await userEvent.click(screen.getByRole('button', { name: 'More playback actions' }));
    expect(screen.getByRole('menuitem', { name: 'Undo last event' })).toBeDisabled();
    await userEvent.click(screen.getByRole('menuitem', { name: 'Clear live events' }));
    expect(p.onClearLive).toHaveBeenCalled();
  });

  it('closes the menu with Escape', async () => {
    setup();
    await userEvent.click(screen.getByRole('button', { name: 'More playback actions' }));
    expect(screen.getByRole('menu')).toBeInTheDocument();
    await userEvent.keyboard('{Escape}');
    expect(screen.queryByRole('menu')).not.toBeInTheDocument();
  });
});

describe('StoryCards', () => {
  const normal = { startAge: 40, retireMonth: 180, months: 660 } as unknown as PlaybackPath;
  const saved: Story[] = [
    {
      id: 's1',
      name: 'My crash',
      backdrop: 'normal',
      events: [],
      behaviour: { kind: 'keep' },
      ...stamp,
    } as unknown as Story,
  ];

  it('starts with Normal markets selected and lists saved stories last', () => {
    render(
      <StoryCards saved={saved} selected="normal" normal={normal} onPick={() => {}} onBuild={() => {}} />,
    );
    const radios = screen.getAllByRole('radio');
    expect(radios[0]).toHaveAttribute('aria-checked', 'true');
    expect(radios[0]).toHaveTextContent('Normal markets');
    expect(radios.at(-1)).toHaveTextContent('My crash');
  });

  it('hands back the picked story', async () => {
    const onPick = vi.fn();
    render(<StoryCards saved={saved} selected="normal" normal={normal} onPick={onPick} onBuild={() => {}} />);
    await userEvent.click(screen.getByRole('radio', { name: /My crash/ }));
    expect(onPick).toHaveBeenCalledWith(
      'saved:s1',
      expect.objectContaining({ backdrop: 'normal', events: [] }),
    );
    const combo = screen.getAllByRole('radio')[4];
    await userEvent.click(combo);
    const [, story] = onPick.mock.calls.at(-1)!;
    expect(story.events.length).toBeGreaterThan(0);
    for (const e of story.events) expect(e.start).toBeGreaterThanOrEqual(0);
  });
});
