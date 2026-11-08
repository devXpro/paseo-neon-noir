import { defineRpc, defineSettings } from "@getpaseo/plugin";
import { z } from "zod";
import type { output as ZodOutput } from "zod";

export type FontKind = "ui" | "mono";
export type FontScripts = "latin" | "latin+cyrillic";
export type FontWeight = 400 | 500 | 600 | 700;
export type FontTag =
  | "Grotesk"
  | "Geometric"
  | "Industrial"
  | "Techno"
  | "Squared"
  | "HUD"
  | "Condensed"
  | "Expressive"
  | "Ligatures"
  | "Cursive italics"
  | "Slab"
  | "Texture healing"
  | "Handwritten"
  | "Pixel";

/**
 * A font shipped in fonts/, under the SIL Open Font License with its licence file beside it.
 * `family` is the name in the files' name table (typographic family): iOS registers them under it.
 */
export interface BundledFont {
  id: string;
  family: string;
  kind: FontKind;
  /** Paths under fonts/, by weight. A variable file is listed once, under 400, with its axis in `variable`. */
  files: Partial<Record<FontWeight, string>>;
  /** The weight axis of a variable file. */
  variable?: { min: number; max: number };
  /** An upright-weight italic, shipped only where the italic is the point of the font. */
  italic?: string;
  /** "latin+cyrillic" only where the whole Russian alphabet, Ё included, is in the cmap. */
  scripts: FontScripts;
  tags: readonly FontTag[];
  description: string;
  /** Where the files came from. */
  source: string;
}

const GOOGLE = "google/fonts";

