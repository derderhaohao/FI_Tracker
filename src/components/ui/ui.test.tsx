import { useState } from 'react';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { Button } from './button';
import { Card, CardContent, CardHeader } from './card';
import { Checkbox, Field, Input, Select, Textarea } from './input';
import { Badge, EmptyState, Notice, PageHeader, Segmented, Stat, Table } from './misc';

describe('Button', () => {
  it('is a plain button by default and passes clicks through', async () => {
    const onClick = vi.fn();
    render(<Button onClick={onClick}>Save</Button>);
    const button = screen.getByRole('button', { name: 'Save' });
    expect(button).toHaveAttribute('type', 'button');
    await userEvent.click(button);
    expect(onClick).toHaveBeenCalledTimes(1);
  });

  it('applies the variant and does not fire when disabled', async () => {
    const onClick = vi.fn();
    render(
      <Button variant="destructive" size="sm" disabled onClick={onClick} className="extra">
        Delete
      </Button>,
    );
    const button = screen.getByRole('button', { name: 'Delete' });
    expect(button).toBeDisabled();
    expect(button.className).toContain('bg-critical');
    expect(button.className).toContain('extra');
    await userEvent.click(button);
    expect(onClick).not.toHaveBeenCalled();
  });

  it('can submit a form', async () => {
    const onSubmit = vi.fn((e: React.FormEvent) => e.preventDefault());
    render(
      <form onSubmit={onSubmit}>
        <Button type="submit">Go</Button>
      </form>,
    );
    await userEvent.click(screen.getByRole('button', { name: 'Go' }));
    expect(onSubmit).toHaveBeenCalled();
  });
});

