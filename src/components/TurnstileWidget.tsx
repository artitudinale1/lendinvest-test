import { useEffect, useRef } from 'react';

type TurnstileApi = {
  render: (container: HTMLElement, options: Record<string, unknown>) => string;
  remove: (widgetId: string) => void;
};

declare global {
  interface Window {
    turnstile?: TurnstileApi;
  }
}

const SCRIPT_URL = 'https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit';

export function TurnstileWidget({
  siteKey,
  onToken,
}: {
  siteKey: string;
  onToken: (token: string) => void;
}) {
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    let active = true;
    let widgetId: string | null = null;

    const render = () => {
      if (!active || !containerRef.current || !window.turnstile || widgetId) return;
      widgetId = window.turnstile.render(containerRef.current, {
        sitekey: siteKey,
        appearance: 'interaction-only',
        callback: (token: string) => {
          if (active) onToken(token);
        },
        'expired-callback': () => {
          if (active) onToken('');
        },
        'error-callback': () => {
          if (active) onToken('');
          return true;
        },
      });
    };

    let script = document.querySelector<HTMLScriptElement>('script[data-investlab-turnstile]');
    if (!script) {
      script = document.createElement('script');
      script.src = SCRIPT_URL;
      script.async = true;
      script.dataset.investlabTurnstile = 'true';
      document.head.appendChild(script);
    }

    script.addEventListener('load', render);
    render();

    return () => {
      active = false;
      script?.removeEventListener('load', render);
      if (widgetId && window.turnstile) window.turnstile.remove(widgetId);
    };
  }, [siteKey, onToken]);

  return <div ref={containerRef} aria-label="Security verification" />;
}
