import { describe, expect, it } from 'vitest';
import {
  CALLS_PER_QUESTION,
  DAILY_CALL_LIMIT,
  DAILY_LIMIT_MESSAGE,
  reserveQuestion,
  VISITOR_LIMIT_MESSAGE,
  VISITOR_QUESTION_LIMIT,
  VISITOR_WINDOW_MS,
  type QuotaSnapshot,
} from './quota';

const empty: QuotaSnapshot = { calls: 0, visitorWindowStart: 0, visitorCount: 0 };

describe('copilot quota', () => {
  it('reserves both model calls before a question can run', () => {
    const first = reserveQuestion(empty, 1_000);
    expect(first).toMatchObject({ ok: true, calls: CALLS_PER_QUESTION, visitorCount: 1 });
    expect(DAILY_CALL_LIMIT).toBe(30);
    expect(CALLS_PER_QUESTION).toBe(2);
  });

  it('stops at 15 questions per day without consuming another pair of calls', () => {
    const full: QuotaSnapshot = { calls: DAILY_CALL_LIMIT, visitorWindowStart: 5_000, visitorCount: 1 };
    const blocked = reserveQuestion(full, 5_000);
    expect(blocked).toEqual({ ok: false, status: 429, error: DAILY_LIMIT_MESSAGE });

    const lastSlot: QuotaSnapshot = { calls: DAILY_CALL_LIMIT - CALLS_PER_QUESTION, visitorWindowStart: 5_000, visitorCount: 1 };
    const allowed = reserveQuestion(lastSlot, 5_000);
    expect(allowed).toMatchObject({ ok: true, calls: DAILY_CALL_LIMIT });
  });

  it('limits a visitor to three questions in ten minutes and then opens a new window', () => {
    const active: QuotaSnapshot = {
      calls: 4,
      visitorWindowStart: 10_000,
      visitorCount: VISITOR_QUESTION_LIMIT,
    };
    expect(reserveQuestion(active, 10_000 + VISITOR_WINDOW_MS - 1)).toEqual({
      ok: false,
      status: 429,
      error: VISITOR_LIMIT_MESSAGE,
    });

    const renewed = reserveQuestion(active, 10_000 + VISITOR_WINDOW_MS);
    expect(renewed).toMatchObject({
      ok: true,
      calls: 6,
      visitorWindowStart: 10_000 + VISITOR_WINDOW_MS,
      visitorCount: 1,
    });
  });
});
