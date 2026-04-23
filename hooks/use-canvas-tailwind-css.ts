'use client';

/**
 * useCanvasTailwindCss
 *
 * Replaces the Tailwind browser CDN JIT that used to live inside the canvas
 * iframe. Walks the layer tree for the classes we need, POSTs them to
 * `/ycode/api/canvas/css`, and swaps the resulting CSS into a single
 * `<link id="ycode-tw-css">` element inside the iframe head via a Blob URL.
 *
 * To avoid a flash of unstyled content on the first paint, the iframe body
 * starts with `data-tw-pending` (see lib/canvas-utils.ts) which hides it via
 * CSS; this hook removes the attribute once the first stylesheet has loaded.
 *
 * Subsequent edits are debounced so rapid typing coalesces into a single
 * request, and the resulting Blob URLs are cached in-memory by hash so
 * flipping between pages or breakpoints with identical class sets is instant.
 */

import { useEffect, useRef } from 'react';

import type { Layer } from '@/types';
import { extractCanvasCandidates } from '@/lib/canvas-class-extractor';
import { compileArbitraryClasses } from '@/lib/client/arbitrary-value-compiler';

const LINK_ELEMENT_ID = 'ycode-tw-css';
const LIVE_STYLE_ID = 'ycode-tw-live';
const PENDING_ATTR = 'data-tw-pending';
const DEBOUNCE_MS = 150;
/** Fallback reveal timeout — in case the link `load` event never fires. */
const REVEAL_FALLBACK_MS = 3000;
const CACHE_MAX_ENTRIES = 16;

/** djb2 string hash — deterministic, collision-safe enough for a cache key. */
function hashCandidates(candidates: readonly string[]): string {
  let hash = 5381;
  for (const cls of candidates) {
    for (let i = 0; i < cls.length; i++) {
      hash = ((hash << 5) + hash + cls.charCodeAt(i)) | 0;
    }
    hash = ((hash << 5) + hash + 32) | 0;
  }
  return (hash >>> 0).toString(36) + ':' + candidates.length.toString(36);
}

/**
 * Module-level LRU cache of `hash -> blob URL`. Shared across all hook
 * instances so remounting the canvas (page switch, breakpoint change, etc.)
 * reuses compiled CSS when the underlying class set is unchanged.
 */
const blobUrlCache = new Map<string, string>();

function cacheSet(key: string, url: string): void {
  if (blobUrlCache.has(key)) {
    blobUrlCache.delete(key);
  } else if (blobUrlCache.size >= CACHE_MAX_ENTRIES) {
    const oldestKey = blobUrlCache.keys().next().value;
    if (oldestKey !== undefined) {
      const oldestUrl = blobUrlCache.get(oldestKey);
      if (oldestUrl) URL.revokeObjectURL(oldestUrl);
      blobUrlCache.delete(oldestKey);
    }
  }
  blobUrlCache.set(key, url);
}

function cacheGet(key: string): string | undefined {
  const url = blobUrlCache.get(key);
  if (url) {
    // Promote to most-recently-used
    blobUrlCache.delete(key);
    blobUrlCache.set(key, url);
  }
  return url;
}

function ensureLinkElement(iframeDoc: Document): HTMLLinkElement {
  let link = iframeDoc.getElementById(LINK_ELEMENT_ID) as HTMLLinkElement | null;
  if (!link) {
    link = iframeDoc.createElement('link');
    link.id = LINK_ELEMENT_ID;
    link.rel = 'stylesheet';
    iframeDoc.head.appendChild(link);
  }
  return link;
}

/**
 * Ensure there's a `<style id="ycode-tw-live">` element positioned *after* the
 * canonical stylesheet link so its rules win source-order ties while the
 * server-compiled CSS catches up.
 */
function ensureLiveStyleElement(iframeDoc: Document): HTMLStyleElement {
  let style = iframeDoc.getElementById(LIVE_STYLE_ID) as HTMLStyleElement | null;
  if (!style) {
    style = iframeDoc.createElement('style');
    style.id = LIVE_STYLE_ID;
    const link = iframeDoc.getElementById(LINK_ELEMENT_ID);
    if (link?.parentNode) {
      link.parentNode.insertBefore(style, link.nextSibling);
    } else {
      iframeDoc.head.appendChild(style);
    }
  }
  return style;
}