const BUNDLED = [
  // ---------------- Interface ----------------
  {
    id: "geist",
    family: "Geist",
    kind: "ui",
    files: { 400: "geist/Geist-Regular.ttf", 500: "geist/Geist-Medium.ttf", 600: "geist/Geist-SemiBold.ttf" },
    scripts: "latin+cyrillic",
    tags: ["Grotesk"],
    description: "Vercel's neo-grotesk: tight, neutral, drawn for interfaces.",
    source: "vercel/geist-font",
  },
  {
    id: "inter",
    family: "Inter",
    kind: "ui",
    files: { 400: "inter/Inter-Regular.ttf", 500: "inter/Inter-Medium.ttf", 600: "inter/Inter-SemiBold.ttf" },
    scripts: "latin+cyrillic",
    tags: ["Grotesk"],
    description: "The interface standard: tall x-height, open shapes, legible at any size.",
    source: "rsms/inter",
  },
  {
    id: "ibm-plex-sans",
    family: "IBM Plex Sans",
    kind: "ui",
    files: { 400: "ibm-plex-sans/IBMPlexSans-Variable.ttf" },
    variable: { min: 100, max: 700 },
    scripts: "latin+cyrillic",
    tags: ["Grotesk", "Industrial"],
    description: "IBM's corporate grotesk: engineered, faintly mechanical, even in long text.",
    source: GOOGLE,
  },
  {
    id: "manrope",
    family: "Manrope",
    kind: "ui",
    files: { 400: "manrope/Manrope-Variable.ttf" },
    variable: { min: 200, max: 800 },
    scripts: "latin+cyrillic",
    tags: ["Geometric"],
    description: "A modern geometric on semi-condensed proportions; calm and exact.",
    source: GOOGLE,
  },
  {
    id: "jost",
    family: "Jost",
    kind: "ui",
    files: { 400: "jost/Jost-Variable.ttf" },
    variable: { min: 100, max: 900 },
    scripts: "latin+cyrillic",
    tags: ["Geometric"],
    description: "Futura's lineage: true circles, sharp apexes, an Art Deco poise.",
    source: GOOGLE,
  },
  {
    id: "golos-text",
    family: "Golos Text",
    kind: "ui",
    files: { 400: "golos-text/GolosText-Variable.ttf" },
    variable: { min: 400, max: 900 },
    scripts: "latin+cyrillic",
    tags: ["Grotesk"],
    description: "A Russian text grotesk: Cyrillic drawn first, not added later.",
    source: GOOGLE,
  },
  {
    id: "onest",
    family: "Onest",
    kind: "ui",
    files: { 400: "onest/Onest-Variable.ttf" },
    variable: { min: 100, max: 900 },
    scripts: "latin+cyrillic",
    tags: ["Geometric"],
    description: "A soft geometric grotesk from Moscow; friendly but disciplined.",
    source: GOOGLE,
  },
  {
    id: "exo-2",
    family: "Exo 2",
    kind: "ui",
    files: { 400: "exo-2/Exo2-Variable.ttf" },
    variable: { min: 100, max: 900 },
    scripts: "latin+cyrillic",
    tags: ["Techno"],
    description: "A techno sans with angled terminals; futuristic, still a text face.",
    source: GOOGLE,
  },
  {
    id: "play",
    family: "Play",
    kind: "ui",
    files: { 400: "play/Play-Regular.ttf", 700: "play/Play-Bold.ttf" },
    scripts: "latin+cyrillic",
    tags: ["Squared"],
    description: "Squared letters with soft corners and a tight rhythm: a console menu.",
    source: GOOGLE,
  },
  {
    id: "jura",
    family: "Jura",
    kind: "ui",
    files: { 400: "jura/Jura-Variable.ttf" },
    variable: { min: 300, max: 700 },
    scripts: "latin+cyrillic",
    tags: ["HUD"],
    description: "A light sci-fi sans with flat sides; reads like a cockpit display.",
    source: GOOGLE,
  },
  {
    id: "tektur",
    family: "Tektur",
    kind: "ui",
    files: { 400: "tektur/Tektur-Variable.ttf" },
    variable: { min: 400, max: 900 },
    scripts: "latin+cyrillic",
    tags: ["Squared", "HUD"],
    description: "Chamfered corners on a mechanical skeleton: an arcade control panel.",
    source: GOOGLE,
  },
  {
    id: "space-grotesk",
    family: "Space Grotesk",
    kind: "ui",
    files: { 400: "space-grotesk/SpaceGrotesk-Variable.ttf" },
    variable: { min: 300, max: 700 },
    scripts: "latin",
    tags: ["Grotesk"],
    description: "Space Mono's proportional sibling: a grotesk with odd, deliberate details.",
    source: GOOGLE,
  },
  {
    id: "chakra-petch",
    family: "Chakra Petch",
    kind: "ui",
    files: {
      400: "chakra-petch/ChakraPetch-Regular.ttf",
      500: "chakra-petch/ChakraPetch-Medium.ttf",
      600: "chakra-petch/ChakraPetch-SemiBold.ttf",
    },
    scripts: "latin",
    tags: ["Squared", "HUD"],
    description: "Cut corners on a square skeleton; a HUD face that still reads as text.",
    source: GOOGLE,
  },
  {
    id: "oxanium",
    family: "Oxanium",
    kind: "ui",
    files: { 400: "oxanium/Oxanium-Variable.ttf" },
    variable: { min: 200, max: 800 },
    scripts: "latin",
    tags: ["Squared", "HUD"],
    description: "Octagonal letters from a game interface; the most sci-fi of the set.",
    source: GOOGLE,
  },
  {
    id: "rajdhani",
    family: "Rajdhani",
    kind: "ui",
    files: { 400: "rajdhani/Rajdhani-Regular.ttf", 500: "rajdhani/Rajdhani-Medium.ttf", 600: "rajdhani/Rajdhani-SemiBold.ttf" },
    scripts: "latin",
    tags: ["Condensed", "Squared"],
    description: "Narrow and squared with flat sides; a dense, technical voice.",
    source: GOOGLE,
  },
  {
    id: "barlow",
    family: "Barlow",
    kind: "ui",
    files: { 400: "barlow/Barlow-Regular.ttf", 500: "barlow/Barlow-Medium.ttf", 600: "barlow/Barlow-SemiBold.ttf" },
    scripts: "latin",
    tags: ["Industrial"],
    description: "A low-contrast grotesk modelled on California highway signs.",
    source: GOOGLE,
  },
  {
    id: "syne",
    family: "Syne",
    kind: "ui",
    files: { 400: "syne/Syne-Variable.ttf" },
    variable: { min: 400, max: 800 },
    scripts: "latin",
    tags: ["Expressive"],
    description: "Drawn for a Paris art centre: wide, peculiar, unmistakable.",
    source: GOOGLE,
  },
  {
    id: "bricolage-grotesque",
    family: "Bricolage Grotesque",
    kind: "ui",
    files: { 400: "bricolage-grotesque/BricolageGrotesque-Variable.ttf" },
    variable: { min: 200, max: 800 },
    scripts: "latin",
    tags: ["Grotesk", "Expressive"],
    description: "A grotesk with ink traps and optical sizes: loud in titles, quiet in text.",
    source: GOOGLE,
  },
  {
    id: "sora",
    family: "Sora",
    kind: "ui",
    files: { 400: "sora/Sora-Variable.ttf" },
    variable: { min: 100, max: 800 },
    scripts: "latin",
    tags: ["Geometric"],
    description: "A wide geometric sans, airy and very clean.",
    source: GOOGLE,
  },

  // ---------------- Code ----------------
  {
    id: "jetbrains-mono",
    family: "JetBrains Mono",
    kind: "mono",
    files: { 400: "jetbrains-mono/JetBrainsMono-Regular.ttf" },
    scripts: "latin+cyrillic",
    tags: ["Ligatures"],
    description: "JetBrains' coding face: tall x-height, plain forms, built for long sessions.",
    source: "JetBrains/JetBrainsMono",
  },
  {
    id: "ibm-plex-mono",
    family: "IBM Plex Mono",
    kind: "mono",
    files: { 400: "ibm-plex-mono/IBMPlexMono-Regular.ttf" },
    scripts: "latin+cyrillic",
    tags: ["Slab"],
    description: "IBM's mono with slab details: the typewriter, re-engineered.",
    source: GOOGLE,
  },
  {
    id: "fira-code",
    family: "Fira Code",
    kind: "mono",
    files: { 400: "fira-code/FiraCode-Variable.ttf" },
    variable: { min: 300, max: 700 },
    scripts: "latin+cyrillic",
    tags: ["Ligatures"],
    description: "Fira Mono with programming ligatures; the reference for the genre.",
    source: GOOGLE,
  },
  {
    id: "cascadia-code",
    family: "Cascadia Code",
    kind: "mono",
    files: { 400: "cascadia-code/CascadiaCode-Variable.ttf" },
    variable: { min: 200, max: 700 },
    scripts: "latin+cyrillic",
    tags: ["Ligatures"],
    description: "Windows Terminal's font: rounded, open, with ligatures.",
    source: GOOGLE,
  },
  {
    id: "victor-mono",
    family: "Victor Mono",
    kind: "mono",
    files: { 400: "victor-mono/VictorMono-Regular.ttf" },
    italic: "victor-mono/VictorMono-Italic.ttf",
    scripts: "latin+cyrillic",
    tags: ["Cursive italics", "Ligatures"],
    description: "Narrow and crisp, with a semi-connected cursive italic for comments.",
    source: "rubjo/victor-mono",
  },
  {
    id: "martian-mono",
    family: "Martian Mono",
    kind: "mono",
    files: { 400: "martian-mono/MartianMono-StdRg.ttf" },
    scripts: "latin+cyrillic",
    tags: ["Geometric"],
    description: "Evil Martians' wide geometric mono, for interfaces as much as code.",
    source: "evilmartians/mono",
  },
  {
    id: "geist-mono",
    family: "Geist Mono",
    kind: "mono",
    files: { 400: "geist-mono/GeistMono-Regular.ttf" },
    scripts: "latin+cyrillic",
    tags: ["Grotesk"],
    description: "Geist's monospaced cut: neutral, compact, Swiss in temperament.",
    source: "vercel/geist-font",
  },
  {
    // Monaspace ships its static faces as OpenType only; its TTFs are the "Frozen" variant.
    id: "monaspace-neon",
    family: "Monaspace Neon",
    kind: "mono",
    files: { 400: "monaspace-neon/MonaspaceNeon-Regular.otf" },
    scripts: "latin+cyrillic",
    tags: ["Texture healing", "Ligatures"],
    description: "GitHub's neo-grotesk mono; texture healing evens out the spacing.",
    source: "githubnext/monaspace",
  },
  {
    id: "monaspace-krypton",
    family: "Monaspace Krypton",
    kind: "mono",
    files: { 400: "monaspace-krypton/MonaspaceKrypton-Regular.otf" },
    scripts: "latin+cyrillic",
    tags: ["Industrial", "Texture healing"],
    description: "Monaspace's mechanical cut: flat terminals, engineered, cold.",
    source: "githubnext/monaspace",
  },
  {
    id: "monaspace-xenon",
    family: "Monaspace Xenon",
    kind: "mono",
    files: { 400: "monaspace-xenon/MonaspaceXenon-Regular.otf" },
    scripts: "latin+cyrillic",
    tags: ["Slab", "Texture healing"],
    description: "Monaspace's slab serif: sturdy, close to a typewriter, very readable.",
    source: "githubnext/monaspace",
  },
  {
    id: "monaspace-radon",
    family: "Monaspace Radon",
    kind: "mono",
    files: { 400: "monaspace-radon/MonaspaceRadon-Regular.otf" },
    scripts: "latin+cyrillic",
    tags: ["Handwritten", "Texture healing"],
    description: "Monaspace's handwriting cut: code that looks written by hand.",
    source: "githubnext/monaspace",
  },
  {
    id: "space-mono",
    family: "Space Mono",
    kind: "mono",
    files: { 400: "space-mono/SpaceMono-Regular.ttf" },
    scripts: "latin",
    tags: ["Geometric"],
    description: "A retro-futurist geometric mono after 1960s technical lettering.",
    source: GOOGLE,
  },
  {
    id: "departure-mono",
    family: "Departure Mono",
    kind: "mono",
    files: { 400: "departure-mono/DepartureMono-Regular.otf" },
    scripts: "latin+cyrillic",
    tags: ["Pixel"],
    description: "A pixel font with a lo-fi mission-control spirit; sharpest at 11 or 22 pt.",
    source: "rektdeckard/departure-mono",
  },
  {
    id: "kode-mono",
    family: "Kode Mono",
    kind: "mono",
    files: { 400: "kode-mono/KodeMono-Variable.ttf" },
    variable: { min: 400, max: 700 },
    scripts: "latin",
    tags: ["Squared"],
    description: "A squared technical mono with a game-console tone.",
    source: GOOGLE,
  },
  {
    id: "share-tech-mono",
    family: "Share Tech Mono",
    kind: "mono",
    files: { 400: "share-tech-mono/ShareTechMono-Regular.ttf" },
    scripts: "latin",
    tags: ["HUD"],
    description: "A narrow techno mono: the classic sci-fi readout.",
    source: GOOGLE,
  },
  {
    id: "0xproto",
    family: "0xProto",
    kind: "mono",
    files: { 400: "0xproto/0xProto-Regular.ttf" },
    scripts: "latin",
    tags: ["Ligatures"],
    description: "Clear shapes tuned for small sizes, with unmistakable 0/O and 1/l.",
    source: "0xType/0xProto",
  },
] as const satisfies readonly BundledFont[];

