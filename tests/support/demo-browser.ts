import type { Page } from 'playwright-core';

/**
 * Puts a browser page's context in demo operator mode through the real,
 * origin-checked action (`POST /demo/operator`), as the start screen's
 * "Continue as the demo operator" does. The page's context shares its cookie
 * jar with `page.request`.
 */
export async function enterOperatorMode(page: Page, base: string): Promise<void> {
  const res = await page.request.post(`${base}/demo/operator`, { headers: { origin: base } });
  if (res.status() !== 200) throw new Error(`operator mode refused: ${res.status()}`);
}
