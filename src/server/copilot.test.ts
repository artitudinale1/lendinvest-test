import { describe, expect, it, vi } from 'vitest';
import { EXPLANATION_FALLBACK, MODEL_UNAVAILABLE } from '../copilot';
import { COPILOT_MODELS, DEFAULT_COPILOT_MODEL } from '../copilotModels';
import { handleCopilotRequest } from './copilot';
import { createCompletion, type Completion } from './provider';
import { copilotMiddleware } from './viteAdapter';

const worked = {
  question: 'Explain my current investment allocation.',
  budget: '10000',
  allocations: { '1': '4000', '5': '4000', '12': '2000' },
};

describe('copilot handler', () => {
  it('uses the model only for intent and explanation, and keeps calculated facts', async () => {
    const complete = vi.fn<Completion>(async ({ system, user }) => {
      if (system.includes('classify')) {
        return JSON.stringify({ type: 'explain_allocation', totalReturnPence: 1 });
      }
      expect(user).toContain('£724.00');
      expect(user).not.toContain('£1,234.00');
      return 'The illustrative annual gross return is £724.00.';
    });

    const result = await handleCopilotRequest(worked, { complete });

    expect(result.status).toBe(200);
    expect(result.body).toMatchObject({
      intent: { type: 'explain_allocation' },
      explanation: 'The illustrative annual gross return is £724.00.',
      explanationStatus: 'model',
    });
  });

  it('hides an explanation that adds a figure and still returns the intent', async () => {
    const complete = vi.fn<Completion>(async ({ system }) =>
      system.includes('classify')
        ? '{"type":"explain_allocation"}'
        : 'The return is £724.00 plus £1,234.00.',
    );

    const result = await handleCopilotRequest(worked, { complete });

    expect(result.status).toBe(200);
    expect(result.body).toMatchObject({
      explanation: null,
      explanationStatus: 'fallback',
      notice: EXPLANATION_FALLBACK,
    });
  });

  it('calculates a distribution from the intent rather than from model numbers', async () => {
    const complete = vi.fn<Completion>(async ({ system, user }) => {
      if (system.includes('classify')) {
        return '{"type":"distribute","budgetPounds":10000,"method":"equal_whole_pounds","total":999}';
      }
      expect(user).toContain('£683.34');
      return 'One illustrative split of the £10,000.00 budget returns £683.34.';
    });

    const result = await handleCopilotRequest(
      {
        question: 'How could I distribute my £10,000 budget across the available loans?',
        budget: '',
        allocations: {},
      },
      { complete },
    );

    expect(result.body).toMatchObject({
      intent: { type: 'distribute', budgetPounds: 10000, method: 'equal_whole_pounds' },
      explanationStatus: 'model',
    });
  });

  it('sends every allowlisted model to both calls and rejects any other id', async () => {
    const complete = vi.fn<Completion>(async ({ system }) =>
      system.includes('classify')
        ? '{"type":"explain_allocation"}'
        : 'The illustrative annual gross return is £724.00.',
    );

    for (const item of COPILOT_MODELS) {
      complete.mockClear();
      const result = await handleCopilotRequest({ ...worked, model: item.id }, { complete });
      expect(result.status).toBe(200);
      expect(complete).toHaveBeenNthCalledWith(
        1,
        expect.objectContaining({ model: item.id }),
      );
      expect(complete).toHaveBeenNthCalledWith(
        2,
        expect.objectContaining({ model: item.id }),
      );
    }

    complete.mockClear();
    const missing = await handleCopilotRequest(worked, { complete });
    expect(missing.status).toBe(200);
    expect(complete).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({ model: DEFAULT_COPILOT_MODEL }),
    );
    expect(complete).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({ model: DEFAULT_COPILOT_MODEL }),
    );

    const rejected = await handleCopilotRequest(
      { ...worked, model: 'openai/gpt-4o' },
      { complete },
    );
    expect(rejected).toEqual({ status: 400, body: { error: 'Choose a supported model.' } });
    expect(complete).toHaveBeenCalledTimes(2);
  });

  it('returns calculated example facts when the provider is unavailable', async () => {
    const result = await handleCopilotRequest(worked, { complete: null });

    expect(result.status).toBe(200);
    expect(result.body).toMatchObject({
      intent: { type: 'explain_allocation' },
      explanation: null,
      explanationStatus: 'unavailable',
      notice: MODEL_UNAVAILABLE,
    });
    expect(MODEL_UNAVAILABLE).toContain('figures above');
  });

  it('reports an unavailable provider without revealing a credential', async () => {
    const complete = vi.fn<Completion>(async () => {
      throw new Error('provider rejected sk-test-secret');
    });

    const result = await handleCopilotRequest(worked, { complete });

    expect(result.status).toBe(503);
    expect(JSON.stringify(result.body)).not.toContain('sk-test-secret');
  });

  it('rejects an unreadable model response and an oversized question', async () => {
    const complete = vi.fn<Completion>(async () => 'not json');
    const unreadable = await handleCopilotRequest(worked, { complete });
    expect(unreadable.status).toBe(422);

    const longQuestion = await handleCopilotRequest(
      { ...worked, question: 'a'.repeat(501) },
      { complete },
    );
    expect(longQuestion.status).toBe(400);
  });
});