/** A bundled font's id, checked where a preset names its pair. */
export type FontId = (typeof BUNDLED)[number]["id"];

export const FONTS: readonly BundledFont[] = BUNDLED;

export const fontById = (id: string | null): BundledFont | null => FONTS.find((font) => font.id === id) ?? null;

/** One file of a bundled font. */
export interface FontFile {
  weight: FontWeight;
  italic: boolean;
  /** Under fonts/. */
  path: string;
}

/** Every file of a font: its weights, then its italic. */
export function filesOf(font: BundledFont): FontFile[] {
  const files: FontFile[] = [];
  for (const [weight, path] of Object.entries(font.files)) {
    if (path !== undefined) files.push({ weight: Number(weight) as FontWeight, italic: false, path });
  }
  if (font.italic !== undefined) files.push({ weight: 400, italic: true, path: font.italic });
  return files;
}

/** The file that draws this weight: the exact one, else the nearest. */
export function fileFor(font: BundledFont, weight: number, italic = false): FontFile {
  const files = filesOf(font);
  const pool = files.filter((file) => file.italic === italic);
  const candidates = pool.length > 0 ? pool : files;
  return candidates.reduce((best, file) => (Math.abs(file.weight - weight) < Math.abs(best.weight - weight) ? file : best));
}

/** Paseo clamps its own size settings to these ranges (use-settings/storage.ts). */
export const UI_SIZE = { min: 10, max: 21 } as const;
export const CODE_SIZE = { min: 9, max: 22 } as const;

