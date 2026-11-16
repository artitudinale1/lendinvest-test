import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';
import App from './App';

const FIRST_LOAN = '9 Munro Court, Bartin Close, Sheffield';
const SECOND_LOAN = '12 Hollins Green Road, Marple';

describe('Current Loans', () => {
  it('shows the three loans and a total of £55,723', () => {
    render(<App />);

    expect(screen.getByRole('heading', { name: 'Current Loans' })).toBeInTheDocument();
    expect(screen.getAllByRole('article')).toHaveLength(3);
    expect(screen.getByRole('heading', { name: FIRST_LOAN })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: SECOND_LOAN })).toBeInTheDocument();
    expect(
      screen.getByRole('heading', { name: 'Robins Gate, Wavering Lane West, Gillingham' }),
    ).toBeInTheDocument();
    expect(screen.getByText('£11,959')).toBeInTheDocument();
    expect(screen.getByText('£31,405')).toBeInTheDocument();
    expect(screen.getByText('£12,359')).toBeInTheDocument();
    expect(screen.getAllByText('10 days')).toHaveLength(2);
    expect(screen.getByText('19 days')).toBeInTheDocument();
    expect(screen.getByText('Total available')).toBeInTheDocument();
    expect(screen.getByText('£55,723')).toBeInTheDocument();
    expect(screen.getByText('Available loans')).toBeInTheDocument();
    expect(screen.getByText('3')).toBeInTheDocument();
    expect(screen.getByText('Funds invested')).toBeInTheDocument();
    expect(screen.getByText('£0')).toBeInTheDocument();
    expect(screen.getAllByRole('button', { name: 'Invest' })).toHaveLength(3);
    expect(screen.queryByText('INVESTED')).not.toBeInTheDocument();
    expect(screen.getByRole('img', { name: /Sheffield/ })).toHaveAttribute(
      'src',
      `${import.meta.env.BASE_URL}images/residence-white.jpg`,
    );
  });

  it('invests £1,000 in the first loan and shows the invested badge', async () => {
    const user = userEvent.setup();
    render(<App />);

    const trigger = within(loanCard(FIRST_LOAN)).getByRole('button', { name: 'Invest' });
    await user.click(trigger);
    const dialog = screen.getByRole('dialog', { name: 'Invest in this loan' });
    expect(dialog).toHaveAttribute('aria-modal', 'true');
    expect(within(dialog).getByText(FIRST_LOAN)).toBeInTheDocument();
    expect(within(dialog).getByText('Available balance')).toBeInTheDocument();
    expect(within(dialog).getByText('£11,959')).toBeInTheDocument();

    await user.type(within(dialog).getByLabelText('Investment amount'), '1000');
    await user.click(within(dialog).getByRole('button', { name: 'Invest' }));

    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(trigger).toHaveFocus();
    const card = loanCard(FIRST_LOAN);
    expect(within(card).getByText('INVESTED')).toBeInTheDocument();
    expect(within(card).getByText('£10,959')).toBeInTheDocument();
    expect(screen.getByText('£54,723')).toBeInTheDocument();
    expect(screen.getByText('£1,000')).toBeInTheDocument();
    expect(screen.getByText('£31,405')).toBeInTheDocument();
  });

  it('invests £1,000 in loan "5"', async () => {
    const user = userEvent.setup();
    render(<App />);

    await openLoan(user, SECOND_LOAN);
    const dialog = screen.getByRole('dialog', { name: 'Invest in this loan' });
    await user.type(within(dialog).getByLabelText('Investment amount'), '1000');
    await user.click(within(dialog).getByRole('button', { name: 'Invest' }));

    const card = loanCard(SECOND_LOAN);
    expect(within(card).getByText('INVESTED')).toBeInTheDocument();
    expect(within(card).getByText('£30,405')).toBeInTheDocument();
    expect(screen.getByText('£54,723')).toBeInTheDocument();
    expect(within(loanCard(FIRST_LOAN)).queryByText('INVESTED')).not.toBeInTheDocument();
  });

  it.each([
    ['', 'Enter an investment amount.'],
    ['0', 'Enter an amount greater than zero.'],
    ['10.5', 'Enter a whole number of pounds.'],
    ['20000', 'That amount is higher than the available balance.'],
  ])('keeps the modal open when the amount is %j', async (value, message) => {
    const user = userEvent.setup();
    render(<App />);

    await openLoan(user, FIRST_LOAN);
    const dialog = screen.getByRole('dialog', { name: 'Invest in this loan' });
    if (value !== '') {
      await user.type(within(dialog).getByLabelText('Investment amount'), value);
    }
    await user.click(within(dialog).getByRole('button', { name: 'Invest' }));

    expect(screen.getByRole('dialog', { name: 'Invest in this loan' })).toBeInTheDocument();
    expect(screen.getByRole('alert')).toHaveTextContent(message);
    expect(screen.queryByText('INVESTED')).not.toBeInTheDocument();
    expect(within(loanCard(FIRST_LOAN, true)).getByText('£11,959')).toBeInTheDocument();
    expect(screen.getByText('£55,723')).toBeInTheDocument();
  });

  it('closes from the dialog control without investing', async () => {
    const user = userEvent.setup();
    render(<App />);

    const trigger = within(loanCard(FIRST_LOAN)).getByRole('button', { name: 'Invest' });
    await user.click(trigger);
    await user.click(screen.getByRole('button', { name: 'Close' }));

    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(trigger).toHaveFocus();
    expect(screen.queryByText('INVESTED')).not.toBeInTheDocument();
    expect(screen.getByText('£55,723')).toBeInTheDocument();
  });

  it('traps focus in the dialog, hides the page, and restores focus on Escape', async () => {
    const user = userEvent.setup();
    render(<App />);

    const trigger = within(loanCard(FIRST_LOAN)).getByRole('button', { name: 'Invest' });
    await user.click(trigger);

    const dialog = screen.getByRole('dialog', { name: 'Invest in this loan' });
    const amount = within(dialog).getByLabelText('Investment amount');
    const close = within(dialog).getByRole('button', { name: 'Close' });
    const cancel = within(dialog).getByRole('button', { name: 'Cancel' });
    const confirm = within(dialog).getByRole('button', { name: 'Invest' });

    expect(amount).toHaveFocus();
    expect(screen.queryByRole('heading', { name: 'Current Loans' })).not.toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Current Loans', hidden: true })).toBeInTheDocument();
    expect(screen.getAllByRole('button', { name: 'Invest' })).toHaveLength(1);

    await user.tab({ shift: true });
    expect(close).toHaveFocus();
    await user.tab();
    expect(amount).toHaveFocus();
    await user.tab();
    expect(cancel).toHaveFocus();
    await user.tab();
    expect(confirm).toHaveFocus();
    await user.tab();
    expect(close).toHaveFocus();

    await user.keyboard('{Escape}');

    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(trigger).toHaveFocus();
    expect(screen.getByRole('heading', { name: 'Current Loans' })).toBeInTheDocument();
    expect(screen.queryByText('INVESTED')).not.toBeInTheDocument();
    expect(screen.getByText('£55,723')).toBeInTheDocument();
  });
});

function loanCard(title: string, hidden = false): HTMLElement {
  const card = screen.getByRole('heading', { name: title, hidden }).closest('article');
  if (!(card instanceof HTMLElement)) {
    throw new Error(`No card for ${title}`);
  }
  return card;
}

async function openLoan(user: ReturnType<typeof userEvent.setup>, title: string) {
  await user.click(within(loanCard(title)).getByRole('button', { name: 'Invest' }));
}
