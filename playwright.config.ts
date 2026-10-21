import { defineConfig, devices } from '@playwright/test';

const isLive = Boolean(process.env.LIVE_URL);
const rawBasePath = process.env.BASE_PATH ?? '/';
const normalizedBasePath = rawBasePath.startsWith('/') ? rawBasePath : `/${rawBasePath}`;
const defaultPreviewUrl = `https://localhost:4173${normalizedBasePath.endsWith('/') ? normalizedBasePath : `${normalizedBasePath}/`}`;

export default defineConfig({
  testDir: './tests/e2e',
  fullyParallel: true,
  forbidOnly: Boolean(process.env.CI),
  retries: process.env.CI ? 1 : 0,
  workers: process.env.CI ? 1 : undefined,
  reporter: 'list',
  use: {
    baseURL: process.env.LIVE_URL ?? defaultPreviewUrl,
    ignoreHTTPSErrors: !isLive,
    trace: 'off',
    video: 'off',
    screenshot: 'off',
  },
  projects: [
    {
      name: 'chromium',
      use: {
        ...devices['Desktop Chrome'],
        launchOptions: {
          args: [
            '--use-gl=angle',
            '--use-angle=swiftshader',
            '--enable-webgl',
            '--ignore-certificate-errors',
          ],
        },
      },
    },
  ],
  webServer: isLive
    ? undefined
    : {
        command: 'npm run preview -- --host 0.0.0.0 --port 4173',
        url: defaultPreviewUrl,
        ignoreHTTPSErrors: true,
        reuseExistingServer: !process.env.CI,
        timeout: 60_000,
      },
});
