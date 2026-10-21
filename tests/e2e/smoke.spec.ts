import { expect, test } from '@playwright/test';

const targetUrl = process.env.LIVE_URL ?? 'https://localhost:4173/talking-drum-vr/';

test.describe('Talking Drum VR — M0 Smoke & E2E Check', () => {
  test('loads cleanly with zero console errors, zero failed/404 requests, zero third-party requests, and renders Enter VR control', async ({
    page,
  }) => {
    const consoleErrors: string[] = [];
    const failedRequests: string[] = [];
    const badStatusResponses: string[] = [];
    const requestedUrls: string[] = [];

    page.on('console', (msg) => {
      if (msg.type() === 'error') {
        consoleErrors.push(msg.text());
      }
    });

    page.on('pageerror', (err) => {
      consoleErrors.push(err.message);
    });

    page.on('request', (request) => {
      requestedUrls.push(request.url());
    });

    page.on('requestfailed', (request) => {
      const failure = request.failure()?.errorText ?? 'unknown';
      failedRequests.push(`${request.method()} ${request.url()} (${failure})`);
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

    const allowedOrigins = new Set<string>([new URL(targetUrl).origin, new URL(page.url()).origin]);

    const thirdPartyRequests = requestedUrls.filter((rawUrl) => {
      if (rawUrl.startsWith('data:') || rawUrl.startsWith('blob:')) {
        return false;
      }
      const origin = new URL(rawUrl).origin;
      return !allowedOrigins.has(origin);
    });

    expect(
      thirdPartyRequests,
      `Disallowed third-party requests: ${thirdPartyRequests.join(', ')}`,
    ).toEqual([]);
    expect(badStatusResponses, `HTTP >= 400 responses: ${badStatusResponses.join(', ')}`).toEqual(
      [],
    );
    expect(failedRequests, `Failed network requests: ${failedRequests.join(', ')}`).toEqual([]);
    expect(consoleErrors, `Console/page errors: ${consoleErrors.join(' | ')}`).toEqual([]);
  });

  test('renders FPS overlay and Debug HUD stub when ?xrfps=1&debug=1 flags are present with zero errors or third-party requests', async ({
    page,
  }) => {
    const consoleErrors: string[] = [];
    const failedRequests: string[] = [];
    const requestedUrls: string[] = [];

    page.on('console', (msg) => {
      if (msg.type() === 'error') {
        consoleErrors.push(msg.text());
      }
    });
    page.on('pageerror', (err) => {
      consoleErrors.push(err.message);
    });
    page.on('request', (request) => {
      requestedUrls.push(request.url());
    });
    page.on('requestfailed', (request) => {
      const failure = request.failure()?.errorText ?? 'unknown';
      failedRequests.push(`${request.method()} ${request.url()} (${failure})`);
    });

    const separator = targetUrl.includes('?') ? '&' : '?';
    const flaggedUrl = `${targetUrl}${separator}xrfps=1&debug=1`;

    await page.goto(flaggedUrl, { waitUntil: 'networkidle' });

    await expect(page.getByTestId('fps-overlay')).toBeVisible();
    await expect(page.getByTestId('debug-hud')).toBeVisible();

    const allowedOrigins = new Set<string>([new URL(targetUrl).origin, new URL(page.url()).origin]);
    const thirdPartyRequests = requestedUrls.filter((rawUrl) => {
      if (rawUrl.startsWith('data:') || rawUrl.startsWith('blob:')) {
        return false;
      }
      return !allowedOrigins.has(new URL(rawUrl).origin);
    });

    expect(thirdPartyRequests).toEqual([]);
    expect(failedRequests).toEqual([]);
    expect(consoleErrors).toEqual([]);
  });
});
