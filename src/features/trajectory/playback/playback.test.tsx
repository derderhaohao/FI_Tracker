import type { ReactNode } from 'react';
import { act, fireEvent, renderHook, screen, waitFor, within } from '@testing-library/react';
import userEvent, { type UserEvent } from '@testing-library/user-event';
import { db } from '@/db/db';
import { DataProvider } from '@/app/data';
import { runMonteCarlo } from '@/domain/montecarlo/runner';
import type { MonteCarloOptions } from '@/domain/montecarlo/runner';
import type { ProjectionInput } from '@/domain/projection';
import { NORMAL_STORY } from '@/domain/playback/engine';
import { installChartStubs, renderApp, resetDemo } from '@/test/renderApp';
import { usePlayback } from './usePlayback';

/** Play mode: live events, undo and the story's settings, on the demo household. */

vi.setConfig({ testTimeout: 30_000 });

vi.mock('@/lib/mcWorker', async (original) => ({
  ...(await original<typeof import('@/lib/mcWorker')>()),
  monteCarloWorker: () => ({
    run: async (inputs: ProjectionInput[], o: MonteCarloOptions) =>
      inputs.map((i) => runMonteCarlo(i, { ...o, runs: 50 })),
    chances: async () => [],
  }),
}));

const downloads = vi.hoisted(() => [] as { name: string; text: string }[]);
vi.mock('@/lib/download', async (original) => ({
  ...(await original<typeof import('@/lib/download')>()),
  downloadText: (name: string, text: string) => void downloads.push({ name, text }),
}));

beforeAll(() => installChartStubs());
afterAll(() => vi.unstubAllGlobals());
beforeEach(async () => {
  await resetDemo();
  downloads.length = 0;
});

function wrapper({ children }: { children: ReactNode }) {
  return <DataProvider fallback={null}>{children}</DataProvider>;
}

async function playback() {
  const hook = renderHook(() => usePlayback(), { wrapper });
  await waitFor(() => expect(hook.result.current).toBeTruthy(), { timeout: 5000 });
  return hook;
}

describe('the playback state (LE-2 to LE-6)', () => {
  it('fires an event, lowers the path after it, and logs its impact', async () => {
    const { result } = await playback();
    const normal = result.current.path;
    expect(result.current.canUndo).toBe(false);
    let error: string | undefined;
    act(() => void (error = result.current.fire('gfc', 24, 'severe')));
    expect(error).toBeUndefined();
    expect(result.current.live).toHaveLength(1);
    expect(result.current.log[0]).toMatchObject({ eventId: 'gfc', month: 24, severity: 'severe' });
    expect(result.current.canUndo).toBe(true);
    const later = 24 + 12;
    expect(result.current.path.investable[later]).toBeLessThan(normal.investable[later]);
    // Months before the event are untouched.
    expect(result.current.path.investable[12]).toBeCloseTo(normal.investable[12], 6);
    expect(result.current.remaining('gfc', 24)).toBeGreaterThan(0);
    expect(result.current.remaining('gfc', 0)).toBe(0);
  });

  it('refuses an unknown event, the same event twice, and a sixth at once', async () => {
    const { result } = await playback();
    expect(result.current.fire('no-such-event', 12)).toBe('Unknown event.');
    act(() => void result.current.fire('gfc', 12));
    let error: string | undefined;
    act(() => void (error = result.current.fire('gfc', 13)));
    expect(error).toMatch(/is still running; it can be fired again when it ends\.$/);
    for (const id of ['oil_shock', 'tech_bubble', 'us_housing', 'asian_currency'])
      act(() => void result.current.fire(id, 12));
    expect(result.current.live).toHaveLength(5);
    act(() => void (error = result.current.fire('europe_war', 12)));
    expect(error).toBe('At most 5 events can run at the same time.');
  });

  it('removes one event, undoes exactly, and clears them all', async () => {
    const { result } = await playback();
    const normal = Array.from(result.current.path.investable);
    act(() => void result.current.fire('gfc', 12));
    act(() => void result.current.fire('oil_shock', 60));
    const both = Array.from(result.current.path.investable);

    act(() => result.current.remove(result.current.log[1].uid));
    expect(result.current.live.map((e) => e.eventId)).toEqual(['gfc']);
    act(() => result.current.undo());
    expect(result.current.live).toHaveLength(2);
    expect(Array.from(result.current.path.investable)).toEqual(both);

    act(() => result.current.clearLive());
    expect(result.current.live).toHaveLength(0);
    expect(result.current.log).toHaveLength(0);
    expect(result.current.path.investable.at(-1)).toBeCloseTo(normal.at(-1)!, 0);
    // Clearing nothing changes nothing.
    act(() => result.current.clearLive());
    expect(result.current.canUndo).toBe(true);
  });

  it('starts over when the story changes, unless asked to keep live events', async () => {
    const { result } = await playback();
    act(() => void result.current.fire('gfc', 12));
    act(() => result.current.changeStory({ ...NORMAL_STORY, behaviour: { kind: 'pause' } }, true));
    expect(result.current.live).toHaveLength(1);
    expect(result.current.story.behaviour).toEqual({ kind: 'pause' });
    act(() => result.current.changeStory(NORMAL_STORY));
    expect(result.current.live).toHaveLength(0);
    expect(result.current.canUndo).toBe(false);
  });
});