export const WALLPAPER_FOLDER = "~/Pictures/Neon";

const unit = z.number().min(0).max(1);

const wallpaperSchema = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("none") }),
  z.object({ kind: z.literal("gradient"), id: z.string() }),
  z.object({ kind: z.literal("image"), path: z.string() }),
]);
export type Wallpaper = ZodOutput<typeof wallpaperSchema>;

/**
 * Paseo's own settings blob on one device as it was before the plugin first wrote to it; null
 * when the device had none. Kept per Paseo client id, since every device has its own blob.
 */
const backupSchema = z.object({ at: z.string(), blob: z.record(z.string(), z.json()).nullable() });

/**
 * Everything beyond the eight theme colours. The host keeps one copy for every app connected to
 * it; an effect that a platform cannot show is left out there. All of it is off until the studio
 * turns it on.
 */
export const styleSettings = defineSettings({
  id: "style",
  scope: "host",
  version: 1,
  schema: z.object({
    fonts: z
      .object({
        enabled: z.boolean().default(false),
        /** A FONTS id; null keeps Paseo's system font. */
        ui: z.string().nullable().default(null),
        mono: z.string().nullable().default(null),
        /** Picking a preset also picks its font pair; picking a font by hand turns this off. */
        follow: z.boolean().default(true),
        /** Paseo's own size settings; null leaves them as they are. */
        uiSize: z.number().int().min(UI_SIZE.min).max(UI_SIZE.max).nullable().default(null),
        codeSize: z.number().int().min(CODE_SIZE.min).max(CODE_SIZE.max).nullable().default(null),
      })
      .prefault({}),
    /** Paseo's syntax theme follows the preset. */
    syntax: z.boolean().default(false),
    fx: z
      .object({
        enabled: z.boolean().default(false),
        wallpaper: wallpaperSchema.default({ kind: "none" }),
        /** Where the image wallpapers are listed from, on the host. */
        folder: z.string().default(WALLPAPER_FOLDER),
        blur: z.number().min(0).max(40).default(16),
        dim: unit.default(0.4),
        glass: unit.default(0.6),
        scanlines: unit.default(0),
        grain: unit.default(0),
        vignette: unit.default(0),
        glow: unit.default(0),
      })
      .prefault({}),
    backup: z.record(z.string(), backupSchema).default({}),
  }),
});

