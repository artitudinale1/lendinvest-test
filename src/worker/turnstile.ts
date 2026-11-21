export const PRODUCTION_TURNSTILE_HOSTNAME = 'artitudinale1.github.io';
export const TEST_TURNSTILE_HOSTNAME = 'example.com';
const SITEVERIFY_URL = 'https://challenges.cloudflare.com/turnstile/v0/siteverify';

export type TurnstileVerdict =
  | { ok: true }
  | { ok: false; reason: 'missing' | 'invalid' | 'expired' | 'hostname' | 'unavailable' };

export function expectedTurnstileHostname(mode: string | undefined): string {
  return mode === 'development' ? TEST_TURNSTILE_HOSTNAME : PRODUCTION_TURNSTILE_HOSTNAME;
}

export function readTurnstileToken(body: unknown): string | null {
  if (!body || typeof body !== 'object') {
    return null;
  }
  const token = (body as { turnstileToken?: unknown }).turnstileToken;
  if (typeof token !== 'string') {
    return null;
  }
  const trimmed = token.trim();
  if (trimmed === '' || trimmed.length > 2048) {
    return null;
  }
  return trimmed;
}

export function turnstileFailure(reason: Exclude<TurnstileVerdict, { ok: true }>['reason']): {
  status: number;
  error: string;
} {
  if (reason === 'unavailable') {
    return { status: 503, error: 'Investment Copilot is unavailable.' };
  }
  if (reason === 'missing') {
    return { status: 403, error: 'Complete the verification check before asking.' };
  }
  if (reason === 'expired') {
    return { status: 403, error: 'The verification check expired. Please try again.' };
  }
  return { status: 403, error: 'The verification check failed. Please try again.' };
}

export async function verifyTurnstileToken(input: {
  token: string;
  secret: string;
  expectedHostname: string;
  remoteIp?: string;
  fetchImpl?: typeof fetch;
}): Promise<TurnstileVerdict> {
  if (input.secret.trim() === '') {
    return { ok: false, reason: 'unavailable' };
  }
  const body = new URLSearchParams({ secret: input.secret, response: input.token });
  if (input.remoteIp) {
    body.set('remoteip', input.remoteIp);
  }
  const fetchImpl = input.fetchImpl ?? fetch;
  let response: Response;
  try {
    response = await fetchImpl(SITEVERIFY_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body,
    });
  } catch {
    return { ok: false, reason: 'unavailable' };
  }
  if (!response.ok) {
    return { ok: false, reason: 'unavailable' };
  }
  let payload: unknown;
  try {
    payload = await response.json();
  } catch {
    return { ok: false, reason: 'unavailable' };
  }
  if (!payload || typeof payload !== 'object') {
    return { ok: false, reason: 'unavailable' };
  }
  const record = payload as { success?: unknown; hostname?: unknown; 'error-codes'?: unknown };
  if (record.success !== true) {
    const codes = Array.isArray(record['error-codes']) ? record['error-codes'] : [];
    return { ok: false, reason: codes.includes('timeout-or-duplicate') ? 'expired' : 'invalid' };
  }
  if (record.hostname !== input.expectedHostname) {
    return { ok: false, reason: 'hostname' };
  }
  return { ok: true };
}
