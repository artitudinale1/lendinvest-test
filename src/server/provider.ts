export type CompletionRequest = {
  system: string;
  user: string;
  timeoutMs: number;
};

export type Completion = (request: CompletionRequest) => Promise<string>;

export type ProviderEnv = Record<string, string | undefined>;

const UNAVAILABLE = 'The language model is unavailable.';

export function createCompletion(env: ProviderEnv): Completion | null {
  const provider = (env.COPILOT_PROVIDER ?? 'disabled').trim().toLowerCase();
  if (provider !== 'openai') {
    return null;
  }
  const apiKey = env.COPILOT_API_KEY?.trim();
  const model = env.COPILOT_MODEL?.trim();
  if (!apiKey || !model) {
    return null;
  }
  const base = (env.COPILOT_BASE_URL?.trim() || 'https://api.openai.com/v1').replace(/\/$/, '');

  return async ({ system, user, timeoutMs }) => {
    let response: Response;
    try {
      response = await fetch(`${base}/chat/completions`, {
        method: 'POST',
        signal: AbortSignal.timeout(timeoutMs),
        headers: {
          Authorization: `Bearer ${apiKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          model,
          temperature: 0,
          messages: [
            { role: 'system', content: system },
            { role: 'user', content: user },
          ],
        }),
      });
    } catch {
      throw new Error(UNAVAILABLE);
    }
    if (!response.ok) {
      throw new Error(UNAVAILABLE);
    }
    let payload: unknown;
    try {
      payload = await response.json();
    } catch {
      throw new Error(UNAVAILABLE);
    }
    const text = assistantText(payload);
    if (!text) {
      throw new Error(UNAVAILABLE);
    }
    return text;
  };
}

function assistantText(payload: unknown): string | null {
  if (!payload || typeof payload !== 'object') {
    return null;
  }
  const choices = (payload as { choices?: unknown }).choices;
  if (!Array.isArray(choices) || !choices[0] || typeof choices[0] !== 'object') {
    return null;
  }
  const message = (choices[0] as { message?: unknown }).message;
  if (!message || typeof message !== 'object') {
    return null;
  }
  const content = (message as { content?: unknown }).content;
  return typeof content === 'string' && content.trim() !== '' ? content : null;
}
