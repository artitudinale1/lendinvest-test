import { describe, expect, it, vi } from 'vitest';
import type { Completion } from '../server/provider';
import { DEFAULT_COPILOT_MODEL } from '../copilotModels';
import { handleWorkerFetch, PAGES_ORIGIN, type WorkerDependencies } from './copilotWorker';
import {
  DAILY_CALL_LIMIT,
  DAILY_LIMIT_MESSAGE,
  reserveQuestion,
  VISITOR_LIMIT_MESSAGE,
  VISITOR_QUESTION_LIMIT,
  type QuotaSnapshot,
} from './quota';
import { verifyTurnstileToken } from './turnstile';

const now = 1_700_000_000_000;

const worked = {
  question: 'Explain my current investment allocation.',
  budget: '10000',
  allocations: { '1': '4000', '5': '4000', '12': '2000' },
  turnstileToken: 'XXXX.DUMMY.TOKEN.XXXX',
};

describe('copilot worker integration', () => {
  it('reserves through the real quota rules for the visitor window and the daily cap', async () => {
    const complete = vi.fn<Completion>(async ({ system }) =>
      system.includes('classify') ? '{"type":"explain_allocation"}' : 'Calculated figures only.',
    );
    const visitor = quotaReserve({ calls: 0, visitorWindowStart: now, visitorCount: 0 });

    for (let attempt = 1; attempt <= VISITOR_QUESTION_LIMIT; attempt += 1) {
      const response = await handleWorkerFetch(question(worked), deps({ complete, reserve: visitor, now: () => now }));
      expect(response.status).toBe(200);
    }
    const blockedVisitor = await handleWorkerFetch(
      question(worked),
      deps({ complete, reserve: visitor, now: () => now }),
    );
    expect(blockedVisitor.status).toBe(429);
    await expect(blockedVisitor.json()).resolves.toEqual({ error: VISITOR_LIMIT_MESSAGE });
    expect(blockedVisitor.headers.get('Access-Control-Allow-Origin')).toBe(PAGES_ORIGIN);
    expect(complete).toHaveBeenCalledTimes(VISITOR_QUESTION_LIMIT * 2);

    const daily = quotaReserve({
      calls: DAILY_CALL_LIMIT - 2,
      visitorWindowStart: now,
      visitorCount: 0,
    });
    const lastQuestion = await handleWorkerFetch(
      question(worked),
      deps({ complete, reserve: daily, now: () => now + 1 }),
    );
    expect(lastQuestion.status).toBe(200);
    const overDaily = await handleWorkerFetch(
      question(worked),
      deps({ complete, reserve: daily, now: () => now + 1 }),
    );
    expect(overDaily.status).toBe(429);
    await expect(overDaily.json()).resolves.toEqual({ error: DAILY_LIMIT_MESSAGE });
    expect(complete).toHaveBeenCalledTimes(VISITOR_QUESTION_LIMIT * 2 + 2);
  });

  it('defaults a missing model to automatic and keeps a foreign origin off the response', async () => {
    const complete = vi.fn<Completion>(async ({ system, model }) => {
      expect(model).toBe(DEFAULT_COPILOT_MODEL);
      return system.includes('classify') ? '{"type":"explain_allocation"}' : 'Calculated figures only.';
    });
    const reserve = vi.fn(async () => ({ ok: true as const, calls: 2, visitorWindowStart: now, visitorCount: 1 }));
    const withoutModel = {
      question: worked.question,
      budget: worked.budget,
      allocations: worked.allocations,
      turnstileToken: worked.turnstileToken,
    };

    const response = await handleWorkerFetch(question(withoutModel), deps({ complete, reserve }));
    expect(response.status).toBe(200);
    expect(response.headers.get('Vary')).toBe('Origin');
    expect(complete).toHaveBeenCalledTimes(2);

    const noOrigin = await handleWorkerFetch(question(worked, null), deps({ complete, reserve }));
    expect(noOrigin.status).toBe(200);
    expect(noOrigin.headers.get('Access-Control-Allow-Origin')).toBeNull();
  });

  it('rejects an unsupported method and a non-JSON body before quota', async () => {
    const complete = vi.fn<Completion>(async () => '{"type":"explain_allocation"}');
    const reserve = vi.fn();
    const get = await handleWorkerFetch(
      new Request('https://worker.test/api/copilot', { method: 'GET', headers: { Origin: PAGES_ORIGIN } }),
      deps({ complete, reserve }),
    );
    expect(get.status).toBe(405);
    await expect(get.json()).resolves.toEqual({ error: 'That request is not supported.' });

    const text = await handleWorkerFetch(
      new Request('https://worker.test/api/copilot', {
        method: 'POST',
        headers: { Origin: PAGES_ORIGIN, 'Content-Type': 'text/plain' },
        body: 'hello',
      }),
      deps({ complete, reserve }),
    );
    expect(text.status).toBe(400);
    expect(reserve).not.toHaveBeenCalled();
    expect(complete).not.toHaveBeenCalled();
  });

  it('uses mocked Siteverify and does not reserve when the token is rejected', async () => {
    const complete = vi.fn<Completion>(async () => '{"type":"explain_allocation"}');
    const reserve = vi.fn();
    const fetchImpl = vi.fn(async (url: RequestInfo | URL) => {
      expect(String(url)).toBe('https://challenges.cloudflare.com/turnstile/v0/siteverify');
      return new Response(JSON.stringify({ success: false, 'error-codes': ['invalid-input-response'] }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      });
    });

    const response = await handleWorkerFetch(question(worked), deps({
      complete,
      reserve,
      verifyTurnstile: (token) =>
        verifyTurnstileToken({
          token,
          secret: 'test-secret',
          expectedHostname: 'artitudinale1.github.io',
          fetchImpl: fetchImpl as typeof fetch,
        }),
    }));

    expect(response.status).toBe(403);
    await expect(response.json()).resolves.toEqual({
      error: 'The verification check failed. Please try again.',
    });
    expect(fetchImpl).toHaveBeenCalledOnce();
    expect(reserve).not.toHaveBeenCalled();
    expect(complete).not.toHaveBeenCalled();
  });
});

function quotaReserve(initial: QuotaSnapshot) {
  let snapshot = initial;
  return async () => {
    const decision = reserveQuestion(snapshot, snapshot.visitorWindowStart || now);
    if (decision.ok) {
      snapshot = {
        calls: decision.calls,
        visitorWindowStart: decision.visitorWindowStart,
        visitorCount: decision.visitorCount,
      };
    }
    return decision;
  };
}

function question(body: unknown, origin: string | null = PAGES_ORIGIN): Request {
  const headers = new Headers({ 'Content-Type': 'application/json' });
  if (origin) {
    headers.set('Origin', origin);
  }
  return new Request('https://worker.test/api/copilot', {
    method: 'POST',
    headers,
    body: JSON.stringify(body),
  });
}

function deps(
  options: Partial<WorkerDependencies> & Pick<WorkerDependencies, 'complete' | 'reserve'>,
): WorkerDependencies {
  return {
    verifyTurnstile: async () => ({ ok: true }),
    visitorHash: 'visitor-a',
    now: () => now,
    ...options,
  };
}
