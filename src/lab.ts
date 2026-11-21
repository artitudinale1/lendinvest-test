import currentLoans from './current-loans.json';
import { createLoans, formatPounds } from './loans.ts';

export type CatalogueLoan = {
  id: string;
  title: string;
  availableAmount: number;
  annualisedReturnBps: number;
};

export type AmountError = 'negative' | 'not-integer' | 'exceeds-available';

export type ScenarioRow = {
  loanId: string;
  title: string;
  availableAmount: number;
  annualisedReturnBps: number;
  error: AmountError | null;
  pounds: number;
  included: boolean;
  shareTenths: number;
  returnPence: number;
};

export type Scenario = {
  budgetError: AmountError | null;
  budgetPounds: number;
  budgetValid: boolean;
  rows: ScenarioRow[];
  allocatedPounds: number;
  remainingPounds: number | null;
  overBudget: boolean;
  totalReturnPence: number;
};

export function createCatalogue(): CatalogueLoan[] {
  return createLoans().map((loan) => {
    const source = currentLoans.loans.find((item) => item.id === loan.id);
    if (!source) {
      throw new Error(`Missing fixture for loan ${loan.id}`);
    }

    return {
      id: loan.id,
      title: loan.title,
      availableAmount: loan.availableAmount,
      annualisedReturnBps: parseAnnualisedReturnBps(source.annualised_return),
    };
  });
}

export function parseAnnualisedReturnBps(value: string): number {
  const match = /^(\d+)\.(\d{2})$/.exec(value);
  if (!match) {
    throw new Error(`Invalid annualised return: ${value}`);
  }

  return Number(match[1]) * 100 + Number(match[2]);
}

export function returnPence(pounds: number, annualisedReturnBps: number): number {
  if (pounds <= 0 || annualisedReturnBps <= 0) {
    return 0;
  }

  const product = pounds * annualisedReturnBps;
  const pence = Math.trunc(product / 100);
  const remainder = product % 100;
  return remainder >= 50 ? pence + 1 : pence;
}

export function shareTenths(amountPounds: number, budgetPounds: number): number {
  if (budgetPounds <= 0 || amountPounds <= 0) {
    return 0;
  }

  const product = amountPounds * 1000;
  const tenths = Math.trunc(product / budgetPounds);
  const remainder = product % budgetPounds;
  return remainder * 2 >= budgetPounds ? tenths + 1 : tenths;
}

export function formatShare(tenths: number): string {
  const whole = Math.trunc(tenths / 10);
  const fraction = Math.abs(tenths % 10);
  return `${whole}.${fraction}%`;
}

export function formatPence(pence: number): string {
  const negative = pence < 0;
  const absolute = Math.abs(pence);
  const pounds = Math.trunc(absolute / 100);
  const cents = absolute % 100;
  return `${negative ? '-' : ''}£${formatPounds(pounds)}.${cents.toString().padStart(2, '0')}`;
}

export function formatRate(annualisedReturnBps: number): string {
  const whole = Math.trunc(annualisedReturnBps / 100);
  const fraction = Math.abs(annualisedReturnBps % 100);
  return `${whole}.${fraction.toString().padStart(2, '0')}%`;
}

export function amountErrorMessage(error: AmountError): string {
  switch (error) {
    case 'negative':
      return 'Enter zero or a positive amount.';
    case 'not-integer':
      return 'Enter a whole number of pounds.';
    case 'exceeds-available':
      return 'That amount is higher than the available balance.';
  }
}

export function evaluateScenario(
  catalogue: readonly CatalogueLoan[],
  budgetInput: string,
  allocations: Readonly<Record<string, string>>,
): Scenario {
  const budgetParsed = parseWholePounds(budgetInput);
  const budgetValid = budgetParsed.ok;
  const budgetPounds = budgetParsed.ok ? budgetParsed.pounds : 0;

  const parsedRows = catalogue.map((loan) => {
    const parsed = parseWholePounds(allocations[loan.id] ?? '');
    if (!parsed.ok) {
      return { loan, error: parsed.error, included: false, pounds: 0 };
    }

    if (parsed.pounds > loan.availableAmount) {
      return { loan, error: 'exceeds-available' as const, included: false, pounds: 0 };
    }

    return { loan, error: null, included: true, pounds: parsed.pounds };
  });

  const allocatedPounds = parsedRows.reduce(
    (sum, row) => sum + (row.included ? row.pounds : 0),
    0,
  );
  const totalReturnPence = parsedRows.reduce((sum, row) => {
    if (!row.included) {
      return sum;
    }
    return sum + returnPence(row.pounds, row.loan.annualisedReturnBps);
  }, 0);

  return {
    budgetError: budgetParsed.ok ? null : budgetParsed.error,
    budgetPounds,
    budgetValid,
    allocatedPounds,
    remainingPounds: budgetValid ? budgetPounds - allocatedPounds : null,
    overBudget: budgetValid && allocatedPounds > budgetPounds,
    totalReturnPence,
    rows: parsedRows.map((row) => ({
      loanId: row.loan.id,
      title: row.loan.title,
      availableAmount: row.loan.availableAmount,
      annualisedReturnBps: row.loan.annualisedReturnBps,
      error: row.error,
      pounds: row.included ? row.pounds : 0,
      included: row.included,
      shareTenths: budgetValid ? shareTenths(row.included ? row.pounds : 0, budgetPounds) : 0,
      returnPence: row.included ? returnPence(row.pounds, row.loan.annualisedReturnBps) : 0,
    })),
  };
}

function parseWholePounds(
  input: string,
): { ok: true; pounds: number } | { ok: false; error: 'negative' | 'not-integer' } {
  const trimmed = input.trim();
  if (trimmed === '') {
    return { ok: true, pounds: 0 };
  }

  if (trimmed.startsWith('-')) {
    return { ok: false, error: 'negative' };
  }

  if (!/^\d+$/.test(trimmed)) {
    return { ok: false, error: 'not-integer' };
  }

  const pounds = Number(trimmed);
  const canonical = trimmed.replace(/^0+(?=\d)/, '');
  if (!Number.isSafeInteger(pounds) || String(pounds) !== canonical) {
    return { ok: false, error: 'not-integer' };
  }

  return { ok: true, pounds };
}
