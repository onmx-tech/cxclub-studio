'use client';

/**
 * Arbitrary-value Tailwind fast path
 *
 * Compiles a targeted subset of Tailwind utilities with arbitrary values
 * (e.g. `text-[#FF0000]`, `w-[137px]`, `p-[24px]`, `max-md:bg-[#00FF00]`) into
 * CSS directly in the browser so interactive edits (color picker drag, numeric
 * sliders) get pixel-perfect feedback on the next frame.
 *
 * The canonical Tailwind stylesheet is still compiled on the server — this
 * module only produces a short-lived overlay so users don't wait on the
 * debounce + network roundtrip for rules that are trivial to derive.
 *
 * Classes we can't confidently compile (unknown utility prefix, unexpected
 * variant, arbitrary URL values, etc.) are silently skipped; the server will
 * fill them in a moment later.
 */
// ============================================================================
// Utility prefix tables
// ============================================================================

/** Prefixes that accept an arbitrary color value. */
const COLOR_UTILITIES: Record<string, string | readonly string[]> = {
  text: 'color',
  bg: 'background-color',
  border: 'border-color',
  'border-t': 'border-top-color',
  'border-r': 'border-right-color',
  'border-b': 'border-bottom-color',
  'border-l': 'border-left-color',
  'border-x': ['border-left-color', 'border-right-color'],
  'border-y': ['border-top-color', 'border-bottom-color'],
  outline: 'outline-color',
  decoration: 'text-decoration-color',
  fill: 'fill',
  stroke: 'stroke',
  caret: 'caret-color',
  accent: 'accent-color',
};

/** Prefixes that accept an arbitrary length/number value. */
const LENGTH_UTILITIES: Record<string, string | readonly string[]> = {
  w: 'width',
  h: 'height',
  'min-w': 'min-width',
  'min-h': 'min-height',
  'max-w': 'max-width',
  'max-h': 'max-height',
  p: 'padding',
  px: ['padding-left', 'padding-right'],
  py: ['padding-top', 'padding-bottom'],
  pt: 'padding-top',
  pr: 'padding-right',
  pb: 'padding-bottom',
  pl: 'padding-left',
  m: 'margin',
  mx: ['margin-left', 'margin-right'],
  my: ['margin-top', 'margin-bottom'],
  mt: 'margin-top',
  mr: 'margin-right',
  mb: 'margin-bottom',
  ml: 'margin-left',
  gap: 'gap',
  'gap-x': 'column-gap',
  'gap-y': 'row-gap',
  rounded: 'border-radius',
  'rounded-t': ['border-top-left-radius', 'border-top-right-radius'],
  'rounded-r': ['border-top-right-radius', 'border-bottom-right-radius'],
  'rounded-b': ['border-bottom-left-radius', 'border-bottom-right-radius'],
  'rounded-l': ['border-top-left-radius', 'border-bottom-left-radius'],
  'rounded-tl': 'border-top-left-radius',
  'rounded-tr': 'border-top-right-radius',
  'rounded-br': 'border-bottom-right-radius',
  'rounded-bl': 'border-bottom-left-radius',
  top: 'top',
  right: 'right',
  bottom: 'bottom',
  left: 'left',
  inset: 'inset',
  'inset-x': ['left', 'right'],
  'inset-y': ['top', 'bottom'],
  leading: 'line-height',
  tracking: 'letter-spacing',
  'border-width': 'border-width',
  'border-t-width': 'border-top-width',
  'border-r-width': 'border-right-width',
  'border-b-width': 'border-bottom-width',
  'border-l-width': 'border-left-width',
};

/** Prefixes whose arbitrary value is a plain number (no unit). */
const NUMBER_UTILITIES: Record<string, string> = {
  z: 'z-index',
  opacity: 'opacity',
  'font-weight': 'font-weight',
  order: 'order',
  'flex-grow': 'flex-grow',
  'flex-shrink': 'flex-shrink',
};

/** `font-[...]` is special: number → font-weight, otherwise font-family. */
const FONT_UTILITY_PREFIX = 'font';

// ============================================================================
// Variant handling
// ============================================================================

type SelectorPiece = { append: string };
type MediaPiece = { media: string };
type Variant = SelectorPiece | MediaPiece;

/** Supported breakpoint variants (mirrors lib/breakpoint-utils.ts). */
const BREAKPOINT_VARIANTS: Record<string, string> = {
  'max-md': '(max-width: 767px)',
  'max-lg': '(max-width: 1023px)',
  sm: '(min-width: 640px)',
  md: '(min-width: 768px)',
  lg: '(min-width: 1024px)',
  xl: '(min-width: 1280px)',
  '2xl': '(min-width: 1536px)',
};

