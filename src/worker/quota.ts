export const DAILY_QUESTION_LIMIT = 15;
export const CALLS_PER_QUESTION = 2;
export const DAILY_CALL_LIMIT = DAILY_QUESTION_LIMIT * CALLS_PER_QUESTION;
export const VISITOR_QUESTION_LIMIT = 3;
export const VISITOR_WINDOW_MS = 10 * 60 * 1000;

export const DAILY_LIMIT_MESSAGE =
  'The daily Copilot limit has been reached. Please try again tomorrow.';
export const VISITOR_LIMIT_MESSAGE = 'Too many Copilot questions. Please wait and try again.';

export type QuotaSnapshot = {
  calls: number;
  visitorWindowStart: number;
  visitorCount: number;
};

export type Reservation =
  | { ok: true; calls: number; visitorWindowStart: number; visitorCount: number }
  | { ok: false; status: 429; error: string };

export function reserveQuestion(snapshot: QuotaSnapshot, now: number): Reservation {
  const expired = now - snapshot.visitorWindowStart >= VISITOR_WINDOW_MS;
  const visitorWindowStart = expired ? now : snapshot.visitorWindowStart;
  const visitorCount = expired ? 0 : snapshot.visitorCount;
  if (snapshot.calls + CALLS_PER_QUESTION > DAILY_CALL_LIMIT) {
    return { ok: false, status: 429, error: DAILY_LIMIT_MESSAGE };
  }
  if (visitorCount >= VISITOR_QUESTION_LIMIT) {
    return { ok: false, status: 429, error: VISITOR_LIMIT_MESSAGE };
  }
  return {
    ok: true,
    calls: snapshot.calls + CALLS_PER_QUESTION,
    visitorWindowStart,
    visitorCount: visitorCount + 1,
  };
}

export function utcDay(now: number): string {
  return new Date(now).toISOString().slice(0, 10);
}
