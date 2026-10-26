import { useState } from 'react';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { BigButton, Celebrate, Keypad, Panel, PickCard } from './ui';
import { SplitEditor } from './split';
import type { Split } from './math';

function KeypadHarness({ start = 0, onValue }: { start?: number; onValue?: (v: number) => void }) {
  const [value, setValue] = useState(start);
  return (
    <Keypad
      label="Amount"
      value={value}
      onChange={(v) => {
        setValue(v);
        onValue?.(v);
      }}
    />
  );
}

describe('Keypad', () => {
  it('builds a whole amount from key presses', async () => {
    render(<KeypadHarness />);
    for (const k of ['1', '2', '00']) await userEvent.click(screen.getByRole('button', { name: k }));
    expect(screen.getByLabelText('Amount')).toHaveTextContent('NT$1,200');
  });

  it('ignores a leading zero and deletes the last digit', async () => {
    render(<KeypadHarness />);
    await userEvent.click(screen.getByRole('button', { name: '0' }));
    await userEvent.click(screen.getByRole('button', { name: '5' }));
    expect(screen.getByLabelText('Amount')).toHaveTextContent('NT$5');
    await userEvent.click(screen.getByRole('button', { name: '7' }));
    await userEvent.click(screen.getByRole('button', { name: 'Delete a number' }));
    expect(screen.getByLabelText('Amount')).toHaveTextContent('NT$5');
  });

  it('stops at 999,999', async () => {
    const onValue = vi.fn();
    render(<KeypadHarness start={999_999} onValue={onValue} />);
    await userEvent.click(screen.getByRole('button', { name: '1' }));
    expect(onValue).not.toHaveBeenCalled();
    expect(screen.getByLabelText('Amount')).toHaveTextContent('NT$999,999');
  });

  it('has twelve keys in a labelled group', () => {
    render(<KeypadHarness />);
    const group = screen.getByRole('group', { name: 'Coin keypad' });
    expect(group.querySelectorAll('button')).toHaveLength(12);
  });
});

describe('big buttons and cards', () => {
  it('is a large button that keeps its handlers', async () => {
    const onClick = vi.fn();
    render(
      <BigButton tone="good" onClick={onClick}>
        I got money
      </BigButton>,
    );
    const button = screen.getByRole('button', { name: 'I got money' });
    expect(button.className).toContain('min-h-12');
    expect(button.className).toContain('bg-good');
    await userEvent.click(button);
    expect(onClick).toHaveBeenCalled();
  });

  it('marks a picked card as pressed', () => {
    const { rerender } = render(<PickCard selected>Snack</PickCard>);
    expect(screen.getByRole('button', { name: 'Snack' })).toHaveAttribute('aria-pressed', 'true');
    rerender(<PickCard>Snack</PickCard>);
    expect(screen.getByRole('button', { name: 'Snack' })).not.toHaveAttribute('aria-pressed', 'true');
  });

  it('shows a panel heading only when given', () => {
    const { rerender } = render(<Panel title="Your jars">Body</Panel>);
    expect(screen.getByRole('heading', { name: 'Your jars' })).toBeInTheDocument();
    rerender(<Panel>Body</Panel>);
    expect(screen.queryByRole('heading')).not.toBeInTheDocument();
  });

  it('announces a celebration', () => {
    render(<Celebrate text="You did it!" />);
    expect(screen.getByRole('status')).toHaveTextContent('You did it!');
  });
});

describe('SplitEditor', () => {
  function Harness({ start, onSplit }: { start: Split; onSplit: (s: Split) => void }) {
    const [split, setSplit] = useState(start);
    return (
      <SplitEditor
        split={split}
        onChange={(s) => {
          setSplit(s);
          onSplit(s);
        }}
      />
    );
  }

  it('moves the line between two jars one coin of every 10 per arrow key (UI-23)', async () => {
    const onSplit = vi.fn();
    render(<Harness start={{ spend: 50, save: 30, grow: 20 }} onSplit={onSplit} />);
    const [first, second] = screen.getAllByRole('slider');
    expect(first).toHaveAttribute('aria-label', 'Between Spend and Savings');
    expect(first).toHaveAttribute('aria-valuenow', '50');
    expect(second).toHaveAttribute('aria-valuenow', '80');
    expect(screen.getByTestId('split-words')).toHaveTextContent(
      'Spend 5 · Savings 3 · Grow 2 of every 10 coins',
    );

    first.focus();
    await userEvent.keyboard('{ArrowRight}');
    expect(onSplit).toHaveBeenLastCalledWith({ spend: 60, save: 20, grow: 20 });
    await userEvent.keyboard('{ArrowLeft}{ArrowLeft}{ArrowLeft}');
    expect(onSplit).toHaveBeenLastCalledWith({ spend: 30, save: 50, grow: 20 });

    await userEvent.tab();
    expect(screen.getAllByRole('slider')[1]).toHaveFocus();
    await userEvent.keyboard('{ArrowRight}');
    expect(onSplit).toHaveBeenLastCalledWith({ spend: 30, save: 60, grow: 10 });
    expect(screen.getByTestId('split-words')).toHaveTextContent(
      'Spend 3 · Savings 6 · Grow 1 of every 10 coins',
    );
  });

  it('never lets one handle pass the other, and Home / End go to the ends', async () => {
    const onSplit = vi.fn();
    render(<Harness start={{ spend: 70, save: 30, grow: 0 }} onSplit={onSplit} />);
    const [first, second] = screen.getAllByRole('slider');
    expect(first).toHaveAttribute('aria-valuemax', '100');
    first.focus();
    await userEvent.keyboard('{End}');
    expect(onSplit).toHaveBeenLastCalledWith({ spend: 100, save: 0, grow: 0 });
    await userEvent.keyboard('{Home}');
    expect(onSplit).toHaveBeenLastCalledWith({ spend: 0, save: 100, grow: 0 });
    second.focus();
    await userEvent.keyboard('{Home}');
    expect(onSplit).toHaveBeenLastCalledWith({ spend: 0, save: 0, grow: 100 });
  });
});
