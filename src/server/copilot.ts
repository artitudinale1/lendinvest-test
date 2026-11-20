import {
  catalogueForPrompt,
  exampleIntent,
  EXPLANATION_FALLBACK,
  explanationMatchesFacts,
  MODEL_UNAVAILABLE,
  parseIntent,
  resolveIntent,
  type CopilotIntent,
} from '../copilot';
import { allowedCopilotModel, DEFAULT_COPILOT_MODEL, type CopilotModelId } from '../copilotModels';
import { createCatalogue } from '../lab';
import { type Completion } from './provider';

const MAX_QUESTION = 500;
const MAX_FIELD = 40;
const PROVIDER_TIMEOUT_MS = 10_000;

export type CopilotSuccess = {
  intent: CopilotIntent;
  explanation: string | null;
  explanationStatus: 'model' | 'fallback' | 'unavailable';
  notice: string | null;
};

export type CopilotFailure = {
  error: string;
};

export type CopilotResult = {
  status: number;
  body: CopilotSuccess | CopilotFailure;
};

const INTENT_SYSTEM = `You classify one question about a loan simulator.
Return one JSON object and nothing else.
Do not calculate a return, a share, a percentage, or a new total.
Copy only a whole-pound amount the user wrote.
loanRef must be first, second, third, or one of the listed ids.
method must be equal_whole_pounds when the user wants the budget spread across the loans, or highest_rate_first when the user asks to favour the higher supplied rate.
Use unsupported when the question is not about explaining, comparing supplied rates, changing an allocation, or distributing a budget.
Shapes:
{"type":"explain_allocation"}
{"type":"compare_rates"}
{"type":"adjust","loanRef":"first","deltaPounds":2000}
{"type":"distribute","budgetPounds":10000,"method":"equal_whole_pounds"}
{"type":"unsupported"}`;

const EXPLANATION_SYSTEM = `You write a short plain-text explanation of a loan simulator result.
Use only figures that already appear in the facts.
Do not invent amounts, percentages, or rates.
Do not give financial advice, a ranking, or a guarantee.
Describe any return as an illustrative annual gross return that is not guaranteed.
This simulator does not make a real investment.`;

export async function handleCopilotRequest(
  body: unknown,
  options: { complete: Completion | null },
): Promise<CopilotResult> {
  const parsed = parseRequest(body);
  if (!parsed.ok) {
    return { status: 400, body: { error: parsed.error } };
  }

  const catalogue = createCatalogue();
  let intent: CopilotIntent | null = null;
  if (!options.complete) {
    intent = exampleIntent(parsed.question);
    if (!intent) {
      return { status: 503, body: { error: 'Investment Copilot is unavailable.' } };
    }
  } else {
    try {
      const raw = await options.complete({
        system: `${INTENT_SYSTEM}\nLoans:\n${catalogueForPrompt(catalogue)}`,
        user: parsed.question,
        timeoutMs: PROVIDER_TIMEOUT_MS,
        model: parsed.model,
      });
      intent = parseIntent(parseModelJson(raw));
    } catch (error) {
      if (error instanceof SyntaxError) {
        return { status: 422, body: { error: 'The copilot could not read that request.' } };
      }
      return { status: 503, body: { error: 'Investment Copilot is unavailable.' } };
    }
    if (!intent) {
      return { status: 422, body: { error: 'The copilot could not read that request.' } };
    }
  }

  const resolved = resolveIntent(catalogue, parsed.budget, parsed.allocations, intent);
  if (!options.complete || intent.type === 'unsupported') {
    return {
      status: 200,
      body: {
        intent,
        explanation: null,
        explanationStatus: 'unavailable',
        notice: options.complete ? resolved.blockedReason : MODEL_UNAVAILABLE,
      },
    };
  }

  try {
    const raw = await options.complete({
      system: EXPLANATION_SYSTEM,
      user: JSON.stringify({ question: parsed.question, facts: resolved.lines }),
      timeoutMs: PROVIDER_TIMEOUT_MS,
      model: parsed.model,
    });
    const explanation = raw.trim().slice(0, 1200);
    if (explanation !== '' && explanationMatchesFacts(explanation, resolved.lines)) {
      return {
        status: 200,
        body: {
          intent,
          explanation,
          explanationStatus: 'model',
          notice: null,
        },
      };
    }
  } catch {
    // The calculated result is still returned below.
  }

  return {
    status: 200,
    body: {
      intent,
      explanation: null,
      explanationStatus: 'fallback',
      notice: EXPLANATION_FALLBACK,
    },
  };
}

function parseRequest(
  body: unknown,
):
  | {
      ok: true;
      question: string;
      budget: string;
      allocations: Record<string, string>;
      model: CopilotModelId;
    }
  | { ok: false; error: string } {
  if (!body || typeof body !== 'object') {
    return { ok: false, error: 'Enter a question about this scenario.' };
  }
  const record = body as Record<string, unknown>;
  if (typeof record.question !== 'string' || record.question.trim() === '') {
    return { ok: false, error: 'Enter a question about this scenario.' };
  }
  const question = record.question.trim();
  if (question.length > MAX_QUESTION) {
    return { ok: false, error: 'That question is too long.' };
  }
  if (typeof record.budget !== 'string' || record.budget.length > MAX_FIELD) {
    return { ok: false, error: 'Enter a question about this scenario.' };
  }
  if (!record.allocations || typeof record.allocations !== 'object' || Array.isArray(record.allocations)) {
    return { ok: false, error: 'Enter a question about this scenario.' };
  }
  const allocations: Record<string, string> = {};
  for (const [key, value] of Object.entries(record.allocations)) {
    if (key.length > MAX_FIELD || typeof value !== 'string' || value.length > MAX_FIELD) {
      return { ok: false, error: 'Enter a question about this scenario.' };
    }
    allocations[key] = value;
  }
  if (!('model' in record) || record.model === undefined) {
    return { ok: true, question, budget: record.budget, allocations, model: DEFAULT_COPILOT_MODEL };
  }
  const model = allowedCopilotModel(record.model);
  if (!model) {
    return { ok: false, error: 'Choose a supported model.' };
  }
  return { ok: true, question, budget: record.budget, allocations, model };
}

function parseModelJson(text: string): unknown {
  const trimmed = text.trim().replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '');
  return JSON.parse(trimmed);
}
