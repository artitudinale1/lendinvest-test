import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import App from './App';

const SHEFFIELD = '9 Munro Court, Bartin Close, Sheffield';

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('Investment Copilot', () => {
  it('shows a calculated preview and applies it only after confirmation', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(jsonResponse(distributeIntent())));
    const user = userEvent.setup();
    render(<App />);

    await user.click(screen.getByRole('button', { name: 'Investment Lab' }));
    await user.click(
      screen.getByRole('button', {
        name: 'How could I distribute my £10,000 budget across the available loans?',
      }),
    );

    expect(await screen.findByRole('heading', { name: 'Calculated preview' })).toBeInTheDocument();
    expect(screen.getByText('£683.34')).toBeInTheDocument();
    expect(screen.getByLabelText('Investment budget')).toHaveValue('');

    await user.click(screen.getByRole('button', { name: 'Dismiss' }));
    expect(screen.queryByRole('heading', { name: 'Calculated preview' })).not.toBeInTheDocument();
    expect(screen.getByLabelText('Investment budget')).toHaveValue('');

    await user.click(
      screen.getByRole('button', {
        name: 'How could I distribute my £10,000 budget across the available loans?',
      }),
    );
    await user.click(await screen.findByRole('button', { name: 'Apply preview' }));

    expect(screen.getByLabelText('Investment budget')).toHaveValue('10000');
    expect(screen.getByLabelText(SHEFFIELD)).toHaveValue('3334');
    expect(screen.getByText('£55,723')).toBeInTheDocument();
  });

  it('sends the selected free model and starts on automatic', async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      jsonResponse({
        intent: { type: 'explain_allocation' },
        explanation: null,
        notice: 'The language model is unavailable. The figures above are calculated from the scenario.',
      }),
    );
    vi.stubGlobal('fetch', fetchMock);
    const user = userEvent.setup();
    render(<App />);

    await user.click(screen.getByRole('button', { name: 'Investment Lab' }));
    const model = screen.getByLabelText('Model');
    expect(model).toHaveValue('openrouter/free');
    expect(model).toBeEnabled();
    expect(screen.getByRole('option', { name: 'Automatic (free)' })).toBeInTheDocument();
    expect(screen.getByRole('option', { name: 'Nemotron 3.5 Super' })).toBeInTheDocument();
    expect(screen.getByRole('option', { name: 'Particle-1' })).toBeInTheDocument();

    await user.selectOptions(model, 'particle-ai/particle-1:free');
    await user.type(screen.getByLabelText('Ask about this scenario'), 'What is my return?');
    await user.click(screen.getByRole('button', { name: 'Ask' }));

    expect(await screen.findByRole('heading', { name: 'Calculated result' })).toBeInTheDocument();
    const body = JSON.parse(String(fetchMock.mock.calls[0][1].body)) as { model: string };
    expect(body.model).toBe('particle-ai/particle-1:free');
  });

  it('keeps the form unchanged when the copilot is unavailable', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('offline')));
    const user = userEvent.setup();
    render(<App />);

    await user.click(screen.getByRole('button', { name: 'Investment Lab' }));
    await user.type(screen.getByLabelText('Ask about this scenario'), 'What is my return?');
    await user.click(screen.getByRole('button', { name: 'Ask' }));

    expect(await screen.findByRole('alert')).toHaveTextContent('Investment Copilot is unavailable.');
    expect(screen.getByLabelText('Investment budget')).toHaveValue('');
    expect(screen.getByLabelText(SHEFFIELD)).toHaveValue('');
  });

  it('shows calculated facts when the explanation cannot be verified', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(
        jsonResponse({
          intent: { type: 'explain_allocation' },
          explanation: 'The illustrative return is £1,234.00.',
          explanationStatus: 'model',
          notice: null,
        }),
      ),
    );
    const user = userEvent.setup();
    render(<App />);

    await user.click(screen.getByRole('button', { name: 'Investment Lab' }));
    await user.type(screen.getByLabelText('Investment budget'), '10000');
    await user.click(
      screen.getByRole('button', { name: 'Explain my current investment allocation.' }),
    );

    expect(await screen.findByRole('heading', { name: 'Calculated result' })).toBeInTheDocument();
    expect(screen.getByRole('table', { name: 'Allocation by loan' })).toBeInTheDocument();
    expect(screen.getByRole('columnheader', { name: 'Amount' })).toBeInTheDocument();
    expect(screen.getByText(/could not be verified/)).toBeInTheDocument();
    expect(screen.queryByText(/£1,234.00/)).not.toBeInTheDocument();
  });

  it('shows a Markdown-style explanation as plain wrapped paragraphs', async () => {
    const markdown = [
      'Your current allocation totals £10,000.00.',
      '**1. 9 Munro Court, Bartin Close, Sheffield** - Allocated: £4,000.00 (40.0%) at 8.60% (£344.00)',
      '**2. 12 Hollins Green Road, Marple** - Allocated: £4,000.00 (40.0%) at 7.10% (£284.00)',
      '**3. Robins Gate, Wavering Lane West, Gillingham** - Allocated: £2,000.00 (20.0%) at 4.80% (£96.00)',
      '**Overall** - Combined illustrative annual gross return: £724.00',
    ].join(' ');
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(
        jsonResponse({
          intent: { type: 'explain_allocation' },
          explanation: markdown,
          explanationStatus: 'model',
          notice: null,
        }),
      ),
    );
    const user = userEvent.setup();
    render(<App />);

    await user.click(screen.getByRole('button', { name: 'Investment Lab' }));
    await user.type(screen.getByLabelText('Investment budget'), '10000');
    await user.type(screen.getByLabelText(SHEFFIELD), '4000');
    await user.type(screen.getByLabelText('12 Hollins Green Road, Marple'), '4000');
    await user.type(screen.getByLabelText('Robins Gate, Wavering Lane West, Gillingham'), '2000');
    await user.click(
      screen.getByRole('button', { name: 'Explain my current investment allocation.' }),
    );

    const heading = await screen.findByRole('heading', { name: 'AI explanation' });
    const block = heading.parentElement;
    if (!(block instanceof HTMLElement)) {
      throw new Error('Missing explanation block');
    }
    const paragraphs = [...block.querySelectorAll('p.break-words')].map((paragraph) => paragraph.textContent ?? '');
    expect(block.textContent).not.toContain('**');
    expect(paragraphs).toEqual([
      'Your current allocation totals £10,000.00.',
      '1. 9 Munro Court, Bartin Close, Sheffield - Allocated: £4,000.00 (40.0%) at 8.60% (£344.00)',
      '2. 12 Hollins Green Road, Marple - Allocated: £4,000.00 (40.0%) at 7.10% (£284.00)',
      '3. Robins Gate, Wavering Lane West, Gillingham - Allocated: £2,000.00 (20.0%) at 4.80% (£96.00)',
      'Overall - Combined illustrative annual gross return: £724.00',
    ]);
    expect(block.textContent).toContain('Generated text. The figures above come from the calculation.');
  });

  it('does not change a current loans investment when a preview is dismissed', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(jsonResponse(distributeIntent())));
    const user = userEvent.setup();
    render(<App />);

    await user.click(within(loanCard(SHEFFIELD)).getByRole('button', { name: 'Invest' }));
    await user.type(screen.getByLabelText('Investment amount'), '1000');
    await user.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'Invest' }));

    await user.click(screen.getByRole('button', { name: 'Investment Lab' }));
    await user.click(
      screen.getByRole('button', {
        name: 'How could I distribute my £10,000 budget across the available loans?',
      }),
    );
    await user.click(await screen.findByRole('button', { name: 'Dismiss' }));
    await user.click(screen.getByRole('button', { name: 'Current Loans' }));

    expect(within(loanCard(SHEFFIELD)).getByText('£10,959')).toBeInTheDocument();
    expect(screen.getByText('£54,723')).toBeInTheDocument();
  });
});

function distributeIntent() {
  return {
    intent: { type: 'distribute', budgetPounds: 10000, method: 'equal_whole_pounds' },
    explanation: 'This is one illustrative split of the budget.',
    explanationStatus: 'model',
    notice: null,
  };
}

function jsonResponse(body: unknown): Response {
  return {
    ok: true,
    json: async () => body,
  } as Response;
}

function loanCard(title: string): HTMLElement {
  const card = screen.getByRole('heading', { name: title }).closest('article');
  if (!(card instanceof HTMLElement)) {
    throw new Error(`No card for ${title}`);
  }
  return card;
}
