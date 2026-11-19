import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import App from './App';

afterEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
  delete window.turnstile;
  document.querySelector('script[data-investlab-turnstile]')?.remove();
});

describe('Cloudflare Turnstile', () => {
  it('stays interaction-only and still sends the token to the Worker', async () => {
    vi.stubEnv('VITE_COPILOT_API_URL', 'https://copilot.example.test');
    vi.stubEnv('VITE_TURNSTILE_SITE_KEY', 'site-key');
    vi.stubEnv('VITE_COPILOT_DEMO', '');
    const turnstileRender = vi.fn((_element: HTMLElement, options: Record<string, unknown>) => {
      (options.callback as (token: string) => void)('fresh-token');
      return 'widget-1';
    });
    window.turnstile = { render: turnstileRender, remove: vi.fn() };
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        intent: { type: 'explain_allocation' },
        explanation: null,
        notice: 'The language model is unavailable. The figures above are calculated from the scenario.',
      }),
    } as Response);
    vi.stubGlobal('fetch', fetchMock);
    const user = userEvent.setup();
    render(<App />);

    await user.click(screen.getByRole('button', { name: 'Investment Lab' }));
    expect(turnstileRender).toHaveBeenCalledWith(
      expect.any(HTMLDivElement),
      expect.objectContaining({ sitekey: 'site-key', appearance: 'interaction-only' }),
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
  });
});
