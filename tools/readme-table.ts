// Run: node tools/readme-table.ts. Prints README.md's preset table from the presets as they are;
// `node tools/readme-table.ts fonts` prints its font table from the registry.

import { resolveTheme } from "../shared/engine.ts";
import { PRESETS } from "../shared/presets.ts";
import { FONTS, fontById } from "../shared/style.ts";

// Upper bounds of OKLCH hue names, in degrees.
const HUES: [number, string][] = [
  [15, "rose"], [40, "red"], [65, "orange"], [90, "amber"], [115, "yellow"], [135, "lime"],
  [160, "green"], [190, "teal"], [215, "cyan"], [245, "azure"], [270, "blue"], [290, "indigo"],
  [315, "violet"], [340, "magenta"], [360, "pink"],
];
const hueName = (h: number) => HUES.find(([max]) => ((h % 360) + 360) % 360 < max)![1];
const family = (id: string) => fontById(id)?.family ?? id;

function presetRows(): string[][] {
  const rows = [["Preset", "Collection", "Accent", "Second hue", "Syntax", "Fonts", "Tagline"]];
  for (const p of PRESETS) {
    const { knobs: k, colors } = resolveTheme(p.id, null);
    // A ring or field within 20 degrees of the accent reads as the same hue.
    const ring = k.ring !== null && Math.abs(k.ring) >= 20 ? hueName(k.hue + k.ring) : null;
    const field = k.tint >= 0.4 && Math.abs(k.field) >= 20 ? hueName(k.hue + k.field) : null;
    const second =
      ring && field ? (ring === field ? `${ring} ring and field` : `${ring} ring, ${field} field`)
      : ring ? `${ring} ring` : field ? `${field} field` : "none";
    const fonts = `${family(p.fonts.ui)} / ${family(p.fonts.code)}`;
    rows.push([p.name, p.collection, `\`${colors.accent}\``, second, p.syntax, fonts, p.tagline]);
  }
  return rows;
}

function fontRows(): string[][] {
  const rows = [["Family", "Kind", "Scripts", "Tags", "Source"]];
  for (const f of FONTS) {
    const scripts = f.scripts === "latin+cyrillic" ? "Latin, Cyrillic" : "Latin";
    rows.push([f.family, f.kind === "ui" ? "Interface" : "Code", scripts, f.tags.join(", "), f.source]);
  }
  return rows;
}

const rows = process.argv[2] === "fonts" ? fontRows() : presetRows();
const widths = rows[0].map((_, i) => Math.max(...rows.map((r) => r[i].length)));
const line = (r: string[]) => `| ${r.map((c, i) => c.padEnd(widths[i])).join(" | ")} |`;
console.log([line(rows[0]), line(widths.map((w) => "-".repeat(w))), ...rows.slice(1).map(line)].join("\n"));
