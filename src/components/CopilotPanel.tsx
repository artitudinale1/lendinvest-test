import { useCallback, useEffect, useId, useRef, useState } from 'react';
import {
  EXAMPLE_QUESTIONS,
  EXPLANATION_FALLBACK,
  MODEL_UNAVAILABLE,
  exampleIntent,
  explanationMatchesFacts,
  explanationParagraphs,
  parseIntent,
  resolveIntent,
  type CopilotIntent,
} from '../copilot';
import { isStaticCopilotDemo } from '../copilotDemo';
import { TurnstileWidget, type TurnstileProblem, type TurnstileStatus } from './TurnstileWidget';
import {
  createCatalogue,
  formatPence,
  formatShare,
  type Scenario,
} from '../lab';

const catalogue = createCatalogue();

type CopilotPanelProps = {
  budget: string;
  allocations: Record<string, string>;
  onApply: (budget: string, allocations: Record<string, string>) => void;
  labActive: boolean;
};

type Answer = {
  intent: CopilotIntent;
  explanation: string | null;
  notice: string | null;
  signature: string;
};

export function CopilotPanel({ budget, allocations, onApply, labActive }: CopilotPanelProps) {
  const questionId = useId();
  const previewRef = useRef<HTMLHeadingElement>(null);
  const [question, setQuestion] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [answer, setAnswer] = useState<Answer | null>(null);
  const [turnstileToken, setTurnstileToken] = useState('');
  const [turnstileStatus, setTurnstileStatus] = useState<TurnstileStatus>('verifying');
  const [turnstileProblem, setTurnstileProblem] = useState<TurnstileProblem>(null);
  const [challengeVersion, setChallengeVersion] = useState(0);
  const siteKey = import.meta.env.VITE_TURNSTILE_SITE_KEY;
  const handleTurnstileStatus = useCallback((status: TurnstileStatus, problem: TurnstileProblem = null) => {
    setTurnstileStatus(status);
    setTurnstileProblem(problem);
  }, []);
  const liveWorker = !isStaticCopilotDemo() && Boolean(import.meta.env.VITE_COPILOT_API_URL);
  const signature = `${budget}\n${JSON.stringify(allocations)}`;
  const visible = answer?.signature === signature ? answer : null;
  const resolved = visible
    ? resolveIntent(catalogue, budget, allocations, visible.intent)
    : null;
  const explanation =
    visible?.explanation &&
    resolved &&
    explanationMatchesFacts(visible.explanation, resolved.lines)
      ? visible.explanation
      : null;
  const explanationParts = explanation ? explanationParagraphs(explanation) : [];
  const previewKey = resolved?.proposal ? `${signature}:${JSON.stringify(visible?.intent)}` : '';

  useEffect(() => {
    if (previewKey) {
      previewRef.current?.focus();
    }
  }, [previewKey]);

  useEffect(() => {
    if (labActive) return;
    setTurnstileToken('');
    setTurnstileStatus('verifying');
    setTurnstileProblem(null);
  }, [labActive]);

  async function ask(nextQuestion: string) {
    const trimmed = nextQuestion.trim();
    if (trimmed === '' || loading) {
      return;
    }
    if (liveWorker && (turnstileStatus !== 'verified' || turnstileToken.trim() === '')) {
      setError(verificationBlockedMessage(turnstileStatus, turnstileProblem, Boolean(siteKey)));
      return;
    }
    setQuestion(trimmed);
    setLoading(true);
    setError(null);
    setAnswer(null);
    try {
      if (isStaticCopilotDemo()) {
        const intent = exampleIntent(trimmed);
        if (!intent) {
          setError('Investment Copilot is unavailable.');
          return;
        }
        setAnswer({
          intent,
          explanation: null,
          notice: MODEL_UNAVAILABLE,
          signature,
        });
        return;
      }
      const response = await fetch(`${import.meta.env.VITE_COPILOT_API_URL?.replace(/\/$/, '') ?? ''}/api/copilot`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ question: trimmed, budget, allocations, ...(liveWorker ? { turnstileToken } : {}) }),
      });
      const payload: unknown = await response.json();
      if (!response.ok) {
        setError(errorMessage(payload));
        return;
      }
      const intent = parseIntent(payload && typeof payload === 'object' ? (payload as { intent?: unknown }).intent : null);
      if (!intent) {
        setError('The copilot could not read that request.');
        return;
      }
      const record = payload as { explanation?: unknown; notice?: unknown };
      setAnswer({
        intent,
        explanation: typeof record.explanation === 'string' ? record.explanation : null,
        notice: typeof record.notice === 'string' ? record.notice : null,
        signature,
      });
    } catch {
      setError('Investment Copilot is unavailable.');
    } finally {
      if (liveWorker) {
        setTurnstileToken('');
        setTurnstileStatus('verifying');
        setTurnstileProblem(null);
        setChallengeVersion((version) => version + 1);
      }
      setLoading(false);
    }
  }

  function applyPreview() {
    if (!resolved?.proposal || !resolved.applicable) {
      return;
    }
    onApply(resolved.proposal.budget, resolved.proposal.allocations);
    setAnswer(null);
  }

  return (
    <section aria-labelledby="copilot-heading" className="mt-6 rounded-2xl border border-slate-200/80 bg-white p-5 shadow-[0_8px_24px_rgba(16,40,70,0.05)]">
      <h2 id="copilot-heading" className="text-lg font-bold text-ink">
        Investment Copilot
      </h2>
      <p className="mt-2 max-w-3xl text-sm text-slate-600">
        The copilot reads this scenario and explains the calculated figures. It does not give
        financial advice, and it does not make a real investment. Returns stay illustrative annual
        gross returns and are not guaranteed.
      </p>
      {isStaticCopilotDemo() ? (
        <p className="mt-3 max-w-3xl text-sm text-slate-700">
          Public demo. The language model is unavailable. The four example questions use the
          calculated figures.
        </p>
      ) : null}
      <div className="mt-4 flex flex-wrap gap-2">
        {EXAMPLE_QUESTIONS.map((item) => (
          <button
            key={item.label}
            type="button"
            onClick={() => void ask(item.label)}
            className="min-h-11 rounded-full border border-slate-300 px-3 text-left text-sm text-slate-700 hover:bg-slate-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand"
          >
            {item.label}
          </button>
        ))}
      </div>
      {liveWorker && labActive && siteKey ? (
        <div className="mt-4">
          <TurnstileWidget
            key={challengeVersion}
            siteKey={siteKey}
            onToken={setTurnstileToken}
            onStatus={handleTurnstileStatus}
          />
        </div>
      ) : null}
      {liveWorker && labActive && !siteKey ? (
        <p role="status" data-verification-status="failed" className="mt-4 text-sm text-red-800">
          Verification failed. The security check could not be loaded.
        </p>
      ) : null}
      <form
        className="mt-4 flex flex-col gap-3 sm:flex-row sm:items-end"
        onSubmit={(event) => {
          event.preventDefault();
          void ask(question);
        }}
      >
        <div className="flex-1">
          <label htmlFor={questionId} className="text-sm font-medium text-ink">
            Ask about this scenario
          </label>
          <input
            id={questionId}
            value={question}
            onChange={(event) => setQuestion(event.target.value)}
            className="mt-2 min-h-11 w-full rounded-lg border border-slate-300 px-3 text-base text-ink outline-none focus:border-brand focus:ring-2 focus:ring-brand"
          />
        </div>
        <button
          type="submit"
          disabled={loading}
          className="inline-flex min-h-11 items-center justify-center rounded-lg bg-brand px-4 text-sm font-semibold text-white hover:bg-brand-hover focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand focus-visible:ring-offset-2 disabled:opacity-60"
        >
          {loading ? 'Calculating' : 'Ask'}
        </button>
      </form>
      <div aria-live="polite" className="mt-4">
        {loading ? (
          <p className="text-sm text-slate-600">
            <span className="sr-only">Calculating the scenario.</span>
            <span aria-hidden="true">
              Calculating the scenario
              <span className="copilot-ellipsis">...</span>
            </span>
          </p>
        ) : null}
        {error ? (
          <p role="alert" className="text-sm text-red-800">
            {error}
          </p>
        ) : null}
        {resolved ? (
          <div className="grid gap-4">
            <div>
              <h3 className="text-sm font-semibold text-ink">
                {resolved.proposal ? 'Calculated preview' : 'Calculated result'}
              </h3>
              <CalculatedResult resolved={resolved} />
            </div>
            {resolved.proposal ? (
              <div className="rounded-xl border border-slate-200 p-4">
                <h3 ref={previewRef} tabIndex={-1} className="text-sm font-semibold text-ink outline-none">
                  Proposed scenario
                </h3>
                {resolved.blockedReason ? (
                  <p className="mt-2 text-sm text-red-800">{resolved.blockedReason}</p>
                ) : null}
                {resolved.scenario.overBudget && resolved.scenario.remainingPounds !== null ? (
                  <p className="mt-2 text-sm text-amber-950">
                    Over budget by {formatPence(Math.abs(resolved.scenario.remainingPounds) * 100)}.
                    This scenario is not a valid investment recommendation.
                  </p>
                ) : null}
                <div className="mt-3 flex flex-wrap gap-2">
                  <button
                    type="button"
                    onClick={applyPreview}
                    disabled={!resolved.applicable}
                    className="inline-flex min-h-11 items-center justify-center rounded-lg bg-brand px-4 text-sm font-semibold text-white hover:bg-brand-hover focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand focus-visible:ring-offset-2 disabled:opacity-60"
                  >
                    Apply preview
                  </button>
                  <button
                    type="button"
                    onClick={() => setAnswer(null)}
                    className="inline-flex min-h-11 items-center justify-center rounded-lg border border-slate-300 px-4 text-sm font-semibold text-slate-700 hover:bg-slate-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand"
                  >
                    Dismiss
                  </button>
                </div>
              </div>
            ) : null}
            {explanationParts.length > 0 ? (
              <div className="min-w-0 max-w-full">
                <h3 className="text-sm font-semibold text-ink">AI explanation</h3>
                <div className="mt-2 min-w-0 max-w-full space-y-2.5">
                  {explanationParts.map((paragraph, index) => (
                    <p key={`${index}:${paragraph}`} className="text-sm leading-6 break-words text-slate-700">
                      {paragraph}
                    </p>
                  ))}
                </div>
                <p className="mt-1 text-xs text-slate-500">
                  Generated text. The figures above come from the calculation.
                </p>
              </div>
            ) : visible?.notice || visible?.explanation ? (
              <p className="text-sm text-slate-600">{visible.notice ?? EXPLANATION_FALLBACK}</p>
            ) : null}
          </div>
        ) : null}
      </div>
    </section>
  );
}

