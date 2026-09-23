/**
 * Runtime theming.
 *  - Brand color: generates the brand-50…950 scale (light + dark variants) from one hex.
 *  - Night mode: toggles the `dark` class on <html>; remembered per browser.
 */
import { DEFAULT_BRAND } from './catalog';

type RGB = [number, number, number];
const WHITE: RGB = [255, 255, 255];
const BLACK: RGB = [0, 0, 0];
const DARK_BG: RGB = [22, 23, 38];

export const isHex = (v?: string): v is string => !!v && /^#[0-9a-f]{6}$/i.test(v);

const toRgb = (hex: string): RGB => {
  const n = parseInt(hex.slice(1), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
};
const mix = (a: RGB, b: RGB, amt: number) => a.map((ch, i) => Math.round(ch + (b[i] - ch) * amt)).join(' ');

const LIGHT: Array<[number, RGB, number]> = [
  [50, WHITE, 0.95],
  [100, WHITE, 0.9],
  [200, WHITE, 0.78],
  [300, WHITE, 0.6],
  [400, WHITE, 0.4],
  [500, WHITE, 0.18],
  [600, WHITE, 0],
  [700, BLACK, 0.18],
  [800, BLACK, 0.33],
  [900, BLACK, 0.5],
  [950, BLACK, 0.66],
];

// In night mode tints become dark and "text" shades become light so every pairing keeps contrast.
const DARK: Array<[number, RGB, number]> = [
  [50, DARK_BG, 0.85],
  [100, DARK_BG, 0.75],
  [200, DARK_BG, 0.6],
  [300, DARK_BG, 0.4],
  [400, WHITE, 0.3],
  [500, WHITE, 0.15],
  [600, WHITE, 0],
  [700, WHITE, 0.4],
  [800, WHITE, 0.55],
  [900, WHITE, 0.7],
  [950, WHITE, 0.82],
];

export const brandScale = (hex: string) => LIGHT.map(([step, target, amt]) => [step, mix(toRgb(hex), target, amt)] as const);

let applied = '';
export const applyBrand = (hex?: string) => {
  if (typeof document === 'undefined') return;
  const color = isHex(hex) ? hex.toLowerCase() : DEFAULT_BRAND;
  if (color === applied) return;
  applied = color;
  const base = toRgb(color);
  const vars = (steps: typeof LIGHT) => steps.map(([step, target, amt]) => `--brand-${step}: ${mix(base, target, amt)};`).join(' ');
  const fixed = `--brand-base: ${base.join(' ')}; --brand-deep: ${mix(base, BLACK, 0.33)};`;
  let el = document.getElementById('brand-vars') as HTMLStyleElement | null;
  if (!el) {
    el = document.createElement('style');
    el.id = 'brand-vars';
    document.head.appendChild(el);
  }
  el.textContent = `:root { ${vars(LIGHT)} ${fixed} } :root.dark { ${vars(DARK)} ${fixed} }`;
  document.querySelector('meta[name="theme-color"]')?.setAttribute('content', color);
};

// ---------------- night mode ----------------
export type ThemeMode = 'light' | 'dark';
const KEY = 'cf-theme';

export const getTheme = (): ThemeMode => {
  try {
    const saved = localStorage.getItem(KEY);
    if (saved === 'light' || saved === 'dark') return saved;
  } catch {
    /* storage unavailable */
  }
  return typeof window !== 'undefined' && window.matchMedia?.('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
};

export const applyTheme = (mode: ThemeMode) => {
  document.documentElement.classList.toggle('dark', mode === 'dark');
};

export const setTheme = (mode: ThemeMode) => {
  try {
    localStorage.setItem(KEY, mode);
  } catch {
    /* storage unavailable */
  }
  applyTheme(mode);
  window.dispatchEvent(new Event('cf-theme'));
};
