import type { Plugin } from 'vite';
import { handleCopilotRequest, type CopilotFailure, type CopilotSuccess } from './copilot';
import { createCompletion, type ProviderEnv } from './provider';

const BODY_LIMIT = 8_192;

type LimitedRequest = AsyncIterable<Uint8Array | string> & { method?: string };

type JsonResponse = {
  statusCode: number;
  setHeader: (name: string, value: string) => void;
  end: (body: string) => void;
};

export function copilotPlugin(): Plugin {
  return {
    name: 'investment-copilot',
    configureServer(server) {
      server.middlewares.use('/api/copilot', (request, response, next) => {
        void copilotMiddleware(request as LimitedRequest, response as JsonResponse, next);
      });
    },
    configurePreviewServer(server) {
      server.middlewares.use('/api/copilot', (request, response, next) => {
        void copilotMiddleware(request as LimitedRequest, response as JsonResponse, next);
      });
    },
  };
}

export async function copilotMiddleware(
  request: LimitedRequest,
  response: JsonResponse,
  next: (error?: unknown) => void,
): Promise<void> {
  if (request.method !== 'POST') {
    next();
    return;
  }
  try {
    const raw = await readLimitedBody(request, BODY_LIMIT);
    const result = await handleCopilotRequest(JSON.parse(raw), {
      complete: createCompletion(readEnv()),
    });
    sendJson(response, result.status, result.body);
  } catch (error) {
    if (error instanceof Error && error.name === 'PayloadTooLarge') {
      sendJson(response, 413, { error: 'That request is too large.' });
      return;
    }
    if (error instanceof SyntaxError) {
      sendJson(response, 400, { error: 'Enter a question about this scenario.' });
      return;
    }
    sendJson(response, 503, { error: 'Investment Copilot is unavailable.' });
  }
}

export async function readLimitedBody(request: LimitedRequest, limit: number): Promise<string> {
  const parts: Uint8Array[] = [];
  let size = 0;
  for await (const chunk of request) {
    const bytes = typeof chunk === 'string' ? new TextEncoder().encode(chunk) : chunk;
    size += bytes.byteLength;
    if (size > limit) {
      const error = new Error('limited');
      error.name = 'PayloadTooLarge';
      throw error;
    }
    parts.push(bytes);
  }
  const body = new Uint8Array(size);
  let offset = 0;
  for (const part of parts) {
    body.set(part, offset);
    offset += part.byteLength;
  }
  return new TextDecoder().decode(body);
}

function readEnv(): ProviderEnv {
  const runtime = globalThis as { process?: { env?: ProviderEnv } };
  return runtime.process?.env ?? {};
}

function sendJson(
  response: JsonResponse,
  status: number,
  body: CopilotSuccess | CopilotFailure,
): void {
  response.statusCode = status;
  response.setHeader('Content-Type', 'application/json; charset=utf-8');
  response.end(JSON.stringify(body));
}
