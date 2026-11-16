import currentLoans from './current-loans.json';

export type Loan = {
  id: string;
  title: string;
  availableAmount: number;
  termRemainingSeconds: number;
  invested: boolean;
};

export type InvestError =
  | 'empty'
  | 'zero'
  | 'negative'
  | 'not-integer'
  | 'exceeds-available'
  | 'unknown-loan';

export type InvestResult =
  | { ok: true; loans: Loan[] }
  | { ok: false; error: InvestError };

const SECONDS_PER_DAY = 86_400;

export function createLoans(): Loan[] {
  return currentLoans.loans.map((loan) => {
    const availableAmount = parseFixturePounds(loan.available_amount);
    const termRemainingSeconds = Number(loan.term_remaining);

    if (!Number.isInteger(termRemainingSeconds)) {
      throw new Error(`Invalid term in loan fixture: ${loan.term_remaining}`);
    }

    return {
      id: loan.id,
      title: loan.title,
      availableAmount,
      termRemainingSeconds,
      invested: false,
    };
  });
}

export function totalAvailable(loans: readonly Loan[]): number {
  return loans.reduce((sum, loan) => sum + loan.availableAmount, 0);
}

export function formatPounds(amount: number): string {
  return amount.toString().replace(/\B(?=(\d{3})+(?!\d))/g, ',');
}

export function formatTermRemaining(seconds: number): string {
  const days = Math.round(seconds / SECONDS_PER_DAY);
  return days === 1 ? 'a day' : `${days} days`;
}

export function invest(
  loans: readonly Loan[],
  loanId: string,
  amountInput: string,
): InvestResult {
  const parsed = parseInvestmentAmount(amountInput);
  if (!parsed.ok) {
    return parsed;
  }

  const loan = loans.find((item) => item.id === loanId);
  if (!loan) {
    return { ok: false, error: 'unknown-loan' };
  }

  if (parsed.amount > loan.availableAmount) {
    return { ok: false, error: 'exceeds-available' };
  }

  return {
    ok: true,
    loans: loans.map((item) =>
      item.id === loanId
        ? {
            ...item,
            availableAmount: item.availableAmount - parsed.amount,
            invested: true,
          }
        : item,
    ),
  };
}

export function investErrorMessage(error: InvestError): string {
  switch (error) {
    case 'empty':
      return 'Enter an investment amount.';
    case 'zero':
      return 'Enter an amount greater than zero.';
    case 'negative':
      return 'Enter a positive amount.';
    case 'not-integer':
      return 'Enter a whole number of pounds.';
    case 'exceeds-available':
      return 'That amount is higher than the available balance.';
    case 'unknown-loan':
      return 'This loan could not be found.';
  }
}

function parseFixturePounds(value: string): number {
  const normalised = value.replace(/,/g, '');
  if (!/^\d+$/.test(normalised)) {
    throw new Error(`Invalid amount in loan fixture: ${value}`);
  }
  return Number(normalised);
}

function parseInvestmentAmount(
  amountInput: string,
):
  | { ok: true; amount: number }
  | { ok: false; error: 'empty' | 'zero' | 'negative' | 'not-integer' } {
  const trimmed = amountInput.trim();

  if (trimmed === '') {
    return { ok: false, error: 'empty' };
  }

  if (trimmed.startsWith('-')) {
    return { ok: false, error: 'negative' };
  }

  if (!/^\d+$/.test(trimmed)) {
    return { ok: false, error: 'not-integer' };
  }

  const amount = Number(trimmed);
  if (!Number.isSafeInteger(amount)) {
    return { ok: false, error: 'not-integer' };
  }

  if (amount === 0) {
    return { ok: false, error: 'zero' };
  }

  return { ok: true, amount };
}
