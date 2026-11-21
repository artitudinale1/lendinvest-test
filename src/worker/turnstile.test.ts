import { describe, expect, it, vi } from 'vitest';
import wranglerConfig from '../../wrangler.toml?raw';
import {
  expectedTurnstileHostname,
  PRODUCTION_TURNSTILE_HOSTNAME,
  TEST_TURNSTILE_HOSTNAME,
  verifyTurnstileToken,
} from './turnstile';

const TEST_SECRET = '1x0000000000000000000000000000000AA';
const TEST_TOKEN = 'XXXX.DUMMY.TOKEN.XXXX';

describe('Turnstile verification', () => {
  it('accepts the official test token only for the example.com hostname', async () => {
    const fetchImpl = vi.fn(async () => json({ success: true, hostname: TEST_TURNSTILE_HOSTNAME }));
    const accepted = await verifyTurnstileToken({
      token: TEST_TOKEN,
      secret: TEST_SECRET,
      expectedHostname: expectedTurnstileHostname('development'),
      fetchImpl,
    });
    expect(accepted).toEqual({ ok: true });
    expect(expectedTurnstileHostname('development')).toBe(TEST_TURNSTILE_HOSTNAME);

    const production = await verifyTurnstileToken({
      token: TEST_TOKEN,
      secret: TEST_SECRET,
      expectedHostname: expectedTurnstileHostname(undefined),
      fetchImpl: vi.fn(async () => json({ success: true, hostname: TEST_TURNSTILE_HOSTNAME })),
    });
    expect(expectedTurnstileHostname(undefined)).toBe(PRODUCTION_TURNSTILE_HOSTNAME);
    expect(expectedTurnstileHostname('production')).toBe(PRODUCTION_TURNSTILE_HOSTNAME);
    expect(expectedTurnstileHostname('')).toBe(PRODUCTION_TURNSTILE_HOSTNAME);
    expect(production).toEqual({ ok: false, reason: 'hostname' });
  });

  it('keeps development Turnstile validation off the deployed Worker', () => {
    const config = wranglerConfig;
    const assignments = config
      .split('\n')
      .filter((line) => !line.trim().startsWith('#'))
      .some((line) => line.includes('TURNSTILE_ENV') || line.includes('1x0000000000000000000000000000000AA'));
    expect(assignments).toBe(false);

    expect(expectedTurnstileHostname('development')).toBe(TEST_TURNSTILE_HOSTNAME);
    expect(expectedTurnstileHostname('Development')).toBe(PRODUCTION_TURNSTILE_HOSTNAME);
    expect(expectedTurnstileHostname('')).toBe(PRODUCTION_TURNSTILE_HOSTNAME);
    expect(expectedTurnstileHostname(undefined)).toBe(PRODUCTION_TURNSTILE_HOSTNAME);
    expect(expectedTurnstileHostname('production')).toBe(PRODUCTION_TURNSTILE_HOSTNAME);
  });

  it('rejects an invalid token and an expired or duplicate token', async () => {
    const invalid = await verifyTurnstileToken({
      token: 'invalid-token',
      secret: 'production-secret',
      expectedHostname: PRODUCTION_TURNSTILE_HOSTNAME,
      fetchImpl: vi.fn(async () => json({ success: false, 'error-codes': ['invalid-input-response'] })),
    });
    expect(invalid).toEqual({ ok: false, reason: 'invalid' });

    const expired = await verifyTurnstileToken({
      token: 'used-token',
      secret: 'production-secret',
      expectedHostname: PRODUCTION_TURNSTILE_HOSTNAME,
      fetchImpl: vi.fn(async () => json({ success: false, 'error-codes': ['timeout-or-duplicate'] })),
    });
    expect(expired).toEqual({ ok: false, reason: 'expired' });
  });

  it('fails closed when Siteverify is unavailable and does not send an empty secret', async () => {
    const fetchImpl = vi.fn();
    const missingSecret = await verifyTurnstileToken({
      token: TEST_TOKEN,
      secret: '',
      expectedHostname: PRODUCTION_TURNSTILE_HOSTNAME,
      fetchImpl,
    });
    expect(missingSecret).toEqual({ ok: false, reason: 'unavailable' });
    expect(fetchImpl).not.toHaveBeenCalled();

    const offline = await verifyTurnstileToken({
      token: TEST_TOKEN,
      secret: 'production-secret',
      expectedHostname: PRODUCTION_TURNSTILE_HOSTNAME,
      fetchImpl: vi.fn(async () => {
        throw new Error('network down');
      }),
    });
    expect(offline).toEqual({ ok: false, reason: 'unavailable' });

    const rejected = await verifyTurnstileToken({
      token: TEST_TOKEN,
      secret: 'production-secret',
      expectedHostname: PRODUCTION_TURNSTILE_HOSTNAME,
      fetchImpl: vi.fn(async () => new Response('nope', { status: 500 })),
    });
    expect(rejected).toEqual({ ok: false, reason: 'unavailable' });
  });

  it('does not return the secret or token from a successful check', async () => {
    const fetchImpl = vi.fn(async (_url: string, init: RequestInit) => {
      expect(String(init.body)).toContain(`secret=${TEST_SECRET}`);
      expect(String(init.body)).toContain(`response=${TEST_TOKEN}`);
      return json({ success: true, hostname: 'artitudinale1.github.io' });
    });
    const verdict = await verifyTurnstileToken({
      token: TEST_TOKEN,
      secret: TEST_SECRET,
      expectedHostname: PRODUCTION_TURNSTILE_HOSTNAME,
      fetchImpl: fetchImpl as typeof fetch,
    });
    expect(verdict).toEqual({ ok: true });
    expect(JSON.stringify(verdict)).not.toContain(TEST_SECRET);
    expect(JSON.stringify(verdict)).not.toContain(TEST_TOKEN);
  });
});

function json(body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
  });
}
