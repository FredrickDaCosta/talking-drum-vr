import { expect, test } from '@playwright/test';

const targetUrl = process.env.LIVE_URL ?? 'http://localhost:4173/talking-drum-vr/';

test.describe('Talking Drum VR — M0 Smoke & E2E Check', () => {
  test('loads cleanly with zero console errors, zero 404/failed requests, and renders Enter VR control', async ({
    page,
  }) => {
    const consoleErrors: string[] = [];
    const failedRequests: string[] = [];
    const badStatusResponses: string[] = [];

    page.on('console', (msg) => {
      if (msg.type() === 'error') {
        consoleErrors.push(msg.text());
      }
    });

    page.on('pageerror', (err) => {
      consoleErrors.push(err.message);
    });

    page.on('requestfailed', (request) => {
      // Ignore benign aborted requests during navigation teardown
      const failure = request.failure()?.errorText ?? 'unknown';
      if (!failure.includes('net::ERR_ABORTED')) {
        failedRequests.push(`${request.method()} ${request.url()} (${failure})`);
      }
    });

    page.on('response', (response) => {
      if (response.status() >= 400) {
        badStatusResponses.push(`${response.status()} ${response.url()}`);
      }
    });

    const response = await page.goto(targetUrl, { waitUntil: 'networkidle' });
    expect(response?.status()).toBeLessThan(400);

    await expect(page).toHaveTitle(/Talking Drum VR/i);

    const enterVrButton = page.getByRole('button', { name: /enter vr/i });
    await expect(enterVrButton).toBeVisible();

    expect(badStatusResponses, `HTTP >= 400 responses: ${badStatusResponses.join(', ')}`).toEqual(
      [],
    );
    expect(failedRequests, `Failed network requests: ${failedRequests.join(', ')}`).toEqual([]);
    expect(consoleErrors, `Console/page errors: ${consoleErrors.join(' | ')}`).toEqual([]);
  });

  test('renders FPS overlay and Debug HUD stub when ?xrfps=1&debug=1 flags are present', async ({
    page,
  }) => {
    const separator = targetUrl.includes('?') ? '&' : '?';
    const flaggedUrl = `${targetUrl}${separator}xrfps=1&debug=1`;

    await page.goto(flaggedUrl, { waitUntil: 'networkidle' });

    await expect(page.getByTestId('fps-overlay')).toBeVisible();
    await expect(page.getByTestId('debug-hud')).toBeVisible();
  });
});
