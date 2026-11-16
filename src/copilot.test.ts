import { describe, expect, it } from 'vitest';
import {
  explanationMatchesFacts,
  parseIntent,
  resolveIntent,
} from './copilot';
import { createCatalogue, formatPence } from './lab';

const catalogue = createCatalogue();
const tenThousand = {
  budget: '10000',
  allocations: { '1': '4000', '5': '4000', '12': '2000' },
};

describe('copilot calculations', () => {
  it('splits £10,000 into equal whole pounds and reports £683.34', () => {
    const resolved = resolveIntent(catalogue, '', {}, {
      type: 'distribute',
      budgetPounds: 10000,
      method: 'equal_whole_pounds',
    });

    expect(resolved.applicable).toBe(true);
    expect(resolved.proposal?.allocations).toEqual({ '1': '3334', '5': '3333', '12': '3333' });
    expect(resolved.scenario.totalReturnPence).toBe(68334);
    expect(formatPence(resolved.scenario.totalReturnPence)).toBe('£683.34');
    expect(resolved.scenario.overBudget).toBe(false);
  });

  it('fills the highest supplied rate first for £10,000', () => {
    const resolved = resolveIntent(catalogue, '', {}, {
      type: 'distribute',
      budgetPounds: 10000,
      method: 'highest_rate_first',
    });

    expect(resolved.proposal?.allocations).toEqual({ '1': '10000', '5': '0', '12': '0' });
    expect(resolved.scenario.totalReturnPence).toBe(86000);
    expect(formatPence(resolved.scenario.totalReturnPence)).toBe('£860.00');
  });

  it('adds £2,000 to the first loan and keeps the result over budget', () => {
    const resolved = resolveIntent(
      catalogue,
      tenThousand.budget,
      tenThousand.allocations,
      { type: 'adjust', loanRef: 'first', deltaPounds: 2000 },
    );

    expect(resolved.applicable).toBe(true);
    expect(resolved.proposal?.allocations['1']).toBe('6000');
    expect(resolved.scenario.allocatedPounds).toBe(12000);
    expect(resolved.scenario.overBudget).toBe(true);
    expect(resolved.scenario.remainingPounds).toBe(-2000);
    expect(resolved.scenario.totalReturnPence).toBe(89600);
  });

  it('rounds the illustrative return with the existing pence rule', () => {
    const resolved = resolveIntent(catalogue, '3', { '1': '1', '5': '1', '12': '1' }, {
      type: 'explain_allocation',
    });

    expect(resolved.scenario.rows.map((row) => row.returnPence)).toEqual([9, 7, 5]);
    expect(resolved.scenario.totalReturnPence).toBe(21);
  });

  it('keeps a zero budget at £0.00', () => {
    const resolved = resolveIntent(catalogue, '', {}, {
      type: 'distribute',
      budgetPounds: 0,
      method: 'equal_whole_pounds',
    });

    expect(resolved.applicable).toBe(true);
    expect(resolved.scenario.budgetPounds).toBe(0);
    expect(resolved.scenario.totalReturnPence).toBe(0);
    expect(resolved.scenario.overBudget).toBe(false);
  });

  it('rejects a negative result and an allocation above the fixture balance', () => {
    const negative = resolveIntent(catalogue, '10000', { '1': '4000', '5': '0', '12': '0' }, {
      type: 'adjust',
      loanRef: '1',
      deltaPounds: -5000,
    });
    expect(negative.applicable).toBe(false);
    expect(negative.proposal).toBeNull();

    const tooHigh = resolveIntent(catalogue, '20000', { '1': '10000', '5': '0', '12': '0' }, {
      type: 'adjust',
      loanRef: 'first',
      deltaPounds: 2000,
    });
    expect(tooHigh.applicable).toBe(false);
    expect(tooHigh.blockedReason).toBe('That amount is higher than the available balance.');
    expect(tooHigh.proposal?.allocations['1']).toBe('12000');
  });

  it('rejects decimal and unsafe intent amounts', () => {
    expect(parseIntent({ type: 'adjust', loanRef: 'first', deltaPounds: 10.5 })).toBeNull();
    expect(parseIntent({ type: 'distribute', budgetPounds: -1, method: 'equal_whole_pounds' })).toBeNull();
    expect(parseIntent({ type: 'adjust', loanRef: 'first', deltaPounds: Number.NaN })).toBeNull();
    expect(parseIntent({ type: 'compare_rates', totalReturnPence: 1 })).toEqual({ type: 'compare_rates' });
  });

  it('drops an explanation that introduces a figure', () => {
    const resolved = resolveIntent(catalogue, tenThousand.budget, tenThousand.allocations, {
      type: 'explain_allocation',
    });
    expect(explanationMatchesFacts('The illustrative annual gross return is £724.00.', resolved.lines)).toBe(
      true,
    );
    expect(explanationMatchesFacts('The return is £724.00 plus £1,234.00.', resolved.lines)).toBe(false);
  });
});
