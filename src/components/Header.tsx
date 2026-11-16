import { LogoMark } from './icons';

export type AppView = 'loans' | 'lab';

type HeaderProps = {
  view: AppView;
  onViewChange: (view: AppView) => void;
};

const navButtonClass =
  'inline-flex min-h-11 items-center rounded-lg px-3 text-sm font-semibold focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white focus-visible:ring-offset-2 focus-visible:ring-offset-navy';

export function Header({ view, onViewChange }: HeaderProps) {
  return (
    <header className="bg-navy text-white">
      <div className="mx-auto flex min-h-16 max-w-6xl flex-wrap items-center gap-x-3 gap-y-2 px-4 py-3 sm:px-6 lg:px-8">
        <div className="flex min-w-0 items-center gap-3">
          <LogoMark />
          <p className="text-lg font-semibold tracking-tight">InvestLab</p>
          <span className="hidden h-5 w-px shrink-0 bg-white/25 sm:block" aria-hidden="true" />
          <p className="hidden truncate text-sm text-white/80 lg:block">Loan Investment Dashboard</p>
        </div>
        <nav aria-label="Primary" className="flex w-full gap-1 sm:ml-auto sm:w-auto">
          <button
            type="button"
            className={`${navButtonClass} ${view === 'loans' ? 'bg-white/15 text-white' : 'text-white/80 hover:bg-white/10 hover:text-white'}`}
            aria-current={view === 'loans' ? 'page' : undefined}
            onClick={() => onViewChange('loans')}
          >
            Current Loans
          </button>
          <button
            type="button"
            className={`${navButtonClass} ${view === 'lab' ? 'bg-white/15 text-white' : 'text-white/80 hover:bg-white/10 hover:text-white'}`}
            aria-current={view === 'lab' ? 'page' : undefined}
            onClick={() => onViewChange('lab')}
          >
            Investment Lab
          </button>
        </nav>
      </div>
    </header>
  );
}