describe('provider configuration', () => {
  it('stays disabled unless an OpenAI-compatible key and model are set', () => {
    expect(createCompletion({ COPILOT_PROVIDER: 'disabled', COPILOT_API_KEY: 'sk-test' })).toBeNull();
    expect(createCompletion({ COPILOT_PROVIDER: 'openai', COPILOT_MODEL: 'gpt-test' })).toBeNull();
    expect(createCompletion({ VITE_COPILOT_API_KEY: 'sk-test', COPILOT_MODEL: 'gpt-test' })).toBeNull();
    expect(
      createCompletion({
        COPILOT_PROVIDER: 'openai',
        COPILOT_API_KEY: 'sk-test',
        COPILOT_MODEL: 'gpt-test',
      }),
    ).not.toBeNull();
  });

  it('does not surface the API key when the provider request fails', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: false,
        json: async () => ({ error: 'bad sk-test-secret' }),
      }),
    );
    const complete = createCompletion({
      COPILOT_PROVIDER: 'openai',
      COPILOT_API_KEY: 'sk-test-secret',
      COPILOT_MODEL: 'gpt-test',
    });

    await expect(
      complete?.({ system: 'classify', user: 'hello', timeoutMs: 1000, model: DEFAULT_COPILOT_MODEL }),
    ).rejects.toThrow('unavailable');
    await expect(
      complete?.({ system: 'classify', user: 'hello', timeoutMs: 1000, model: DEFAULT_COPILOT_MODEL }),
    ).rejects.not.toThrow(/sk-test-secret/);
    vi.unstubAllGlobals();
  });

  it('sends the selected model instead of the configured model name', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ choices: [{ message: { content: 'ok' } }] }),
    });
    vi.stubGlobal('fetch', fetchMock);
    const complete = createCompletion({
      COPILOT_PROVIDER: 'openai',
      COPILOT_API_KEY: 'sk-test',
      COPILOT_MODEL: 'gpt-test',
      COPILOT_BASE_URL: 'https://openrouter.ai/api/v1',
    });

    await complete?.({
      system: 'classify',
      user: 'hello',
      timeoutMs: 1000,
      model: 'particle-ai/particle-1:free',
    });

    expect(fetchMock).toHaveBeenCalledWith(
      'https://openrouter.ai/api/v1/chat/completions',
      expect.objectContaining({
        body: expect.stringContaining('"model":"particle-ai/particle-1:free"'),
      }),
    );
    expect(String(fetchMock.mock.calls[0][1].body)).not.toContain('gpt-test');
    vi.unstubAllGlobals();
  });
});

describe('copilot HTTP adapter', () => {
  it('limits the body and leaves non-POST requests untouched', async () => {
    const next = vi.fn();
    const response = mockResponse();
    await copilotMiddleware(mockRequest('GET', '{}'), response, next);
    expect(next).toHaveBeenCalledOnce();

    const tooLarge = mockResponse();
    await copilotMiddleware(mockRequest('POST', 'x'.repeat(9000)), tooLarge, vi.fn());
    expect(tooLarge.statusCode).toBe(413);
  });
});

function mockRequest(method: string, body: string) {
  return {
    method,
    async *[Symbol.asyncIterator]() {
      yield new TextEncoder().encode(body);
    },
  };
}

function mockResponse() {
  return {
    statusCode: 200,
    setHeader: vi.fn(),
    end: vi.fn(),
  };
}
