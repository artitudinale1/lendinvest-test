import { useEffect, useRef, useState } from 'react';
import { InvestmentLab } from './components/InvestmentLab';
import { type AppView } from './components/Header';
import { Loans } from './Loans';

export default function App() {
  const [view, setView] = useState<AppView>('loans');
  const loansHeading = useRef<HTMLHeadingElement>(null);
  const labHeading = useRef<HTMLHeadingElement>(null);
  const skipInitialFocus = useRef(true);

  useEffect(() => {
    if (skipInitialFocus.current) {
      skipInitialFocus.current = false;
      return;
    }

    const heading = view === 'loans' ? loansHeading.current : labHeading.current;
    heading?.focus();
  }, [view]);

  return (
    <div className="min-h-screen bg-page font-sans text-ink antialiased">
      <div
        hidden={view !== 'loans' ? true : undefined}
        inert={view !== 'loans' ? true : undefined}
        aria-hidden={view !== 'loans' ? true : undefined}
      >
        <Loans view={view} onViewChange={setView} headingRef={loansHeading} />
      </div>
      <div
        hidden={view !== 'lab' ? true : undefined}
        inert={view !== 'lab' ? true : undefined}
        aria-hidden={view !== 'lab' ? true : undefined}
      >
        <InvestmentLab view={view} onViewChange={setView} headingRef={labHeading} />
      </div>
    </div>
  );
}
