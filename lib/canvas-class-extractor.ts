/**
 * Canvas Class Extractor
 *
 * Shared between client and server: walks a layer tree and returns the unique
 * set of Tailwind class candidates that need to be compiled so the canvas
 * iframe (or the published site) can render correctly.
 *
 * Used by:
 * - lib/server/cssGenerator.ts (publish pipeline + API endpoints)
 * - hooks/use-canvas-tailwind-css.ts (live editor canvas)
 * - lib/client/thumbnail-capture.tsx (component thumbnails)
 */

import type { Layer } from '@/types';
import { DEFAULT_TEXT_STYLES } from '@/lib/text-format-utils';

/**
 * Tailwind utilities that must always be present in the compiled canvas CSS,
 * even if no layer currently uses them. These back the context menus and other
 * editor chrome that React portals into the iframe. They reference the
 * custom `@theme` tokens defined in `lib/server/canvas-tailwind-input.css`.
 */
export const CANVAS_SAFELIST_CLASSES: readonly string[] = [
  'bg-popover',
  'text-popover-foreground',
  'bg-accent',
  'text-accent-foreground',
  'text-muted-foreground',
  'text-foreground',
  'border-border',
  'text-destructive',
];

function addClassString(
  classes: Set<string>,
  value: string | string[] | undefined,
): void {
  if (!value) return;

  if (Array.isArray(value)) {
    for (const entry of value) {
      if (typeof entry !== 'string') continue;
      for (const cls of entry.split(/\s+/)) {
        const trimmed = cls.trim();
        if (trimmed) classes.add(trimmed);
      }
    }
    return;
  }

  if (typeof value === 'string') {
    for (const cls of value.split(/\s+/)) {
      const trimmed = cls.trim();
      if (trimmed) classes.add(trimmed);
    }
  }
}

/**
 * Walk a layer tree and collect every Tailwind candidate we can see.
 *
 * Deduplicates component subtrees by `componentId` so a component used many
 * times only contributes its classes once.
 */
export function extractClassesFromLayers(layers: Layer[]): Set<string> {
  const classes = new Set<string>();
  const processedComponentIds = new Set<string>();

  function processLayer(layer: Layer): void {
    if (layer.settings?.hidden) return;

    if (layer.componentId) {
      if (processedComponentIds.has(layer.componentId)) return;
      processedComponentIds.add(layer.componentId);
    }

    addClassString(classes, layer.classes);

    if (layer.textStyles) {
      for (const style of Object.values(layer.textStyles)) {
        addClassString(classes, style.classes);
      }
    }

    if (layer.variables?.text) {
      for (const style of Object.values(DEFAULT_TEXT_STYLES)) {
        addClassString(classes, style.classes);
      }
    }

    if (layer.children && Array.isArray(layer.children)) {
      for (const child of layer.children) {
        processLayer(child);
      }
    }
  }

  for (const layer of layers) {
    processLayer(layer);
  }

  return classes;
}

/**
 * Convenience: extract classes from layers and merge in the safelist used by
 * the editor iframe. Returns a sorted, deduped array, which doubles as a
 * stable hash input.
 */
export function extractCanvasCandidates(layers: Layer[]): string[] {
  const classes = extractClassesFromLayers(layers);
  for (const safelisted of CANVAS_SAFELIST_CLASSES) {
    classes.add(safelisted);
  }
  return Array.from(classes).sort();
}