/**
 * Rebuild the live-style overlay from the current candidate set. Using the
 * full candidate list (rather than just newly-added classes) keeps the
 * overlay bounded — it only ever contains utilities currently in use.
 */
function updateLiveStyle(iframeDoc: Document, candidates: readonly string[]): void {
  const css = compileArbitraryClasses(candidates);
  const style = ensureLiveStyleElement(iframeDoc);
  if (style.textContent !== css) style.textContent = css;
}

function revealBody(iframeDoc: Document): void {
  iframeDoc.body?.removeAttribute(PENDING_ATTR);
}

/**
 * Apply a Blob URL to the iframe's stylesheet link and schedule the body
 * reveal once the browser has loaded and applied the stylesheet. A fallback
 * timer ensures we never leave the canvas hidden if the `load` event never
 * fires for some reason.
 */
function applyStylesheet(iframeDoc: Document, url: string): void {
  const link = ensureLinkElement(iframeDoc);

  // If the href hasn't changed, the load event won't refire — reveal now.
  if (link.href === url) {
    revealBody(iframeDoc);
    return;
  }

  const reveal = () => revealBody(iframeDoc);

  const fallback = setTimeout(reveal, REVEAL_FALLBACK_MS);
  link.addEventListener(
    'load',
    () => {
      clearTimeout(fallback);
      reveal();
    },
    { once: true },
  );
  link.addEventListener(
    'error',
    () => {
      clearTimeout(fallback);
      reveal();
    },
    { once: true },
  );

  link.href = url;
}

export function useCanvasTailwindCss(
  iframeDoc: Document | null,
  layers: Layer[],
  componentLayers: Layer[],
): void {
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const lastHashRef = useRef<string | null>(null);
  const abortRef = useRef<AbortController | null>(null);

  useEffect(() => {
    if (!iframeDoc) return;

    const combined = componentLayers.length > 0 ? [...layers, ...componentLayers] : layers;
    const candidates = extractCanvasCandidates(combined);
    const hash = hashCandidates(candidates);

    if (hash === lastHashRef.current) return;

    // Instant fast path: compile arbitrary-value utilities in the browser so
    // interactive edits (color picker drag, numeric sliders) update on the
    // next frame while the canonical server-compiled stylesheet catches up.
    // The overlay is rebuilt from the current candidate set each tick so it
    // never grows beyond what's actually on the canvas.
    updateLiveStyle(iframeDoc, candidates);

    // Fast path: cached blob URL for this exact class set
    const cached = cacheGet(hash);
    if (cached) {
      applyStylesheet(iframeDoc, cached);
      lastHashRef.current = hash;
      return;
    }

    // Slow path: compile on the server. Skip the debounce on the very first
    // fetch so the user never sees a flash of unstyled layers.
    const isFirstLoad = lastHashRef.current === null;

    if (timeoutRef.current) clearTimeout(timeoutRef.current);
    if (abortRef.current) abortRef.current.abort();

    const controller = new AbortController();
    abortRef.current = controller;

    const runFetch = async () => {
      try {
        const response = await fetch('/ycode/api/canvas/css', {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ classes: candidates }),
          signal: controller.signal,
        });

        if (!response.ok) {
          throw new Error(`canvas css endpoint returned ${response.status}`);
        }

        const css = await response.text();

        // Bail if another edit already superseded this request or the iframe
        // document is gone (e.g. page navigation).
        if (controller.signal.aborted) return;
        if (!iframeDoc.documentElement) return;

        const blob = new Blob([css], { type: 'text/css' });
        const url = URL.createObjectURL(blob);
        cacheSet(hash, url);

        applyStylesheet(iframeDoc, url);
        lastHashRef.current = hash;
      } catch (error) {
        if ((error as { name?: string }).name === 'AbortError') return;
        console.error('[canvas-css] Failed to load canvas Tailwind CSS:', error);
        // Never leave the canvas hidden on error.
        revealBody(iframeDoc);
      }
    };

    if (isFirstLoad) {
      runFetch();
    } else {
      timeoutRef.current = setTimeout(runFetch, DEBOUNCE_MS);
    }

    return () => {
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current);
        timeoutRef.current = null;
      }
      controller.abort();
    };
  }, [iframeDoc, layers, componentLayers]);

  useEffect(() => {
    return () => {
      if (timeoutRef.current) clearTimeout(timeoutRef.current);
      if (abortRef.current) abortRef.current.abort();
    };
  }, []);
}
