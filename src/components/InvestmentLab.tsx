import { useState, type Ref } from 'react';
import { CopilotPanel } from './CopilotPanel';
import { Header, type AppView } from './Header';
import {
  amountErrorMessage,
  createCatalogue,
  evaluateScenario,
  formatPence,
  formatRate,
  formatShare,
  shareTenths,
  type Scenario,
  type ScenarioRow,
} from '../lab';
import { formatPounds } from '../loans';

const catalogue = createCatalogue();
const emptyAllocations = Object.fromEntries(catalogue.map((loan) => [loan.id, '']));

const segmentColours = ['#168578', '#0369a1', '#475569'];
const unallocatedColour = '#e2e8f0';

type InvestmentLabProps = {
  view: AppView;
  onViewChange: (view: AppView) => void;
  headingRef: Ref<HTMLHeadingElement>;
};

type BarSegment = {
  key: string;
  label: string;
  units: number;
  colour: string;
  detail: string;
};

export function InvestmentLab({ view, onViewChange, headingRef }: InvestmentLabProps) {
  const [budget, setBudget] = useState('');
  const [allocations, setAllocations] = useState<Record<string, string>>(emptyAllocations);
  const scenario = evaluateScenario(catalogue, budget, allocations);
  const segments = barSegments(scenario);

  function reset() {
    setBudget('');
    setAllocations(emptyAllocations);
  }

  return (
    <>
      <Header view={view} onViewChange={onViewChange} />
      <main id="investment-lab" className="mx-auto max-w-6xl px-4 py-8 sm:px-6 lg:px-8">
        <h1
          ref={headingRef}
          tabIndex={-1}
          className="text-3xl font-bold tracking-tight text-ink outline-none sm:text-4xl"
        >
          Investment Lab
        </h1>
        <p className="mt-2 max-w-3xl text-base text-slate-600">
          Illustrative annual gross returns use each loan&apos;s supplied annualised rate. Returns
          are not guaranteed. This simulator does not perform a real transaction, and the loan
          deadline is not the investment term.
        </p>

        <section aria-label="Budget" className="mt-6 rounded-2xl border border-slate-200/80 bg-white p-5 shadow-[0_8px_24px_rgba(16,40,70,0.05)]">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
            <div className="max-w-md flex-1">
              <label htmlFor="investment-budget" className="text-sm font-medium text-ink">
                Investment budget
              </label>
              <div className="mt-2 flex items-center rounded-lg border border-slate-300 bg-white px-3 focus-within:border-brand focus-within:ring-2 focus-within:ring-brand">
                <span aria-hidden="true" className="text-slate-500">
                  £
                </span>
                <input
                  id="investment-budget"
                  type="text"
                  inputMode="numeric"
                  value={budget}
                  aria-invalid={scenario.budgetError ? true : undefined}
                  aria-describedby={scenario.budgetError ? 'budget-hint budget-error' : 'budget-hint'}
                  onChange={(event) => setBudget(event.target.value)}
                  className="min-h-11 w-full border-0 bg-transparent px-2 text-base text-ink outline-none"
                />
              </div>
              <p id="budget-hint" className="mt-2 text-sm text-slate-600">
                Enter a whole amount in pounds. Leave this empty to start from £0.
              </p>
              {scenario.budgetError ? (
                <p id="budget-error" role="alert" className="mt-2 text-sm text-red-800">
                  {amountErrorMessage(scenario.budgetError)}
                </p>
              ) : null}
            </div>
            <button
              type="button"
              onClick={reset}
              className="inline-flex min-h-11 items-center justify-center rounded-lg border border-slate-300 bg-white px-4 text-sm font-semibold text-slate-700 hover:bg-slate-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand focus-visible:ring-offset-2"
            >
              Reset scenario
            </button>
          </div>
        </section>

        <section aria-label="Scenario totals" className="mt-4 grid gap-4 sm:grid-cols-3">
          <TotalCard label="Total allocated" value={formatPence(scenario.allocatedPounds * 100)} />
          <TotalCard
            label="Illustrative annual gross return"
            value={formatPence(scenario.totalReturnPence)}
          />
          <TotalCard
            label={scenario.overBudget ? 'Over budget' : 'Remaining budget'}
            value={remainingValue(scenario)}
            warning={scenario.overBudget}
          />
        </section>

        {scenario.overBudget && scenario.remainingPounds !== null ? (
          <p role="status" className="mt-4 rounded-xl border border-amber-300 bg-amber-50 px-4 py-3 text-sm text-amber-950">
            Over budget by {formatPence(Math.abs(scenario.remainingPounds) * 100)}. This scenario is
            not a valid investment recommendation.
          </p>
        ) : null}

        <section aria-label="Loan allocations" className="mt-6 grid gap-4 md:grid-cols-3">
          {scenario.rows.map((row) => (
            <AllocationField
              key={row.loanId}
              row={row}
              value={allocations[row.loanId] ?? ''}
              onChange={(value) =>
                setAllocations((current) => ({
                  ...current,
                  [row.loanId]: value,
                }))
              }
            />
          ))}
        </section>

        <section aria-label="Allocation chart" className="mt-6 rounded-2xl border border-slate-200/80 bg-white p-5 shadow-[0_8px_24px_rgba(16,40,70,0.05)]">
          <h2 className="text-lg font-bold text-ink">Allocation</h2>
          <p className="mt-2 text-sm text-slate-600">{chartDescription(scenario)}</p>
          <AllocationChart segments={segments} />
          {segments.length > 0 ? (
            <ul aria-hidden="true" className="mt-4 grid gap-2 sm:grid-cols-2">
              {segments.map((segment) => (
                <li key={segment.key} className="flex items-start gap-2 text-sm text-slate-600">
                  <span
                    className="mt-1 h-3 w-3 shrink-0 rounded-sm"
                    style={{ backgroundColor: segment.colour }}
                  />
                  <span>
                    <span className="font-medium text-ink">{segment.label}</span>
                    <span className="mt-0.5 block">{segment.detail}</span>
                  </span>
                </li>
              ))}
            </ul>
          ) : null}
          <div className="mt-5 overflow-x-auto">
            <table className="w-full min-w-[36rem] text-left text-sm">
              <caption className="sr-only">Illustrative allocation scenario</caption>
              <thead className="text-slate-500">
                <tr>
                  <th scope="col" className="py-2 pr-4 font-medium">
                    Loan
                  </th>
                  <th scope="col" className="py-2 pr-4 font-medium">
                    Allocation
                  </th>
                  <th scope="col" className="py-2 pr-4 font-medium">
                    Share of budget
                  </th>
                  <th scope="col" className="py-2 font-medium">
                    Illustrative annual gross return
                  </th>
                </tr>
              </thead>
              <tbody>
                {scenario.rows.map((row) => (
                  <tr key={row.loanId} className="border-t border-slate-100">
                    <th scope="row" className="py-3 pr-4 font-semibold text-ink">
                      {row.title}
                    </th>
                    <td className="py-3 pr-4 text-ink">
                      {row.included ? formatPence(row.pounds * 100) : 'Not included'}
                    </td>
                    <td className="py-3 pr-4 text-ink">
                      {row.included ? formatShare(row.shareTenths) : '—'}
                    </td>
                    <td className="py-3 text-ink">
                      {row.included ? formatPence(row.returnPence) : '—'}
                    </td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr className="border-t border-slate-200 font-semibold text-ink">
                  <th scope="row" className="py-3 pr-4">
                    Total
                  </th>
                  <td className="py-3 pr-4">{formatPence(scenario.allocatedPounds * 100)}</td>
                  <td className="py-3 pr-4">
                    {scenario.budgetValid ? formatShare(shareOfBudget(scenario)) : '—'}
                  </td>
                  <td className="py-3">{formatPence(scenario.totalReturnPence)}</td>
                </tr>
              </tfoot>
            </table>
          </div>
        </section>
        <CopilotPanel
          budget={budget}
          allocations={allocations}
          labActive={view === 'lab'}
          onApply={(nextBudget, nextAllocations) => {
            setBudget(nextBudget);
            setAllocations(nextAllocations);
          }}
        />
      </main>
    </>
  );
}

function AllocationField({
  row,
  value,
  onChange,
}: {
  row: ScenarioRow;
  value: string;
  onChange: (value: string) => void;
}) {
  const inputId = `allocation-${row.loanId}`;
  const hintId = `${inputId}-hint`;
  const errorId = `${inputId}-error`;

  return (
    <div className="rounded-2xl border border-slate-200/80 bg-white p-4 shadow-[0_8px_24px_rgba(16,40,70,0.05)]">
      <label htmlFor={inputId} className="text-sm font-bold leading-snug text-ink">
        {row.title}
      </label>
      <p id={hintId} className="mt-1 text-sm text-slate-600">
        Available balance £{formatPounds(row.availableAmount)}. Annualised return{' '}
        {formatRate(row.annualisedReturnBps)}.
      </p>
      <div className="mt-3 flex items-center rounded-lg border border-slate-300 bg-white px-3 focus-within:border-brand focus-within:ring-2 focus-within:ring-brand">
        <span aria-hidden="true" className="text-slate-500">
          £
        </span>
        <input
          id={inputId}
          type="text"
          inputMode="numeric"
          value={value}
          aria-invalid={row.error ? true : undefined}
          aria-describedby={row.error ? `${hintId} ${errorId}` : hintId}
          onChange={(event) => onChange(event.target.value)}
          className="min-h-11 w-full border-0 bg-transparent px-2 text-base text-ink outline-none"
        />
      </div>
      {row.error ? (
        <p id={errorId} role="alert" className="mt-2 text-sm text-red-800">
          {amountErrorMessage(row.error)}
        </p>
      ) : null}
    </div>
  );
}

function TotalCard({
  label,
  value,
  warning = false,
}: {
  label: string;
  value: string;
  warning?: boolean;
}) {
  return (
    <div
      className={`rounded-2xl border px-5 py-4 shadow-[0_8px_24px_rgba(16,40,70,0.05)] ${warning ? 'border-amber-300 bg-amber-50' : 'border-slate-200/80 bg-white'}`}
    >
      <p className={`text-sm ${warning ? 'text-amber-950' : 'text-slate-500'}`}>{label}</p>
      <p className={`text-2xl font-bold tracking-tight ${warning ? 'text-amber-950' : 'text-ink'}`}>
        {value}
      </p>
    </div>
  );
}

function AllocationChart({ segments }: { segments: BarSegment[] }) {
  let offset = 0;

  return (
    <svg
      id="allocation-chart"
      viewBox="0 0 1000 32"
      preserveAspectRatio="none"
      aria-hidden="true"
      className="mt-4 h-8 w-full overflow-hidden rounded-full bg-slate-200"
    >
      {segments.map((segment) => {
        const x = offset;
        offset += segment.units;
        return (
          <rect key={segment.key} x={x} y="0" width={segment.units} height="32" fill={segment.colour} />
        );
      })}
    </svg>
  );
}

function remainingValue(scenario: Scenario): string {
  if (scenario.remainingPounds === null) {
    return '—';
  }
  if (scenario.overBudget) {
    return formatPence(Math.abs(scenario.remainingPounds) * 100);
  }
  return formatPence(scenario.remainingPounds * 100);
}

function chartDescription(scenario: Scenario): string {
  if (scenario.allocatedPounds === 0) {
    return 'Nothing is allocated yet.';
  }
  if (!scenario.budgetValid) {
    return 'The chart shows each included loan’s share of the allocated amount.';
  }
  if (scenario.overBudget) {
    return 'The chart shows each included loan’s share of the allocated amount. The allocation is larger than the budget.';
  }
  if (scenario.remainingPounds !== null && scenario.remainingPounds > 0) {
    return 'The chart shows each included loan’s share of the budget, including the amount still unallocated.';
  }
  return 'The chart shows each included loan’s share of the budget.';
}

function segmentDetail(pounds: number, tenths: number, showShare: boolean): string {
  const amount = formatPence(pounds * 100);
  return showShare ? `${amount} · ${formatShare(tenths)}` : amount;
}

function shareOfBudget(scenario: Scenario): number {
  return shareTenths(scenario.allocatedPounds, scenario.budgetPounds);
}

function barSegments(scenario: Scenario): BarSegment[] {
  const included = scenario.rows
    .map((row, index) => ({ row, index }))
    .filter((item) => item.row.included && item.row.pounds > 0);

  if (included.length === 0) {
    return [];
  }

  const parts: Array<{ key: string; label: string; amount: number; colour: string; detail: string }> =
    included.map((item) => ({
      key: item.row.loanId,
      label: item.row.title,
      amount: item.row.pounds,
      colour: segmentColours[item.index] ?? '#168578',
      detail: segmentDetail(item.row.pounds, item.row.shareTenths, scenario.budgetValid),
    }));

  const withinBudget = scenario.budgetValid && !scenario.overBudget && scenario.budgetPounds > 0;
  const total = withinBudget ? scenario.budgetPounds : scenario.allocatedPounds;

  if (withinBudget && scenario.budgetPounds > scenario.allocatedPounds) {
    const unallocated = scenario.budgetPounds - scenario.allocatedPounds;
    parts.push({
      key: 'unallocated',
      label: 'Unallocated',
      amount: unallocated,
      colour: unallocatedColour,
      detail: segmentDetail(unallocated, shareTenths(unallocated, scenario.budgetPounds), true),
    });
  }

  if (total <= 0) {
    return [];
  }

  let used = 0;
  return parts.map((part, index) => {
    const units =
      index === parts.length - 1 ? 1000 - used : Math.floor((part.amount * 1000) / total);
    used += units;
    return {
      key: part.key,
      label: part.label,
      units,
      colour: part.colour,
      detail: part.detail,
    };
  });
}
