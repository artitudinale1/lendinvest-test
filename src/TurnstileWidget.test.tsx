import { act, fireEvent, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import App from './App';
import { TURNSTILE_SCRIPT_TIMEOUT_MS } from './components/TurnstileWidget';

const PASS_KEY = '1x00000000000000000000BB';
const FAIL_KEY = '2x00000000000000000000BB';

afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
  delete window.turnstile;
  document.querySelector('script[data-investlab-turnstile]')?.remove();
});

describe('Invisible Turnstile', () => {
  it('submits a pre-generated token once and shows no verification control', async () => {
    const logs = watchConsole();
    const fetchMock = stubCopilotFetch();
    const turnstile = installTurnstile((options) => {
      (options.callback as (token: string) => void)('fresh-token');
    });
    const user = userEvent.setup();
    render(<App />);

    expect(turnstile.render).not.toHaveBeenCalled();
    await user.click(screen.getByRole('button', { name: 'Investment Lab' }));

    expect(turnstile.render).toHaveBeenCalledWith(
      expect.any(HTMLDivElement),
      expect.objectContaining({
        sitekey: PASS_KEY,
        retry: 'never',
        'refresh-expired': 'auto',
        'refresh-timeout': 'never',
        'response-field': false,
      }),
    );
    const options = turnstile.render.mock.calls[0][1] as Record<string, unknown>;
    expect(options).not.toHaveProperty('appearance');
    expect(options).not.toHaveProperty('execution');
    expect(screen.queryByRole('group', { name: 'Security verification' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Retry verification' })).not.toBeInTheDocument();
    expect(screen.queryByText('Verifying')).not.toBeInTheDocument();
    expect(screen.queryByText(/Complete the security/)).not.toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Turnstile Privacy Addendum' })).toHaveAttribute(
      'href',
      'https://www.cloudflare.com/turnstile-privacy-policy/',
    );
    expect(fetchMock).not.toHaveBeenCalled();

    await user.type(screen.getByLabelText('Ask about this scenario'), 'What is my return?');
    await user.click(screen.getByRole('button', { name: 'Ask' }));

    expect(await screen.findByRole('heading', { name: 'Calculated result' })).toBeInTheDocument();
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(fetchMock).toHaveBeenCalledWith(
      'https://copilot.example.test/api/copilot',
      expect.objectContaining({
        method: 'POST',
        body: expect.stringContaining('"turnstileToken":"fresh-token"'),
      }),
    );
    expect(document.body.textContent).not.toContain('fresh-token');
    expect(logs.text()).not.toContain('fresh-token');
    expect(logs.text()).not.toContain(PASS_KEY);
  });

  it('waits for a delayed script and then submits once', async () => {
    const fetchMock = stubCopilotFetch();
    const user = userEvent.setup();
    render(<App />);

    await user.click(screen.getByRole('button', { name: 'Investment Lab' }));
    await user.type(screen.getByLabelText('Ask about this scenario'), 'What is my return?');
    await user.click(screen.getByRole('button', { name: 'Ask' }));

    expect(fetchMock).not.toHaveBeenCalled();
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
    expect(screen.queryByText(/security verification/i)).not.toBeInTheDocument();

    installTurnstile((options) => {
      (options.callback as (token: string) => void)('delayed-token');
    });
    const script = document.querySelector('script[data-investlab-turnstile]');
    if (!(script instanceof HTMLScriptElement)) throw new Error('Missing Turnstile script');
    await act(async () => {
      script.dispatchEvent(new Event('load'));
    });

    expect(await screen.findByRole('heading', { name: 'Calculated result' })).toBeInTheDocument();
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(fetchMock.mock.calls[0][1].body).toContain('"turnstileToken":"delayed-token"');
    expect(document.body.textContent).not.toContain('delayed-token');
  });

  it('replaces an expired token without treating expiry as a failure', async () => {
    const fetchMock = stubCopilotFetch();
    let options: Record<string, unknown> | null = null;
    installTurnstile((next) => {
      options = next;
      (next.callback as (token: string) => void)('expired-token');
    });
    const user = userEvent.setup();
    render(<App />);

    await user.click(screen.getByRole('button', { name: 'Investment Lab' }));
    await act(async () => {
      (options?.['expired-callback'] as () => void)();
      (options?.['expired-callback'] as () => void)();
      (options?.callback as (token: string) => void)('fresh-token');
    });

    expect(fetchMock).not.toHaveBeenCalled();
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
    expect(screen.queryByText(/expired/i)).not.toBeInTheDocument();

    await user.type(screen.getByLabelText('Ask about this scenario'), 'What is my return?');
    await user.click(screen.getByRole('button', { name: 'Ask' }));

    expect(await screen.findByRole('heading', { name: 'Calculated result' })).toBeInTheDocument();
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const body = String(fetchMock.mock.calls[0][1].body);
    expect(body).toContain('"turnstileToken":"fresh-token"');
    expect(body).not.toContain('expired-token');
  });

  it('stops after bounded challenge failures and does not call the worker', async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
    enableLiveCopilot(FAIL_KEY);
    let handled = false;
    installTurnstile((options) => {
      handled = (options['error-callback'] as () => boolean)() === true;
    }, true);
    const user = userEvent.setup();
    render(<App />);

    await user.click(screen.getByRole('button', { name: 'Investment Lab' }));
    expect(handled).toBe(true);
    expect(fetchMock).not.toHaveBeenCalled();
    expect(screen.queryByRole('button', { name: 'Retry verification' })).not.toBeInTheDocument();
    expect(screen.queryByText(/security verification/i)).not.toBeInTheDocument();

    await user.type(screen.getByLabelText('Ask about this scenario'), 'What is my return?');
    await user.click(screen.getByRole('button', { name: 'Ask' }));

    expect(screen.getByRole('alert')).toHaveTextContent('Investment Copilot is unavailable.');
    expect(screen.getByRole('alert')).not.toHaveTextContent(/verif/i);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('stops when the script does not load before the timeout', async () => {
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
    enableLiveCopilot();
    render(<App />);

    fireEvent.click(screen.getByRole('button', { name: 'Investment Lab' }));
    for (let attempt = 0; attempt < 3; attempt += 1) {
      await act(async () => {
        await vi.advanceTimersByTimeAsync(TURNSTILE_SCRIPT_TIMEOUT_MS);
      });
    }

    const script = document.querySelector('script[data-investlab-turnstile]');
    expect(script).toBeInstanceOf(HTMLScriptElement);
    expect((script as HTMLScriptElement).dataset.turnstileFailed).toBe('true');

    await act(async () => {
      fireEvent.change(screen.getByLabelText('Ask about this scenario'), {
        target: { value: 'What is my return?' },
      });
      fireEvent.click(screen.getByRole('button', { name: 'Ask' }));
    });

    expect(screen.getByRole('alert')).toHaveTextContent('Investment Copilot is unavailable.');
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('sends one request when Ask is clicked again before the token arrives', async () => {
    const fetchMock = stubCopilotFetch();
    let options: Record<string, unknown> | null = null;
    installTurnstile((next) => {
      options = next;
    });
    const user = userEvent.setup();
    render(<App />);

    await user.click(screen.getByRole('button', { name: 'Investment Lab' }));
    await user.type(screen.getByLabelText('Investment budget'), '10000');
    await user.type(screen.getByLabelText('Ask about this scenario'), 'What is my return?');
    await user.click(screen.getByRole('button', { name: 'Ask' }));
    await user.clear(screen.getByLabelText('Investment budget'));
    await user.type(screen.getByLabelText('Investment budget'), '5');
    await user.click(screen.getByRole('button', { name: 'Explain my current investment allocation.' }));

    expect(fetchMock).not.toHaveBeenCalled();
    await act(async () => {
      (options?.callback as (token: string) => void)('once-token');
      (options?.callback as (token: string) => void)('second-token');
    });

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const body = JSON.parse(String(fetchMock.mock.calls[0][1].body)) as {
      question: string;
      budget: string;
      turnstileToken: string;
    };
    expect(body.question).toBe('What is my return?');
    expect(body.budget).toBe('10000');
    expect(body.turnstileToken).toBe('once-token');
    expect(screen.getByLabelText('Investment budget')).toHaveValue('5');
  });

  it('does not call the worker when the site key is missing', async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
    vi.stubEnv('VITE_COPILOT_API_URL', 'https://copilot.example.test');
    vi.stubEnv('VITE_TURNSTILE_SITE_KEY', '');
    vi.stubEnv('VITE_COPILOT_DEMO', '');
    const user = userEvent.setup();
    render(<App />);

    await user.click(screen.getByRole('button', { name: 'Investment Lab' }));
    expect(document.querySelector('script[data-investlab-turnstile]')).toBeNull();
    expect(screen.getByRole('link', { name: 'Turnstile Privacy Addendum' })).toBeInTheDocument();

    await user.type(screen.getByLabelText('Ask about this scenario'), 'What is my return?');
    await user.click(screen.getByRole('button', { name: 'Ask' }));

    expect(screen.getByRole('alert')).toHaveTextContent('Investment Copilot is unavailable.');
    expect(fetchMock).not.toHaveBeenCalled();
  });
});

function enableLiveCopilot(siteKey = PASS_KEY) {
  vi.stubEnv('VITE_COPILOT_API_URL', 'https://copilot.example.test');
  vi.stubEnv('VITE_TURNSTILE_SITE_KEY', siteKey);
  vi.stubEnv('VITE_COPILOT_DEMO', '');
}

function stubCopilotFetch() {
  enableLiveCopilot();
  const fetchMock = vi.fn().mockResolvedValue({
    ok: true,
    json: async () => ({
      intent: { type: 'explain_allocation' },
      explanation: null,
      notice: 'The language model is unavailable. The figures above are calculated from the scenario.',
    }),
  } as Response);
  vi.stubGlobal('fetch', fetchMock);
  return fetchMock;
}

function installTurnstile(
  onRender: (options: Record<string, unknown>) => void,
  failOnReset = false,
) {
  let options: Record<string, unknown> | null = null;
  const render = vi.fn((_element: HTMLElement, next: Record<string, unknown>) => {
    options = next;
    onRender(next);
    return 'widget-1';
  });
  const reset = vi.fn(() => {
    if (failOnReset && options) (options['error-callback'] as () => boolean)();
  });
  const remove = vi.fn();
  window.turnstile = { render, reset, remove };
  return { render, reset, remove };
}

function watchConsole() {
  const spies = (['log', 'info', 'debug', 'warn', 'error'] as const).map((method) =>
    vi.spyOn(console, method).mockImplementation(() => {}),
  );
  return {
    text() {
      return spies
        .flatMap((spy) => spy.mock.calls)
        .map((call) =>
          call
            .map((part) => {
              if (typeof part === 'string') return part;
              try {
                return JSON.stringify(part);
              } catch {
                return String(part);
              }
            })
            .join(' '),
        )
        .join('\n');
    },
  };
}
