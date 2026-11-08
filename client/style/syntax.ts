import { PRESETS, type SyntaxThemeId } from "../../shared/presets.ts";
import { DEFAULT_PRESET_ID } from "../../shared/settings.ts";

export const SYNTAX_LABELS: Readonly<Record<SyntaxThemeId, string>> = {
  github: "GitHub",
  catppuccin: "Catppuccin",
  dracula: "Dracula",
  "tokyo-night": "Tokyo Night",
  one: "One",
  nord: "Nord",
  gruvbox: "Gruvbox",
  solarized: "Solarized",
};

/** The preset's own syntax theme; an unknown id falls back as resolveTheme does. */
export function syntaxFor(presetId: string): SyntaxThemeId {
  const preset =
    PRESETS.find((candidate) => candidate.id === presetId) ??
    PRESETS.find((candidate) => candidate.id === DEFAULT_PRESET_ID) ??
    PRESETS[0];
  return preset?.syntax ?? "one";
}