describe('Card', () => {
  it('renders its parts', () => {
    render(
      <Card>
        <CardHeader
          title="Net worth"
          description="All accounts"
          actions={<button type="button">Edit</button>}
        />
        <CardContent>NT$1,000</CardContent>
      </Card>,
    );
    expect(screen.getByRole('heading', { level: 2, name: 'Net worth' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Edit' })).toBeInTheDocument();
    expect(screen.getByText('All accounts')).toBeInTheDocument();
    expect(screen.getByText('NT$1,000')).toBeInTheDocument();
  });
});

describe('Notice, Badge and Stat', () => {
  it('announces info as a status and warnings as alerts', () => {
    const { rerender } = render(<Notice>Saved</Notice>);
    expect(screen.getByRole('status')).toHaveTextContent('Saved');
    rerender(<Notice tone="warning">Check this</Notice>);
    expect(screen.getByRole('alert')).toHaveTextContent('Check this');
    rerender(
      <Notice tone="critical" action={<button type="button">Fix</button>}>
        Broken
      </Notice>,
    );
    expect(screen.getByRole('alert')).toHaveTextContent('Broken');
    expect(screen.getByRole('button', { name: 'Fix' })).toBeInTheDocument();
  });

  it('colours a badge by tone', () => {
    render(<Badge tone="critical">At risk</Badge>);
    expect(screen.getByText('At risk').className).toContain('text-critical');
  });

  it('shows a stat with an optional sub-line', () => {
    const { rerender } = render(<Stat label="FI number" value="NT$10M" sub="25 × spending" />);
    expect(screen.getByText('FI number')).toBeInTheDocument();
    expect(screen.getByText('NT$10M')).toBeInTheDocument();
    expect(screen.getByText('25 × spending')).toBeInTheDocument();
    rerender(<Stat label="FI number" value="NT$10M" />);
    expect(screen.queryByText('25 × spending')).not.toBeInTheDocument();
  });
});

describe('EmptyState and PageHeader', () => {
  it('links to the next step only when both a target and an action are given', () => {
    const { rerender } = render(
      <MemoryRouter>
        <EmptyState title="No accounts" to="/accounts" action="Add an account">
          Start here.
        </EmptyState>
      </MemoryRouter>,
    );
    expect(screen.getByText('Start here.')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Add an account' })).toHaveAttribute('href', '/accounts');
    rerender(
      <MemoryRouter>
        <EmptyState title="No accounts" to="/accounts" />
      </MemoryRouter>,
    );
    expect(screen.queryByRole('link')).not.toBeInTheDocument();
  });

  it('shows a heading, description and actions', () => {
    render(
      <PageHeader title="Goal" description="Your FI target" actions={<button type="button">Edit</button>} />,
    );
    expect(screen.getByRole('heading', { level: 1, name: 'Goal' })).toBeInTheDocument();
    expect(screen.getByText('Your FI target')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Edit' })).toBeInTheDocument();
  });
});

describe('Segmented', () => {
  function Harness({ onChange }: { onChange: (v: string) => void }) {
    const [value, setValue] = useState<'real' | 'nominal'>('real');
    return (
      <Segmented
        label="Money"
        value={value}
        onChange={(v) => {
          setValue(v);
          onChange(v);
        }}
        options={[
          { value: 'real', label: 'Today' },
          { value: 'nominal', label: 'Future' },
        ]}
      />
    );
  }

  it('is a labelled radio group that marks the chosen option', async () => {
    const onChange = vi.fn();
    render(<Harness onChange={onChange} />);
    expect(screen.getByRole('radiogroup', { name: 'Money' })).toBeInTheDocument();
    expect(screen.getByRole('radio', { name: 'Today' })).toHaveAttribute('aria-checked', 'true');
    await userEvent.click(screen.getByRole('radio', { name: 'Future' }));
    expect(onChange).toHaveBeenCalledWith('nominal');
    expect(screen.getByRole('radio', { name: 'Future' })).toHaveAttribute('aria-checked', 'true');
    expect(screen.getByRole('radio', { name: 'Today' })).toHaveAttribute('aria-checked', 'false');
  });
});

describe('Table', () => {
  it('wraps a table so it can scroll sideways', () => {
    render(
      <Table>
        <tbody>
          <tr>
            <td>Cash</td>
          </tr>
        </tbody>
      </Table>,
    );
    const table = screen.getByRole('table');
    expect(table.parentElement?.className).toContain('overflow-x-auto');
    expect(screen.getByRole('cell', { name: 'Cash' })).toBeInTheDocument();
  });
});

describe('form fields', () => {
  it('connects a field label to its control and shows the hint', async () => {
    render(
      <Field label="Birth year" hint="Four digits">
        {(id) => <Input id={id} />}
      </Field>,
    );
    const input = screen.getByLabelText('Birth year');
    await userEvent.type(input, '1990');
    expect(input).toHaveValue('1990');
    expect(screen.getByText('Four digits')).toBeInTheDocument();
  });

  it('shows an error in place of the hint', () => {
    render(
      <Field label="SWR" hint="Usually 3–4%" error="Must be above 0">
        {(id) => <Input id={id} />}
      </Field>,
    );
    expect(screen.getByText('Must be above 0')).toBeInTheDocument();
    expect(screen.queryByText('Usually 3–4%')).not.toBeInTheDocument();
  });

  it('selects, types and ticks', async () => {
    const onCheck = vi.fn();
    render(
      <>
        <Select aria-label="Currency" defaultValue="TWD">
          <option value="TWD">TWD</option>
          <option value="USD">USD</option>
        </Select>
        <Textarea aria-label="Notes" />
        <Checkbox label="Essential" onChange={onCheck} />
      </>,
    );
    await userEvent.selectOptions(screen.getByLabelText('Currency'), 'USD');
    expect(screen.getByLabelText('Currency')).toHaveValue('USD');
    await userEvent.type(screen.getByLabelText('Notes'), 'hello');
    expect(screen.getByLabelText('Notes')).toHaveValue('hello');
    await userEvent.click(screen.getByLabelText('Essential'));
    expect(screen.getByLabelText('Essential')).toBeChecked();
    expect(onCheck).toHaveBeenCalled();
  });
});