/** Supported pseudo-class variants. */
const PSEUDO_VARIANTS: Record<string, string> = {
  hover: ':hover',
  focus: ':focus',
  'focus-visible': ':focus-visible',
  'focus-within': ':focus-within',
  active: ':active',
  visited: ':visited',
  checked: ':checked',
  disabled: ':is(:disabled, [aria-disabled])',
  // Custom variant defined in lib/server/canvas-tailwind-input.css
  current: '[aria-current]',
  first: ':first-child',
  last: ':last-child',
  odd: ':nth-child(odd)',
  even: ':nth-child(even)',
  empty: ':empty',
  'placeholder-shown': ':placeholder-shown',
};

function classifyVariant(token: string): Variant | null {
  const media = BREAKPOINT_VARIANTS[token];
  if (media) return { media };

  const pseudo = PSEUDO_VARIANTS[token];
  if (pseudo) return { append: pseudo };

  return null;
}

// ============================================================================
// Parsing
// ============================================================================

/**
 * Split a class name into variant tokens and the trailing utility.
 * Respects brackets so `text-[rgb(0,0,0)]` isn't split on its internal colons.
 */
function splitVariantsAndUtility(className: string): {
  variants: string[];
  utility: string;
} {
  const variants: string[] = [];
  let start = 0;
  let bracketDepth = 0;
  let parenDepth = 0;

  for (let i = 0; i < className.length; i++) {
    const ch = className[i];
    if (ch === '[') bracketDepth++;
    else if (ch === ']') bracketDepth--;
    else if (ch === '(') parenDepth++;
    else if (ch === ')') parenDepth--;
    else if (ch === ':' && bracketDepth === 0 && parenDepth === 0) {
      variants.push(className.slice(start, i));
      start = i + 1;
    }
  }

  return { variants, utility: className.slice(start) };
}

const ARBITRARY_UTILITY_RE = /^(.+?)-\[(.+)\](?:\/(\d+(?:\.\d+)?))?$/;

function parseArbitraryUtility(
  utility: string,
): { prefix: string; value: string; opacity: string | null } | null {
  const match = ARBITRARY_UTILITY_RE.exec(utility);
  if (!match) return null;
  const [, prefix, rawValue, opacity] = match;
  return { prefix, value: rawValue, opacity: opacity ?? null };
}

// ============================================================================
// Value classification
// ============================================================================

