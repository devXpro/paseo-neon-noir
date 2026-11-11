// Neon Noir's colour engine: OKLab/OKLCH maths, WCAG contrast and the knob-driven theme
// generator. Plain TypeScript with no DOM or Node APIs, so the app, the daemon and node share it.

import type { PluginThemeColors } from "@getpaseo/plugin";
import { PRESETS, type Preset } from "./presets.ts";
import { DEFAULT_PRESET_ID, type Knobs } from "./settings.ts";

export type Hex = string; // "#RRGGBB", upper case

/** The eight colours of a Paseo theme, accent included. */
export type ThemeColors = Required<PluginThemeColors>;

/**
 * Dark: the field is black and every colour is solved lighter than it. Light: the same knobs on
 * a white field, every colour solved darker. One preset, two looks; the guarantees hold in both.
 */
export type Mode = "dark" | "light";

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
 * Light background OKLab L at depth 1, as 1 - LIGHT_DEPTH_L: about #E1E1E1 when untinted, the
 * darkest paper that keeps dark text at 15:1. Depth 0 is pure white, the mirror of pure black.
 */
const LIGHT_DEPTH_L = 0.09;
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
/** The light mirrors: a mid accent that reads as ink, bronze or sage on paper, and near-black at glow 1. */
const LIGHT_MUTED_L = 0.5;
const LIGHT_DEEP_L = 0.25;

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
 * Nearest-needed solve: colour of hue h just far enough from bg to reach `target`: lighter on a
 * dark field, darker on a light one. Chroma is fixed, or a function of the lightness being tried.
 */
