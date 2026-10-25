import { useState } from 'react';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Chips, MarketBadge, NumberInput } from './fields';

/** The page keeps the value in state, as the Time Machine does. */
function Controlled({ start, onChange }: { start: number; onChange: (v: number) => void }) {
  const [value, setValue] = useState(start);
  return (
    <NumberInput
      label="Amount"
      value={value}
      min={1}
      onChange={(v) => {
        setValue(v);
        onChange(v);
      }}
    />
  );
}

describe('NumberInput', () => {
  it('reports valid numbers and keeps invalid text without reporting it', async () => {
    const onChange = vi.fn();
    render(<Controlled start={100} onChange={onChange} />);
    const input = screen.getByLabelText('Amount');
    await userEvent.clear(input);
    expect(input).toHaveAttribute('aria-invalid', 'true');
    expect(onChange).not.toHaveBeenCalled();
    await userEvent.type(input, '250');
    expect(onChange).toHaveBeenLastCalledWith(250);
    expect(input).not.toHaveAttribute('aria-invalid');
  });

  it('rejects values outside the range', async () => {
    const onChange = vi.fn();
    render(<NumberInput label="Weight" value={10} min={0} max={100} onChange={onChange} />);
    const input = screen.getByLabelText('Weight');
    await userEvent.clear(input);
    await userEvent.type(input, '150');
    expect(onChange).not.toHaveBeenCalledWith(150);
    expect(input).toHaveAttribute('aria-invalid', 'true');
  });

  it('shows a decimal as a percent with a scale', async () => {
    const onChange = vi.fn();
    render(<NumberInput label="Rate" value={0.025} scale={100} suffix="%" onChange={onChange} />);
    const input = screen.getByLabelText('Rate');
    expect(input).toHaveValue(2.5);
    await userEvent.clear(input);
    await userEvent.type(input, '4');
    expect(onChange).toHaveBeenLastCalledWith(0.04);
    expect(screen.getByText('%')).toBeInTheDocument();
  });

  it('follows a value changed from outside', () => {
    const { rerender } = render(<NumberInput label="Amount" value={100} onChange={() => {}} />);
    rerender(<NumberInput label="Amount" value={300_000} onChange={() => {}} />);
    expect(screen.getByLabelText('Amount')).toHaveValue(300000);
  });
});

describe('Chips', () => {
  function Harness() {
    const [value, setValue] = useState<number>(10_000);
    return (
      <Chips
        label="Presets"
        value={value}
        onPick={setValue}
        options={[
          { value: 1000, label: '$1k' },
          { value: 10_000, label: '$10k' },
        ]}
      />
    );
  }

  it('marks the picked chip', async () => {
    render(<Harness />);
    expect(screen.getByRole('group', { name: 'Presets' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '$10k' })).toHaveAttribute('aria-pressed', 'true');
    await userEvent.click(screen.getByRole('button', { name: '$1k' }));
    expect(screen.getByRole('button', { name: '$1k' })).toHaveAttribute('aria-pressed', 'true');
    expect(screen.getByRole('button', { name: '$10k' })).toHaveAttribute('aria-pressed', 'false');
  });
});

describe('MarketBadge', () => {
  it('shows the market and price currency', () => {
    render(
      <>
        <MarketBadge market="TW" currency="TWD" />
        <MarketBadge market="US" currency="USD" />
      </>,
    );
    expect(screen.getByText('TW · TWD')).toHaveAttribute('title', 'TWD');
    expect(screen.getByText('US · USD')).toBeInTheDocument();
  });
});
