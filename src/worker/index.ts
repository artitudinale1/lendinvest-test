import { handleWorkerFetch } from './copilotWorker';
import { createCompletion } from '../server/provider';
import { CopilotQuota, type WorkerEnv } from './quotaObject';
import { expectedTurnstileHostname, verifyTurnstileToken } from './turnstile';

export { CopilotQuota };

export default {
  async fetch(request: Request, env: WorkerEnv): Promise<Response> {
    const quota = env.COPILOT_QUOTA;
    return handleWorkerFetch(request, {
      complete: createCompletion({
        COPILOT_PROVIDER: env.COPILOT_PROVIDER,
        COPILOT_API_KEY: env.COPILOT_API_KEY,
        COPILOT_MODEL: env.COPILOT_MODEL,
        COPILOT_BASE_URL: env.COPILOT_BASE_URL,
      }),
      verifyTurnstile: (token, incoming) =>
        verifyTurnstileToken({
          token,
          secret: env.TURNSTILE_SECRET_KEY ?? '',
          expectedHostname: expectedTurnstileHostname(env.TURNSTILE_ENV),
          remoteIp: incoming.headers.get('CF-Connecting-IP') ?? undefined,
        }),
      reserve: async (visitor, now) => {
        if (!quota) {
          throw new Error('quota unavailable');
        }
        const stub = quota.get(quota.idFromName('global'));
        return stub.reserve(visitor, now);
      },
    });
  },
};
