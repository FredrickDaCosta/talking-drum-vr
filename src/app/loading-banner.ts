export const LOADING_ERROR_MESSAGE = 'Could not start Talking Drum VR. Please reload the page.';

/** The subset of HTMLElement the banner lifecycle needs (keeps it unit-testable without a DOM). */
export interface LoadingBannerElement {
  textContent: string | null;
  hidden: boolean;
  readonly dataset: Record<string, string | undefined>;
  remove(): void;
}

/**
 * Drives the static `#app-loading-banner` from index.html: it is visible at first paint without
 * waiting for JS, removed once `startup` resolves, and switched to a plain error message if
 * `startup` rejects. The rejection is handled here, so it never becomes an unhandled rejection.
 */
export async function trackStartupWithBanner<T>(
  startup: Promise<T>,
  banner: LoadingBannerElement | null,
  logError: (message: string, error: unknown) => void = (message, error) =>
    console.error(message, error),
): Promise<T | undefined> {
  try {
    const result = await startup;
    banner?.remove();
    return result;
  } catch (error: unknown) {
    logError('[Startup] Talking Drum VR failed to start:', error);
    if (banner !== null) {
      banner.textContent = LOADING_ERROR_MESSAGE;
      banner.dataset.state = 'error';
      banner.hidden = false;
    }
    return undefined;
  }
}
