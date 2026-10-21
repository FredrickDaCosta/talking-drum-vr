import { expect, test } from '@playwright/test';

const rawBasePath = process.env.BASE_PATH ?? '/';
const normalizedBasePath = rawBasePath.startsWith('/') ? rawBasePath : `/${rawBasePath}`;
const defaultPreviewUrl = `https://localhost:4173${normalizedBasePath.endsWith('/') ? normalizedBasePath : `${normalizedBasePath}/`}`;
const targetUrl = process.env.LIVE_URL ?? defaultPreviewUrl;

const EXPECTED_VR_UNAVAILABLE_MESSAGE =
  "VR isn't available in this browser. Open this page in Meta Quest Browser, or on a desktop use the Immersive Web Emulator extension.";

function collectThirdPartyRequests(
  trackedRequests: import('@playwright/test').Request[],
  response: import('@playwright/test').Response | null,
  finalUrl: string,
): string[] {
  const finalOrigin = new URL(finalUrl).origin;
  const navRedirectChain = new Set<import('@playwright/test').Request>();
  let navHop = response?.request() ?? null;
  while (navHop) {
    navRedirectChain.add(navHop);
    navHop = navHop.redirectedFrom();
  }

  return trackedRequests
    .filter((req) => {
      const rawUrl = req.url();
      if (rawUrl.startsWith('data:') || rawUrl.startsWith('blob:')) {
        return false;
      }
      if (navRedirectChain.has(req)) {
        return false;
      }
      return new URL(rawUrl).origin !== finalOrigin;
    })
    .map((req) => req.url());
}

test.describe('Talking Drum VR — M0 Smoke & E2E Check', () => {
  test('loads cleanly with zero console errors, zero failed/404 requests, zero third-party requests, and renders Enter VR control', async ({
    page,
  }) => {
    const consoleErrors: string[] = [];
    const failedRequests: string[] = [];
    const badStatusResponses: string[] = [];
    const trackedRequests: import('@playwright/test').Request[] = [];

    page.on('console', (msg) => {
      if (msg.type() === 'error') {
        consoleErrors.push(msg.text());
      }
    });

    page.on('pageerror', (err) => {
      consoleErrors.push(err.message);
    });

    page.on('request', (request) => {
      trackedRequests.push(request);
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

    const thirdPartyRequests = collectThirdPartyRequests(trackedRequests, response, page.url());

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
    const trackedRequests: import('@playwright/test').Request[] = [];

    page.on('console', (msg) => {
      if (msg.type() === 'error') {
        consoleErrors.push(msg.text());
      }
    });
    page.on('pageerror', (err) => {
      consoleErrors.push(err.message);
    });
    page.on('request', (request) => {
      trackedRequests.push(request);
    });
    page.on('requestfailed', (request) => {
      const failure = request.failure()?.errorText ?? 'unknown';
      failedRequests.push(`${request.method()} ${request.url()} (${failure})`);
    });

    const separator = targetUrl.includes('?') ? '&' : '?';
    const flaggedUrl = `${targetUrl}${separator}xrfps=1&debug=1`;

    const response = await page.goto(flaggedUrl, { waitUntil: 'networkidle' });

    await expect(page.getByTestId('fps-overlay')).toBeVisible();
    await expect(page.getByTestId('debug-hud')).toBeVisible();

    const thirdPartyRequests = collectThirdPartyRequests(trackedRequests, response, page.url());

    expect(thirdPartyRequests).toEqual([]);
    expect(failedRequests).toEqual([]);
    expect(consoleErrors).toEqual([]);
  });

  test('shows friendly VR unavailable status message on Enter VR click in headless Chromium with zero console errors, failed requests, or third-party requests', async ({
    page,
  }) => {
    const consoleErrors: string[] = [];
    const failedRequests: string[] = [];
    const badStatusResponses: string[] = [];
    const trackedRequests: import('@playwright/test').Request[] = [];

    page.on('console', (msg) => {
      if (msg.type() === 'error') {
        consoleErrors.push(msg.text());
      }
    });
    page.on('pageerror', (err) => {
      consoleErrors.push(err.message);
    });
    page.on('request', (request) => {
      trackedRequests.push(request);
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

    const statusRegion = page.getByRole('status');
    await expect(statusRegion).toBeHidden();

    const enterVrButton = page.getByRole('button', { name: /enter vr/i });
    await enterVrButton.click();

    await expect(statusRegion).toBeVisible();
    await expect(statusRegion).toHaveText(EXPECTED_VR_UNAVAILABLE_MESSAGE);

    // Click a second time to verify re-checking support keeps the message visible and logs no errors
    await enterVrButton.click();
    await expect(statusRegion).toBeVisible();
    await expect(statusRegion).toHaveText(EXPECTED_VR_UNAVAILABLE_MESSAGE);

    const thirdPartyRequests = collectThirdPartyRequests(trackedRequests, response, page.url());

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
});
