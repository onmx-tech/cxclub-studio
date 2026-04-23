/**
 * Client-Side CSS Generator
 *
 * Thin wrapper around the server CSS pipeline. The previous implementation
 * ran Tailwind's browser CDN JIT inside a hidden iframe to compile CSS for
 * publishing; that's now replaced with a single call to the existing
 * `POST /ycode/api/css/generate` endpoint, which runs the same Node
 * compiler used by the canvas.
 */

'use client';

/**
 * Regenerate the draft CSS on the server using the current draft layers in
 * the database, save it to the `draft_css` setting, and return the compiled
 * CSS string.
 *
 * The `layers` argument is ignored — it's kept to preserve existing call
 * sites while the server reads drafts authoritatively from the DB. Callers
 * can pass anything (or nothing) without changing behavior.
 */
export async function generateAndSaveCSS(_layers?: unknown): Promise<string> {
  const response = await fetch('/ycode/api/css/generate', {
    method: 'POST',
  });

  if (!response.ok) {
    const message = await response.text().catch(() => response.statusText);
    throw new Error(`Failed to generate CSS: ${message}`);
  }

  const payload = (await response.json().catch(() => null)) as
    | { data?: { css?: string; length?: number; message?: string } }
    | null;

  const css = payload?.data?.css ?? '';

  // Keep the settings store in sync so UI reading draft_css reflects the
  // latest value without an extra fetch.
  try {
    const { useSettingsStore } = await import('@/stores/useSettingsStore');
    useSettingsStore.getState().updateSetting('draft_css', css);
  } catch {
    // Non-fatal: settings store update is a convenience, not a correctness
    // requirement.
  }

  return css;
}

/**
 * Save raw CSS to a settings key. Retained for any callers that already have
 * CSS in hand (e.g. published_css after publish).
 */
export async function saveCSS(css: string, key: 'draft_css' | 'published_css'): Promise<void> {
  const response = await fetch(`/ycode/api/settings/${key}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ value: css }),
  });

  if (!response.ok) {
    throw new Error(`Failed to save CSS: ${response.statusText}`);
  }

  const { useSettingsStore } = await import('@/stores/useSettingsStore');
  useSettingsStore.getState().updateSetting(key, css);
}
