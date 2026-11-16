import { useCallback, useState, type FormEvent, type Ref } from 'react';
import { Header, type AppView } from './components/Header';
import { investButtonClass, LoanCard } from './components/LoanCard';
import { ChartIcon, CoinsIcon, HouseIcon } from './components/icons';
import { Modal } from './components/Modal';
import { illustrationFor } from './loanIllustrations';
import {
  createLoans,
  formatPounds,
  invest,
  investErrorMessage,
  totalAvailable,
  type InvestError,
  type Loan,
} from './loans';

type LoansProps = {
  view: AppView;
  onViewChange: (view: AppView) => void;
  headingRef: Ref<HTMLHeadingElement>;
};

export function Loans({ view, onViewChange, headingRef }: LoansProps) {
  const [loans, setLoans] = useState<Loan[]>(createLoans);
  const [selectedLoanId, setSelectedLoanId] = useState<string | null>(null);
  const [amount, setAmount] = useState('');
  const [error, setError] = useState<InvestError | null>(null);
  const [returnFocusTo, setReturnFocusTo] = useState<HTMLElement | null>(null);

  const selectedLoan = loans.find((loan) => loan.id === selectedLoanId) ?? null;
  const total = totalAvailable(loans);
  const fundsInvested = totalAvailable(createLoans()) - total;

  const closeModal = useCallback(() => {
    setSelectedLoanId(null);
    setAmount('');
    setError(null);
  }, []);

  function openLoan(loanId: string, trigger: HTMLElement) {
    setReturnFocusTo(trigger);
    setSelectedLoanId(loanId);
    setAmount('');
    setError(null);
  }

  function submitInvestment(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (selectedLoanId === null) {
      return;
    }

    const result = invest(loans, selectedLoanId, amount);
    if (!result.ok) {
      setError(result.error);
      return;
    }

    setLoans(result.loans);
    closeModal();
  }

  const dialogOpen = selectedLoan !== null;

  return (
    <>
      <div inert={dialogOpen ? true : undefined} aria-hidden={dialogOpen ? true : undefined}>
        <Header view={view} onViewChange={onViewChange} />
        <main id="portfolio" className="mx-auto max-w-6xl px-4 py-8 sm:px-6 lg:px-8">
          <h1
            ref={headingRef}
            tabIndex={-1}
            className="text-3xl font-bold tracking-tight text-ink outline-none sm:text-4xl"
          >
            Current Loans
          </h1>
          <p className="mt-2 text-base text-slate-600">Browse available property loans and invest.</p>

          <section aria-label="Dashboard overview" className="mt-6 grid gap-4 sm:grid-cols-3">
            <div className="flex items-center gap-4 rounded-2xl border border-slate-200/80 bg-white px-5 py-4 shadow-[0_8px_24px_rgba(16,40,70,0.05)]">
              <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-mint text-brand">
                <CoinsIcon />
              </span>
              <div className="min-w-0">
                <p className="text-sm text-slate-500">Total available</p>
                <p className="text-2xl font-bold tracking-tight text-ink">£{formatPounds(total)}</p>
              </div>
            </div>
            <div className="flex items-center gap-4 rounded-2xl border border-slate-200/80 bg-white px-5 py-4 shadow-[0_8px_24px_rgba(16,40,70,0.05)]">
              <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-ice text-sky-700">
                <HouseIcon />
              </span>
              <div className="min-w-0">
                <p className="text-sm text-slate-500">Available loans</p>
                <p className="text-2xl font-bold tracking-tight text-ink">{loans.length}</p>
              </div>
            </div>
            <div className="flex items-center gap-4 rounded-2xl border border-slate-200/80 bg-white px-5 py-4 shadow-[0_8px_24px_rgba(16,40,70,0.05)]">
              <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-mint text-brand">
                <ChartIcon />
              </span>
              <div className="min-w-0">
                <p className="text-sm text-slate-500">Funds invested</p>
                <p className="text-2xl font-bold tracking-tight text-ink">£{formatPounds(fundsInvested)}</p>
              </div>
            </div>
          </section>

          <section aria-label="Available loan listings" className="mt-6 grid gap-6 md:grid-cols-2 lg:grid-cols-3">
            {loans.map((loan) => (
              <LoanCard key={loan.id} loan={loan} onInvest={openLoan} />
            ))}
          </section>
        </main>
      </div>
      <Modal
        show={dialogOpen}
        title="Invest in this loan"
        close={closeModal}
        returnFocusTo={returnFocusTo}
      >
        {selectedLoan ? (
          <InvestForm
            loan={selectedLoan}
            amount={amount}
            error={error}
            onAmountChange={(value) => {
              setAmount(value);
              setError(null);
            }}
            onCancel={closeModal}
            onSubmit={submitInvestment}
          />
        ) : null}
      </Modal>
    </>
  );
}

type InvestFormProps = {
  loan: Loan;
  amount: string;
  error: InvestError | null;
  onAmountChange: (value: string) => void;
  onCancel: () => void;
  onSubmit: (event: FormEvent<HTMLFormElement>) => void;
};

function InvestForm({ loan, amount, error, onAmountChange, onCancel, onSubmit }: InvestFormProps) {
  const illustration = illustrationFor(loan.id);

  return (
    <>
      <div className="flex items-center gap-3 rounded-xl border border-slate-200 p-3">
        <img
          src={illustration.src}
          alt=""
          width={illustration.width}
          height={illustration.height}
          style={{ objectPosition: illustration.objectPosition }}
          className="h-16 w-20 shrink-0 rounded-lg object-cover"
        />
        <div className="min-w-0">
          <p className="font-semibold text-ink">{loan.title}</p>
          <p className="mt-1 text-xs text-slate-500">Available balance</p>
          <p className="text-sm font-semibold text-ink">£{formatPounds(loan.availableAmount)}</p>
        </div>
      </div>
      <form className="mt-5" noValidate onSubmit={onSubmit}>
        <label htmlFor="investment-amount" className="text-sm font-medium text-ink">
          Investment amount
        </label>
        <div className="mt-2 flex items-center rounded-lg border border-slate-300 bg-white px-3 focus-within:border-brand focus-within:ring-2 focus-within:ring-brand">
          <span aria-hidden="true" className="text-slate-500">
            £
          </span>
          <input
            id="investment-amount"
            type="number"
            inputMode="numeric"
            value={amount}
            aria-invalid={error ? true : undefined}
            aria-describedby={error ? 'invest-hint invest-error' : 'invest-hint'}
            onChange={(event) => onAmountChange(event.target.value)}
            className="min-h-11 w-full border-0 bg-transparent px-2 text-base text-ink outline-none [appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none"
          />
        </div>
        <p id="invest-hint" className="mt-2 text-sm text-slate-600">
          Enter a whole amount in pounds, up to £{formatPounds(loan.availableAmount)}.
        </p>
        {error ? (
          <p
            id="invest-error"
            className="mt-3 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800"
            role="alert"
          >
            {investErrorMessage(error)}
          </p>
        ) : null}
        <div className="mt-5 grid grid-cols-2 gap-3">
          <button
            type="button"
            onClick={onCancel}
            className="inline-flex min-h-11 items-center justify-center rounded-lg border border-slate-300 bg-white px-4 text-sm font-semibold text-slate-700 hover:bg-slate-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand focus-visible:ring-offset-2"
          >
            Cancel
          </button>
          <button type="submit" className={investButtonClass}>
            Invest
          </button>
        </div>
      </form>
    </>
  );
}
