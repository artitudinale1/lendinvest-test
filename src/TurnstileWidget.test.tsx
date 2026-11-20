import { act, fireEvent, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import App from './App';
import { TURNSTILE_SCRIPT_TIMEOUT_MS } from './components/TurnstileWidget';

afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
  delete window.turnstile;
  document.querySelector('script[data-investlab-turnstile]')?.remove();
});

describe('Cloudflare Turnstile', () => {
  it('shows a visible challenge and sends the token after verification', async () => {
    const logs = watchConsole();
    const fetchMock = stubCopilotFetch();
    const turnstileRender = vi.fn((_element: HTMLElement, options: Record<string, unknown>) => {
      (options.callback as (token: string) => void)('fresh-token');
      return 'widget-1';
    });
    window.turnstile = { render: turnstileRender, remove: vi.fn() };
    const user = userEvent.setup();
    render(<App />);

    expect(turnstileRender).not.toHaveBeenCalled();
    await user.click(screen.getByRole('button', { name: 'Investment Lab' }));

    expect(screen.getByRole('group', { name: 'Security verification' })).toBeInTheDocument();
    expect(screen.getByRole('status')).toHaveTextContent('Verified');
    expect(screen.getByRole('status')).toHaveAttribute('data-verification-status', 'verified');
    expect(turnstileRender).toHaveBeenCalledWith(
      expect.any(HTMLDivElement),
      expect.objectContaining({
        sitekey: 'site-key',
        appearance: 'always',
        size: 'flexible',
        theme: 'light',
        retry: 'never',
        'refresh-expired': 'never',
        'refresh-timeout': 'never',
      }),
    );

    await user.type(screen.getByLabelText('Ask about this scenario'), 'What is my return?');
    await user.click(screen.getByRole('button', { name: 'Ask' }));

    expect(await screen.findByRole('heading', { name: 'Calculated result' })).toBeInTheDocument();
    expect(fetchMock).toHaveBeenCalledWith(
      'https://copilot.example.test/api/copilot',
      expect.objectContaining({
        method: 'POST',
        body: expect.stringContaining('"turnstileToken":"fresh-token"'),
      }),
    );
    expect(document.body.textContent).not.toContain('fresh-token');
    expect(logs.text()).not.toContain('fresh-token');
    expect(logs.text()).not.toContain('site-key');
  });

  it('keeps the question local when verification is still missing', async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
    enableLiveCopilot();
    window.turnstile = { render: vi.fn(() => 'widget-1'), remove: vi.fn() };
    const user = userEvent.setup();
    render(<App />);

    await user.click(screen.getByRole('button', { name: 'Investment Lab' }));
    expect(screen.getByRole('group', { name: 'Security verification' })).toBeInTheDocument();
    expect(screen.getByRole('status')).toHaveTextContent('Verifying');

    await user.type(screen.getByLabelText('Ask about this scenario'), 'What is my return?');
    await user.click(screen.getByRole('button', { name: 'Ask' }));

    expect(screen.getByRole('alert')).toHaveTextContent('Complete the security verification before asking.');
    expect(fetchMock).not.toHaveBeenCalled();
    expect(screen.getByLabelText('Investment budget')).toHaveValue('');
  });

  it('does not ask the visitor to finish a check that failed to load', async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
    enableLiveCopilot();
    const user = userEvent.setup();
    render(<App />);

    await user.click(screen.getByRole('button', { name: 'Investment Lab' }));
    const script = document.querySelector('script[data-investlab-turnstile]');
    if (!(script instanceof HTMLScriptElement)) {
      throw new Error('Missing Turnstile script');
    }
    await act(async () => {
      script.dispatchEvent(new Event('error'));
    });

    expect(screen.getByRole('status')).toHaveAttribute('data-verification-status', 'failed');
    expect(screen.getByRole('status')).toHaveTextContent(
      'Verification failed. The security check could not be loaded.',
    );
    expect(screen.getByRole('button', { name: 'Retry verification' })).toBeInTheDocument();

    await user.type(screen.getByLabelText('Ask about this scenario'), 'What is my return?');
    await user.click(screen.getByRole('button', { name: 'Ask' }));

    expect(screen.getByRole('alert')).toHaveTextContent('Security verification could not be loaded. Try again.');
    expect(screen.getByRole('alert')).not.toHaveTextContent('Complete the security verification');
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('does not ask the visitor to finish a check when the site key is missing', async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
    vi.stubEnv('VITE_COPILOT_API_URL', 'https://copilot.example.test');
    vi.stubEnv('VITE_TURNSTILE_SITE_KEY', '');
    vi.stubEnv('VITE_COPILOT_DEMO', '');
    const user = userEvent.setup();
    render(<App />);

    await user.click(screen.getByRole('button', { name: 'Investment Lab' }));
    expect(screen.getByRole('status')).toHaveTextContent(
      'Verification failed. The security check could not be loaded.',
    );
    expect(document.querySelector('script[data-investlab-turnstile]')).toBeNull();

    await user.type(screen.getByLabelText('Ask about this scenario'), 'What is my return?');
    await user.click(screen.getByRole('button', { name: 'Ask' }));

    expect(screen.getByRole('alert')).toHaveTextContent('Security verification could not be loaded. Try again.');
    expect(screen.getByRole('alert')).not.toHaveTextContent('Complete the security verification');
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('lets the visitor retry a failed challenge and then sends the new token', async () => {
    const logs = watchConsole();
    const fetchMock = stubCopilotFetch();
    let accept = false;
    let errorResult: unknown;
    const turnstileRender = vi.fn((_element: HTMLElement, options: Record<string, unknown>) => {
      if (accept) {
        (options.callback as (token: string) => void)('retry-token');
      } else {
        errorResult = (options['error-callback'] as () => boolean)();
      }
      return 'widget-1';
    });
    window.turnstile = { render: turnstileRender, remove: vi.fn() };
    const user = userEvent.setup();
    render(<App />);

    await user.click(screen.getByRole('button', { name: 'Investment Lab' }));
    expect(errorResult).toBe(true);
    expect(screen.getByRole('status')).toHaveTextContent('Verification failed');
    expect(screen.getByRole('status')).not.toHaveTextContent('could not be loaded');

    await user.type(screen.getByLabelText('Ask about this scenario'), 'What is my return?');
    await user.click(screen.getByRole('button', { name: 'Ask' }));
    expect(screen.getByRole('alert')).toHaveTextContent('Security verification failed. Try again before asking.');
    expect(screen.getByRole('alert')).not.toHaveTextContent('Complete the security verification');
    expect(fetchMock).not.toHaveBeenCalled();

    accept = true;
    await user.click(screen.getByRole('button', { name: 'Retry verification' }));
    expect(screen.getByRole('status')).toHaveTextContent('Verified');

    await user.click(screen.getByRole('button', { name: 'Ask' }));
    expect(await screen.findByRole('heading', { name: 'Calculated result' })).toBeInTheDocument();
    expect(fetchMock).toHaveBeenCalledWith(
      'https://copilot.example.test/api/copilot',
      expect.objectContaining({
        body: expect.stringContaining('"turnstileToken":"retry-token"'),
      }),
    );
    expect(document.body.textContent).not.toContain('retry-token');
    expect(logs.text()).not.toContain('retry-token');
  });

  it('blocks asking when verification expires', async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
    enableLiveCopilot();
    window.turnstile = {
      render: vi.fn((_element: HTMLElement, options: Record<string, unknown>) => {
        (options.callback as (token: string) => void)('expiring-token');
        (options['expired-callback'] as () => void)();
        return 'widget-1';
      }),
      remove: vi.fn(),
    };
    const user = userEvent.setup();
    render(<App />);

    await user.click(screen.getByRole('button', { name: 'Investment Lab' }));
    expect(screen.getByRole('status')).toHaveAttribute('data-verification-status', 'expired');
    expect(screen.getByRole('status')).toHaveTextContent('Verification expired');
    expect(screen.getByRole('button', { name: 'Retry verification' })).toBeInTheDocument();
    expect(document.body.textContent).not.toContain('expiring-token');

    await user.type(screen.getByLabelText('Ask about this scenario'), 'What is my return?');
    await user.click(screen.getByRole('button', { name: 'Ask' }));

    expect(screen.getByRole('alert')).toHaveTextContent(
      'Security verification expired. Verify again before asking.',
    );
    expect(screen.getByRole('alert')).not.toHaveTextContent('Complete the security verification');
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('blocks asking when the interactive challenge times out', async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
    enableLiveCopilot();
    window.turnstile = {
      render: vi.fn((_element: HTMLElement, options: Record<string, unknown>) => {
        (options['timeout-callback'] as () => void)();
        return 'widget-1';
      }),
      remove: vi.fn(),
    };
    const user = userEvent.setup();
    render(<App />);

    await user.click(screen.getByRole('button', { name: 'Investment Lab' }));
    expect(screen.getByRole('status')).toHaveAttribute('data-verification-status', 'failed');
    expect(screen.getByRole('status')).toHaveTextContent('Verification failed. The security check timed out.');

    await user.type(screen.getByLabelText('Ask about this scenario'), 'What is my return?');
    await user.click(screen.getByRole('button', { name: 'Ask' }));

    expect(screen.getByRole('alert')).toHaveTextContent('Security verification timed out. Try again before asking.');
    expect(screen.getByRole('alert')).not.toHaveTextContent('Complete the security verification');
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('marks verification failed when the script does not load in time', async () => {
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
    enableLiveCopilot();
    render(<App />);

    fireEvent.click(screen.getByRole('button', { name: 'Investment Lab' }));
    expect(screen.getByRole('status')).toHaveTextContent('Verifying');

    await act(async () => {
      await vi.advanceTimersByTimeAsync(TURNSTILE_SCRIPT_TIMEOUT_MS);
    });

    expect(screen.getByRole('status')).toHaveTextContent(
      'Verification failed. The security check could not be loaded.',
    );

    fireEvent.change(screen.getByLabelText('Ask about this scenario'), {
      target: { value: 'What is my return?' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Ask' }));

    expect(screen.getByRole('alert')).toHaveTextContent('Security verification could not be loaded. Try again.');
    expect(screen.getByRole('alert')).not.toHaveTextContent('Complete the security verification');
    expect(fetchMock).not.toHaveBeenCalled();
  });
});

function enableLiveCopilot() {
  vi.stubEnv('VITE_COPILOT_API_URL', 'https://copilot.example.test');
  vi.stubEnv('VITE_TURNSTILE_SITE_KEY', 'site-key');
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
