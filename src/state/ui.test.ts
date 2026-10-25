import { MAX_COMPARE, useUi } from './ui';

const initial = useUi.getState();
afterEach(() => useUi.setState(initial, true));

describe('UI state', () => {
  it('toggles real and nominal money and the selected scenario', () => {
    useUi.getState().setValueMode('nominal');
    expect(useUi.getState().valueMode).toBe('nominal');
    useUi.getState().selectScenario('s1');
    expect(useUi.getState().selectedScenarioId).toBe('s1');
  });

  it('gives each compared scenario a colour slot that it keeps', () => {
    const { toggleCompare } = useUi.getState();
    toggleCompare('a');
    toggleCompare('b');
    toggleCompare('c');
    expect(useUi.getState().compare).toEqual({ a: 0, b: 1, c: 2 });
    toggleCompare('b');
    expect(useUi.getState().compare).toEqual({ a: 0, c: 2 });
    // The free slot is reused; the others stay put.
    toggleCompare('d');
    expect(useUi.getState().compare).toEqual({ a: 0, c: 2, d: 1 });
  });

  it('compares at most five scenarios', () => {
    const { toggleCompare, setCompare } = useUi.getState();
    for (const id of ['a', 'b', 'c', 'd', 'e', 'f']) toggleCompare(id);
    expect(Object.keys(useUi.getState().compare)).toHaveLength(MAX_COMPARE);
    expect(useUi.getState().compare.f).toBeUndefined();
    setCompare(['x', 'y', 'z', 'w', 'v', 'u']);
    expect(useUi.getState().compare).toEqual({ x: 0, y: 1, z: 2, w: 3, v: 4 });
  });

  it('keeps the Monte Carlo runs and seed', () => {
    useUi.getState().setMcRuns(5000);
    useUi.getState().setMcSeed(7);
    expect(useUi.getState()).toMatchObject({ mcRuns: 5000, mcSeed: 7 });
  });

  it('remembers the Strategy Lab view and starter card on this device', () => {
    useUi.getState().setLabView('advanced');
    useUi.getState().setLabStarter('dismissed');
    expect(useUi.getState()).toMatchObject({ labView: 'advanced', labStarter: 'dismissed' });
    expect(localStorage.getItem('fi-tracker-lab-view')).toBe('advanced');
    expect(localStorage.getItem('fi-tracker-lab-starter')).toBe('dismissed');
  });
});
