import { forwardRef, useEffect, useImperativeHandle, useRef, useState } from 'react';

type Waiter = (token: string | null) => void;

type TurnstileApi = {
  render: (container: HTMLElement, options: Record<string, unknown>) => string;
  reset: (widgetId: string) => void;
  remove: (widgetId: string) => void;
};

declare global {
  interface Window {
    turnstile?: TurnstileApi;
  }
}

const SCRIPT_URL = 'https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit';
const SCRIPT_SELECTOR = 'script[data-investlab-turnstile]';

export const TURNSTILE_SCRIPT_TIMEOUT_MS = 15_000;

/** First failure plus two silent replacements. Expiry does not count. */
export const TURNSTILE_RECOVERY_LIMIT = 2;

export type TurnstileHandle = {
  takeToken: () => Promise<string | null>;
};

export const TurnstileWidget = forwardRef<TurnstileHandle, { siteKey: string }>(function TurnstileWidget(
  { siteKey },
  ref,
) {
  const containerRef = useRef<HTMLDivElement>(null);
  const tokenRef = useRef<string | null>(null);
  const waitersRef = useRef<Waiter[]>([]);
  const failuresRef = useRef(0);
  const exhaustedRef = useRef(false);
  const resetRef = useRef<() => void>(() => {});
  const [attempt, setAttempt] = useState(0);

  const settleWaiters = (token: string | null) => {
    const waiters = waitersRef.current;
    waitersRef.current = [];
    for (const waiter of waiters) waiter(token);
  };

  useImperativeHandle(ref, () => ({
    takeToken() {
      if (exhaustedRef.current) return Promise.resolve(null);
      const ready = tokenRef.current?.trim() ?? '';
      if (ready) {
        tokenRef.current = null;
        resetRef.current();
        return Promise.resolve(ready);
      }
      return new Promise((resolve) => {
        waitersRef.current.push(resolve);
      });
    },
  }), []);

  useEffect(() => {
    const container = containerRef.current;
    if (!container || exhaustedRef.current) return;

    let active = true;
    let widgetId: string | null = null;
    let timeoutId = 0;
    let script: HTMLScriptElement | null = null;
    let needsReset = false;

    let issue = 0;
    let storedIssue = 0;

    const deliver = (token: string) => {
      failuresRef.current = 0;
      issue += 1;
      storedIssue = issue;
      const waiters = waitersRef.current;
      if (waiters.length === 0) {
        tokenRef.current = token;
        return;
      }
      waitersRef.current = [];
      tokenRef.current = null;
      for (const waiter of waiters) waiter(token);
      resetRef.current();
    };

    const giveUp = () => {
      if (!active || exhaustedRef.current) return;
      exhaustedRef.current = true;
      tokenRef.current = null;
      settleWaiters(null);
    };

    const fail = (kind: 'widget' | 'script') => {
      if (!active || exhaustedRef.current) return;
      tokenRef.current = null;
      failuresRef.current += 1;
      if (failuresRef.current > TURNSTILE_RECOVERY_LIMIT) {
        giveUp();
        return;
      }
      if (kind === 'script') {
        setAttempt((value) => value + 1);
        return;
      }
      resetRef.current();
    };

    resetRef.current = () => {
      if (!active || !widgetId || !window.turnstile) {
        needsReset = true;
        return;
      }
      needsReset = false;
      try {
        window.turnstile.reset(widgetId);
      } catch {
        fail('widget');
      }
    };

    const renderWidget = () => {
      if (!active || !containerRef.current || !window.turnstile || widgetId) return;
      window.clearTimeout(timeoutId);
      containerRef.current.replaceChildren();
      try {
        const id = window.turnstile.render(containerRef.current, {
          sitekey: siteKey,
          retry: 'never',
          'refresh-expired': 'auto',
          'refresh-timeout': 'never',
          'response-field': false,
          callback: (token: unknown) => {
            if (!active) return;
            if (typeof token !== 'string' || token.trim() === '') {
              fail('widget');
              return;
            }
            deliver(token.trim());
          },
          'expired-callback': () => {
            if (!active) return;
            const expiredIssue = storedIssue;
            queueMicrotask(() => {
              if (!active || storedIssue !== expiredIssue) return;
              tokenRef.current = null;
            });
          },
          'error-callback': () => {
            fail('widget');
            return true;
          },
          'timeout-callback': () => {
            fail('widget');
          },
        });
        if (!id) {
          fail('script');
          return;
        }
        widgetId = id;
        if (needsReset) resetRef.current();
      } catch {
        fail('script');
      }
    };

    const markScriptFailed = () => {
      if (script) script.dataset.turnstileFailed = 'true';
    };

    const onLoad = () => {
      if (!active || script?.dataset.turnstileFailed === 'true') return;
      window.clearTimeout(timeoutId);
      if (!window.turnstile) {
        markScriptFailed();
        fail('script');
        return;
      }
      renderWidget();
    };

    const onError = () => {
      if (!active) return;
      window.clearTimeout(timeoutId);
      markScriptFailed();
      fail('script');
    };

    if (window.turnstile) {
      const existing = document.querySelector<HTMLScriptElement>(SCRIPT_SELECTOR);
      if (existing?.dataset.turnstileFailed === 'true') existing.remove();
      renderWidget();
    } else {
      script = scriptElement();
      script.addEventListener('load', onLoad);
      script.addEventListener('error', onError);
      timeoutId = window.setTimeout(() => {
        if (!active || widgetId) return;
        markScriptFailed();
        fail('script');
      }, TURNSTILE_SCRIPT_TIMEOUT_MS);
      if (!script.parentNode) document.head.appendChild(script);
      if (window.turnstile) onLoad();
    }

    return () => {
      active = false;
      resetRef.current = () => {};
      window.clearTimeout(timeoutId);
      script?.removeEventListener('load', onLoad);
      script?.removeEventListener('error', onError);
      if (widgetId && window.turnstile) {
        try {
          window.turnstile.remove(widgetId);
        } catch {
          // The API throws if this widget was already removed.
        }
      }
    };
  }, [attempt, siteKey]);

  return <div ref={containerRef} aria-hidden="true" />;
});

function scriptElement(): HTMLScriptElement {
  const existing = document.querySelector<HTMLScriptElement>(SCRIPT_SELECTOR);
  if (existing && existing.dataset.turnstileFailed !== 'true') return existing;
  existing?.remove();
  const script = document.createElement('script');
  script.src = SCRIPT_URL;
  script.async = true;
  script.dataset.investlabTurnstile = 'true';
  return script;
}
