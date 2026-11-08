import type { Knobs } from "./settings.ts";
import type { FontId } from "./style.ts";

/** Paseo's syntax highlighting themes (SyntaxThemeId in @getpaseo/highlight, Paseo 0.15). */
export type SyntaxThemeId =
  | "github"
  | "catppuccin"
  | "dracula"
  | "tokyo-night"
  | "one"
  | "nord"
  | "gruvbox"
  | "solarized";

export interface Preset {
  id: string;
  name: string;
  /** Short group name the studio files the preset under: Ink, Neon, Terminal, Luxe, Frost. */
  collection: string;
  /** The syntax highlighting theme that sits best with the preset. */
  syntax: SyntaxThemeId;
  tagline: string;
  /** The interface and code fonts that suit the preset; the studio applies them when fonts follow the preset. */
  fonts: { ui: FontId; code: FontId };
  knobs: Knobs;
}

// Every preset is a knob set on the slider grid; generate() turns it into colours. All are dark.
// Collections in studio order; within one, the strongest preset first.
// Two lines above each preset say what it depicts and why the numbers are what they are.
// noir, acid, replicant, kowloon, grid, phosphor, ultraviolet, hologram and obsidian (now
// Monolith) keep the ids of earlier releases, so a saved choice survives.
export const PRESETS: Preset[] = [
  // ---------------- Ink ----------------

  // The archetype: a #000 field, neutral greys and a crimson at full chroma, nothing else coloured.
  // Contrast 0.75 keeps the white crisp; the neutral ring stops red leaking into small text.
  {
    id: "noir", name: "Noir", collection: "Ink", syntax: "one",
    tagline: "Pure black, one red slash.",
    fonts: { ui: "ibm-plex-sans", code: "ibm-plex-mono" },
    knobs: { hue: 21, neon: 1, glow: 0.5, depth: 0, tint: 0, contrast: 0.75, ring: null, field: 0 },
  },

  // A black slab under plain white light: true #000, neutral greys, no hue anywhere.
  // neon 0 at glow 1 is the whitest accent the engine makes; contrast 0.25 keeps prose below a glare.
  {
    id: "obsidian", name: "Monolith", collection: "Ink", syntax: "one",
    tagline: "Black slab, white light.",
    fonts: { ui: "geist", code: "geist-mono" },
    knobs: { hue: 250, neon: 0, glow: 1, depth: 0, tint: 0, contrast: 0.25, ring: null, field: 0 },
  },

  // A graphite instrument body with a single signal switch.
  // depth 0.78 is graphite; tint 0.12 at field 173 (hue 222, the orange's complement) cools the grey so the orange pops.
  {
    id: "graphite", name: "Graphite", collection: "Ink", syntax: "one",
    tagline: "A graphite instrument with one orange switch.",
    fonts: { ui: "barlow", code: "jetbrains-mono" },
    knobs: { hue: 49, neon: 0.94, glow: 0.51, depth: 0.78, tint: 0.12, contrast: 0.5, ring: null, field: 173 },
  },

  // The loudest accent (17:1) gets the quietest field: near-neutral ink with a cool cast.
  // The cyan ring is the second hue and stays out of the surfaces, so it reads as a signal.
  {
    id: "acid", name: "Acid", collection: "Ink", syntax: "dracula",
    tagline: "Hazard yellow on cold ink.",
    fonts: { ui: "space-grotesk", code: "space-mono" },
    knobs: { hue: 104, neon: 1, glow: 0.5, depth: 0.06, tint: 0.12, contrast: 0.5, ring: 110, field: 150 },
  },

  // An aqua projection on near-neutral black; the periwinkle ring is the fringe at its edge.
  // Neutral surfaces keep it clear of Grid's teal.
  {
    id: "hologram", name: "Hologram", collection: "Ink", syntax: "tokyo-night",
    tagline: "Aqua light with a violet fringe.",
    fonts: { ui: "jura", code: "monaspace-krypton" },
    knobs: { hue: 180, neon: 1, glow: 0.55, depth: 0.04, tint: 0.25, contrast: 0.5, ring: 100, field: 0 },
  },

  // A violet lamp in a cool, almost colourless room; ring 0 puts the faint text in the lamp's violet.
  // Kept apart from Kowloon on purpose: Kowloon owns the violet glass, Ultraviolet owns the light.
  {
    id: "ultraviolet", name: "Ultraviolet", collection: "Ink", syntax: "tokyo-night",
    tagline: "One blacklight tube in a dark room.",
    fonts: { ui: "manrope", code: "monaspace-neon" },
    knobs: { hue: 298, neon: 1, glow: 0.55, depth: 0.02, tint: 0.3, contrast: 0.55, ring: 0, field: -40 },
  },

  // ---------------- Neon ----------------

  // Magenta tube over violet black glass (depth 0.25, tint 0.8). The one lavender ring in the set,
  // allowed because it echoes the glass: two neighbouring hues, so it reads lush, not loud.
  {
    id: "kowloon", name: "Kowloon", collection: "Neon", syntax: "dracula",
    tagline: "Magenta signage in a violet alley.",
    fonts: { ui: "chakra-petch", code: "monaspace-krypton" },
    knobs: { hue: 338, neon: 1, glow: 0.5, depth: 0.25, tint: 0.8, contrast: 0.5, ring: -46, field: -40 },
  },

  // The film grade: orange against its complement, teal soaking both the glass and the ring.
  // Depth 0.21 makes wet black instead of void; the tinted glass is what separates it from Acid.
  {
    id: "replicant", name: "Replicant", collection: "Neon", syntax: "tokyo-night",
    tagline: "Orange neon over teal-black rain.",
    fonts: { ui: "sora", code: "monaspace-radon" },
    knobs: { hue: 54, neon: 1, glow: 0.5, depth: 0.21, tint: 0.55, contrast: 0.45, ring: 145, field: 166 },
  },

  // Azure over navy glass with a steel ring: one hue from floor to signal. Hue 250, not cobalt 262,
  // so the black label on the button reads at 6.4:1 instead of 4.6:1.
  {
    id: "reactor", name: "Reactor", collection: "Neon", syntax: "tokyo-night",
    tagline: "Blue glow at the bottom of the pool.",
    fonts: { ui: "oxanium", code: "martian-mono" },
    knobs: { hue: 250, neon: 1, glow: 0.5, depth: 0.25, tint: 0.85, contrast: 0.5, ring: 0, field: -8 },
  },

  // Uranium-glass lime against a violet-black field (tint 0.8). The hues are complementary,
  // but the violet lives only in the blacks, so it stays strict rather than toxic.
  {
    id: "uranium", name: "Uranium", collection: "Neon", syntax: "tokyo-night",
    tagline: "Antique glass, glowing from within.",
    fonts: { ui: "tektur", code: "kode-mono" },
    knobs: { hue: 126, neon: 1, glow: 0.45, depth: 0.13, tint: 0.8, contrast: 0.5, ring: null, field: 165 },
  },

  // The whole frame lit red: oxblood glass (field -24, toward crimson so it never turns brown)
  // under a deep vermilion at hue 42, clear of Paseo's diff red. Low glow and low contrast keep it dim.
  {
    id: "darkroom", name: "Darkroom", collection: "Neon", syntax: "one",
    tagline: "Prints rising under the safelight.",
    fonts: { ui: "bricolage-grotesque", code: "victor-mono" },
    knobs: { hue: 42, neon: 1, glow: 0.25, depth: 0.12, tint: 0.75, contrast: 0.25, ring: null, field: -24 },
  },

  // ---------------- Terminal ----------------

  // Monochrome green on pure black: field, ring and accent share one hue, so Paseo's fixed greens
  // (diff, success) read as part of the screen. The ring sits 10 degrees cooler to avoid sage mud.
  {
    id: "phosphor", name: "Phosphor", collection: "Terminal", syntax: "dracula",
    tagline: "Green glow on black glass.",
    fonts: { ui: "rajdhani", code: "share-tech-mono" },
    knobs: { hue: 145, neon: 1, glow: 0.5, depth: 0, tint: 0.75, contrast: 0.5, ring: 10, field: 0 },
  },

  // Amber phosphor on pure black; field -25 turns the trace of warmth in the surfaces toward orange,
  // never olive. Neutral ring, soft contrast: the calmest preset of the set.
  {
    id: "amber", name: "Amber", collection: "Terminal", syntax: "gruvbox",
    tagline: "A 1983 terminal, warm in the dark.",
    fonts: { ui: "play", code: "departure-mono" },
    knobs: { hue: 79, neon: 1, glow: 0.45, depth: 0, tint: 0.25, contrast: 0.4, ring: null, field: -25 },
  },

  // A vector display: a cyan line in a black void (depth 0), teal only in the surfaces and the ring.
  // Teal rings take 85% of their small gamut, so timestamps glow instead of greying.
  {
    id: "grid", name: "Grid", collection: "Terminal", syntax: "tokyo-night",
    tagline: "Cyan wireframe on a dark void.",
    fonts: { ui: "exo-2", code: "0xproto" },
    knobs: { hue: 210, neon: 1, glow: 0.5, depth: 0, tint: 0.75, contrast: 0.55, ring: 0, field: 0 },
  },

  // ---------------- Luxe ----------------

  // Black lacquer with polished brass inlay.
  // depth 0 lacquer, faint warm greys (tint 0.2, field -30 keeps them off olive); ring -35 is copper faint text; neon 0.86 is the brightest gold.
  {
    id: "brass-deco", name: "Brass Deco", collection: "Luxe", syntax: "gruvbox",
    tagline: "Polished brass on black lacquer.",
    fonts: { ui: "jost", code: "ibm-plex-mono" },
    knobs: { hue: 92, neon: 0.86, glow: 0.58, depth: 0, tint: 0.2, contrast: 0.5, ring: -35, field: -30 },
  },

  // Lapis lazuli: ultramarine with pyrite flecks.
  // Full ultramarine (neon 1) on deep navy (depth 0.25); ring 150 (hue 59) makes faint text bronze flecks, as gold reads khaki.
  {
    id: "lapis", name: "Lapis", collection: "Luxe", syntax: "tokyo-night",
    tagline: "Ultramarine stone with flecks of gold.",
    fonts: { ui: "golos-text", code: "martian-mono" },
    knobs: { hue: 269, neon: 1, glow: 0.5, depth: 0.25, tint: 0.9, contrast: 0.57, ring: 150, field: -2 },
  },

  // Emerald velvet and old gilt: two hues.
  // field +63 = hue 158 at depth 0.3, tint 0.85: velvet that stays near black; hue 95, neon 0.8, glow 0.35 is deep old gold.
  {
    id: "emerald-velvet", name: "Emerald Velvet", collection: "Luxe", syntax: "gruvbox",
    tagline: "Green velvet, old gilt.",
    fonts: { ui: "syne", code: "monaspace-xenon" },
    knobs: { hue: 95, neon: 0.8, glow: 0.35, depth: 0.3, tint: 0.85, contrast: 0.5, ring: null, field: 63 },
  },

  // Claret leather with ivory stitching: two hues.
  // field -74 puts the surfaces at hue 10, claret rather than brown (depth 0.35, tint 0.85); neon 0.12 at glow 0.85 = ivory thread.
  {
    id: "oxblood", name: "Oxblood", collection: "Luxe", syntax: "gruvbox",
    tagline: "Oxblood leather, ivory stitching.",
    fonts: { ui: "onest", code: "victor-mono" },
    knobs: { hue: 84, neon: 0.12, glow: 0.85, depth: 0.35, tint: 0.85, contrast: 0.52, ring: null, field: -74 },
  },

  // ---------------- Frost ----------------

  // Polar night: black, frosted blue surfaces, crisp white text.
  // A deep ice-blue (hue 228, glow 0.2, well clear of Paseo's running blue); contrast 1 is the 18:1 ceiling; ring 12 gives steel-blue timestamps.
  {
    id: "arctic", name: "Arctic", collection: "Frost", syntax: "nord",
    tagline: "Polar night, breath on cold glass.",
    fonts: { ui: "inter", code: "fira-code" },
    knobs: { hue: 228, neon: 0.85, glow: 0.2, depth: 0.03, tint: 0.69, contrast: 1, ring: 12, field: 4 },
  },

  // An aurora: a green curtain over a night sky that leans violet.
  // field +105 puts the sky at hue 275 (depth 0.3, tint 0.85); hue 170 keeps the jade clear of Paseo's success green.
  {
    id: "borealis", name: "Borealis", collection: "Frost", syntax: "nord",
    tagline: "Green light across a frozen sky.",
    fonts: { ui: "manrope", code: "cascadia-code" },
    knobs: { hue: 170, neon: 0.9, glow: 0.3, depth: 0.3, tint: 0.85, contrast: 0.8, ring: null, field: 105 },
  },
];
