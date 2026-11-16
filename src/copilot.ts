import {
  amountErrorMessage,
  createCatalogue,
  evaluateScenario,
  formatPence,
  formatRate,
  formatShare,
  type CatalogueLoan,
  type Scenario,
} from './lab';

export type DistributionMethod = 'equal_whole_pounds' | 'highest_rate_first';

export type CopilotIntent =
  | { type: 'explain_allocation' }
  | { type: 'compare_rates' }
  | { type: 'adjust'; loanRef: string; deltaPounds: number }
  | { type: 'distribute'; budgetPounds: number; method: DistributionMethod }
  | { type: 'unsupported' };

export type ProposalInputs = {
  budget: string;
  allocations: Record<string, string>;
};

export type ResolvedIntent = {
  intent: CopilotIntent;
  scenario: Scenario;
  comparison: Array<{ loanId: string; title: string; rate: string }>;
  proposal: ProposalInputs | null;
  applicable: boolean;
  blockedReason: string | null;
  lines: string[];
};

export const EXPLANATION_FALLBACK =
  'The calculated figures are shown above. An explanation could not be verified, so it is not shown.';

export const MODEL_UNAVAILABLE =
  'The language model is unavailable. The figures above are calculated from the scenario.';

export const EXAMPLE_QUESTIONS: ReadonlyArray<{ label: string; intent: CopilotIntent }> = [
  {
    label: 'Explain my current investment allocation.',
    intent: { type: 'explain_allocation' },
  },
  {
    label: 'Compare the three loans by advertised annual return.',
    intent: { type: 'compare_rates' },
  },
  {
    label: 'What happens if I allocate £2,000 more to the first loan?',
    intent: { type: 'adjust', loanRef: 'first', deltaPounds: 2000 },
  },
  {
    label: 'How could I distribute my £10,000 budget across the available loans?',
    intent: { type: 'distribute', budgetPounds: 10000, method: 'equal_whole_pounds' },
  },
];

const POSITIONS = ['first', 'second', 'third'] as const;
const METHODS = new Set<DistributionMethod>(['equal_whole_pounds', 'highest_rate_first']);
const MONEY_OR_RATE = /£\d{1,3}(?:,\d{3})*(?:\.\d{2})?|\d+\.\d{1,2}%/g;

export function exampleIntent(question: string): CopilotIntent | null {
  return EXAMPLE_QUESTIONS.find((item) => item.label === question.trim())?.intent ?? null;
}

export function parseIntent(value: unknown): CopilotIntent | null {
  if (!value || typeof value !== 'object') {
    return null;
  }
  const record = value as Record<string, unknown>;
  if (record.type === 'explain_allocation' || record.type === 'compare_rates' || record.type === 'unsupported') {
    return { type: record.type };
  }
  if (record.type === 'adjust') {
    if (typeof record.loanRef !== 'string' || record.loanRef.trim() === '') {
      return null;
    }
    if (!isSafePounds(record.deltaPounds)) {
      return null;
    }
    return { type: 'adjust', loanRef: record.loanRef.trim(), deltaPounds: record.deltaPounds };
  }
  if (record.type === 'distribute') {
    if (!isSafePounds(record.budgetPounds) || record.budgetPounds < 0) {
      return null;
    }
    if (typeof record.method !== 'string' || !METHODS.has(record.method as DistributionMethod)) {
      return null;
    }
    return {
      type: 'distribute',
      budgetPounds: record.budgetPounds,
      method: record.method as DistributionMethod,
    };
  }
  return null;
}

