import { act, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { UpdatePrompt } from './UpdatePrompt';

const sw = vi.hoisted(() => ({
  needRefresh: false,
  offlineReady: false,
  setNeedRefresh: vi.fn(),
  setOfflineReady: vi.fn(),
  updateServiceWorker: vi.fn(async () => {}),
}));

vi.mock('virtual:pwa-register/react', () => ({
  useRegisterSW: () => ({
    needRefresh: [sw.needRefresh, sw.setNeedRefresh],
    offlineReady: [sw.offlineReady, sw.setOfflineReady],
    updateServiceWorker: sw.updateServiceWorker,
  }),
}));

beforeEach(() => {
  sw.needRefresh = false;
  sw.offlineReady = false;
  vi.clearAllMocks();
});

describe('the offline and new-version note', () => {
  it('waits during first run and setup (UX doc, O1)', () => {
    sw.offlineReady = true;
    const { rerender } = render(<UpdatePrompt holdOffline />);
    expect(screen.queryByRole('status')).not.toBeInTheDocument();
    rerender(<UpdatePrompt />);
    expect(screen.getByRole('status')).toHaveTextContent('FI Tracker now works offline.');
  });

  it('hides the offline note by itself after five seconds', () => {
    vi.useFakeTimers();
    sw.offlineReady = true;
    render(<UpdatePrompt />);
    act(() => void vi.advanceTimersByTime(5000));
    expect(sw.setOfflineReady).toHaveBeenCalledWith(false);
    vi.useRealTimers();
  });

  it('offers a reload when a new version is ready, even while held', async () => {
    sw.needRefresh = true;
    render(<UpdatePrompt holdOffline />);
    expect(screen.getByRole('status')).toHaveTextContent('A new version of FI Tracker is ready.');
    await userEvent.click(screen.getByRole('button', { name: 'Reload' }));
    expect(sw.updateServiceWorker).toHaveBeenCalledWith(true);
    await userEvent.click(screen.getByRole('button', { name: 'Dismiss' }));
    expect(sw.setNeedRefresh).toHaveBeenCalledWith(false);
  });
});
