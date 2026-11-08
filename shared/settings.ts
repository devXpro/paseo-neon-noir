import { defineSettings } from "@getpaseo/plugin";
import { z } from "zod";
import { PRESETS, type Preset } from "./presets.ts";

/** The Adjust panel's groups. */
export type KnobGroup = "accent" | "background" | "text" | "second";

export interface KnobSpec {
  id: keyof Knobs;
  label: string;
  group: KnobGroup;
  min: number;
  max: number;
  step: number;
  nullable?: boolean;
  /** An OKLCH hue: the accent's own ("absolute"), or an offset from it ("offset"). */
  hue?: "absolute" | "offset";
}

/**
 * The studio's knobs, in the order the UI shows them. `step` is the slider grid; the engine
 * accepts any value in range. `ring` is the only nullable one: null is a neutral grey ring.
 */
export const KNOBS: readonly KnobSpec[] = [
  { id: "hue", label: "Colour", group: "accent", min: 0, max: 360, step: 1, hue: "absolute" },
  { id: "neon", label: "Saturation", group: "accent", min: 0, max: 1, step: 0.01 },
  { id: "glow", label: "Brightness", group: "accent", min: 0, max: 1, step: 0.01 },
  { id: "depth", label: "Brightness", group: "background", min: 0, max: 1, step: 0.01 },
  { id: "tint", label: "Tint", group: "background", min: 0, max: 1, step: 0.01 },
  { id: "field", label: "Tint Colour", group: "background", min: -180, max: 180, step: 1, hue: "offset" },
  { id: "contrast", label: "Contrast", group: "text", min: 0, max: 1, step: 0.01 },
  { id: "ring", label: "Colour", group: "second", min: -180, max: 180, step: 1, nullable: true, hue: "offset" },
] as const;

/** One complete knob set. Angles are OKLCH degrees; everything else is 0..1. */
export type Knobs = {
  /** Accent hue, 0..360. */
  hue: number;
  /** Accent chroma: 0 = a rich muted tone (bronze, sage, pewter), 1 = the most saturated sRGB colour of that hue. */
  neon: number;
  /** Accent lightness within what stays readable: 0 = the deepest accent that still carries the background as text at 4.5:1, 0.5 = the default, 1 = near-white at that hue. */
  glow: number;
  /** Background lightness, perceptual: 0 = pure black, 1 = graphite (about #242424). */
  depth: number;
  /** How strongly the field hue colours the background, surfaces, border and text. 0 = neutral grey. */
  tint: number;
  /** Text brightness: foreground 15.4:1 at 0, up to nearly white-on-background at 1; muted text and the ring follow. */
  contrast: number;
  /** Ring hue as an offset from the accent, -180..180 (the engine wraps any angle); null = a neutral grey ring. */
  ring: number | null;
  /** Hue offset of the background and surface tint from the accent, -180..180 (wrapped); 0 = the accent's own hue. */
  field: number;
};

export const knobsSchema = z.object({
  hue: z.number().min(0).max(360),
  neon: z.number().min(0).max(1),
  glow: z.number().min(0).max(1),
  depth: z.number().min(0).max(1),
  tint: z.number().min(0).max(1),
  contrast: z.number().min(0).max(1),
  ring: z.number().min(-180).max(180).nullable(),
  field: z.number().min(-180).max(180),
}) satisfies z.ZodType<Knobs>;

export const DEFAULT_PRESET_ID = "noir";

/** The preset with this id; an unknown id falls back to the default, as resolveTheme does. */
export function presetById(id: string): Preset {
  return PRESETS.find((preset) => preset.id === id) ?? PRESETS.find((preset) => preset.id === DEFAULT_PRESET_ID) ?? PRESETS[0];
}

/** This preset's edited knobs, or null while it is as it ships. */
export function editOf(edits: Readonly<Record<string, Knobs>>, presetId: string): Knobs | null {
  return Object.prototype.hasOwnProperty.call(edits, presetId) ? edits[presetId] : null;
}

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

/**
 * A file saved before edits were kept per preset holds one `knobs` set (null = untouched) for the
 * preset picked then: it becomes that preset's edit. Edits already in the file win.
 */
function migrateKnobs(input: unknown): unknown {
  if (!isRecord(input) || !("knobs" in input)) return input;
  const { knobs, ...rest } = input;
  if (knobs === null || knobs === undefined) return rest;
  const presetId = typeof rest.presetId === "string" ? rest.presetId : DEFAULT_PRESET_ID;
  return { ...rest, edits: { [presetId]: knobs, ...(isRecord(rest.edits) ? rest.edits : {}) } };
}

/**
 * The host keeps one choice for every app connected to it: the preset picked, and the knobs of
 * every preset that was adjusted. A preset without an entry in `edits` is as it ships.
 */
export const studioSettings = defineSettings({
  id: "studio",
  scope: "host",
  version: 1,
  schema: z.preprocess(
    migrateKnobs,
    z.object({
      presetId: z.string().default(DEFAULT_PRESET_ID),
      edits: z.record(z.string(), knobsSchema).default({}),
    }),
  ),
});
