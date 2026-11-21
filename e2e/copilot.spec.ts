import { expect, test, type Page, type Route } from '@playwright/test';

const BLOCKED_HOSTS = [
  'openrouter.ai',
  'api.openai.com',
  'challenges.cloudflare.com',
  'workers.dev',
];

const EXPLANATION_FALLBACK =
  'The calculated figures are shown above. An explanation could not be verified, so it is not shown.';

const FIRST_LOAN = '9 Munro Court, Bartin Close, Sheffield';
const SECOND_LOAN = '12 Hollins Green Road, Marple';
const THIRD_LOAN = 'Robins Gate, Wavering Lane West, Gillingham';

let blocked: string[] = [];

test.beforeEach(async ({ page }) => {
  blocked = [];
  await page.route('**/*', async (route) => {
    const url = route.request().url();
    if (BLOCKED_HOSTS.some((host) => url.includes(host))) {
      blocked.push(url);
      await route.abort('blockedbyclient');
      return;
    }
    if (!isLocal(url)) {
      await route.abort('blockedbyclient');
      return;
    }
    await route.continue();
  });
  await page.goto('./');
  await page.getByRole('button', { name: 'Investment Lab' }).click();
  await expect(page.getByRole('heading', { level: 1, name: 'Investment Lab' })).toBeVisible();
});

test.afterEach(() => {
  expect(blocked, 'blocked external AI or verification calls').toEqual([]);
});

test('serves the InvestLab favicon under the Pages base path', async ({ page }) => {
  const href = await page.locator('link[rel="icon"]').getAttribute('href');
  expect(href).toBe('/lendinvest-test/favicon.svg');
  const response = await page.request.get(new URL(href ?? '', page.url()).toString());
  expect(response.status()).toBe(200);
  expect(response.headers()['content-type']).toContain('image/svg+xml');
  expect(await response.text()).toContain('<svg');
});

test('sends the selected free model with the scenario payload', async ({ page }) => {
  let payload: Record<string, unknown> | null = null;
  await mockCopilot(page, async (route) => {
    payload = route.request().postDataJSON() as Record<string, unknown>;
    await fulfill(route, 200, {
      intent: { type: 'explain_allocation' },
      explanation: 'The illustrative annual gross return is £724.00.',
      explanationStatus: 'model',
      notice: null,
    });
  });

  await page.getByLabel('Investment budget').fill('10000');
  await page.getByLabel(FIRST_LOAN).fill('4000');
  await page.getByLabel(SECOND_LOAN).fill('4000');
  await page.getByLabel(THIRD_LOAN).fill('2000');
  const model = page.getByLabel('Model');
  await expect(model).toHaveValue('openrouter/free');
  await expect(model.getByRole('option')).toHaveText([
    'Automatic (free)',
    'Nemotron 3.5 Super',
    'Particle-1',
  ]);
  await model.selectOption('particle-ai/particle-1:free');
  await page.getByLabel('Ask about this scenario').fill('Explain my current investment allocation.');
  await page.getByRole('button', { name: 'Ask' }).click();

  await expect(page.getByRole('heading', { name: 'AI explanation' })).toBeVisible();
  await expect(page.getByText('The illustrative annual gross return is £724.00.')).toBeVisible();
  expect(payload).toMatchObject({
    question: 'Explain my current investment allocation.',
    budget: '10000',
    model: 'particle-ai/particle-1:free',
    allocations: { '1': '4000', '5': '4000', '12': '2000' },
  });
  expect(payload).not.toHaveProperty('turnstileToken');
});

test('applies a distribution preview and can dismiss another preview', async ({ page }) => {
  await mockCopilot(page, (route) =>
    fulfill(route, 200, {
      intent: { type: 'distribute', budgetPounds: 10000, method: 'equal_whole_pounds' },
      explanation: null,
      explanationStatus: 'fallback',
      notice: null,
    }),
  );

  await page.getByLabel('Ask about this scenario').fill('How should this budget be split?');
  await page.getByRole('button', { name: 'Ask' }).click();
  await expect(page.getByRole('heading', { name: 'Proposed scenario' })).toBeVisible();
  await page.getByRole('button', { name: 'Apply preview' }).click();

  await expect(page.getByRole('heading', { name: 'Proposed scenario' })).toHaveCount(0);
  await expect(page.getByLabel('Investment budget')).toHaveValue('10000');
  await expect(page.getByLabel(FIRST_LOAN)).toHaveValue('3334');
  await expect(page.getByLabel(SECOND_LOAN)).toHaveValue('3333');
  await expect(page.getByLabel(THIRD_LOAN)).toHaveValue('3333');

  await page.getByRole('button', { name: 'Ask' }).click();
  await expect(page.getByRole('heading', { name: 'Proposed scenario' })).toBeVisible();
  await page.getByRole('button', { name: 'Dismiss' }).click();
  await expect(page.getByRole('heading', { name: 'Proposed scenario' })).toHaveCount(0);
  await expect(page.getByLabel('Investment budget')).toHaveValue('10000');
});

