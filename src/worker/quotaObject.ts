import { DurableObject } from 'cloudflare:workers';
import { reserveQuestion, utcDay, type Reservation } from './quota';

export type WorkerEnv = {
  COPILOT_API_KEY?: string;
  COPILOT_PROVIDER?: string;
  COPILOT_MODEL?: string;
  COPILOT_BASE_URL?: string;
  TURNSTILE_SECRET_KEY?: string;
  TURNSTILE_ENV?: string;
  COPILOT_QUOTA?: QuotaNamespace;
};

type QuotaNamespace = {
  idFromName(name: string): unknown;
  get(id: unknown): { reserve(visitor: string, now: number): Promise<Reservation> | Reservation };
};

export class CopilotQuota extends DurableObject<WorkerEnv> {
  constructor(ctx: DurableObjectState, env: WorkerEnv) {
    super(ctx, env);
    void ctx.blockConcurrencyWhile(async () => {
      ctx.storage.sql.exec(
        `CREATE TABLE IF NOT EXISTS daily_calls (
          day TEXT PRIMARY KEY,
          calls INTEGER NOT NULL
        )`,
      );
      ctx.storage.sql.exec(
        `CREATE TABLE IF NOT EXISTS visitor_windows (
          visitor TEXT PRIMARY KEY,
          window_start INTEGER NOT NULL,
          count INTEGER NOT NULL
        )`,
      );
    });
  }

  reserve(visitor: string, now: number): Reservation {
    const day = utcDay(now);
    const daily = this.ctx.storage.sql.exec('SELECT calls FROM daily_calls WHERE day = ?', day).toArray();
    const calls = daily.length === 1 ? Number(daily[0]?.calls ?? 0) : 0;
    const visitors = this.ctx.storage.sql
      .exec('SELECT window_start, count FROM visitor_windows WHERE visitor = ?', visitor)
      .toArray();
    const visitorRow = visitors[0];
    const decision = reserveQuestion(
      {
        calls,
        visitorWindowStart: visitorRow ? Number(visitorRow.window_start ?? now) : now,
        visitorCount: visitorRow ? Number(visitorRow.count ?? 0) : 0,
      },
      now,
    );
    if (!decision.ok) {
      return decision;
    }
    this.ctx.storage.sql.exec(
      `INSERT INTO daily_calls (day, calls) VALUES (?, ?)
       ON CONFLICT(day) DO UPDATE SET calls = excluded.calls`,
      day,
      decision.calls,
    );
    this.ctx.storage.sql.exec(
      `INSERT INTO visitor_windows (visitor, window_start, count) VALUES (?, ?, ?)
       ON CONFLICT(visitor) DO UPDATE SET window_start = excluded.window_start, count = excluded.count`,
      visitor,
      decision.visitorWindowStart,
      decision.visitorCount,
    );
    return decision;
  }
}
