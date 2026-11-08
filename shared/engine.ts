// Neon Noir's colour engine: OKLab/OKLCH maths, WCAG contrast and the knob-driven theme
// generator. Plain TypeScript with no DOM or Node APIs, so the app, the daemon and node share it.

import type { PluginThemeColors } from "@getpaseo/plugin";
import { PRESETS, type Preset } from "./presets.ts";
import { DEFAULT_PRESET_ID, type Knobs } from "./settings.ts";

export type Hex = string; // "#RRGGBB", upper case

/** The eight colours of a Paseo theme, accent included. Neon Noir themes are always dark. */
export type ThemeColors = Required<PluginThemeColors>;

/** Hard guarantees (inclusive), WCAG ratios against the background. tools/check.ts fuzzes them. */
export const LIMITS = {
  fgMin: 15,
  fgMax: 18.2,
  mutedMin: 6,
  onAccentMin: 4.5,
  ringMin: 3.5,
  ringMax: 5.0,
  borderMin: 1.3,
  borderMax: 1.5,
  raisedMin: 1.04,
  raisedMax: 1.12,
  controlMin: 1.1,
  controlMax: 1.25,
};

/**
 * Background OKLab L at depth 1: #242424 when untinted, the lightest that keeps white text at 15:1.
 * Depth is perceptual, L = DEPTH_L * sqrt(depth), so the lower half of the knob is not all #000.
 */
const DEPTH_L = 0.26;
/**
 * Ring chroma as a share of the sRGB gamut at its lightness and hue, so violet, magenta and red
 * rings are as lively as cyan ones, whatever the tint. Teal and green rings (hues 140-230) have
 * so little gamut at ring lightness that they need more of it to read as colour, not dust; the
 * share ramps over 10 degrees outside that band so dragging the ring hue never jumps.
 */
const RING_SHARE = 0.6;
const RING_SHARE_TEAL = 0.85;
/**
 * Text chroma toward the field hue: tinted whites, never pink or mint. On red fields (hues 350-40)
 * even 0.008 reads pink, so whites there stay within 0.004. Muted text, and a neutral ring, may
 * carry a little more.
 */
const FG_CHROMA_MAX = 0.008;
const FG_CHROMA_MAX_RED = 0.004;
const MUTED_CHROMA_MAX = 0.016;
/** Foreground ceiling at contrast 1: brighter text haloes on prose. */
const FG_MAX_RATIO = 18;
/** Accent chroma at neon 0, as a share of the sRGB gamut at the accent's lightness. */
const NEON_FLOOR = 0.18;
/**
 * Accent lightness at glow 0.5 and neon 0; neon 1 starts at the hue's cusp. Low-chroma accents
 * are held at this mid lightness (not lifted toward white), so they read as bronze, sage or
 * pewter instead of pastel. Bone and ivory come from a high glow.
 */
const MUTED_L = 0.7;
/** Accent lightness at glow 1: near-white at the accent's hue. */
const WHITE_L = 0.96;

const clamp = (x: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, x));
const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
const mod360 = (h: number) => ((h % 360) + 360) % 360;
const wrap180 = (d: number) => mod360(d + 180) - 180;

// ---------- sRGB <-> linear <-> OKLab <-> OKLCH ----------

export const srgbToLinear = (c: number) =>
  c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
export const linearToSrgb = (c: number) =>
  c <= 0.0031308 ? c * 12.92 : 1.055 * Math.pow(c, 1 / 2.4) - 0.055;

export type Vec3 = [number, number, number];

