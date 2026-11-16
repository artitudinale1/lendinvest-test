import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';
import App from './App';

const SHEFFIELD = '9 Munro Court, Bartin Close, Sheffield';
const MARPLE = '12 Hollins Green Road, Marple';

describe('Investment Lab', () => {
  it('keeps the simulator out of the current loans view until it is opened', () => {
    render(<App />);

    expect(screen.getByRole('heading', { name: 'Current Loans' })).toBeInTheDocument();
    expect(screen.queryByRole('heading', { name: 'Investment Lab' })).not.toBeInTheDocument();
    const budget = document.getElementById('investment-budget');
    expect(budget?.closest('[hidden][inert][aria-hidden="true"]')).not.toBeNull();
    expect(screen.getByRole('button', { name: 'Investment Lab' })).not.toHaveAttribute(
      'aria-current',
    );
    expect(screen.getByRole('button', { name: 'Current Loans' })).toHaveAttribute(
      'aria-current',
      'page',
    );
  });

  it('updates the allocation, rejects an amount above the fixture balance, and resets', async () => {
    const user = userEvent.setup();
    render(<App />);

    await user.click(screen.getByRole('button', { name: 'Investment Lab' }));
    expect(screen.getByRole('heading', { name: 'Investment Lab' })).toHaveFocus();

    await user.type(screen.getByLabelText('Investment budget'), '10000');
    await user.type(screen.getByLabelText(SHEFFIELD), '4000');
    await user.type(screen.getByLabelText(MARPLE), '4000');
    await user.type(screen.getByLabelText('Robins Gate, Wavering Lane West, Gillingham'), '2000');

    const table = screen.getByRole('table', { name: 'Illustrative allocation scenario' });
    expect(within(table).getByText('£724.00')).toBeInTheDocument();
    expect(within(table).getAllByText('40.0%')).toHaveLength(2);
    expect(within(table).getByText('20.0%')).toBeInTheDocument();
    expect(screen.getAllByText('£10,000.00').length).toBeGreaterThan(0);
    expect(screen.getAllByText('£0.00').length).toBeGreaterThan(0);
    expect(document.getElementById('allocation-chart')).not.toBeNull();

    await user.clear(screen.getByLabelText(SHEFFIELD));
    await user.type(screen.getByLabelText(SHEFFIELD), '20000');
    expect(screen.getByRole('alert')).toHaveTextContent(
      'That amount is higher than the available balance.',
    );
    expect(within(table).getByText('Not included')).toBeInTheDocument();
    expect(within(table).queryByText('£724.00')).not.toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Reset scenario' }));
    expect(screen.getByLabelText('Investment budget')).toHaveValue('');
    expect(screen.getByLabelText(SHEFFIELD)).toHaveValue('');
    expect(screen.getByText('Nothing is allocated yet.')).toBeInTheDocument();
    expect(within(table).getAllByText('£0.00').length).toBeGreaterThan(0);
  });

  it('calculates the table footer share from the allocated total', async () => {
    const user = userEvent.setup();
    render(<App />);

    await user.click(screen.getByRole('button', { name: 'Investment Lab' }));
    await user.type(screen.getByLabelText('Investment budget'), '3');
    await user.type(screen.getByLabelText(SHEFFIELD), '1');
    await user.type(screen.getByLabelText(MARPLE), '1');
    await user.type(screen.getByLabelText('Robins Gate, Wavering Lane West, Gillingham'), '1');

    const table = screen.getByRole('table', { name: 'Illustrative allocation scenario' });
    const total = within(table).getByRole('rowheader', { name: 'Total' }).closest('tr');
    expect(total).not.toBeNull();
    expect(within(total as HTMLElement).getByText('100.0%')).toBeInTheDocument();
    expect(within(table).getAllByText('33.3%')).toHaveLength(3);
  });

  it('identifies an over-budget scenario and keeps the current loans balances unchanged', async () => {
    const user = userEvent.setup();
    render(<App />);

    await user.click(within(loanCard(SHEFFIELD)).getByRole('button', { name: 'Invest' }));
    await user.type(screen.getByLabelText('Investment amount'), '1000');
    await user.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'Invest' }));
    expect(screen.getByText('£54,723')).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Investment Lab' }));
    expect(screen.queryByRole('heading', { name: 'Current Loans' })).not.toBeInTheDocument();
    expect(screen.getByText('Available balance £11,959. Annualised return 8.60%.')).toBeInTheDocument();

    await user.type(screen.getByLabelText('Investment budget'), '1000');
    await user.type(screen.getByLabelText(MARPLE), '2000');
    expect(screen.getByRole('status')).toHaveTextContent(
      'Over budget by £1,000.00. This scenario is not a valid investment recommendation.',
    );
    expect(screen.getAllByText('£142.00').length).toBeGreaterThan(0);

    await user.type(screen.getByLabelText(SHEFFIELD), '10.5');
    expect(screen.getByText('Enter a whole number of pounds.')).toBeInTheDocument();
    expect(screen.getAllByText('£142.00').length).toBeGreaterThan(0);

    await user.click(screen.getByRole('button', { name: 'Current Loans' }));
    expect(screen.getByRole('heading', { name: 'Current Loans' })).toHaveFocus();
    expect(within(loanCard(SHEFFIELD)).getByText('INVESTED')).toBeInTheDocument();
    expect(within(loanCard(SHEFFIELD)).getByText('£10,959')).toBeInTheDocument();
    expect(screen.getByText('£54,723')).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Investment Lab' }));
    expect(screen.getByLabelText('Investment budget')).toHaveValue('1000');
    expect(screen.getByLabelText(MARPLE)).toHaveValue('2000');
    expect(screen.getByLabelText(SHEFFIELD)).toHaveValue('10.5');
  });

  it('hides the other view and keeps dialog focus on the open loan dialog', async () => {
    const user = userEvent.setup();
    render(<App />);

    const trigger = within(loanCard(SHEFFIELD)).getByRole('button', { name: 'Invest' });
    await user.click(trigger);

    expect(screen.queryByRole('button', { name: 'Investment Lab' })).not.toBeInTheDocument();
    expect(screen.queryByRole('heading', { name: 'Investment Lab' })).not.toBeInTheDocument();
    const budget = document.getElementById('investment-budget');
    expect(budget?.closest('[hidden][inert][aria-hidden="true"]')).not.toBeNull();

    const dialog = screen.getByRole('dialog', { name: 'Invest in this loan' });
    await user.tab();
    expect(within(dialog).getByRole('button', { name: 'Cancel' })).toHaveFocus();
    await user.keyboard('{Escape}');

    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(trigger).toHaveFocus();
    expect(screen.getByRole('button', { name: 'Investment Lab' })).toBeInTheDocument();
  });
});

function loanCard(title: string): HTMLElement {
  const card = screen.getByRole('heading', { name: title }).closest('article');
  if (!(card instanceof HTMLElement)) {
    throw new Error(`No card for ${title}`);
  }
  return card;
}
