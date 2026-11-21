import { parseCopilotRequest, handleCopilotRequest, type ExplanationDiagnostic } from '../server/copilot';
import type { Completion } from '../server/provider';
import type { Reservation } from './quota';
import { readTurnstileToken, turnstileFailure, type TurnstileVerdict } from './turnstile';

export const PAGES_ORIGIN = 'https://artitudinale1.github.io';
export const BODY_LIMIT = 8_192;

const UNAVAILABLE = 'Investment Copilot is unavailable.';

export type TurnstileCheck = (token: string, request: Request) => Promise<TurnstileVerdict>;

export type WorkerDependencies = {
  complete: Completion | null;
  reserve: (visitorHash: string, now: number) => Promise<Reservation>;
  verifyTurnstile: TurnstileCheck;
  now?: () => number;
  visitorHash?: string;
};

export async function handleWorkerFetch(request: Request, options: WorkerDependencies): Promise<Response> {
  const origin = request.headers.get('Origin');
  if (origin && origin !== PAGES_ORIGIN) {
    return json(403, { error: UNAVAILABLE }, null);
  }
  if (request.method === 'OPTIONS') {
    if (origin !== PAGES_ORIGIN) {
      return json(403, { error: UNAVAILABLE }, null);
    }
    return new Response(null, { status: 204, headers: preflightHeaders() });
  }
  if (request.method !== 'POST') {
    return json(405, { error: 'That request is not supported.' }, origin);
  }
  if (!options.complete) {
    return json(503, { error: UNAVAILABLE }, origin);
  }

  const contentType = request.headers.get('Content-Type') ?? '';
  if (!contentType.toLowerCase().startsWith('application/json')) {
    return json(400, { error: 'Enter a question about this scenario.' }, origin);
  }
  const bytes = new Uint8Array(await request.arrayBuffer());
  if (bytes.byteLength > BODY_LIMIT) {
    return json(413, { error: 'That request is too large.' }, origin);
  }
  let body: unknown;
  try {
    body = JSON.parse(new TextDecoder().decode(bytes));
  } catch {
    return json(400, { error: 'Enter a question about this scenario.' }, origin);
  }
  const parsed = parseCopilotRequest(body);
  if (!parsed.ok) {
    return json(400, { error: parsed.error }, origin);
  }

  const token = readTurnstileToken(body);
  if (!token) {
    const failure = turnstileFailure('missing');
    return json(failure.status, { error: failure.error }, origin);
  }
  let verdict: TurnstileVerdict;
  try {
    verdict = await options.verifyTurnstile(token, request);
  } catch {
    verdict = { ok: false, reason: 'unavailable' };
  }
  if (!verdict.ok) {
    const failure = turnstileFailure(verdict.reason);
    return json(failure.status, { error: failure.error }, origin);
  }

  const now = options.now?.() ?? Date.now();
  const visitor = options.visitorHash ?? (await hashVisitor(request));
  let reservation: Reservation;
  try {
    reservation = await options.reserve(visitor, now);
  } catch {
    return json(503, { error: UNAVAILABLE }, origin);
  }
  if (!reservation.ok) {
    return json(reservation.status, { error: reservation.error }, origin);
  }

  const result = await handleCopilotRequest(body, {
    complete: options.complete,
    onExplanationFallback: reportExplanationFallback,
  });
  return json(result.status, result.body, origin);
}

async function hashVisitor(request: Request): Promise<string> {
  const address = request.headers.get('CF-Connecting-IP') ?? '0';
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(`copilot:${address}`));
  return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, '0')).join('');
}

function reportExplanationFallback(diagnostic: ExplanationDiagnostic): void {
  const figures = diagnostic.reason === 'unverified' ? ` figures=${diagnostic.figures.join(',')}` : '';
  console.error(`copilot explanation fallback reason=${diagnostic.reason}${figures}`);
}

function preflightHeaders(): Headers {
  return new Headers({
    'Access-Control-Allow-Origin': PAGES_ORIGIN,
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Access-Control-Max-Age': '86400',
    Vary: 'Origin',
  });
}

function json(status: number, body: unknown, origin: string | null): Response {
  const headers = new Headers({
    'Content-Type': 'application/json; charset=utf-8',
    'Cache-Control': 'no-store',
  });
  if (origin === PAGES_ORIGIN) {
    headers.set('Access-Control-Allow-Origin', PAGES_ORIGIN);
    headers.set('Vary', 'Origin');
  }
  return new Response(JSON.stringify(body), { status, headers });
}