export type StyleValues = ZodOutput<typeof styleSettings.schema>;
export type FxValues = StyleValues["fx"];
export type FontValues = StyleValues["fonts"];

export const fontsRpc = defineRpc({
  name: "style.fonts",
  input: z.object({}),
  output: z.object({
    /** The registry's fonts whose files are all present, with their size on disk. */
    fonts: z.array(
      z.object({
        id: z.string(),
        family: z.string(),
        kind: z.enum(["ui", "mono"]),
        scripts: z.enum(["latin", "latin+cyrillic"]),
        tags: z.array(z.string()),
        bytes: z.number(),
      }),
    ),
    error: z.string().nullable(),
  }),
});

export const fontRpc = defineRpc({
  name: "style.font",
  /** The file that draws this weight (the nearest one there is), upright unless `italic`. */
  input: z.object({ id: z.string(), weight: z.number(), italic: z.boolean().optional() }),
  output: z.object({ base64: z.string(), format: z.enum(["truetype", "opentype"]) }),
});

export const wallpapersRpc = defineRpc({
  name: "style.wallpapers",
  /** Lists the folder in the style settings, never one named by the caller. */
  input: z.object({}),
  output: z.object({
    /** The folder as the host resolved it. */
    folder: z.string(),
    images: z.array(z.object({ name: z.string(), path: z.string(), bytes: z.number() })),
    error: z.string().nullable(),
  }),
});

export const wallpaperRpc = defineRpc({
  name: "style.wallpaper",
  input: z.object({ path: z.string() }),
  output: z.object({ base64: z.string(), mimeType: z.string() }),
});