export function resolveIntent(
  catalogue: readonly CatalogueLoan[],
  budgetInput: string,
  allocations: Readonly<Record<string, string>>,
  intent: CopilotIntent,
): ResolvedIntent {
  const current = evaluateScenario(catalogue, budgetInput, allocations);
  if (intent.type === 'explain_allocation') {
    return pack(intent, current, null, true, null, scenarioLines(current));
  }
  if (intent.type === 'compare_rates') {
    const comparison = [...catalogue]
      .sort(
        (left, right) =>
          right.annualisedReturnBps - left.annualisedReturnBps || left.id.localeCompare(right.id),
      )
      .map((loan) => ({
        loanId: loan.id,
        title: loan.title,
        rate: formatRate(loan.annualisedReturnBps),
      }));
    const lines = [
      'Listed by the supplied annualised rate. This is not a recommendation.',
      ...comparison.map((item) => `${item.title} ${item.rate}`),
    ];
    return {
      intent,
      scenario: current,
      comparison,
      proposal: null,
      applicable: true,
      blockedReason: null,
      lines,
    };
  }
  if (intent.type === 'unsupported') {
    return pack(
      intent,
      current,
      null,
      false,
      'This simulator can explain the current scenario, compare the supplied rates, adjust an allocation, or distribute a budget.',
      ['This question is outside the simulator.'],
    );
  }

  const proposal =
    intent.type === 'adjust'
      ? adjustAllocations(catalogue, budgetInput, allocations, intent.loanRef, intent.deltaPounds)
      : distributeBudget(catalogue, intent.budgetPounds, intent.method);

  if (!proposal.inputs) {
    return pack(intent, current, null, false, proposal.blockedReason, [
      proposal.blockedReason ?? 'The change could not be calculated.',
    ]);
  }

  const scenario = evaluateScenario(catalogue, proposal.inputs.budget, proposal.inputs.allocations);
  const lines = [
    proposal.rule,
    ...scenarioLines(scenario),
    ...(scenario.overBudget
      ? ['This scenario is over budget and is not a valid investment recommendation.']
      : []),
  ];
  return {
    intent,
    scenario,
    comparison: [],
    proposal: proposal.inputs,
    applicable: proposal.applicable && !scenario.rows.some((row) => row.error),
    blockedReason: proposal.applicable ? null : proposal.blockedReason,
    lines,
  };
}

export function explanationMatchesFacts(explanation: string, lines: readonly string[]): boolean {
  const allow = lines.join('\n');
  const figures = explanation.match(MONEY_OR_RATE) ?? [];
  return figures.every((figure) => allow.includes(figure));
}

export function catalogueForPrompt(catalogue: readonly CatalogueLoan[] = createCatalogue()): string {
  return catalogue
    .map((loan, index) => {
      const position = POSITIONS[index] ?? `position ${index + 1}`;
      return `${position}: id ${loan.id}, ${loan.title}, available ${loan.availableAmount} pounds`;
    })
    .join('\n');
}

function pack(
  intent: CopilotIntent,
  scenario: Scenario,
  proposal: ProposalInputs | null,
  applicable: boolean,
  blockedReason: string | null,
  lines: string[],
): ResolvedIntent {
  return {
    intent,
    scenario,
    comparison: [],
    proposal,
    applicable,
    blockedReason,
    lines,
  };
}

function scenarioLines(scenario: Scenario): string[] {
  const lines = scenario.rows.flatMap((row) => {
    const rate = formatRate(row.annualisedReturnBps);
    if (!row.included) {
      return [`${row.title} ${rate}`, `${row.title} not included`];
    }
    return [
      `${row.title} ${rate}`,
      `${row.title} ${formatPence(row.pounds * 100)}`,
      `${row.title} ${formatShare(row.shareTenths)}`,
      `${row.title} illustrative annual gross return ${formatPence(row.returnPence)}`,
    ];
  });
  lines.push(`Total allocated ${formatPence(scenario.allocatedPounds * 100)}`);
  lines.push(`Illustrative annual gross return ${formatPence(scenario.totalReturnPence)}`);
  if (scenario.remainingPounds !== null) {
    lines.push(
      scenario.overBudget
        ? `Over budget by ${formatPence(Math.abs(scenario.remainingPounds) * 100)}`
        : `Remaining budget ${formatPence(scenario.remainingPounds * 100)}`,
    );
  }
  return lines;
}