async function playMode(user: UserEvent) {
  renderApp('/plan/projection');
  await screen.findByRole('heading', { level: 1, name: 'Year by year' }, { timeout: 5000 });
  await user.click(screen.getByRole('radio', { name: 'Play a story' }));
  await screen.findAllByText('One possible story, not a forecast.', {}, { timeout: 5000 });
}

describe('Play mode on the projection', () => {
  it('splits the chart by class, region or currency', async () => {
    const user = userEvent.setup();
    await playMode(user);
    expect(screen.queryByRole('radiogroup', { name: 'Group by' })).not.toBeInTheDocument();
    await user.click(screen.getByRole('radio', { name: 'Breakdown' }));
    const groups = screen.getByRole('radiogroup', { name: 'Group by' });
    await user.click(within(groups).getByRole('radio', { name: 'Region' }));
    expect(within(groups).getByRole('radio', { name: 'Region' })).toHaveAttribute('aria-checked', 'true');
    await user.click(within(groups).getByRole('radio', { name: 'Currency' }));
    expect(within(groups).getByRole('radio', { name: 'Currency' })).toHaveAttribute('aria-checked', 'true');
  });

  it('shows the asset groups at the playhead, the history, and exports it', async () => {
    const user = userEvent.setup();
    await playMode(user);
    expect(screen.getByRole('table', { name: 'Asset groups at the playhead' })).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Show history' }));
    expect(screen.getByRole('columnheader', { name: 'Age' })).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Export CSV' }));
    expect(downloads[0].name).toBe('fi-tracker-playback.csv');
    // A header, then rows of the history by age.
    const lines = downloads[0].text.trim().split('\n');
    expect(lines[0]).toMatch(/age/i);
    expect(lines.length).toBeGreaterThan(1);
    await user.click(screen.getByRole('button', { name: 'Show the playhead month' }));
    expect(screen.getByRole('table', { name: 'Asset groups at the playhead' })).toBeInTheDocument();
  });

  it('saves the story and its settings from Advanced', async () => {
    const user = userEvent.setup();
    await playMode(user);
    await user.click(screen.getByText('Advanced'));
    await user.selectOptions(screen.getByLabelText('During events'), 'pause');
    await user.click(screen.getByLabelText('Market noise'));
    await user.type(screen.getByLabelText('Name'), 'Quiet decade');
    await user.click(screen.getByRole('button', { name: 'Save this story' }));
    expect(await screen.findByText('Saved “Quiet decade”.')).toBeInTheDocument();
    const saved = (await db.settings.get('singleton'))!.stories!.find((x) => x.name === 'Quiet decade')!;
    expect(saved.behaviour).toEqual({ kind: 'pause' });
    expect(saved.noiseSeed).toBeDefined();
    // Saving a run needs live events first.
    expect(screen.getByRole('button', { name: 'Save this run (with live events)' })).toBeDisabled();
  });

  it('imports a story file and rejects anything else', async () => {
    const user = userEvent.setup();
    await playMode(user);
    await user.click(screen.getByText('Advanced'));
    const input = screen.getByLabelText('Story file');
    fireEvent.change(input, { target: { files: [new File(['{"hello":1}'], 'x.json')] } });
    expect(await screen.findByText('Could not import: not a story file')).toBeInTheDocument();
    const story = {
      id: 's1',
      name: 'Shared blockade',
      backdrop: 'normal',
      events: [{ uid: 'e1', eventId: 'blockade', start: 12, severity: 'typical', source: 'scheduled' }],
      behaviour: { kind: 'keep' },
    };
    fireEvent.change(input, { target: { files: [new File([JSON.stringify({ story })], 's.json')] } });
    expect(await screen.findByText('Imported “Shared blockade”.')).toBeInTheDocument();
    expect((await db.settings.get('singleton'))!.stories!.some((x) => x.name === 'Shared blockade')).toBe(
      true,
    );
  });

  it('turns playback pauses on and off', async () => {
    const user = userEvent.setup();
    await playMode(user);
    await user.click(screen.getByText('Advanced'));
    await user.click(screen.getByText('Playback settings'));
    const box = screen.getByLabelText('Pause 3 s at each event') as HTMLInputElement;
    const before = box.checked;
    await user.click(box);
    await waitFor(async () =>
      expect((await db.settings.get('singleton'))!.playback?.autoPause).toBe(!before),
    );
  });

  it('plays and pauses with Space, fires a pinned event with its number key, and undoes with Ctrl+Z', async () => {
    const user = userEvent.setup();
    await playMode(user);
    const stage = screen.getByLabelText('Stage');
    expect(within(stage).queryByLabelText('Impact of the last event')).not.toBeInTheDocument();
    // Arrow keys step the playhead; number keys fire the pinned events.
    fireEvent.keyDown(document.body, { key: 'ArrowRight', shiftKey: true });
    fireEvent.keyDown(document.body, { key: '1' });
    expect(await screen.findByLabelText('Impact of the last event')).toBeInTheDocument();
    fireEvent.keyDown(document.body, { key: 'z', ctrlKey: true });
    await waitFor(() => expect(screen.queryByLabelText('Impact of the last event')).not.toBeInTheDocument());

    fireEvent.keyDown(document.body, { key: ' ' });
    expect(await screen.findAllByRole('button', { name: /^Pause/ })).not.toHaveLength(0);
    fireEvent.keyDown(document.body, { key: ' ' });
    await waitFor(() => expect(screen.queryAllByRole('button', { name: /^Pause$/ })).toHaveLength(0));
  });
});
