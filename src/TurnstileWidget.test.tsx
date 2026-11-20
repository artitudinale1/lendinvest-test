import { createRef } from 'react';
import { act, fireEvent, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import App from './App';
import {
  TURNSTILE_CANCELLED,
  TURNSTILE_SCRIPT_TIMEOUT_MS,
  TurnstileWidget,
  type TurnstileHandle,
} from './components/TurnstileWidget';

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

  it('settles a pending token request when the widget unmounts', async () => {
    installTurnstile(() => {});
    const ref = createRef<TurnstileHandle>();
    const view = render(<TurnstileWidget ref={ref} siteKey={PASS_KEY} />);
    const pending = ref.current?.takeToken();
    if (!pending) throw new Error('Missing Turnstile handle');

    view.unmount();

    await expect(pending).resolves.toBe(TURNSTILE_CANCELLED);
  });

  it('cancels a waiting question when the lab closes and does not submit afterwards', async () => {
    const errors = vi.spyOn(console, 'error').mockImplementation(() => {});
    const fetchMock = stubCopilotFetch();
    const renders: Record<string, unknown>[] = [];
    installTurnstile((next) => {
      renders.push(next);
    });
    const turnstile = window.turnstile;
    if (!turnstile) throw new Error('Missing Turnstile mock');
    turnstile.remove = vi.fn(() => {
      (renders.at(-1)?.callback as (token: string) => void)('stale-token');
    });
    const user = userEvent.setup();
    const view = render(<App />);

    await user.click(screen.getByRole('button', { name: 'Investment Lab' }));
    await user.type(screen.getByLabelText('Ask about this scenario'), 'What is my return?');
    await user.click(screen.getByRole('button', { name: 'Ask' }));

    expect(screen.getByRole('button', { name: 'Calculating' })).toBeDisabled();
    expect(fetchMock).not.toHaveBeenCalled();

    await user.click(screen.getByRole('button', { name: 'Current Loans' }));

    expect(fetchMock).not.toHaveBeenCalled();
    expect(screen.queryByRole('alert', { hidden: true })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Calculating', hidden: true })).not.toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Investment Lab' }));
    expect(screen.getByRole('button', { name: 'Ask' })).toBeEnabled();
    await user.click(screen.getByRole('button', { name: 'Ask' }));
    await act(async () => {
      (renders.at(-1)?.callback as (token: string) => void)('next-token');
    });

    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(String(fetchMock.mock.calls[0][1].body)).toContain('"turnstileToken":"next-token"');
    expect(String(fetchMock.mock.calls[0][1].body)).not.toContain('stale-token');
    expectNoVerificationUi();

    await user.click(screen.getByRole('button', { name: 'Ask' }));
    expect(fetchMock).toHaveBeenCalledTimes(1);
    view.unmount();
    await act(async () => {
      (renders.at(-1)?.callback as (token: string) => void)('after-unmount-token');
    });

    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(errors.mock.calls.flat().join(' ')).not.toMatch(/unmounted|state update/i);
  });

  it('submits one waiting question after an invisible check, then handles expiry, retry, and failure', async () => {
    const fetchMock = stubCopilotFetch(PASS_KEY);
    let options: Record<string, unknown> | null = null;
    installTurnstile((next) => {
      options = next;
    });
    const user = userEvent.setup();
    render(<App />);

    await user.click(screen.getByRole('button', { name: 'Investment Lab' }));

    const rendered = turnstileOptions(options);
    expect(rendered.sitekey).toBe(PASS_KEY);
    expect(rendered).not.toHaveProperty('appearance');
    expect(rendered).not.toHaveProperty('execution');
    expectNoVerificationUi();
    expect(screen.getByRole('link', { name: 'Turnstile Privacy Addendum' })).toBeInTheDocument();

    await user.type(screen.getByLabelText('Ask about this scenario'), 'What is my return?');
    await user.click(screen.getByRole('button', { name: 'Ask' }));

    expect(fetchMock).not.toHaveBeenCalled();
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
    expectNoVerificationUi();

    await act(async () => {
      turnstileCallback(options, 'callback')('pass-token');
    });

    expect(await screen.findByRole('heading', { name: 'Calculated result' })).toBeInTheDocument();
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(String(fetchMock.mock.calls[0][1].body)).toContain('"turnstileToken":"pass-token"');
    expect(document.body.textContent).not.toContain('pass-token');
    expectNoVerificationUi();

    await act(async () => {
      turnstileCallback(options, 'callback')('expiring-token');
      turnstileCallback(options, 'expired-callback')();
      turnstileCallback(options, 'callback')('renewed-token');
    });
    await user.click(screen.getByRole('button', { name: 'Ask' }));

    expect(fetchMock).toHaveBeenCalledTimes(2);
    const renewed = String(fetchMock.mock.calls[1][1].body);
    expect(renewed).toContain('"turnstileToken":"renewed-token"');
    expect(renewed).not.toContain('expiring-token');
    expect(screen.queryByText(/expired/i)).not.toBeInTheDocument();
    expectNoVerificationUi();

    await user.click(screen.getByRole('button', { name: 'Ask' }));
    expect(fetchMock).toHaveBeenCalledTimes(2);
    const recovered = turnstileCallback(options, 'error-callback')();
    expect(recovered).toBe(true);
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
    expectNoVerificationUi();
    await act(async () => {
      turnstileCallback(options, 'callback')('retry-token');
    });

    expect(fetchMock).toHaveBeenCalledTimes(3);
    expect(String(fetchMock.mock.calls[2][1].body)).toContain('"turnstileToken":"retry-token"');
    expectNoVerificationUi();

    await act(async () => {
      turnstileCallback(options, 'error-callback')();
      turnstileCallback(options, 'error-callback')();
      turnstileCallback(options, 'error-callback')();
    });
    await user.click(screen.getByRole('button', { name: 'Ask' }));

    expect(screen.getByRole('alert')).toHaveTextContent('Investment Copilot is unavailable.');
    expect(screen.getByRole('alert')).not.toHaveTextContent(/verif/i);
    expect(fetchMock).toHaveBeenCalledTimes(3);
    expect(screen.queryByRole('button', { name: 'Retry verification' })).not.toBeInTheDocument();
    expectNoVerificationUi();
  });
});