function adjustAllocations(
  catalogue: readonly CatalogueLoan[],
  budgetInput: string,
  allocations: Readonly<Record<string, string>>,
  loanRef: string,
  deltaPounds: number,
): { inputs: ProposalInputs | null; applicable: boolean; blockedReason: string | null; rule: string } {
  const loan = loanFromRef(catalogue, loanRef);
  if (!loan) {
    return { inputs: null, applicable: false, blockedReason: 'That loan is not in this scenario.', rule: '' };
  }
  const current = evaluateScenario(catalogue, budgetInput, allocations).rows.find(
    (row) => row.loanId === loan.id,
  );
  if (!current || current.error) {
    return {
      inputs: null,
      applicable: false,
      blockedReason: 'Enter a valid amount for this loan before changing it.',
      rule: '',
    };
  }
  const next = current.pounds + deltaPounds;
  if (!Number.isSafeInteger(next) || next < 0) {
    return {
      inputs: null,
      applicable: false,
      blockedReason: amountErrorMessage('negative'),
      rule: '',
    };
  }
  const nextAllocations = Object.fromEntries(
    catalogue.map((item) => [item.id, item.id === loan.id ? String(next) : (allocations[item.id] ?? '')]),
  );
  const applicable = next <= loan.availableAmount;
  return {
    inputs: { budget: budgetInput, allocations: nextAllocations },
    applicable,
    blockedReason: applicable ? null : amountErrorMessage('exceeds-available'),
    rule: `Change ${loan.title} by ${formatPence(deltaPounds * 100)}.`,
  };
}

function distributeBudget(
  catalogue: readonly CatalogueLoan[],
  budgetPounds: number,
  method: DistributionMethod,
): { inputs: ProposalInputs | null; applicable: boolean; blockedReason: string | null; rule: string } {
  const amounts =
    method === 'equal_whole_pounds'
      ? equalWholePounds(catalogue, budgetPounds)
      : highestRateFirst(catalogue, budgetPounds);
  const overAvailable = catalogue.some((loan) => (amounts.get(loan.id) ?? 0) > loan.availableAmount);
  const allocations = Object.fromEntries(
    catalogue.map((loan) => [loan.id, String(amounts.get(loan.id) ?? 0)]),
  );
  return {
    inputs: { budget: String(budgetPounds), allocations },
    applicable: !overAvailable,
    blockedReason: overAvailable ? amountErrorMessage('exceeds-available') : null,
    rule:
      method === 'equal_whole_pounds'
        ? `Equal whole pounds across ${catalogue.length} loans. The remainder pound goes to the highest supplied rate. Budget ${formatPence(budgetPounds * 100)}.`
        : `Highest supplied rate first, up to each fixture balance. Budget ${formatPence(budgetPounds * 100)}.`,
  };
}

function equalWholePounds(
  catalogue: readonly CatalogueLoan[],
  budgetPounds: number,
): Map<string, number> {
  const byRate = [...catalogue].sort(
    (left, right) =>
      right.annualisedReturnBps - left.annualisedReturnBps || left.id.localeCompare(right.id),
  );
  const count = catalogue.length;
  const base = count === 0 ? 0 : Math.floor(budgetPounds / count);
  let remainder = count === 0 ? 0 : budgetPounds % count;
  const amounts = new Map<string, number>();
  for (const loan of byRate) {
    const extra = remainder > 0 ? 1 : 0;
    remainder -= extra;
    amounts.set(loan.id, base + extra);
  }
  return amounts;
}

function highestRateFirst(
  catalogue: readonly CatalogueLoan[],
  budgetPounds: number,
): Map<string, number> {
  const byRate = [...catalogue].sort(
    (left, right) =>
      right.annualisedReturnBps - left.annualisedReturnBps || left.id.localeCompare(right.id),
  );
  let remaining = budgetPounds;
  const amounts = new Map<string, number>();
  for (const loan of byRate) {
    const take = Math.min(loan.availableAmount, remaining);
    amounts.set(loan.id, take);
    remaining -= take;
  }
  for (const loan of catalogue) {
    if (!amounts.has(loan.id)) {
      amounts.set(loan.id, 0);
    }
  }
  return amounts;
}

function loanFromRef(
  catalogue: readonly CatalogueLoan[],
  loanRef: string,
): CatalogueLoan | undefined {
  const position = POSITIONS.indexOf(loanRef as (typeof POSITIONS)[number]);
  if (position >= 0) {
    return catalogue[position];
  }
  return catalogue.find((loan) => loan.id === loanRef);
}

function isSafePounds(value: unknown): value is number {
  return typeof value === 'number' && Number.isSafeInteger(value);
}
