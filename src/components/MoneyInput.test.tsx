import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MoneyInput } from './MoneyInput';

describe('MoneyInput', () => {
  it('commits minor units on blur and shows the TWD equivalent', async () => {
    const onCommit = vi.fn();
    render(
      <MoneyInput aria-label="Balance" value={undefined} currency="USD" twdRate={32} onCommit={onCommit} />,
    );
    const input = screen.getByLabelText('Balance');
    await userEvent.type(input, '1,000.50');
    expect(screen.getByText('≈ NT$32,016')).toBeInTheDocument();
    await userEvent.tab();
    expect(onCommit).toHaveBeenCalledWith(100050);
    expect(input).toHaveValue('1,000.5');
  });

  it('rejects invalid and negative input without committing', async () => {
    const onCommit = vi.fn();
    render(<MoneyInput aria-label="Balance" value={500} currency="TWD" onCommit={onCommit} />);
    const input = screen.getByLabelText('Balance');
    await userEvent.clear(input);
    await userEvent.type(input, '-5{Enter}');
    expect(onCommit).not.toHaveBeenCalled();
    expect(input).toHaveAttribute('aria-invalid', 'true');
  });

  it('follows a new value from props', () => {
    const { rerender } = render(
      <MoneyInput aria-label="Balance" value={100} currency="TWD" onCommit={() => {}} />,
    );
    rerender(<MoneyInput aria-label="Balance" value={250000} currency="TWD" onCommit={() => {}} />);
    expect(screen.getByLabelText('Balance')).toHaveValue('2,500');
  });
});
