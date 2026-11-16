import { describe, expect, it } from 'vitest';
import {
  createCatalogue,
  evaluateScenario,
  formatPence,
  formatShare,
  returnPence,
  shareTenths,
} from './lab';

const SHEFFIELD = '1';
const MARPLE = '5';
const GILLINGHAM = '12';

describe('catalogue rates', () => {
  it('reads annualised returns as basis points', () => {
    const catalogue = createCatalogue();

    expect(catalogue.map((loan) => loan.annualisedReturnBps)).toEqual([860, 710, 480]);
    expect(catalogue.map((loan) => loan.availableAmount)).toEqual([11_959, 31_405, 12_359]);
  });
});

describe('return and percentage calculations', () => {
  it('calculates the £10,000 worked example as a £724 annual return', () => {
    const scenario = evaluateScenario(createCatalogue(), '10000', {
      [SHEFFIELD]: '4000',
      [MARPLE]: '4000',
      [GILLINGHAM]: '2000',
    });

    expect(scenario.rows.map((row) => row.returnPence)).toEqual([34_400, 28_400, 9_600]);
    expect(scenario.totalReturnPence).toBe(72_400);
    expect(formatPence(scenario.totalReturnPence)).toBe('£724.00');
    expect(scenario.rows.map((row) => formatShare(row.shareTenths))).toEqual([
      '40.0%',
      '40.0%',
      '20.0%',
    ]);
    expect(scenario.allocatedPounds).toBe(10_000);
    expect(scenario.remainingPounds).toBe(0);
    expect(scenario.overBudget).toBe(false);
  });

  it('rounds each loan return to the nearest penny before adding', () => {
    expect(returnPence(1, 860)).toBe(9);
    expect(returnPence(3, 480)).toBe(14);
    expect(returnPence(1, 50)).toBe(1);
    expect(returnPence(1, 860) + returnPence(1, 710) + returnPence(1, 480)).toBe(21);

    const scenario = evaluateScenario(createCatalogue(), '3', {
      [SHEFFIELD]: '1',
      [MARPLE]: '1',
      [GILLINGHAM]: '1',
    });
    expect(scenario.totalReturnPence).toBe(21);
    expect(formatPence(scenario.totalReturnPence)).toBe('£0.21');
  });

  it('rounds percentage shares half up', () => {
    expect(shareTenths(1, 3)).toBe(333);
    expect(formatShare(333)).toBe('33.3%');
    expect(shareTenths(1, 16)).toBe(63);
    expect(shareTenths(4000, 10_000)).toBe(400);
  });

  it('treats an empty or zero budget as £0', () => {
    const empty = evaluateScenario(createCatalogue(), '', {
      [SHEFFIELD]: '',
      [MARPLE]: '',
      [GILLINGHAM]: '',
    });
    expect(empty.budgetValid).toBe(true);
    expect(empty.budgetPounds).toBe(0);
    expect(empty.allocatedPounds).toBe(0);
    expect(empty.remainingPounds).toBe(0);
    expect(empty.totalReturnPence).toBe(0);
    expect(empty.rows.every((row) => row.shareTenths === 0 && row.error === null)).toBe(true);

    const zero = evaluateScenario(createCatalogue(), '0', {
      [SHEFFIELD]: '0',
      [MARPLE]: '',
      [GILLINGHAM]: '0',
    });
    expect(zero.budgetPounds).toBe(0);
    expect(zero.remainingPounds).toBe(0);
    expect(zero.overBudget).toBe(false);
    expect(zero.rows.every((row) => row.shareTenths === 0)).toBe(true);
  });

  it('rejects negative, decimal, and unsafe amounts', () => {
    const scenario = evaluateScenario(createCatalogue(), '-5', {
      [SHEFFIELD]: '10.5',
      [MARPLE]: '9007199254740993',
      [GILLINGHAM]: '',
    });

    expect(scenario.budgetError).toBe('negative');
    expect(scenario.budgetValid).toBe(false);
    expect(scenario.remainingPounds).toBeNull();
    expect(scenario.overBudget).toBe(false);
    expect(scenario.rows[0]?.error).toBe('not-integer');
    expect(scenario.rows[1]?.error).toBe('not-integer');
    expect(scenario.rows[2]?.error).toBeNull();
    expect(scenario.allocatedPounds).toBe(0);
    expect(scenario.totalReturnPence).toBe(0);
  });

  it('excludes allocations above the fixture balance from the return', () => {
    const scenario = evaluateScenario(createCatalogue(), '20000', {
      [SHEFFIELD]: '11960',
      [MARPLE]: '1000',
      [GILLINGHAM]: '',
    });

    expect(scenario.rows[0]?.error).toBe('exceeds-available');
    expect(scenario.rows[0]?.included).toBe(false);
    expect(scenario.rows[0]?.returnPence).toBe(0);
    expect(scenario.allocatedPounds).toBe(1000);
    expect(scenario.totalReturnPence).toBe(returnPence(1000, 710));
    expect(scenario.remainingPounds).toBe(19_000);
  });

  it('allows an over-budget scenario and reports the deficit', () => {
    const scenario = evaluateScenario(createCatalogue(), '1000', {
      [SHEFFIELD]: '',
      [MARPLE]: '2000',
      [GILLINGHAM]: '',
    });

    expect(scenario.overBudget).toBe(true);
    expect(scenario.allocatedPounds).toBe(2000);
    expect(scenario.remainingPounds).toBe(-1000);
    expect(scenario.totalReturnPence).toBe(14_200);
    expect(formatShare(scenario.rows[1]?.shareTenths ?? 0)).toBe('200.0%');
  });
});
