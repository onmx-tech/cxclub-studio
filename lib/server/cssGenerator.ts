/**
 * Server-Side CSS Generator using Tailwind CSS Node API
 *
 * Compiles the Tailwind utility CSS that powers both the editor canvas and
 * the published sites. The compiler instance is expensive to create but cheap
 * to invoke, so we cache a single instance for the lifetime of the Node
 * process.
 *
 * Consumers:
 * - The canvas endpoint (app/(builder)/ycode/api/canvas/css/route.ts) calls
 *   `compileCanvasCss` with the exact set of classes used by the current
 *   draft, so the editor iframe never runs Tailwind JIT in the browser.
 * - The publish pipeline calls `generateAndSaveDraftCSS` to regenerate the
 *   `draft_css` setting whenever layers change outside the browser editor
 *   (MCP tools, API-driven changes, etc.).
 */

import { readFile } from 'node:fs/promises';
import { join, dirname } from 'node:path';
import { compile } from 'tailwindcss';
import type { Layer, Component } from '@/types';
import { extractClassesFromLayers, CANVAS_SAFELIST_CLASSES } from '@/lib/canvas-class-extractor';
import { getAllDraftLayers } from '@/lib/repositories/pageLayersRepository';
import { getAllComponents } from '@/lib/repositories/componentRepository';
import { setSetting } from '@/lib/repositories/settingsRepository';

let compilerCache: { build: (candidates: string[]) => string } | null = null;
let compilerPromise: Promise<{ build: (candidates: string[]) => string }> | null = null;

/**
 * Get or create a cached Tailwind compiler instance. The compiler is reused
 * for every subsequent `compileCanvasCss` / `generateAndSaveDraftCSS` call.
 *
 * The input stylesheet is Tailwind's own `index.css` concatenated with
 * `canvas-tailwind-input.css`, which adds the editor's custom variants and
 * `@theme` tokens on top of Tailwind's defaults.
 */
async function getCompiler(): Promise<{ build: (candidates: string[]) => string }> {
  if (compilerCache) return compilerCache;

  if (!compilerPromise) {
    compilerPromise = (async () => {
      const twPath = join(process.cwd(), 'node_modules/tailwindcss/index.css');
      const canvasInputPath = join(process.cwd(), 'lib/server/canvas-tailwind-input.css');

      const [tailwindCss, canvasAdditions] = await Promise.all([
        readFile(twPath, 'utf-8'),
        readFile(canvasInputPath, 'utf-8'),
      ]);

      const input = `${tailwindCss}\n${canvasAdditions}`;

      const compiler = await compile(input, {
        base: process.cwd(),
        async loadStylesheet(id: string, base: string) {
          const fullPath = join(dirname(base), id);
          const content = await readFile(fullPath, 'utf-8');
          return { path: fullPath, content, base: dirname(fullPath) };
        },
      });

      compilerCache = compiler;
      return compiler;
    })().catch((error) => {
      // Reset so the next caller can retry instead of getting a rejected promise forever
      compilerPromise = null;
      throw error;
    });
  }

  return compilerPromise;
}

/**
 * Compile a CSS bundle for the given Tailwind candidate classes.
 *
 * Always includes the editor's safelist so context menus and other chrome
 * portaled into the canvas iframe continue to render even when no user layer
 * references those utilities.
 */
export async function compileCanvasCss(classNames: string[]): Promise<string> {
  const compiler = await getCompiler();
  const candidates = new Set<string>(classNames);
  for (const safelisted of CANVAS_SAFELIST_CLASSES) {
    candidates.add(safelisted);
  }
  return compiler.build(Array.from(candidates));
}

/**
 * Generate CSS from all draft layers and component layers,
 * then save it to the draft_css setting.
 */
export async function generateAndSaveDraftCSS(): Promise<string> {
  const allLayers: Layer[] = [];

  const draftPageLayers = await getAllDraftLayers();
  for (const pl of draftPageLayers) {
    if (pl.layers && Array.isArray(pl.layers)) {
      allLayers.push(...pl.layers);
    }
  }

  const components: Component[] = await getAllComponents(false);
  for (const component of components) {
    if (component.layers && Array.isArray(component.layers)) {
      allLayers.push(...component.layers);
    }
  }

  const classes = extractClassesFromLayers(allLayers);
  const css = await compileCanvasCss(Array.from(classes));

  await setSetting('draft_css', css);

  return css;
}
