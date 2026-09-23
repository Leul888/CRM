/** Runtime brand color: generates the brand-50…950 scale as CSS variables from one hex. */
import { DEFAULT_BRAND } from './catalog';

const STEPS: Array<[number, 'w' | 'b', number]> = [
  [50, 'w', 0.95],
  [100, 'w', 0.9],
  [200, 'w', 0.78],
  [300, 'w', 0.6],
  [400, 'w', 0.4],
  [500, 'w', 0.18],
  [600, 'w', 0],
  [700, 'b', 0.18],
  [800, 'b', 0.33],
  [900, 'b', 0.5],
  [950, 'b', 0.66],
];

export const isHex = (v?: string): v is string => !!v && /^#[0-9a-f]{6}$/i.test(v);

export const brandScale = (hex: string) => {
  const n = parseInt(hex.slice(1), 16);
  const rgb = [(n >> 16) & 255, (n >> 8) & 255, n & 255];
  return STEPS.map(([step, dir, amt]) => {
    const target = dir === 'w' ? 255 : 0;
    const c = rgb.map((ch) => Math.round(ch + (target - ch) * amt));
    return [step, c.join(' ')] as const;
  });
};

let applied = '';
export const applyBrand = (hex?: string) => {
  if (typeof document === 'undefined') return;
  const color = isHex(hex) ? hex.toLowerCase() : DEFAULT_BRAND;
  if (color === applied) return;
  applied = color;
  const root = document.documentElement.style;
  for (const [step, value] of brandScale(color)) root.setProperty(`--brand-${step}`, value);
  document.querySelector('meta[name="theme-color"]')?.setAttribute('content', color);
};