function looksLikeColor(value: string): boolean {
  if (value.startsWith('#')) return true;
  if (/^[0-9A-Fa-f]{3}$/.test(value)) return true;
  if (/^[0-9A-Fa-f]{6}$/.test(value)) return true;
  if (/^[0-9A-Fa-f]{8}$/.test(value)) return true;
  if (/^(rgb|rgba|hsl|hsla|oklch|oklab|lab|lch|color)\s*\(/i.test(value)) return true;
  if (/^(transparent|currentColor|inherit|initial|unset)$/i.test(value)) return true;
  if (value.startsWith('color:')) return true;
  return false;
}

function looksLikeLength(value: string): boolean {
  if (/^-?\d+(?:\.\d+)?(px|rem|em|%|vh|vw|svh|svw|dvh|dvw|lvh|lvw|ch|ex|cm|mm|in|pt|pc)$/i.test(
    value,
  )) {
    return true;
  }
  if (value === '0' || value === 'auto') return true;
  if (/^-?\d+(?:\.\d+)?$/.test(value)) return true; // bare number → unitless length
  if (/^calc\(/i.test(value)) return true;
  if (/^var\(/i.test(value)) return true;
  return false;
}

function normalizeColorValue(value: string): string {
  if (value.startsWith('color:')) return value.slice('color:'.length);
  if (/^[0-9A-Fa-f]{3}$/.test(value)) return `#${value}`;
  if (/^[0-9A-Fa-f]{6}$/.test(value)) return `#${value}`;
  if (/^[0-9A-Fa-f]{8}$/.test(value)) return `#${value}`;
  return value;
}

/**
 * Apply an opacity modifier (0-100) to a color value using `color-mix`, which
 * matches what Tailwind 4 produces for `text-[#f00]/50` and friends.
 */
function applyOpacityModifier(color: string, opacityPercent: string): string {
  return `color-mix(in oklab, ${color} ${opacityPercent}%, transparent)`;
}

// ============================================================================
// Declaration generation
// ============================================================================

type Declarations = Array<[string, string]>;

function mapColorDeclarations(
  prefix: string,
  value: string,
  opacity: string | null,
): Declarations | null {
  const target = COLOR_UTILITIES[prefix];
  if (!target) return null;
  if (!looksLikeColor(value)) return null;

  const color = normalizeColorValue(value);
  const finalColor = opacity ? applyOpacityModifier(color, opacity) : color;

  if (typeof target === 'string') return [[target, finalColor]];
  return target.map((prop) => [prop, finalColor] as [string, string]);
}

function mapLengthDeclarations(prefix: string, value: string): Declarations | null {
  const target = LENGTH_UTILITIES[prefix];
  if (!target) return null;
  if (!looksLikeLength(value)) return null;

  if (typeof target === 'string') return [[target, value]];
  return target.map((prop) => [prop, value] as [string, string]);
}

function mapNumberDeclarations(prefix: string, value: string): Declarations | null {
  const target = NUMBER_UTILITIES[prefix];
  if (!target) return null;
  if (!/^-?\d+(?:\.\d+)?$/.test(value)) return null;
  return [[target, value]];
}

/**
 * `text-[...]` can be either a color or a font-size. `bg-[...]` can be a
 * color or a URL/gradient — only handle the color case here.
 */
function mapTextFontBgSpecial(
  prefix: string,
  value: string,
  opacity: string | null,
): Declarations | null {
  if (prefix === 'text') {
    if (looksLikeColor(value)) return mapColorDeclarations('text', value, opacity);
    if (looksLikeLength(value)) return [['font-size', value]];
    return null;
  }

  if (prefix === 'bg') {
    if (looksLikeColor(value)) return mapColorDeclarations('bg', value, opacity);
    return null;
  }

  if (prefix === FONT_UTILITY_PREFIX) {
    if (/^\d+$/.test(value)) return [['font-weight', value]];
    return null;
  }

  return null;
}

function compileUtilityDeclarations(
  prefix: string,
  value: string,
  opacity: string | null,
): Declarations | null {
  const special = mapTextFontBgSpecial(prefix, value, opacity);
  if (special) return special;

  const color = mapColorDeclarations(prefix, value, opacity);
  if (color) return color;

  const length = mapLengthDeclarations(prefix, value);
  if (length) return length;

  const number = mapNumberDeclarations(prefix, value);
  if (number) return number;

  return null;
}

// ============================================================================
// Emission
// ============================================================================

function escapeSelector(className: string): string {
  if (typeof CSS !== 'undefined' && typeof CSS.escape === 'function') {
    return CSS.escape(className);
  }
  return className.replace(/([!"#$%&'()*+,./:;<=>?@[\\\]^`{|}~])/g, '\\$1');
}

function declarationsToBody(decls: Declarations): string {
  return decls.map(([prop, val]) => `${prop}: ${val};`).join(' ');
}

function tryCompileClass(className: string): string | null {
  const { variants, utility } = splitVariantsAndUtility(className);
  const parsed = parseArbitraryUtility(utility);
  if (!parsed) return null;

  const decls = compileUtilityDeclarations(parsed.prefix, parsed.value, parsed.opacity);
  if (!decls || decls.length === 0) return null;

  const resolvedVariants: Variant[] = [];
  for (const token of variants) {
    const variant = classifyVariant(token);
    if (!variant) return null; // Unknown variant → leave for the server
    resolvedVariants.push(variant);
  }

  const pseudoSuffix = resolvedVariants
    .filter((v): v is SelectorPiece => 'append' in v)
    .map((v) => v.append)
    .join('');
  const selector = `.${escapeSelector(className)}${pseudoSuffix}`;

  let rule = `${selector} { ${declarationsToBody(decls)} }`;

  // Wrap in @media blocks (innermost first → outermost last, but order between
  // independent medias is irrelevant — we emit them outside-in).
  const medias = resolvedVariants
    .filter((v): v is MediaPiece => 'media' in v)
    .map((v) => v.media);
  for (const media of medias) {
    rule = `@media ${media} { ${rule} }`;
  }

  return rule;
}

/**
 * Compile every arbitrary-value class we can recognise into a CSS string,
 * silently skipping anything unsupported. Duplicate rules are deduped.
 */
export function compileArbitraryClasses(classNames: readonly string[]): string {
  const seen = new Set<string>();
  const rules: string[] = [];

  for (const raw of classNames) {
    const className = raw.trim();
    if (!className) continue;
    if (!className.includes('[')) continue; // Only arbitrary-value utilities

    const rule = tryCompileClass(className);
    if (!rule) continue;
    if (seen.has(rule)) continue;

    seen.add(rule);
    rules.push(rule);
  }

  return rules.join('\n');
}

/** Test helpers — exported for unit tests, not part of the public surface. */
export const __testing = {
  splitVariantsAndUtility,
  parseArbitraryUtility,
  looksLikeColor,
  looksLikeLength,
  tryCompileClass,
};