function solveRatio(bg: Hex, c: number | ((L: number) => number), h: number, target: number, mode: Mode = "dark"): Hex {
  const at = (L: number) => oklchToHex(L, typeof c === "number" ? c : c(L), h);
  const bgL = hexToOklch(bg)[0];
  const dark = mode === "dark";
  let best = at(dark ? 1 : 0);
  if (contrastRatio(best, bg) < target) return best; // unreachable; caller's check will flag it
  let lo = dark ? bgL : 0, hi = dark ? 1 : bgL;
  for (let i = 0; i < 30; i++) {
    const mid = (lo + hi) / 2;
    const hex = at(mid);
    const reads = contrastRatio(hex, bg) >= target;
    if (reads) best = hex;
    // Toward the background while it still reads, away from it when it stops.
    if (reads === dark) hi = mid; else lo = mid;
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
  /** Glow 0: the lightness nearest the background that still reaches ACCENT_TARGET. */
  low: number;
  /** Glow 0.5. */
  mid: number;
  /** Glow 1: near-white on a dark field, near-black on a light one. */
  high: number;
  /** The accent at lightness L: hue kept, chroma a fixed share of the gamut there. */
  at: (L: number) => Hex;
}

function accentBand(hue: number, neon: number, background: Hex, mode: Mode): AccentBand {
  const rel = lerp(NEON_FLOOR, 1, neon);
  const at = (L: number) => oklchToHex(L, rel * maxChroma(L, hue), hue);
  const bgL = hexToOklch(background)[0];
  if (mode === "dark") {
    // White always reads, so `hi` stays a lightness that reaches the target.
    let lo = bgL, hi = 1;
    for (let i = 0; i < 24; i++) {
      const m = (lo + hi) / 2;
      if (contrastRatio(at(m), background) >= ACCENT_TARGET) hi = m; else lo = m;
    }
    const mid = Math.max(hi, lerp(MUTED_L, cuspL(hue), neon));
    return { low: hi, mid, high: Math.max(mid, WHITE_L), at };
  }
  // Black always reads, so `lo` stays a lightness that reaches the target.
  let lo = 0, hi = bgL;
  for (let i = 0; i < 24; i++) {
    const m = (lo + hi) / 2;
    if (contrastRatio(at(m), background) >= ACCENT_TARGET) lo = m; else hi = m;
  }
  // A hue whose cusp is pale (yellow, lime) sits at the lightest lightness that reads: on paper it is gold, not lemon.
  const mid = Math.min(lo, lerp(LIGHT_MUTED_L, cuspL(hue), neon));
  return { low: lo, mid, high: Math.min(mid, LIGHT_DEEP_L), at };
}

function accentFor(k: Knobs, background: Hex, mode: Mode): Hex {
  const band = accentBand(k.hue, k.neon, background, mode);
  let L = k.glow <= 0.5 ? lerp(band.low, band.mid, k.glow * 2) : lerp(band.mid, band.high, k.glow * 2 - 1);
  let accent = band.at(L);
  // Belt and braces: move away from the field until the label reads, should the gamut bend the curve.
  const step = mode === "dark" ? 0.004 : -0.004;
  while (contrastRatio(accent, background) < ACCENT_TARGET && L > 0 && L < 1) {
    L = clamp(L + step, 0, 1);
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

/** The eight theme colours for a knob set, dark or light. Every LIMITS guarantee holds for any input. */
export function generate(input: Knobs, mode: Mode = "dark"): ThemeColors {
  const k = normalizeKnobs(input);
  const fieldH = mod360(k.hue + k.field);

  const bgL = mode === "dark" ? DEPTH_L * Math.sqrt(k.depth) : 1 - LIGHT_DEPTH_L * Math.sqrt(k.depth);
  const background = oklchToHex(bgL, k.tint * 0.035, fieldH);
  const yb = relLuminance(background);

  // Surfaces: fixed WCAG steps off the background, tinted toward the field hue.
  const raised = solveRatio(background, k.tint * 0.03, fieldH, 1.07, mode);
  const control = solveRatio(background, k.tint * 0.04, fieldH, 1.22, mode);
  const border = solveRatio(background, k.tint * 0.05, fieldH, 1.4, mode);

  // Text, warm or cool with the field. Foreground can never beat white-on-bg (black-on-bg on a
  // light field); aim just below, and never above FG_MAX_RATIO.
  const maxRatio = Math.min(21, mode === "dark" ? 1.05 / (yb + 0.05) : (yb + 0.05) / 0.05);
  const fgTarget = lerp(15.4, Math.max(15.4, Math.min(FG_MAX_RATIO, maxRatio * 0.985)), k.contrast);
  const redField = fieldH >= 350 || fieldH <= 40;
  const fgC = Math.min(0.02 * k.tint, redField ? FG_CHROMA_MAX_RED : FG_CHROMA_MAX);
  const foreground = solveRatio(background, fgC, fieldH, fgTarget, mode);
  const textC = Math.min(0.03 * k.tint, MUTED_CHROMA_MAX);
  const mutedForeground = solveRatio(background, textC, fieldH, lerp(6.8, 9.5, k.contrast), mode);
  // The ring is also Paseo's faintest text (placeholders, timestamps) and terminal bright black.
  // A neutral ring takes the field's tint, as muted text does.
  const ringTarget = lerp(3.8, 4.7, k.contrast);
  const ringH = mod360(k.hue + (k.ring ?? 0));
  const ring =
    k.ring === null
      ? solveRatio(background, textC, fieldH, ringTarget, mode)
      : solveRatio(background, (L) => ringShare(ringH) * maxChroma(L, ringH), ringH, ringTarget, mode);

  const accent = accentFor(k, background, mode);
  return { background, foreground, raised, control, border, accent, mutedForeground, ring };
}

/** The status colours of a resolved theme. Separate from resolveTheme: only painting the app needs them. */
export function resolveStatus(preset: Preset, knobs: Knobs, colors: ThemeColors, mode: Mode = "dark"): StatusColors {
  return statusColors(knobs, preset, colors, mode);
}

/** A preset with the saved knobs applied, dark or light. An unknown id falls back to the default preset. */
export function resolveTheme(
  presetId: string,
  knobs: Knobs | null,
  mode: Mode = "dark",
): { preset: Preset; knobs: Knobs; colors: ThemeColors; mode: Mode } {
  const preset =
    PRESETS.find((p) => p.id === presetId) ?? PRESETS.find((p) => p.id === DEFAULT_PRESET_ID) ?? PRESETS[0];
  const k = knobs ?? preset.knobs;
  return { preset, knobs: k, colors: generate(k, mode), mode };
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

/** Best-effort knobs for an explicit dark theme (dark only), so a hand-made palette becomes a tweakable preset. */
export function fit(t: ThemeColors): Knobs {
  const [aL, aC, aH] = hexToOklch(t.accent);
  const cmax = maxChroma(aL, aH);
  const neon = clamp(cmax > 0 ? (aC / cmax - NEON_FLOOR) / (1 - NEON_FLOOR) : 0, 0, 1);
  const band = accentBand(aH, neon, t.background, "dark");
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

// ---------- status colours ----------
// Paseo's success, warning and danger: drawn per preset (Preset.status) at its own knobs, then
// carried by the knobs inside semantic hue bands, so an edited preset still reads and still fits.

export type StatusRole = "success" | "warning" | "danger";
export const STATUS_ROLES: StatusRole[] = ["success", "warning", "danger"];

/** A status colour as the preset's designer drew it, at the preset's own knobs. */
export interface StatusVoice {
  /** OKLCH hue, inside the role's band. */
  h: number;
  /** Chroma as a share of the sRGB gamut at (L, h), 0..1. */
  share: number;
  /** OKLCH lightness. */
  L: number;
}

/** A preset's three status colours. "accent": success IS the accent while it sits in the success band. */
export interface StatusSpec {
  success: StatusVoice | "accent";
  warning: StatusVoice;
  danger: StatusVoice;
}

export interface StatusColors {
  success: Hex;
  warning: Hex;
  danger: Hex;
  /** Badge fills: the status at 16%, as Paseo builds them. */
  successTint: string;
  warningTint: string;
  dangerTint: string;
  /** Sidebar dots: same hue, louder chroma, as Paseo's dot band. */
  successDot: Hex;
  warningDot: Hex;
  dangerDot: Hex;
  /** The working dot: the accent when it is blue enough to say "busy", else a blue of the same family. */
  runningDot: Hex;
  /** Merged pull requests: Paseo's violet in the family's lightness and chroma. */
  merged: Hex;
  /** Delete actions and the stop button, whose icon is white: the danger, deep enough to carry it. */
  destructive: Hex;
}

/** Semantic hue bands (OKLCH): centre and half-width. A role never leaves its band. */
export const STATUS_BAND: Record<StatusRole, { c: number; half: number }> = {
  danger: { c: 12, half: 30 }, // 342..42 crimson to vermilion
  warning: { c: 85, half: 27 }, // 58..112 orange to yellow
  success: { c: 161, half: 39 }, // 122..200 lime to teal
};

export const STATUS_LIMITS = {
  /** Readable as 12pt text on the background and on cards. */
  textMin: 4.5,
  /** A sidebar dot on the selected row. */
  dotMin: 3,
  /** Hue gaps that keep the three states apart. */
  gapWarningDanger: 28,
  gapSuccessWarning: 38,
  /** OKLab x100. Paseo's own amber and red are 7.3 apart: the bar is above stock. */
  pairMin: 12,
  /** Against the accent, unless locked to it. */
  accentMin: 7,
  /** Below this a status is grey, and grey says nothing: unless the gamut at its lightness has no more to give (greyShare). */
  chromaMin: 0.07,
  /** A status under chromaMin still counts as colour when it holds this share of the gamut at its lightness and hue. */
  greyShare: 0.75,
  /** The stop button's white icon on the destructive fill. */
  destructiveOnWhite: 3.5,
  /** The destructive colour as text and as a fill on the background. */
  destructiveOnBg: 3,
};

const DRIFT: Record<StatusRole, number> = { success: 24, warning: 8, danger: 8 };
const ACCENT_HUE_GAP = 20;
const MERGED_HUE = 300;
const RUNNING_HUE = 250;
/** A status keeps at least this chroma when the gamut allows: below it, it stops saying anything. */
const CHROMA_FLOOR = 0.078;
const TINT_ALPHA = "29";

const smooth = (t: number) => {
  const x = clamp(t, 0, 1);
  return x * x * (3 - 2 * x);
};

export const hueGap = (a: number, b: number) => Math.abs(wrap180(a - b));

export function inBand(role: StatusRole, h: number, slack = 0): boolean {
  return Math.abs(wrap180(h - STATUS_BAND[role].c)) <= STATUS_BAND[role].half + slack;
}

function clampBand(role: StatusRole, h: number): number {
  const { c, half } = STATUS_BAND[role];
  return mod360(c + clamp(wrap180(h - c), -half, half));
}

/** Inside the success band a hue maps to itself; outside it glides back across, so no jump anywhere. */
function foldSuccess(h: number): number {
  const lo = STATUS_BAND.success.c - STATUS_BAND.success.half;
  const hi = STATUS_BAND.success.c + STATUS_BAND.success.half;
  if (h >= lo && h <= hi) return h;
  return lerp(hi, lo, mod360(h - hi) / (360 - (hi - lo)));
}

/** The nearest hue in [lo, hi] (signed degrees) at least `gap` from `avoid`. */
function awayFrom(h: number, avoid: number, gap: number, lo: number, hi: number): number {
  const d = wrap180(h - avoid);
  if (Math.abs(d) >= gap) return h;
  const up = avoid + gap;
  const down = avoid - gap;
  const upOk = up <= hi && up >= lo;
  const downOk = down >= lo && down <= hi;
  if (upOk && downOk) return d >= 0 ? up : down;
  if (upOk) return up;
  if (downOk) return down;
  return h;
}

function chromaAt(l: number, share: number, h: number): number {
  const top = maxChroma(l, h);
  return Math.max(share * top, Math.min(CHROMA_FLOOR, top));
}

const paint = (l: number, share: number, h: number): Hex => oklchToHex(l, chromaAt(l, share, h), h);

function reads(hex: Hex, theme: ThemeColors, min: number): boolean {
  return contrastRatio(hex, theme.raised) >= min && contrastRatio(hex, theme.background) >= min;
}

/** Where a status may sit in lightness while it keeps away from the accent: the full band on each field. */
const STATUS_L: Record<Mode, { lo: number; hi: number }> = { dark: { lo: 0.5, hi: 0.88 }, light: { lo: 0.2, hi: 0.62 } };

function readable(L: number, share: number, h: number, theme: ThemeColors, min: number, mode: Mode): Hex {
  const dark = mode === "dark";
  let l = L;
  let hex = paint(l, share, h);
  // Away from the field until it reads: lighter on a dark one, darker on a light one.
  while ((dark ? l < 0.97 : l > 0.03) && !reads(hex, theme, min)) {
    l += dark ? 0.004 : -0.004;
    hex = paint(l, share, h);
  }
  // A status the accent could be mistaken for moves in lightness once hue has nowhere left to go:
  // away from the accent's own lightness, down only while it still reads.
  const aL = hexToOklch(theme.accent)[0];
  const tooClose = (x: Hex) => deltaE(x, theme.accent) < STATUS_LIMITS.accentMin + 0.5;
  if (!tooClose(hex)) return hex;
  const band = STATUS_L[mode];
  const search = (direction: number): Hex | null => {
    let walk = l;
    for (let i = 0; i < 36; i++) {
      walk += direction * 0.008;
      if ((direction > 0 && walk > band.hi) || walk < band.lo) return null;
      const candidate = paint(walk, share, h);
      if (!reads(candidate, theme, min)) return null;
      if (!tooClose(candidate)) return candidate;
    }
    return null;
  };
  // First away from the accent's own lightness, then the other way if the surfaces forbid it.
  return search(l < aL ? -1 : 1) ?? search(l < aL ? 1 : -1) ?? hex;
}

/**
 * On paper a status sits at L 0.45..0.6, where yellow and teal have little gamut: a voice drawn
 * at the pale edge of its band comes out grey. This slides the hue along the band, nearest first,
 * toward wherever that lightness still carries colour, and keeps the first hue that does; failing
 * that, the richest one tried. Dark fields have gamut to spare and are left as drawn.
 */
function enriched(
  hex: Hex, h: number, lo: number, hi: number, share: number, theme: ThemeColors, min: number, mode: Mode,
): { hex: Hex; h: number } {
  const [L0, c0] = hexToOklch(hex);
  if (mode === "dark" || c0 >= STATUS_LIMITS.chromaMin) return { hex, h };
  let best = { hex, h, c: c0 };
  for (let step = 3; step <= 90; step += 3) {
    for (const sign of [1, -1]) {
      const hh = h + sign * step;
      if (hh < lo || hh > hi) continue;
      const candidate = readable(L0, share, mod360(hh), theme, min, mode);
      const c = hexToOklch(candidate)[1];
      if (c >= STATUS_LIMITS.chromaMin) return { hex: candidate, h: hh };
      if (c > best.c) best = { hex: candidate, h: hh, c };
    }
  }
  return { hex: best.hex, h: best.h };
}

/**
 * A status voice's lightness on a light field: drawn for a dark one, 0.6..0.9, where brighter is
 * louder; on paper louder is darker, so the band maps to 0.6..0.5 and readable() takes it down
 * from there until it reads.
 */
const lightVoiceL = (L: number) => lerp(0.6, 0.5, clamp((L - 0.6) / 0.3, 0, 1));

export function statusColors(knobs: Knobs, preset: Preset, theme: ThemeColors, mode: Mode = "dark"): StatusColors {
  const spec = preset.status;
  const dark = mode === "dark";
  const k = normalizeKnobs(knobs);
  const own = normalizeKnobs(preset.knobs);
  const drift = Math.sin((wrap180(k.hue - own.hue) * Math.PI) / 180);
  const dNeon = k.neon - own.neon;
  const dGlow = k.glow - own.glow;
  const dContrast = k.contrast - own.contrast;
  const [aL, aC, aH] = hexToOklch(theme.accent);
  const accentHasHue = aC >= 0.06;
  // A pale accent can be avoided, but it cannot stand in for a status: it says nothing.
  const accentCanSpeak = aC >= 0.085 && aL <= 0.92;

  const move = (v: StatusVoice, role: StatusRole) => {
    const L = clamp(v.L + 0.07 * dGlow + 0.03 * dContrast, 0.6, 0.9);
    return {
      h: clampBand(role, v.h + DRIFT[role] * drift),
      share: clamp(v.share + 0.25 * dNeon, 0.5, 1),
      L: dark ? L : lightVoiceL(L),
    };
  };

  // Success: the accent itself, or its own voice melting into the accent as they approach.
  let success: Hex;
  let successH: number;
  const accentShare = aC / Math.max(1e-6, maxChroma(aL, aH));
  const accentReads =
    contrastRatio(theme.accent, theme.raised) >= STATUS_LIMITS.textMin &&
    contrastRatio(theme.accent, theme.background) >= STATUS_LIMITS.textMin;
  // The accent as a status, lifted only when it would not read on a card. Exact when it does.
  const accentAsSuccess = (): Hex => {
    if (accentReads) return theme.accent;
    let l = aL;
    let hex = theme.accent;
    while ((dark ? l < 0.97 : l > 0.03) && !reads(hex, theme, STATUS_LIMITS.textMin)) {
      l += dark ? 0.004 : -0.004;
      hex = oklchToHex(l, accentShare * maxChroma(l, aH), aH);
    }
    return hex;
  };
  const successLo = STATUS_BAND.success.c - STATUS_BAND.success.half;
  const successHi = STATUS_BAND.success.c + STATUS_BAND.success.half;
  if (spec.success === "accent" && accentCanSpeak) {
    successH = foldSuccess(aH);
    if (inBand("success", aH)) success = accentAsSuccess();
    else {
      const share = Math.max(accentShare, 0.5);
      const drawn = readable(dark ? Math.min(aL, 0.82) : Math.max(aL, 0.3), share, successH, theme, STATUS_LIMITS.textMin, mode);
      ({ hex: success, h: successH } = enriched(drawn, successH, successLo, successHi, share, theme, STATUS_LIMITS.textMin, mode));
    }
  } else {
    const fallback: StatusVoice = spec.success === "accent" ? { h: 150, share: 0.6, L: 0.74 } : spec.success;
    const v = move(fallback, "success");
    const near = accentCanSpeak && inBand("success", aH) ? smooth((30 - hueGap(v.h, aH)) / 16) : 0;
    successH = near >= 1 ? aH : mod360(v.h + wrap180(aH - v.h) * near);
    if (near >= 1) success = accentAsSuccess();
    else {
      const share = lerp(v.share, accentShare, near);
      const drawn = readable(lerp(v.L, aL, near), share, successH, theme, STATUS_LIMITS.textMin, mode);
      // Melting toward the accent is a hue of its own; only a voice standing alone may slide.
      ({ hex: success, h: successH } =
        near > 0 ? { hex: drawn, h: successH } : enriched(drawn, successH, successLo, successHi, share, theme, STATUS_LIMITS.textMin, mode));
    }
  }

  // Danger keeps away from the accent, within its band.
  const dv = move(spec.danger, "danger");
  let dangerSigned = wrap180(dv.h);
  if (accentHasHue) dangerSigned = awayFrom(dangerSigned, wrap180(aH), ACCENT_HUE_GAP, -18, 42);

  // Warning lives between danger and success, and keeps away from the accent too.
  const wv = move(spec.warning, "warning");
  const lo = Math.max(58, dangerSigned + STATUS_LIMITS.gapWarningDanger);
  const hi = Math.min(112, (successH > 180 ? 200 : successH) - STATUS_LIMITS.gapSuccessWarning);
  let warningH = clamp(wv.h, lo, Math.max(lo, hi));
  if (accentHasHue) warningH = awayFrom(warningH, aH, ACCENT_HUE_GAP, lo, Math.max(lo, hi));

  const dangerDrawn = readable(dv.L, dv.share, mod360(dangerSigned), theme, STATUS_LIMITS.textMin, mode);
  // Slid only where the accent leaves room, so the gap to it holds.
  const dangerRoom = accentHasHue
    ? (() => {
        const a = wrap180(aH);
        return dangerSigned >= a ? { lo: Math.max(-18, a + ACCENT_HUE_GAP), hi: 42 } : { lo: -18, hi: Math.min(42, a - ACCENT_HUE_GAP) };
      })()
    : { lo: -18, hi: 42 };
  const dangerFit = enriched(dangerDrawn, dangerSigned, Math.min(dangerRoom.lo, dangerSigned), Math.max(dangerRoom.hi, dangerSigned), dv.share, theme, STATUS_LIMITS.textMin, mode);
  dangerSigned = dangerFit.h;
  let danger = dangerFit.hex;
  // Warning's room follows the danger it ended up at.
  const lo2 = Math.max(58, dangerSigned + STATUS_LIMITS.gapWarningDanger);
  warningH = clamp(warningH, lo2, Math.max(lo2, hi));
  let warning = readable(wv.L, wv.share, warningH, theme, STATUS_LIMITS.textMin, mode);
  ({ hex: warning, h: warningH } = enriched(warning, warningH, lo2, Math.max(lo2, hi), wv.share, theme, STATUS_LIMITS.textMin, mode));
  // Amber has the room to move. Outward from the drawn lightness, nearest first, leaning away
  // from the closer neighbour and richer the further it goes, until it clears both.
  const crowded = (x: Hex) =>
    deltaE(x, danger) < STATUS_LIMITS.pairMin + 0.3 || deltaE(x, success) < STATUS_LIMITS.pairMin + 0.3;
  if (crowded(warning)) {
    const drawnL = hexToOklch(warning)[0];
    const lean = deltaE(warning, success) < deltaE(warning, danger) ? -0.5 : 0.5;
    search: for (let step = 1; step <= 40; step++) {
      for (const sign of [1, -1]) {
        const h = clamp(warningH + lean * step, lo2, Math.max(lo2, hi));
        const candidate = readable(
          dark ? clamp(drawnL + sign * step * 0.006, 0.6, 0.86) : clamp(drawnL + sign * step * 0.006, 0.3, 0.6),
          Math.min(1, wv.share + step * 0.02),
          h,
          theme,
          STATUS_LIMITS.textMin,
          mode,
        );
        if (!crowded(candidate)) {
          warning = candidate;
          warningH = h;
          break search;
        }
      }
    }
  }
  // On paper amber and vermilion are both brown at reading depth, and amber has nowhere richer to
  // go; then the danger slides toward crimson, where dark reds keep their chroma, as far as the accent allows.
  if (!dark && crowded(warning)) {
    for (let h = dangerSigned - 3; h >= dangerRoom.lo; h -= 3) {
      const candidate = readable(dv.L, Math.min(1, dv.share + 0.1), mod360(h), theme, STATUS_LIMITS.textMin, mode);
      if (deltaE(warning, candidate) >= STATUS_LIMITS.pairMin + 0.3 && deltaE(candidate, success) >= STATUS_LIMITS.pairMin + 0.3) {
        danger = candidate;
        dangerSigned = h;
        break;
      }
    }
  }
  const dangerH = mod360(dangerSigned);

  const dot = (hex: Hex, h: number): Hex => {
    const [L, C] = hexToOklch(hex);
    const share = C / Math.max(1e-6, maxChroma(L, h));
    return oklchToHex(L, Math.max(share, Math.min(0.95, share + 0.25)) * maxChroma(L, h), h);
  };

  const family = [success, warning, danger].map(hexToOklch);
  const meanL = family.reduce((sum, [L]) => sum + L, 0) / 3;
  const meanShare = family.reduce((sum, [L, C, h]) => sum + C / Math.max(1e-6, maxChroma(L, h)), 0) / 3;
  const merged = readable(meanL, meanShare, MERGED_HUE, theme, STATUS_LIMITS.textMin, mode);
  const accentIsBlue = accentCanSpeak && aH >= 215 && aH <= 300;
  const runningDot = accentIsBlue
    ? dot(theme.accent, aH)
    : dot(readable(meanL, meanShare, RUNNING_HUE, theme, STATUS_LIMITS.textMin, mode), RUNNING_HUE);

  const [dangerL, dangerC] = hexToOklch(danger);
  let destructive = danger;
  for (let l = dangerL; l > 0.45 && contrastRatio(destructive, "#FFFFFF") < STATUS_LIMITS.destructiveOnWhite + 0.1; l -= 0.004)
    destructive = oklchToHex(l, dangerC, dangerH);

  return {
    success,
    warning,
    danger,
    successTint: success + TINT_ALPHA,
    warningTint: warning + TINT_ALPHA,
    dangerTint: danger + TINT_ALPHA,
    successDot: dot(success, successH),
    warningDot: dot(warning, warningH),
    dangerDot: dot(danger, dangerH),
    runningDot,
    merged,
    destructive,
  };
}

export function statusViolations(s: StatusColors, theme: ThemeColors): string[] {
  const out: string[] = [];
  const roles: Array<[StatusRole, Hex, Hex]> = [
    ["success", s.success, s.successDot],
    ["warning", s.warning, s.warningDot],
    ["danger", s.danger, s.dangerDot],
  ];
  for (const [role, hex, dot] of roles) {
    const [, C, h] = hexToOklch(hex);
    if (contrastRatio(hex, theme.background) < STATUS_LIMITS.textMin - 0.02) out.push(`${role}:bg`);
    if (contrastRatio(hex, theme.raised) < STATUS_LIMITS.textMin - 0.02) out.push(`${role}:raised`);
    if (contrastRatio(dot, theme.control) < STATUS_LIMITS.dotMin) out.push(`${role}:dot`);
    if (!inBand(role, h, 1.5)) out.push(`${role}:band(${h.toFixed(0)})`);
    const [L] = hexToOklch(hex);
    if (C < STATUS_LIMITS.chromaMin && C < STATUS_LIMITS.greyShare * maxChroma(L, h)) out.push(`${role}:grey(${C.toFixed(3)})`);
  }
  const hOf = (x: Hex) => hexToOklch(x)[2];
  if (hueGap(hOf(s.warning), hOf(s.danger)) < STATUS_LIMITS.gapWarningDanger - 2) out.push("gap:warning-danger");
  if (hueGap(hOf(s.success), hOf(s.warning)) < STATUS_LIMITS.gapSuccessWarning - 2) out.push("gap:success-warning");
  if (deltaE(s.success, s.warning) < STATUS_LIMITS.pairMin) out.push("pair:success-warning");
  if (deltaE(s.warning, s.danger) < STATUS_LIMITS.pairMin) out.push("pair:warning-danger");
  if (deltaE(s.success, s.danger) < STATUS_LIMITS.pairMin) out.push("pair:success-danger");
  const [, aC] = hexToOklch(theme.accent);
  if (aC >= 0.06) {
    if (deltaE(s.warning, theme.accent) < STATUS_LIMITS.accentMin) out.push("accent:warning");
    if (deltaE(s.danger, theme.accent) < STATUS_LIMITS.accentMin) out.push("accent:danger");
    const melted = hueGap(hexToOklch(s.success)[2], hexToOklch(theme.accent)[2]) < 14;
    if (!melted && deltaE(s.success, theme.accent) < STATUS_LIMITS.accentMin) out.push("accent:success");
  }
  if (contrastRatio(s.runningDot, theme.control) < STATUS_LIMITS.dotMin) out.push("running:dot");
  if (contrastRatio(s.merged, theme.raised) < STATUS_LIMITS.textMin - 0.02) out.push("merged:raised");
  if (contrastRatio(s.destructive, "#FFFFFF") < STATUS_LIMITS.destructiveOnWhite) out.push("destructive:white");
  if (contrastRatio(s.destructive, theme.background) < STATUS_LIMITS.destructiveOnBg) out.push("destructive:bg");
  return out;
}