function CalculatedResult({
  resolved,
}: {
  resolved: ReturnType<typeof resolveIntent>;
}) {
  if (resolved.comparison.length > 0) {
    return (
      <ol className="mt-2 grid gap-1 text-sm text-ink">
        {resolved.comparison.map((item) => (
          <li key={item.loanId}>
            {item.title}: {item.rate}
          </li>
        ))}
      </ol>
    );
  }
  return <ScenarioFacts scenario={resolved.scenario} />;
}

function ScenarioFacts({ scenario }: { scenario: Scenario }) {
  return (
    <div className="mt-2">
      <dl className="grid gap-1 text-sm text-ink">
        <div className="flex justify-between gap-4">
          <dt>Total allocated</dt>
          <dd className="whitespace-nowrap tabular-nums">{formatPence(scenario.allocatedPounds * 100)}</dd>
        </div>
        <div className="flex justify-between gap-4">
          <dt>Illustrative annual gross return</dt>
          <dd className="whitespace-nowrap tabular-nums">{formatPence(scenario.totalReturnPence)}</dd>
        </div>
      </dl>
      <table className="mt-3 w-full border-collapse text-left text-sm text-ink">
        <caption className="sr-only">Allocation by loan</caption>
        <thead className="text-xs text-slate-500">
          <tr className="border-b border-slate-200">
            <th scope="col" className="py-1.5 pr-2 font-medium">
              Loan
            </th>
            <th scope="col" className="py-1.5 pr-2 text-right font-medium">
              Amount
            </th>
            <th scope="col" className="py-1.5 pr-2 text-right font-medium">
              Share
            </th>
            <th scope="col" className="py-1.5 text-right font-medium">
              Return
            </th>
          </tr>
        </thead>
        <tbody>
          {scenario.rows.map((row) => (
            <tr key={row.loanId} className="border-b border-slate-100 align-top">
              <th scope="row" className="py-2 pr-2 font-semibold break-words">
                {row.title}
              </th>
              {row.included ? (
                <>
                  <td className="py-2 pr-2 text-right whitespace-nowrap tabular-nums">
                    {formatPence(row.pounds * 100)}
                  </td>
                  <td className="py-2 pr-2 text-right whitespace-nowrap tabular-nums">
                    {formatShare(row.shareTenths)}
                  </td>
                  <td className="py-2 text-right whitespace-nowrap tabular-nums">
                    {formatPence(row.returnPence)}
                  </td>
                </>
              ) : (
                <td colSpan={3} className="py-2 text-right text-slate-600">
                  Not included
                </td>
              )}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function verificationBlockedMessage(
  status: TurnstileStatus,
  problem: TurnstileProblem,
  hasSiteKey: boolean,
): string {
  if (!hasSiteKey || problem === 'script') {
    return 'Security verification could not be loaded. Try again.';
  }
  if (problem === 'timeout') {
    return 'Security verification timed out. Try again before asking.';
  }
  if (status === 'failed') {
    return 'Security verification failed. Try again before asking.';
  }
  if (status === 'expired') {
    return 'Security verification expired. Verify again before asking.';
  }
  return 'Complete the security verification before asking.';
}

function errorMessage(payload: unknown): string {
  if (payload && typeof payload === 'object' && typeof (payload as { error?: unknown }).error === 'string') {
    return (payload as { error: string }).error;
  }
  return 'Investment Copilot is unavailable.';
}
