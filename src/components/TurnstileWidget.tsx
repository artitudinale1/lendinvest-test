import { useEffect, useRef, useState } from 'react';

export type TurnstileStatus = 'verifying' | 'verified' | 'failed' | 'expired';

export type TurnstileProblem = 'script' | 'challenge' | 'timeout' | null;

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
const SCRIPT_SELECTOR = 'script[data-investlab-turnstile]';

export const TURNSTILE_SCRIPT_TIMEOUT_MS = 15_000;

export function TurnstileWidget({
  siteKey,
  onToken,
  onStatus,
}: {
  siteKey: string;
  onToken: (token: string) => void;
  onStatus: (status: TurnstileStatus, problem?: TurnstileProblem) => void;
}) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [status, setStatus] = useState<TurnstileStatus>('verifying');
  const [problem, setProblem] = useState<TurnstileProblem>(null);
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    let active = true;
    let widgetId: string | null = null;
    let timeoutId = 0;
    let script: HTMLScriptElement | null = null;

    const publish = (next: TurnstileStatus, nextProblem: TurnstileProblem = null) => {
      if (!active) return;
      setStatus(next);
      setProblem(nextProblem);
      onStatus(next, nextProblem);
    };

    const reject = (next: 'failed' | 'expired', nextProblem: TurnstileProblem = null) => {
      if (!active) return;
      onToken('');
      publish(next, nextProblem);
    };

    const renderWidget = () => {
      if (!active || !containerRef.current || !window.turnstile || widgetId) return;
      window.clearTimeout(timeoutId);
      containerRef.current.replaceChildren();
      try {
        const id = window.turnstile.render(containerRef.current, {
          sitekey: siteKey,
          appearance: 'always',
          size: 'flexible',
          theme: 'light',
          retry: 'never',
          'refresh-expired': 'never',
          'refresh-timeout': 'never',
          callback: (token: unknown) => {
            if (!active) return;
            if (typeof token !== 'string' || token.trim() === '') {
              reject('failed', 'challenge');
              return;
            }
            onToken(token.trim());
            publish('verified');
          },
          'expired-callback': () => {
            reject('expired');
          },
          'error-callback': () => {
            reject('failed', 'challenge');
            return true;
          },
          'timeout-callback': () => {
            reject('failed', 'timeout');
          },
        });
        if (!id) {
          reject('failed', 'script');
          return;
        }
        widgetId = id;
      } catch {
        reject('failed', 'script');
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
        reject('failed', 'script');
        return;
      }
      renderWidget();
    };

    const onError = () => {
      if (!active) return;
      window.clearTimeout(timeoutId);
      markScriptFailed();
      reject('failed', 'script');
    };

    publish('verifying');
    onToken('');

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
        reject('failed', 'script');
      }, TURNSTILE_SCRIPT_TIMEOUT_MS);
      if (!script.parentNode) document.head.appendChild(script);
      if (window.turnstile) onLoad();
    }

    return () => {
      active = false;
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
  }, [attempt, onStatus, onToken, siteKey]);

  const needsRetry = status === 'failed' || status === 'expired';

  return (
    <div role="group" aria-label="Security verification" className="max-w-full">
      <div
        ref={containerRef}
        className="min-h-[65px] w-full max-w-[300px]"
        aria-busy={status === 'verifying' || undefined}
      />
      <p
        role="status"
        data-verification-status={status}
        className={
          needsRetry ? 'mt-2 text-sm text-red-800' : 'mt-2 text-sm text-slate-600'
        }
      >
        {statusLabel(status, problem)}
      </p>
      {needsRetry ? (
        <button
          type="button"
          onClick={() => setAttempt((value) => value + 1)}
          className="mt-2 inline-flex min-h-11 items-center justify-center rounded-lg border border-slate-300 px-4 text-sm font-semibold text-slate-700 hover:bg-slate-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand"
        >
          Retry verification
        </button>
      ) : null}
    </div>
  );
}

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

function statusLabel(status: TurnstileStatus, problem: TurnstileProblem): string {
  if (status === 'verifying') return 'Verifying';
  if (status === 'verified') return 'Verified';
  if (status === 'expired') return 'Verification expired';
  if (problem === 'script') return 'Verification failed. The security check could not be loaded.';
  if (problem === 'timeout') return 'Verification failed. The security check timed out.';
  return 'Verification failed';
}
