import { maxChroma, oklchToHex } from "../shared/engine.ts";

const STEP = 5;
/**
 * One lightness and a modest chroma for every hue, so the tracks read as a scale of hues rather
 * than a rainbow, and stay quieter than the accent they set.
 */
const LIGHTNESS = 0.68;
const CHROMA = 0.12;

let table: string[] | null = null;

/** The spectrum's colour at each OKLCH hue, every STEP degrees; worked out on first use. */
function colours(): string[] {
  if (table === null) {
    table = [];
    for (let hue = 0; hue < 360; hue += STEP) {
      table.push(oklchToHex(LIGHTNESS, Math.min(CHROMA, maxChroma(LIGHTNESS, hue)), hue));
    }
  }
  return table;
}

const wrap = (hue: number) => ((hue % 360) + 360) % 360;

/** The spectrum's colour at this OKLCH hue, any angle. */
export function hueColour(hue: number): string {
  const all = colours();
  return all[Math.round(wrap(hue) / STEP) % all.length];
}

const gradients = new Map<number, string>();

/** A left-to-right CSS gradient over the full circle of hues, starting at `from` degrees. */
export function spectrumGradient(from: number): string {
  const start = Math.round(wrap(from));
  let gradient = gradients.get(start);
  if (gradient === undefined) {
    const stops: string[] = [];
    for (let offset = 0; offset <= 360; offset += 10) {
      stops.push(`${hueColour(start + offset)} ${((offset / 360) * 100).toFixed(2)}%`);
    }
    gradient = `linear-gradient(to right, ${stops.join(", ")})`;
    gradients.set(start, gradient);
  }
  return gradient;
}
