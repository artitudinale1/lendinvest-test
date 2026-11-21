import { describe, expect, it, vi } from 'vitest';
import type { Completion } from '../server/provider';
import { BODY_LIMIT, handleWorkerFetch, PAGES_ORIGIN, type WorkerDependencies } from './copilotWorker';
import { DAILY_LIMIT_MESSAGE } from './quota';
import { expectedTurnstileHostname, verifyTurnstileToken } from './turnstile';

const worked = {
  question: 'Explain my current investment allocation.',
  budget: '10000',
  allocations: { '1': '4000', '5': '4000', '12': '2000' },
  model: 'particle-ai/particle-1:free',
  turnstileToken: 'XXXX.DUMMY.TOKEN.XXXX',
};

describe('copilot worker', () => {
  it('answers an allowed Pages request with one quota reservation and one model', async () => {
    const complete = vi.fn<Completion>(async ({ system, model }) => {
      expect(model).toBe('particle-ai/particle-1:free');
      return system.includes('classify')
        ? '{"type":"explain_allocation"}'
        : 'The illustrative annual gross return is £724.00.';
    });
    const reserve = vi.fn(async () => ({
      ok: true as const,
      calls: 2,
      visitorWindowStart: 1,
      visitorCount: 1,
    }));

    const response = await handleWorkerFetch(question(worked), deps({ complete, reserve, visitorHash: 'visitor-a' }));
    const payload = await response.json();

    expect(response.status).toBe(200);
    expect(response.headers.get('Access-Control-Allow-Origin')).toBe(PAGES_ORIGIN);
    expect(payload).toMatchObject({
      intent: { type: 'explain_allocation' },
      explanationStatus: 'model',
    });
    expect(JSON.stringify(payload)).not.toContain('sk-');
    expect(reserve).toHaveBeenCalledOnce();
    expect(complete).toHaveBeenCalledTimes(2);
  });

  it('rejects another origin before using quota or the provider', async () => {
    const complete = vi.fn<Completion>(async () => '{"type":"explain_allocation"}');
    const reserve = vi.fn();
    const response = await handleWorkerFetch(question(worked, 'https://example.test'), deps({
      complete,
      reserve,
    }));

    expect(response.status).toBe(403);
    expect(response.headers.get('Access-Control-Allow-Origin')).toBeNull();
    expect(reserve).not.toHaveBeenCalled();
    expect(complete).not.toHaveBeenCalled();
  });

  it('answers a Pages preflight and rejects any other preflight', async () => {
    const allowed = await handleWorkerFetch(new Request('https://worker.test/api/copilot', {
      method: 'OPTIONS',
      headers: { Origin: PAGES_ORIGIN },
    }), idle());
    expect(allowed.status).toBe(204);
    expect(allowed.headers.get('Access-Control-Allow-Origin')).toBe(PAGES_ORIGIN);
    expect(allowed.headers.get('Access-Control-Allow-Methods')).toContain('POST');
    expect(allowed.headers.get('Access-Control-Allow-Headers')).toBe('Content-Type');

    const blocked = await handleWorkerFetch(new Request('https://worker.test/api/copilot', {
      method: 'OPTIONS',
      headers: { Origin: 'https://example.test' },
    }), idle());
    expect(blocked.status).toBe(403);
  });

  it('rejects an unknown model, a removed model, and an invalid question before reserving quota', async () => {
    const complete = vi.fn<Completion>(async () => '{"type":"explain_allocation"}');
    const reserve = vi.fn();
    const cases = [
      { ...worked, model: 'openai/gpt-4o' },
      { ...worked, model: 'inclusionai/ling-3.2-flash:free' },
      { ...worked, question: '' },
    ];
    for (const body of cases) {
      const response = await handleWorkerFetch(question(body), deps({ complete, reserve, visitorHash: 'visitor-a' }));
      expect(response.status).toBe(400);
    }
    expect(reserve).not.toHaveBeenCalled();
    expect(complete).not.toHaveBeenCalled();
  });

  it('rejects an oversized body and a provider failure without exposing a credential', async () => {
    const reserve = vi.fn(async () => ({
      ok: true as const,
      calls: 2,
      visitorWindowStart: 1,
      visitorCount: 1,
    }));
    const oversized = await handleWorkerFetch(
      new Request('https://worker.test/api/copilot', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Origin: PAGES_ORIGIN },
        body: 'x'.repeat(BODY_LIMIT + 1),
      }),
      deps({ complete: vi.fn<Completion>(async () => 'unused'), reserve, visitorHash: 'visitor-a' }),
    );
    expect(oversized.status).toBe(413);
    expect(reserve).not.toHaveBeenCalled();

    const complete = vi.fn<Completion>(async () => {
      throw new Error('provider rejected sk-test-secret');
    });
    const failed = await handleWorkerFetch(question(worked), deps({ complete, reserve, visitorHash: 'visitor-a' }));
    expect(failed.status).toBe(503);
    expect(JSON.stringify(await failed.json())).not.toContain('sk-test-secret');
    expect(reserve).toHaveBeenCalledOnce();
  });

  it('stops when the daily quota is exhausted or quota enforcement fails', async () => {
    const complete = vi.fn<Completion>(async () => '{"type":"explain_allocation"}');
    const exhausted = await handleWorkerFetch(question(worked), deps({
      complete,
      reserve: async () => ({ ok: false, status: 429, error: DAILY_LIMIT_MESSAGE }),
      visitorHash: 'visitor-a',
    }));
    expect(exhausted.status).toBe(429);
    await expect(exhausted.json()).resolves.toEqual({ error: DAILY_LIMIT_MESSAGE });
    expect(complete).not.toHaveBeenCalled();

    const unavailable = await handleWorkerFetch(question(worked), deps({
      complete,
      reserve: async () => {
        throw new Error('durable object unavailable');
      },
      visitorHash: 'visitor-a',
    }));
    expect(unavailable.status).toBe(503);
    await expect(unavailable.json()).resolves.toEqual({ error: 'Investment Copilot is unavailable.' });
    expect(complete).not.toHaveBeenCalled();
  });

  it('fails closed when the provider secret is not configured', async () => {
    const reserve = vi.fn();
    const response = await handleWorkerFetch(question(worked), deps({ complete: null, reserve }));
    expect(response.status).toBe(503);
    expect(reserve).not.toHaveBeenCalled();
  });

  it('rejects a missing, invalid, expired, or wrong-host token before quota or the provider', async () => {
    const complete = vi.fn<Completion>(async () => '{"type":"explain_allocation"}');
    const reserve = vi.fn();
    const verifyTurnstile = vi.fn(async () => ({ ok: true as const }));
    const withoutToken = {
      question: worked.question,
      budget: worked.budget,
      allocations: worked.allocations,
      model: worked.model,
    };
    const missing = await handleWorkerFetch(question(withoutToken), deps({
      complete,
      reserve,
      verifyTurnstile,
    }));
    expect(missing.status).toBe(403);
    await expect(missing.json()).resolves.toEqual({
      error: 'Complete the verification check before asking.',
    });
    expect(verifyTurnstile).not.toHaveBeenCalled();

    const cases: Array<{ reason: 'invalid' | 'expired' | 'hostname' | 'unavailable'; status: number; error: string }> = [
      { reason: 'invalid', status: 403, error: 'The verification check failed. Please try again.' },
      { reason: 'expired', status: 403, error: 'The verification check expired. Please try again.' },
      { reason: 'hostname', status: 403, error: 'The verification check failed. Please try again.' },
      { reason: 'unavailable', status: 503, error: 'Investment Copilot is unavailable.' },
    ];
    for (const item of cases) {
      const response = await handleWorkerFetch(question(worked), deps({
        complete,
        reserve,
        verifyTurnstile: async () => ({ ok: false, reason: item.reason }),
      }));
      expect(response.status).toBe(item.status);
      const payload = await response.json();
      expect(payload).toEqual({ error: item.error });
      expect(JSON.stringify(payload)).not.toContain(worked.turnstileToken);
    }
    expect(reserve).not.toHaveBeenCalled();
    expect(complete).not.toHaveBeenCalled();
  });

  it('accepts the official local test token before reserving quota', async () => {
    const complete = vi.fn<Completion>(async () => '{"type":"explain_allocation"}');
    const reserve = vi.fn(async () => ({ ok: true as const, calls: 2, visitorWindowStart: 1, visitorCount: 1 }));
    const response = await handleWorkerFetch(question(worked), deps({
      complete,
      reserve,
      verifyTurnstile: (token) => verifyTurnstileToken({
        token,
        secret: '1x0000000000000000000000000000000AA',
        expectedHostname: expectedTurnstileHostname('development'),
        fetchImpl: async () => new Response(JSON.stringify({
          success: true,
          hostname: 'example.com',
        }), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        }),
      }),
    }));
    expect(response.status).toBe(200);
    expect(reserve).toHaveBeenCalledOnce();
    expect(complete).toHaveBeenCalled();
    const sent = complete.mock.calls.map((call) => `${call[0].system}\n${call[0].user}`).join('\n');
    expect(sent).not.toContain(worked.turnstileToken);
    expect(sent).not.toContain('1x0000000000000000000000000000000AA');
  });
});

function question(body: unknown, origin = PAGES_ORIGIN): Request {
  return new Request('https://worker.test/api/copilot', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Origin: origin },
    body: JSON.stringify(body),
  });
}

function deps(options: Partial<WorkerDependencies> & Pick<WorkerDependencies, 'complete' | 'reserve'>): WorkerDependencies {
  return {
    verifyTurnstile: async () => ({ ok: true }),
    visitorHash: 'visitor-a',
    ...options,
  };
}

function idle() {
  return deps({
    complete: null,
    reserve: vi.fn(),
  });
}