export function hexToRgb255(hex: Hex): Vec3 {
  const m = /^#?([0-9a-fA-F]{6})$/.exec(hex);
  if (!m) throw new Error(`bad hex: ${hex}`);
  const n = parseInt(m[1], 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

export function rgb255ToHex(rgb: Vec3): Hex {
  return (
    "#" +
    rgb.map((v) => clamp(Math.round(v), 0, 255).toString(16).padStart(2, "0")).join("").toUpperCase()
  );
}

export function linearToOklab([r, g, b]: Vec3): Vec3 {
  const l = Math.cbrt(0.4122214708 * r + 0.5363325363 * g + 0.0514459929 * b);
  const m = Math.cbrt(0.2119034982 * r + 0.6806995451 * g + 0.1073969566 * b);
  const s = Math.cbrt(0.0883024619 * r + 0.2817188376 * g + 0.6299787005 * b);
  return [
    0.2104542553 * l + 0.793617785 * m - 0.0040720468 * s,
    1.9779984951 * l - 2.428592205 * m + 0.4505937099 * s,
    0.0259040371 * l + 0.7827717662 * m - 0.808675766 * s,
  ];
}

export function oklabToLinear([L, a, b]: Vec3): Vec3 {
  const l = Math.pow(L + 0.3963377774 * a + 0.2158037573 * b, 3);
  const m = Math.pow(L - 0.1055613458 * a - 0.0638541728 * b, 3);
  const s = Math.pow(L - 0.0894841775 * a - 1.291485548 * b, 3);
  return [
    4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s,
    -1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s,
    -0.0041960863 * l - 0.7034186147 * m + 1.707614701 * s,
  ];
}

export function oklabToOklch([L, a, b]: Vec3): Vec3 {
  return [L, Math.hypot(a, b), mod360((Math.atan2(b, a) * 180) / Math.PI)];
}

export function oklchToOklab([L, C, h]: Vec3): Vec3 {
  const r = (h * Math.PI) / 180;
  return [L, C * Math.cos(r), C * Math.sin(r)];
}

export function hexToOklab(hex: Hex): Vec3 {
  const [r, g, b] = hexToRgb255(hex);
  return linearToOklab([srgbToLinear(r / 255), srgbToLinear(g / 255), srgbToLinear(b / 255)]);
}
export const hexToOklch = (hex: Hex): Vec3 => oklabToOklch(hexToOklab(hex));

const EPS = 1e-5;
export function inGamut(L: number, C: number, h: number): boolean {
  const lin = oklabToLinear(oklchToOklab([L, C, h]));
  return lin.every((v) => v >= -EPS && v <= 1 + EPS);
}

/** Largest chroma that fits sRGB at (L, h). */
export function maxChroma(L: number, h: number): number {
  if (L <= 0 || L >= 1) return 0;
  let lo = 0, hi = 0.4;
  for (let i = 0; i < 22; i++) {
    const mid = (lo + hi) / 2;
    if (inGamut(L, mid, h)) lo = mid; else hi = mid;
  }
  return lo;
}

/** Gamut clipping by chroma reduction (hue and lightness are kept). */
export function clipChroma(L: number, C: number, h: number): Vec3 {
  L = clamp(L, 0, 1);
  if (L <= 0) return [0, 0, h];
  if (L >= 1) return [1, 0, h];
  C = Math.max(0, C);
  if (inGamut(L, C, h)) return [L, C, h];
  let lo = 0, hi = C;
  for (let i = 0; i < 22; i++) {
    const mid = (lo + hi) / 2;
    if (inGamut(L, mid, h)) lo = mid; else hi = mid;
  }
  return [L, lo, h];
}

export function oklchToHex(L: number, C: number, h: number): Hex {
  const [l2, c2, h2] = clipChroma(L, C, h);
  const lin = oklabToLinear(oklchToOklab([l2, c2, h2]));
  return rgb255ToHex(lin.map((v) => linearToSrgb(clamp(v, 0, 1)) * 255) as Vec3);
}

// ---------- WCAG ----------

export function relLuminance(hex: Hex): number {
  const [r, g, b] = hexToRgb255(hex).map((v) => srgbToLinear(v / 255));
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

/** WCAG 2 contrast ratio of two hex colours, 1..21. */
export function contrastRatio(a: Hex, b: Hex): number {
  const ya = relLuminance(a), yb = relLuminance(b);
  return (Math.max(ya, yb) + 0.05) / (Math.min(ya, yb) + 0.05);
}

// ---------- generator ----------

/**
 * Lightest-needed solve: colour of hue h just light enough to reach `target` against bg. Chroma
 * is fixed, or a function of the lightness being tried.
 */
function solveRatio(bg: Hex, c: number | ((L: number) => number), h: number, target: number): Hex {
  const at = (L: number) => oklchToHex(L, typeof c === "number" ? c : c(L), h);
  let lo = hexToOklch(bg)[0], hi = 1;
  let best = at(1);
  if (contrastRatio(best, bg) < target) return best; // unreachable; caller's check will flag it
  for (let i = 0; i < 30; i++) {
    const mid = (lo + hi) / 2;
    const hex = at(mid);
    if (contrastRatio(hex, bg) >= target) { best = hex; hi = mid; } else lo = mid;
  }
  return best;
}

function ringShare(h: number): number {
  return lerp(RING_SHARE, RING_SHARE_TEAL, clamp(Math.min(h - 130, 240 - h) / 10, 0, 1));
}

function cuspL(h: number): number {
  let bestL = 0.5, bestC = -1;
  for (let L = 0.05; L < 1; L += 0.01) {
    const c = maxChroma(L, h);
    if (c > bestC) { bestC = c; bestL = L; }
  }
  return bestL;
}

/** The accent must carry the background as button text (Paseo paints labels with it). */
const ACCENT_TARGET = LIMITS.onAccentMin + 0.05;

interface AccentBand {
  /** Glow 0: the deepest lightness that still reaches ACCENT_TARGET. */
  low: number;
  /** Glow 0.5. */
  mid: number;
  /** Glow 1: near-white. */
  high: number;
  /** The accent at lightness L: hue kept, chroma a fixed share of the gamut there. */
  at: (L: number) => Hex;
}

function accentBand(hue: number, neon: number, background: Hex): AccentBand {
  const rel = lerp(NEON_FLOOR, 1, neon);
  const at = (L: number) => oklchToHex(L, rel * maxChroma(L, hue), hue);
  // White always reads, so `hi` stays a lightness that reaches the target.
  let lo = hexToOklch(background)[0], hi = 1;
  for (let i = 0; i < 24; i++) {
    const m = (lo + hi) / 2;
    if (contrastRatio(at(m), background) >= ACCENT_TARGET) hi = m; else lo = m;
  }
  const mid = Math.max(hi, lerp(MUTED_L, cuspL(hue), neon));
  return { low: hi, mid, high: Math.max(mid, WHITE_L), at };
}

function accentFor(k: Knobs, background: Hex): Hex {
  const band = accentBand(k.hue, k.neon, background);
  let L = k.glow <= 0.5 ? lerp(band.low, band.mid, k.glow * 2) : lerp(band.mid, band.high, k.glow * 2 - 1);
  let accent = band.at(L);
  // Belt and braces: lift until the label reads, should the gamut bend the curve.
  while (contrastRatio(accent, background) < ACCENT_TARGET && L < 1) {
    L = Math.min(1, L + 0.004);
    accent = band.at(L);
  }
  return accent;
}

/** Knobs clamped into range; the angles wrap. */
export function normalizeKnobs(k: Knobs): Knobs {
  return {
    hue: mod360(k.hue),
    neon: clamp(k.neon, 0, 1),
    glow: clamp(k.glow, 0, 1),
    depth: clamp(k.depth, 0, 1),
    tint: clamp(k.tint, 0, 1),
    contrast: clamp(k.contrast, 0, 1),
    ring: k.ring === null ? null : wrap180(k.ring),
    field: wrap180(k.field),
  };
}

/** The eight theme colours for a knob set. Every LIMITS guarantee holds for any input. */
export function generate(input: Knobs): ThemeColors {
  const k = normalizeKnobs(input);
  const fieldH = mod360(k.hue + k.field);

  const background = oklchToHex(DEPTH_L * Math.sqrt(k.depth), k.tint * 0.035, fieldH);
  const yb = relLuminance(background);

  // Surfaces: fixed WCAG steps over the background, tinted toward the field hue.
  const raised = solveRatio(background, k.tint * 0.03, fieldH, 1.07);
  const control = solveRatio(background, k.tint * 0.04, fieldH, 1.22);
  const border = solveRatio(background, k.tint * 0.05, fieldH, 1.4);

  // Text, warm or cool with the field. Foreground can never beat white-on-bg; aim just below,
  // and never above FG_MAX_RATIO.
  const maxRatio = Math.min(21, 1.05 / (yb + 0.05));
  const fgTarget = lerp(15.4, Math.max(15.4, Math.min(FG_MAX_RATIO, maxRatio * 0.985)), k.contrast);
  const redField = fieldH >= 350 || fieldH <= 40;
  const fgC = Math.min(0.02 * k.tint, redField ? FG_CHROMA_MAX_RED : FG_CHROMA_MAX);
  const foreground = solveRatio(background, fgC, fieldH, fgTarget);
  const textC = Math.min(0.03 * k.tint, MUTED_CHROMA_MAX);
  const mutedForeground = solveRatio(background, textC, fieldH, lerp(6.8, 9.5, k.contrast));
  // The ring is also Paseo's faintest text (placeholders, timestamps) and terminal bright black.
  // A neutral ring takes the field's tint, as muted text does.
  const ringTarget = lerp(3.8, 4.7, k.contrast);
  const ringH = mod360(k.hue + (k.ring ?? 0));
  const ring =
    k.ring === null
      ? solveRatio(background, textC, fieldH, ringTarget)
      : solveRatio(background, (L) => ringShare(ringH) * maxChroma(L, ringH), ringH, ringTarget);

  const accent = accentFor(k, background);
  return { background, foreground, raised, control, border, accent, mutedForeground, ring };
}

/** A preset with the saved knobs applied. An unknown id falls back to the default preset. */
export function resolveTheme(
  presetId: string,
  knobs: Knobs | null,
): { preset: Preset; knobs: Knobs; colors: ThemeColors } {
  const preset =
    PRESETS.find((p) => p.id === presetId) ?? PRESETS.find((p) => p.id === DEFAULT_PRESET_ID) ?? PRESETS[0];
  const k = knobs ?? preset.knobs;
  return { preset, knobs: k, colors: generate(k) };
}

// ---------- measuring ----------

export interface Metrics {
  fg: number; muted: number; onAccent: number; ring: number;
  border: number; raised: number; control: number;
}

export function metrics(t: ThemeColors): Metrics {
  const c = (x: Hex) => contrastRatio(x, t.background);
  return {
    fg: c(t.foreground), muted: c(t.mutedForeground), onAccent: c(t.accent), ring: c(t.ring),
    border: c(t.border), raised: c(t.raised), control: c(t.control),
  };
}

/** Names of violated guarantees (empty = all hold). */
export function violations(t: ThemeColors): string[] {
  const m = metrics(t), L = LIMITS, v: string[] = [];
  if (m.fg < L.fgMin || m.fg > L.fgMax) v.push("fg");
  if (m.muted < L.mutedMin) v.push("muted");
  if (m.onAccent < L.onAccentMin) v.push("onAccent");
  if (m.ring < L.ringMin || m.ring > L.ringMax) v.push("ring");
  if (m.border < L.borderMin || m.border > L.borderMax) v.push("border");
  if (m.raised < L.raisedMin || m.raised > L.raisedMax) v.push("raised");
  if (m.control < L.controlMin || m.control > L.controlMax) v.push("control");
  if (!(m.raised < m.control && m.control < m.border)) v.push("order");
  return v;
}

// ---------- fitting knobs to explicit colours ----------

/** Best-effort knobs for an explicit dark theme, so a hand-made palette becomes a tweakable preset. */
export function fit(t: ThemeColors): Knobs {
  const [aL, aC, aH] = hexToOklch(t.accent);
  const cmax = maxChroma(aL, aH);
  const neon = clamp(cmax > 0 ? (aC / cmax - NEON_FLOOR) / (1 - NEON_FLOOR) : 0, 0, 1);
  const band = accentBand(aH, neon, t.background);
  const glow =
    aL <= band.mid
      ? (band.mid > band.low ? (0.5 * (aL - band.low)) / (band.mid - band.low) : 0.5)
      : (band.high > band.mid ? 0.5 + (0.5 * (aL - band.mid)) / (band.high - band.mid) : 0.5);
  const [bgL] = hexToOklch(t.background);
  const [, bC, bH] = hexToOklch(t.border);
  const [, rC, rH] = hexToOklch(t.ring);
  const yb = relLuminance(t.background);
  const maxRatio = Math.min(FG_MAX_RATIO, Math.min(21, 1.05 / (yb + 0.05)) * 0.985);
  const fgR = contrastRatio(t.foreground, t.background);
  return normalizeKnobs({
    hue: aH,
    neon,
    glow,
    depth: (bgL / DEPTH_L) ** 2,
    tint: bC / 0.05,
    contrast: maxRatio > 15.4 ? (fgR - 15.4) / (maxRatio - 15.4) : 0,
    ring: rC > 0.03 ? wrap180(rH - aH) : null,
    field: bC > 0.004 ? wrap180(bH - aH) : 0,
  });
}

/** OKLab distance x100, for judging how close two colours are. */
export function deltaE(a: Hex, b: Hex): number {
  const x = hexToOklab(a), y = hexToOklab(b);
  return Math.hypot(x[0] - y[0], x[1] - y[1], x[2] - y[2]) * 100;
}
