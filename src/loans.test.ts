import { describe, expect, it } from 'vitest';
import {
  createLoans,
  formatPounds,
  formatTermRemaining,
  invest,
  totalAvailable,
  type Loan,
} from './loans';

const FIRST_LOAN = '9 Munro Court, Bartin Close, Sheffield';
const SECOND_LOAN = '12 Hollins Green Road, Marple';

describe('loan fixture', () => {
  it('loads three loans with a total of £55,723', () => {
    const loans = createLoans();

    expect(loans.map((loan) => loan.title)).toEqual([
      FIRST_LOAN,
      SECOND_LOAN,
      'Robins Gate, Wavering Lane West, Gillingham',
    ]);
    expect(totalAvailable(loans)).toBe(55_723);
    expect(loans.every((loan) => loan.invested === false)).toBe(true);
  });

  it('formats the remaining terms the way the previous screen did', () => {
    const [first, second, third] = createLoans();

    expect(formatTermRemaining(first.termRemainingSeconds)).toBe('10 days');
    expect(formatTermRemaining(second.termRemainingSeconds)).toBe('19 days');
    expect(formatTermRemaining(third.termRemainingSeconds)).toBe('10 days');
  });
});

describe('formatPounds', () => {
  it('groups thousands with commas', () => {
    expect(formatPounds(1000)).toBe('1,000');
    expect(formatPounds(10_959)).toBe('10,959');
    expect(formatPounds(55_723)).toBe('55,723');
  });
});

describe('invest', () => {
  it('reduces the first loan by £1,000 and derives the new total', () => {
    const loans = createLoans();
    const result = invest(loans, '1', '1000');

    expect(result.ok).toBe(true);
    if (!result.ok) {
      return;
    }

    expect(loanAmount(result.loans, '1')).toBe(10_959);
    expect(loanById(result.loans, '1').invested).toBe(true);
    expect(totalAvailable(result.loans)).toBe(54_723);
    expect(loans[0].availableAmount).toBe(11_959);
    expect(loans[0].invested).toBe(false);
    expect(result.loans).not.toBe(loans);
    expect(result.loans[0]).not.toBe(loans[0]);
  });

  it('reduces loan "5" by £1,000 without changing the other loans', () => {
    const loans = createLoans();
    const result = invest(loans, '5', '1000');

    expect(result.ok).toBe(true);
    if (!result.ok) {
      return;
    }

    expect(loanAmount(result.loans, '5')).toBe(30_405);
    expect(loanById(result.loans, '5').invested).toBe(true);
    expect(loanAmount(result.loans, '1')).toBe(11_959);
    expect(loanAmount(result.loans, '12')).toBe(12_359);
    expect(loans).toEqual(createLoans());
  });

  it('allows an investment equal to the available balance', () => {
    const loans = createLoans();
    const result = invest(loans, '1', '11959');

    expect(result.ok).toBe(true);
    if (!result.ok) {
      return;
    }

    expect(loanAmount(result.loans, '1')).toBe(0);
    expect(totalAvailable(result.loans)).toBe(43_764);
  });

  it.each([
    ['', 'empty'],
    ['   ', 'empty'],
    ['0', 'zero'],
    ['00', 'zero'],
    ['-1', 'negative'],
    ['-10.5', 'negative'],
    ['10.5', 'not-integer'],
    ['1,000', 'not-integer'],
    ['abc', 'not-integer'],
    ['1e3', 'not-integer'],
    ['+1000', 'not-integer'],
    ['11960', 'exceeds-available'],
  ] as const)('rejects %j as %s and leaves the loans unchanged', (input, error) => {
    const loans = createLoans();
    const result = invest(loans, '1', input);

    expect(result).toEqual({ ok: false, error });
    expect(loans).toEqual(createLoans());
  });

  it('rejects an unknown loan id without changing the loans', () => {
    const loans = createLoans();
    const result = invest(loans, 'missing', '1000');

    expect(result).toEqual({ ok: false, error: 'unknown-loan' });
    expect(loans).toEqual(createLoans());
  });
});

function loanById(loans: readonly Loan[], id: string): Loan {
  const loan = loans.find((item) => item.id === id);
  if (!loan) {
    throw new Error(`Missing loan ${id}`);
  }
  return loan;
}

function loanAmount(loans: readonly Loan[], id: string): number {
  return loanById(loans, id).availableAmount;
}