test('shows an over-budget preview without treating it as advice', async ({ page }) => {
  await mockCopilot(page, (route) =>
    fulfill(route, 200, {
      intent: { type: 'adjust', loanRef: 'first', deltaPounds: 2000 },
      explanation: null,
      explanationStatus: 'unavailable',
      notice: null,
    }),
  );

  await page.getByLabel('Investment budget').fill('1000');
  await page.getByLabel('Ask about this scenario').fill('Add two thousand to the first loan.');
  await page.getByRole('button', { name: 'Ask' }).click();

  const preview = page.getByRole('heading', { name: 'Proposed scenario' });
  await expect(preview).toBeVisible();
  await expect(page.getByText('Over budget by £1,000.00.')).toBeVisible();
  await expect(page.getByText('This scenario is not a valid investment recommendation.')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Apply preview' })).toBeEnabled();
});

test('shows fallback, verification, rate-limit, and unavailable states', async ({ page }) => {
  await page.getByLabel('Investment budget').fill('10000');
  await page.getByLabel(FIRST_LOAN).fill('4000');
  await page.getByLabel(SECOND_LOAN).fill('4000');
  await page.getByLabel(THIRD_LOAN).fill('2000');

  await mockCopilot(page, (route) =>
    fulfill(route, 200, {
      intent: { type: 'explain_allocation' },
      explanation: 'The return is £724.00 plus £9,999.00.',
      explanationStatus: 'fallback',
      notice: EXPLANATION_FALLBACK,
    }),
  );
  await ask(page, 'Explain the figures.');
  await expect(page.getByText(EXPLANATION_FALLBACK)).toBeVisible();
  await expect(page.getByText('£9,999.00')).toHaveCount(0);
  await page.unroute('**/api/copilot');

  await mockCopilot(page, (route) =>
    fulfill(route, 403, { error: 'The verification check failed. Please try again.' }),
  );
  await ask(page, 'Try again after verification.');
  await expect(page.getByRole('alert')).toHaveText(
    'Investment Copilot could not accept that question. Please try again.',
  );
  await page.unroute('**/api/copilot');

  await mockCopilot(page, (route) =>
    fulfill(route, 429, { error: 'The daily Copilot limit has been reached. Please try again tomorrow.' }),
  );
  await ask(page, 'One more question.');
  await expect(page.getByRole('alert')).toHaveText(
    'The daily Copilot limit has been reached. Please try again tomorrow.',
  );
  await page.unroute('**/api/copilot');

  await page.route('**/api/copilot', (route) => route.abort('failed'));
  await ask(page, 'Ask while the service is down.');
  await expect(page.getByRole('alert')).toHaveText('Investment Copilot is unavailable.');
});

test('keeps the model control usable and the page within the viewport', async ({ page }, testInfo) => {
  const model = page.getByLabel('Model');
  await expect(model).toBeVisible();
  await expect(model).toBeEnabled();
  const box = await model.boundingBox();
  const viewport = page.viewportSize();
  expect(box).not.toBeNull();
  expect(viewport).not.toBeNull();
  if (testInfo.project.name === 'mobile-chrome') {
    expect(box!.width).toBeGreaterThan(viewport!.width * 0.8);
  } else {
    expect(box!.width).toBeGreaterThan(500);
  }
  const overflow = await page.evaluate(() => {
    const root = document.documentElement;
    return root.scrollWidth - root.clientWidth;
  });
  expect(overflow).toBeLessThanOrEqual(1);
  await expect(page.getByRole('navigation', { name: 'Primary' })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Investment Copilot' })).toBeVisible();
});

async function ask(page: Page, question: string) {
  await page.getByLabel('Ask about this scenario').fill(question);
  await page.getByRole('button', { name: 'Ask' }).click();
}

async function mockCopilot(page: Page, handle: (route: Route) => Promise<void>) {
  await page.route('**/api/copilot', handle);
}

function fulfill(route: Route, status: number, body: unknown) {
  return route.fulfill({
    status,
    contentType: 'application/json',
    body: JSON.stringify(body),
  });
}

function isLocal(url: string): boolean {
  return url.startsWith('http://127.0.0.1') || url.startsWith('http://localhost');
}
