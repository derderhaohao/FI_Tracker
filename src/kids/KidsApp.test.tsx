import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { KidsApp } from './KidsApp';
import { kidsDb } from './db';

// Whole screens with many clicks: allow for slower CI runners under coverage.
vi.setConfig({ testTimeout: 20_000 });

/** Beginner mode end to end in the DOM, on its own database (fake IndexedDB in tests). */
function renderAt(path: string) {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <Routes>
        <Route path="/kids/*" element={<KidsApp />} />
      </Routes>
    </MemoryRouter>,
  );
}

async function keypad(digits: string) {
  const pad = screen.getByRole('group', { name: 'Coin keypad' });
  for (const d of digits) await userEvent.click(within(pad).getByRole('button', { name: d }));
}

const user = userEvent.setup();

beforeEach(async () => {
  await Promise.all(kidsDb.tables.map((t) => t.clear()));
});

describe('Beginner mode screens', () => {
  it('asks for a profile first and greets the child', async () => {
    renderAt('/kids');
    expect(await screen.findByRole('heading', { name: 'Hello! Who is learning today?' })).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Start' }));
    // No nickname yet: nothing is created.
    expect(await kidsDb.profiles.count()).toBe(0);
    await user.type(screen.getByPlaceholderText('A fun name, not your real one'), 'Mimi');
    await user.click(screen.getByRole('button', { name: 'Animal 3' }));
    await user.click(screen.getByRole('button', { name: 'Older' }));
    await user.click(screen.getByRole('button', { name: 'Start' }));
    expect(await screen.findByRole('heading', { name: 'Hi, Mimi!' })).toBeInTheDocument();
    const profile = (await kidsDb.profiles.toArray())[0];
    expect(profile).toMatchObject({ nickname: 'Mimi', avatar: 2, age: 10 });
  });

  it('splits money in across the jars and asks before spending from Savings', async () => {
    renderAt('/kids');
    await user.type(await screen.findByPlaceholderText('A fun name, not your real one'), 'Leo');
    await user.click(screen.getByRole('button', { name: 'Start' }));
    await screen.findByRole('heading', { name: 'Hi, Leo!' });

    await user.click(screen.getByRole('button', { name: 'I got money' }));
    await user.click(await screen.findByRole('button', { name: 'Allowance' }));
    await keypad('100');
    await user.click(screen.getByRole('button', { name: 'Put it in my jars' }));
    await user.click(await screen.findByRole('link', { name: 'Garden' }));
    expect(await screen.findByTestId('jar-spend')).toHaveTextContent('NT$50');
    expect(screen.getByTestId('jar-save')).toHaveTextContent('NT$30');
    expect(screen.getByTestId('jar-grow')).toHaveTextContent('NT$20');

    await user.click(screen.getByRole('button', { name: 'I spent money' }));
    await user.click(await screen.findByRole('button', { name: 'Snack' }));
    await user.click(screen.getByRole('button', { name: 'Need' }));
    await keypad('60');
    await user.click(screen.getByRole('button', { name: 'Take it out' }));
    expect(
      await screen.findByText('Your Spend jar has NT$50. Use NT$10 from your Savings jar too?'),
    ).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Yes, use Savings' }));
    expect(await screen.findByText('Snack · Spend · Need')).toBeInTheDocument();

    const entries = await kidsDb.entries.toArray();
    const sum = (jar: string) => entries.filter((e) => e.jar === jar).reduce((a, e) => a + e.amount, 0);
    expect([sum('spend'), sum('save'), sum('grow')]).toEqual([0, 20, 20]);
  });

  it('adds a goal and shows the weeks to go', async () => {
    renderAt('/kids');
    await user.type(await screen.findByPlaceholderText('A fun name, not your real one'), 'Ivy');
    await user.click(screen.getByRole('button', { name: 'Start' }));
    await screen.findByRole('heading', { name: 'Hi, Ivy!' });
    await user.click(screen.getByRole('link', { name: 'Jars and Goals' }));
    await user.click(await screen.findByRole('button', { name: 'Add a goal' }));
    await user.click(screen.getByRole('button', { name: 'Bike' }));
    await keypad('200');
    await user.click(screen.getByRole('button', { name: 'Save this goal' }));
    expect(await screen.findByTestId('goal')).toBeInTheDocument();
    expect(await kidsDb.goals.count()).toBe(1);
    expect((await kidsDb.goals.toArray())[0]).toMatchObject({ picture: 'bike', price: 200 });
  });

  it('runs lesson 1 and its quiz, then opens lesson 2', async () => {
    renderAt('/kids');
    await user.type(await screen.findByPlaceholderText('A fun name, not your real one'), 'Kai');
    await user.click(screen.getByRole('button', { name: 'Start' }));
    await screen.findByRole('heading', { name: 'Hi, Kai!' });
    await user.click(screen.getByRole('link', { name: 'Learn' }));
    expect(screen.queryByRole('link', { name: /Lesson 2/ })).not.toBeInTheDocument();
    await user.click(await screen.findByRole('link', { name: 'Lesson 1: Where money comes from' }));
    for (let i = 0; i < 4; i++) await user.click(await screen.findByRole('button', { name: /Next/ }));
    for (const answer of ['By working', 'A gift from family', 'Helping with chores']) {
      await user.click(await screen.findByRole('button', { name: answer }));
      await user.click(screen.getByRole('button', { name: /Next|Finish/ }));
    }
    expect(await screen.findByTestId('quiz-score')).toHaveTextContent('3 of 3 right');
    expect(await kidsDb.progress.count()).toBe(1);
    await user.click(screen.getByRole('button', { name: 'Back to lessons' }));
    expect(await screen.findByRole('link', { name: 'Lesson 2: Needs and wants' })).toBeInTheDocument();
  });

  it('grows the money tree and finds a freedom number', async () => {
    // Reduced motion shows every year at once.
    vi.stubGlobal('matchMedia', (q: string) => ({ matches: q.includes('reduce'), media: q }));
    renderAt('/kids');
    await user.type(await screen.findByPlaceholderText('A fun name, not your real one'), 'Tom');
    await user.click(screen.getByRole('button', { name: 'Start' }));
    await screen.findByRole('heading', { name: 'Hi, Tom!' });
    await user.click(screen.getByRole('link', { name: 'Grow' }));
    await user.click(await screen.findByRole('button', { name: 'Grow' }));
    expect(await screen.findByTestId('tree-result')).toHaveTextContent('You put in');
    await user.click(screen.getByRole('tab', { name: 'Freedom Quest' }));
    expect(await screen.findByTestId('freedom-number')).toHaveTextContent('NT$9,900,000');
    expect(screen.getByTestId('free-at')).toHaveTextContent(/You could be free at \d+!/);
    vi.unstubAllGlobals();
  });

  it('opens the grown-ups corner', async () => {
    renderAt('/kids');
    await user.type(await screen.findByPlaceholderText('A fun name, not your real one'), 'Bo');
    await user.click(screen.getByRole('button', { name: 'Start' }));
    await screen.findByRole('heading', { name: 'Hi, Bo!' });
    await user.click(screen.getByRole('link', { name: 'Grown-ups' }));
    expect(await screen.findByRole('button', { name: 'Switch to Pro' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Set a PIN' })).toBeInTheDocument();
  });

  async function grownUps(name: string) {
    renderAt('/kids');
    await user.type(await screen.findByPlaceholderText('A fun name, not your real one'), name);
    await user.click(screen.getByRole('button', { name: 'Start' }));
    await screen.findByRole('heading', { name: `Hi, ${name}!` });
    await user.click(screen.getByRole('link', { name: 'Grown-ups' }));
    await screen.findByRole('button', { name: 'Switch to Pro' });
  }

  async function pin(digits: string) {
    const pad = await screen.findByRole('group', { name: 'PIN pad' });
    for (const d of digits) await user.click(within(pad).getByRole('button', { name: d }));
  }

  it('sets a PIN, then asks for it and makes the child wait after three wrong tries', async () => {
    await grownUps('Pip');
    await user.click(screen.getByRole('button', { name: 'Set a PIN' }));
    await pin('2468');
    await pin('1357');
    expect(await screen.findByText('The two PINs were different. Try again.')).toBeInTheDocument();
    await pin('2468');
    await pin('2468');
    expect(await screen.findByText('The PIN is set.')).toBeInTheDocument();
    expect(await kidsDb.settings.get('pin')).toBeDefined();

    await user.click(screen.getByRole('link', { name: 'Garden' }));
    await user.click(await screen.findByRole('link', { name: 'Grown-ups' }));
    expect(await screen.findByText('Enter the grown-ups PIN')).toBeInTheDocument();
    await pin('1111');
    expect(await screen.findByText('That is not the PIN. Try again.')).toBeInTheDocument();
    await pin('2222');
    await pin('3333');
    expect(await screen.findByText(/Too many tries\. Please wait \d+ seconds\./)).toBeInTheDocument();
  });

  it('opens with the right PIN and can remove it', async () => {
    await grownUps('Rex');
    await user.click(screen.getByRole('button', { name: 'Set a PIN' }));
    await pin('1234');
    await pin('1234');
    await screen.findByText('The PIN is set.');
    await user.click(screen.getByRole('link', { name: 'Garden' }));
    await user.click(await screen.findByRole('link', { name: 'Grown-ups' }));
    await pin('1234');
    await user.click(await screen.findByRole('button', { name: 'Remove the PIN' }));
    expect(await screen.findByText('The PIN is removed.')).toBeInTheDocument();
    expect(await kidsDb.settings.get('pin')).toBeUndefined();
  });

  it('changes the allowance and growth rates with steppers', async () => {
    await grownUps('Zoe');
    const allowance = screen.getByRole('group', { name: 'Weekly allowance' });
    const row = allowance.parentElement!;
    expect(row).toHaveTextContent('Not set');
    await user.click(within(allowance).getByRole('button', { name: 'More' }));
    await user.click(within(allowance).getByRole('button', { name: 'More' }));
    await vi.waitFor(async () =>
      expect(await kidsDb.settings.get('allowance')).toEqual({ key: 'allowance', value: 20 }),
    );
    expect(await within(row).findByText('NT$20 a week')).toBeInTheDocument();

    const tree = screen.getByRole('group', { name: 'Money tree' });
    await user.click(within(tree).getByRole('button', { name: 'Less' }));
    await vi.waitFor(async () =>
      expect(((await kidsDb.settings.get('growth'))?.value as { tree: number }).tree).toBe(5),
    );
  });

  it('starts a child again and then deletes them', async () => {
    await grownUps('Ann');
    const id = (await kidsDb.profiles.toArray())[0].id;
    await kidsDb.entries.add({
      id: 'e1',
      profileId: id,
      date: new Date().toISOString(),
      jar: 'save',
      amount: 40,
    });
    await user.click(screen.getByRole('button', { name: 'Start again' }));
    await user.click(screen.getByRole('button', { name: 'Keep' }));
    expect(await kidsDb.entries.count()).toBe(1);
    await user.click(screen.getByRole('button', { name: 'Start again' }));
    await user.click(screen.getByRole('button', { name: 'Yes, start again' }));
    expect(await screen.findByText('Ann starts again.')).toBeInTheDocument();
    expect(await kidsDb.entries.count()).toBe(0);

    await user.click(
      screen.getByRole('button', { name: 'Delete Ann and all their coins, goals and badges' }),
    );
    await user.click(screen.getByRole('button', { name: 'Delete everything' }));
    // The last child is gone, so the corner reopens with nobody in it.
    expect(await screen.findByText('No children yet.')).toBeInTheDocument();
    expect(await kidsDb.profiles.count()).toBe(0);
  });
});
