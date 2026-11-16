import { formatPounds, formatTermRemaining, type Loan } from '../loans';
import { illustrationFor } from '../loanIllustrations';
import { CalendarIcon, CoinsIcon } from './icons';

const investButtonClass =
  'inline-flex min-h-11 w-full items-center justify-center rounded-lg bg-brand px-4 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-brand-hover focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand focus-visible:ring-offset-2';

type LoanCardProps = {
  loan: Loan;
  onInvest: (loanId: string, trigger: HTMLButtonElement) => void;
};

export function LoanCard({ loan, onInvest }: LoanCardProps) {
  const illustration = illustrationFor(loan.id);

  return (
    <article className="flex flex-col overflow-hidden rounded-2xl border border-slate-200/80 bg-white shadow-[0_10px_30px_rgba(16,40,70,0.06)]">
      <img
        src={illustration.src}
        alt={illustration.alt}
        width={illustration.width}
        height={illustration.height}
        style={{ objectPosition: illustration.objectPosition }}
        className="h-48 w-full object-cover"
      />
      <div className="flex flex-1 flex-col p-5">
        <div className="flex items-start justify-between gap-3">
          <h2 className="text-lg font-bold leading-snug text-ink">{loan.title}</h2>
          {loan.invested ? (
            <p className="shrink-0 rounded-full bg-mint px-2.5 py-1 text-xs font-semibold tracking-wide text-teal-900">
              INVESTED
            </p>
          ) : null}
        </div>
        <div className="mt-4 grid grid-cols-2 gap-3">
          <div className="flex items-start gap-2">
            <CoinsIcon className="mt-0.5 h-5 w-5 shrink-0 text-slate-400" />
            <div className="min-w-0">
              <p className="text-xs text-slate-500">Available amount</p>
              <p className="mt-0.5 text-sm font-semibold text-ink">
                £{formatPounds(loan.availableAmount)}
              </p>
            </div>
          </div>
          <div className="flex items-start gap-2 border-l border-slate-200 pl-3">
            <CalendarIcon className="mt-0.5 h-5 w-5 shrink-0 text-slate-400" />
            <div className="min-w-0">
              <p className="text-xs text-slate-500">Deadline</p>
              <p className="mt-0.5 text-sm font-semibold text-ink">
                {formatTermRemaining(loan.termRemainingSeconds)}
              </p>
            </div>
          </div>
        </div>
        <div className="mt-auto pt-5">
          <button
            type="button"
            className={investButtonClass}
            onClick={(event) => onInvest(loan.id, event.currentTarget)}
          >
            Invest
          </button>
        </div>
      </div>
    </article>
  );
}

export { investButtonClass };