function enableLiveCopilot(siteKey = PASS_KEY) {
  vi.stubEnv('VITE_COPILOT_API_URL', 'https://copilot.example.test');
  vi.stubEnv('VITE_TURNSTILE_SITE_KEY', siteKey);
  vi.stubEnv('VITE_COPILOT_DEMO', '');
}

function stubCopilotFetch(siteKey = PASS_KEY) {
  enableLiveCopilot(siteKey);
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

function turnstileOptions(options: Record<string, unknown> | null): Record<string, unknown> {
  if (!options) throw new Error('Missing Turnstile render options');
  return options;
}

function turnstileCallback(options: Record<string, unknown> | null, name: string): (...args: string[]) => boolean {
  const callback = turnstileOptions(options)[name];
  if (typeof callback !== 'function') throw new Error(`Missing Turnstile ${name}`);
  return callback as (...args: string[]) => boolean;
}

function expectNoVerificationUi() {
  expect(screen.queryByRole('group', { name: 'Security verification' })).not.toBeInTheDocument();
  expect(screen.queryByRole('button', { name: 'Retry verification' })).not.toBeInTheDocument();
  expect(screen.queryByRole('checkbox')).not.toBeInTheDocument();
  expect(screen.queryByText('Verifying')).not.toBeInTheDocument();
  expect(screen.queryByText(/Complete the security/)).not.toBeInTheDocument();
  expect(document.querySelector('iframe')).toBeNull();
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
