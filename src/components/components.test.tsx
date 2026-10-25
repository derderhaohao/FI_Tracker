import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { LanguageSwitch } from './LanguageSwitch';
import { ModeSwitch } from './ModeSwitch';
import { AssumptionBadge } from './AssumptionBadge';
import { Dots } from '@/features/lab/Dots';
import { WelcomeMode } from '@/app/WelcomeMode';
import { getMode, setMode } from '@/lib/mode';
import { getLang, setLang } from '@/i18n';
import { makeAssumptions } from '@/domain/testFixtures';

const reload = vi.fn();

beforeAll(() => {
  // jsdom cannot reload; the switch reloads so every label is rebuilt.
  Object.defineProperty(window, 'location', {
    configurable: true,
    value: { ...window.location, hash: '', reload },
  });
});

afterEach(() => {
  setLang('en');
  setMode('pro');
  window.location.hash = '';
  reload.mockClear();
});

describe('LanguageSwitch', () => {
  it('shows both languages, marks the current one, and reloads after a change', async () => {
    render(<LanguageSwitch />);
    expect(screen.getByRole('radio', { name: 'English' })).toHaveAttribute('aria-checked', 'true');
    await userEvent.click(screen.getByRole('radio', { name: '繁體中文' }));
    expect(getLang()).toBe('zh-TW');
    expect(reload).toHaveBeenCalledTimes(1);
  });
});

describe('ModeSwitch', () => {
  it('switches the device to Beginner mode and opens the kids space', async () => {
    render(<ModeSwitch />);
    await userEvent.click(screen.getByRole('button', { name: 'Switch to Beginner mode' }));
    expect(getMode()).toBe('beginner');
    expect(window.location.hash).toBe('#/kids');
  });

  it('takes a custom label', () => {
    render(<ModeSwitch label="Kids" />);
    expect(screen.getByRole('button', { name: 'Kids' })).toBeInTheDocument();
  });
});

describe('WelcomeMode', () => {
  it('asks who is using the app and keeps the answer', async () => {
    render(<WelcomeMode />);
    expect(screen.getByRole('heading', { name: 'Who is using this today?' })).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: /A grown-up planning money/ }));
    expect(getMode()).toBe('pro');
    expect(window.location.hash).toBe('');
  });

  it('opens Beginner mode for a child', async () => {
    render(<WelcomeMode />);
    await userEvent.click(screen.getByRole('button', { name: /A kid learning about money/ }));
    expect(getMode()).toBe('beginner');
    expect(window.location.hash).toBe('#/kids');
  });
});

describe('AssumptionBadge', () => {
  it('names the assumption set and links to it', () => {
    const set = makeAssumptions();
    render(
      <MemoryRouter>
        <AssumptionBadge set={set} />
      </MemoryRouter>,
    );
    const link = screen.getByRole('link');
    expect(link).toHaveAttribute('href', '/settings#assumptions');
    expect(link).toHaveTextContent(set.name);
    expect(link).toHaveTextContent(/inflation/);
  });
});

describe('Dots', () => {
  it('fills the given number of ten dots', () => {
    const { container } = render(<Dots filled={7} label="7 in 10" />);
    expect(screen.getByRole('img', { name: '7 in 10' })).toBeInTheDocument();
    const dots = container.querySelectorAll('span > span');
    expect(dots).toHaveLength(10);
    expect([...dots].filter((d) => d.className.includes('bg-primary'))).toHaveLength(7);
  });
});
