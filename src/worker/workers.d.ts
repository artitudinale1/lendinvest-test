interface SqlCursor {
  toArray(): Record<string, unknown>[];
}

interface DurableObjectState {
  blockConcurrencyWhile<T>(callback: () => Promise<T>): Promise<T>;
  storage: {
    sql: {
      exec(query: string, ...bindings: (string | number)[]): SqlCursor;
    };
  };
}

declare module 'cloudflare:workers' {
  export abstract class DurableObject<Env = unknown> {
    protected ctx: DurableObjectState;
    protected env: Env;
    constructor(ctx: DurableObjectState, env: Env);
  }
}
