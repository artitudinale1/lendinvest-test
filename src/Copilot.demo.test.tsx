import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import App from './App';

vi.mock('./copilotDemo', () => ({
  isStaticCopilotDemo: () => true,
}));

const SHEFFIELD = '9 Munro Court, Bartin Close, Sheffield';

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('Investment Copilot public demo', () => {
  it('answers the example questions locally and still requires Apply', async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
    const user = userEvent.setup();
    render(<App />);

    await user.click(screen.getByRole('button', { name: 'Investment Lab' }));
    expect(screen.getByText(/Public demo/)).toBeInTheDocument();
    expect(screen.getByLabelText('Model')).toHaveValue('openrouter/free');
    expect(screen.getByLabelText('Model')).toBeDisabled();

    await user.click(
      screen.getByRole('button', { name: 'Explain my current investment allocation.' }),
    );
    expect(await screen.findByRole('heading', { name: 'Calculated result' })).toBeInTheDocument();
    expect(screen.getByText(/figures above are calculated/)).toBeInTheDocument();

    await user.click(
      screen.getByRole('button', { name: 'Compare the three loans by advertised annual return.' }),
    );
    expect(screen.getByText(`${SHEFFIELD}: 8.60%`)).toBeInTheDocument();

    await user.click(
      screen.getByRole('button', { name: 'What happens if I allocate £2,000 more to the first loan?' }),
    );
    expect(await screen.findByRole('heading', { name: 'Calculated preview' })).toBeInTheDocument();
    expect(screen.getByLabelText('Investment budget')).toHaveValue('');

    await user.click(screen.getByRole('button', { name: 'Dismiss' }));
    expect(screen.queryByRole('heading', { name: 'Calculated preview' })).not.toBeInTheDocument();

    await user.click(
      screen.getByRole('button', {
        name: 'How could I distribute my £10,000 budget across the available loans?',
      }),
    );
    expect(await screen.findByText('£683.34')).toBeInTheDocument();
    expect(screen.getByLabelText('Investment budget')).toHaveValue('');
    await user.click(screen.getByRole('button', { name: 'Dismiss' }));
    expect(screen.getByLabelText('Investment budget')).toHaveValue('');

    await user.click(
      screen.getByRole('button', {
        name: 'How could I distribute my £10,000 budget across the available loans?',
      }),
    );
    await user.click(await screen.findByRole('button', { name: 'Apply preview' }));
    expect(screen.getByLabelText('Investment budget')).toHaveValue('10000');
    expect(screen.getByLabelText(SHEFFIELD)).toHaveValue('3334');

    await user.type(screen.getByLabelText('Ask about this scenario'), 'What is my return?');
    await user.click(screen.getByRole('button', { name: 'Ask' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('Investment Copilot is unavailable.');
    expect(screen.getByLabelText('Investment budget')).toHaveValue('10000');
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
