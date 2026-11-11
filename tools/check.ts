// Run: node tools/check.ts (or npm run check). Prints the contrast table of every preset, the
// closest accents and chat views with the design review's warnings, each preset's status colours,
// fuzzes generate() and the status colours over the whole knob space, and exits 1 on any guarantee
// violation. Warnings never fail the run.

import {
  LIMITS, contrastRatio, deltaE, fit, generate, hexToOklch, metrics, normalizeKnobs, resolveStatus, resolveTheme,
  statusColors, statusViolations, violations, type Mode, type StatusColors, type ThemeColors,
} from "../shared/engine.ts";

const MODES: Mode[] = ["dark", "light"];
import { PRESETS } from "../shared/presets.ts";
import { DEFAULT_PRESET_ID, KNOBS, knobsSchema, type Knobs } from "../shared/settings.ts";

const f = (n: number, d = 2) => n.toFixed(d);
const pad = (s: string, n: number) => s.padEnd(n);
const problems: string[] = [];

// ---- presets ----
const ids = new Set(PRESETS.map((p) => p.id));
if (!PRESETS.length) problems.push("no presets");
if (ids.size !== PRESETS.length) problems.push("duplicate preset ids");
if (!ids.has(DEFAULT_PRESET_ID)) problems.push(`default preset "${DEFAULT_PRESET_ID}" missing`);
// The studio groups tiles by collection, so each collection must be one run of the list.
const runs = PRESETS.map((p) => p.collection).filter((c, i, a) => i === 0 || a[i - 1] !== c);
if (new Set(runs).size !== runs.length) problems.push(`collections are interleaved: ${runs.join(", ")}`);
for (const p of PRESETS) {
  if (!/^[a-z][a-z0-9-]*$/.test(p.id)) problems.push(`${p.id}: id must be lowercase letters, digits, hyphens`);
  if (!p.name || !p.collection || !p.tagline) problems.push(`${p.id}: name, collection and tagline are required`);
  if (!knobsSchema.safeParse(p.knobs).success) problems.push(`${p.id}: knobs fail knobsSchema`);
  for (const k of KNOBS) {
    const v = p.knobs[k.id];
    if (v !== null && Math.abs(v / k.step - Math.round(v / k.step)) > 1e-6) problems.push(`${p.id}: ${k.id} ${v} is off the slider grid`);
  }
}

for (const mode of MODES) {
  console.log(`== Presets, ${mode} (WCAG ratios against the background) ==`);
  console.log(pad("preset", 16) + pad("collection", 11) + pad("accent", 9) + pad("bg", 9) + "fg     muted  onAcc  ring   border raised ctrl   violations");
  for (const p of PRESETS) {
    const t = resolveTheme(p.id, null, mode).colors;
    const m = metrics(t);
    const v = violations(t);
    if (v.length) problems.push(`${p.id} ${mode}: ${v.join(",")}`);
    console.log(
      pad(p.name, 16) + pad(p.collection, 11) + pad(t.accent, 9) + pad(t.background, 9) +
      [m.fg, m.muted, m.onAccent, m.ring, m.border, m.raised, m.control].map((x) => pad(f(x), 6)).join(" ") +
      " " + (v.length ? v.join(",") : "ok"),
    );
  }
  console.log("");
}

// ---- design review: warnings, not failures ----
// Colours a plugin theme cannot change, which an accent should not imitate.
const PASEO_FIXED: [string, string][] = [
  ["#5CAAF6", "running blue"], ["#EF4444", "diff red"], ["#DB932E", "warning amber"],
  ["#D8847B", "status danger"], ["#4ADE80", "diff green"], ["#C64F43", "destructive red"],
  ["#35C264", "success dot"],
];
// What the chat view shows of a theme: the field (weighted 3x), the user bubble and the faint text.
const chatDistance = (a: ThemeColors, b: ThemeColors) =>
  3 * deltaE(a.background, b.background) + deltaE(a.border, b.border) + deltaE(a.ring, b.ring);
// Warnings the design review saw and kept, with its reason. Pair keys list the ids alphabetically.
const ACCEPTED: Record<string, string> = {
  "fixed noir #EF4444": "the archetype's crimson; no red near it clears Paseo's diff red",
  "chat noir/obsidian": "the pure-black archetypes share the void; crimson vs white (accents 41.8 apart) tells them apart",
  "chat amber/noir": "pure black by design, a CRT and a slash; amber vs crimson (27.2) tells them apart",
  "chat amber/obsidian": "pure black by design; amber vs white (23.6) tells them apart",
  "chat amber/brass-deco": "pure black by design; a copper ring and gold vs a grey ring and amber (rings 7.2, accents 7.8 apart)",
  "accent graphite/replicant": "one orange in two worlds, graphite vs teal glass (chat views 47.6 apart)",
};

const themes = PRESETS.map((p) => ({ p, t: resolveTheme(p.id, null).colors }));
const warnings: [string, string][] = [];
for (const { p, t } of themes) {
  for (const [hex, name] of PASEO_FIXED) {
    const d = deltaE(t.accent, hex);
    if (d < 6) warnings.push([`fixed ${p.id} ${hex}`, `${p.name}: accent ${t.accent} is ${f(d, 1)} from Paseo's ${name} ${hex}`]);
  }
  const [bL, bC, bH] = hexToOklch(t.background);
  if (bL >= 0.18 && bL <= 0.23 && bC >= 0.02 && !(bH >= 200 && bH <= 270))
    warnings.push([`mud ${p.id}`, `${p.name}: background ${t.background} is a coloured grey (L ${f(bL)}, C ${f(bC, 3)})`]);
  const fieldH = (((p.knobs.hue + p.knobs.field) % 360) + 360) % 360;
  if (fieldH >= 70 && fieldH <= 110 && p.knobs.tint > 0.4)
    warnings.push([`olive ${p.id}`, `${p.name}: field hue ${f(fieldH, 0)} at tint ${p.knobs.tint} reads olive`]);
}
const accentPairs: [number, string][] = [];
const chatPairs: [number, string][] = [];
for (let i = 0; i < themes.length; i++)
  for (let j = i + 1; j < themes.length; j++) {
    const a = themes[i], b = themes[j];
    const key = [a.p.id, b.p.id].sort().join("/"), names = `${a.p.name} / ${b.p.name}`;
    const da = deltaE(a.t.accent, b.t.accent), dc = chatDistance(a.t, b.t);
    accentPairs.push([da, names]);
    chatPairs.push([dc, names]);
    if (da < 6) warnings.push([`accent ${key}`, `${names}: accents ${f(da, 1)} apart`]);
    if (dc < 8) warnings.push([`chat ${key}`, `${names}: chat views ${f(dc, 1)} apart`]);
  }
for (const [label, list] of [["accents (OKLab dE x100)", accentPairs], ["chat views (3 bg + border + ring)", chatPairs]] as const) {
  console.log(`\n== Closest ${label} ==`);
  for (const [d, n] of [...list].sort((x, y) => x[0] - y[0]).slice(0, 8)) console.log(f(d, 1).padStart(5), n);
}
const accepted = warnings.filter(([k]) => ACCEPTED[k]).length;
console.log(`\n== Design warnings: ${warnings.length}, ${accepted} accepted by the review ==`);
for (const [key, text] of warnings) console.log(ACCEPTED[key] ? `  accepted  ${text}: ${ACCEPTED[key]}` : `  WARN      ${text}`);

// fit() is best effort; this shows how faithfully it recovers each preset's accent.
let fitWorst = 0, fitName = "";
for (const p of PRESETS) {
  const t = generate(p.knobs);
  const d = deltaE(t.accent, generate(fit(t)).accent);
  if (d >= fitWorst) { fitWorst = d; fitName = p.name; }
}
console.log(`\n== fit() round trip: worst accent dE ${f(fitWorst)} (${fitName}) ==`);

// ---- fuzz ----
function rng(seed: number) {
  return () => {
    seed |= 0; seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const rand = rng(20261108);
const pick = <T,>(a: T[]) => a[Math.floor(rand() * a.length)];
const edge = () => pick([0, 1, rand()]);

const cases: Knobs[] = [];
for (let hue = 0; hue < 360; hue += 5)
  for (const neon of [0, 0.5, 1]) for (const glow of [0, 0.5, 1]) for (const depth of [0, 1])
    for (const tint of [0, 1]) for (const contrast of [0, 1]) for (const ring of [null, 0, 120])
      cases.push({ hue, neon, glow, depth, tint, contrast, ring, field: ring === null ? 0 : 150 });
for (let i = 0; i < 30000; i++) {
  cases.push({
    hue: rand() * 360, neon: edge(), glow: edge(), depth: edge(), tint: edge(), contrast: edge(),
    // Angles beyond +-180 exercise the wrap.
    ring: rand() < 0.4 ? null : -540 + rand() * 1080, field: -540 + rand() * 1080,
  });
}

for (const mode of MODES) {
const fails: Record<string, number> = {};
const worst = { fgMin: 99, fgMax: 0, mutedMin: 99, onAccentMin: 99, ringMin: 99, ringMax: 0, borderMin: 99, borderMax: 0, raisedMin: 99, raisedMax: 0, controlMin: 99, controlMax: 0 };
const bad: { k: Knobs; v: string[] }[] = [];
const started = Date.now();
for (const c of cases) {
  const k = normalizeKnobs(c);
  const t = generate(k, mode);
  const m = metrics(t);
  worst.fgMin = Math.min(worst.fgMin, m.fg); worst.fgMax = Math.max(worst.fgMax, m.fg);
  worst.mutedMin = Math.min(worst.mutedMin, m.muted);
  worst.onAccentMin = Math.min(worst.onAccentMin, m.onAccent);
  worst.ringMin = Math.min(worst.ringMin, m.ring); worst.ringMax = Math.max(worst.ringMax, m.ring);
  worst.borderMin = Math.min(worst.borderMin, m.border); worst.borderMax = Math.max(worst.borderMax, m.border);
  worst.raisedMin = Math.min(worst.raisedMin, m.raised); worst.raisedMax = Math.max(worst.raisedMax, m.raised);
  worst.controlMin = Math.min(worst.controlMin, m.control); worst.controlMax = Math.max(worst.controlMax, m.control);
  const v = violations(t);
  for (const x of v) fails[x] = (fails[x] ?? 0) + 1;
  if (v.length && bad.length < 5) bad.push({ k, v });
}
const ms = (Date.now() - started) / cases.length;

console.log(`\n== Fuzz, ${mode}: ${cases.length} knob sets, ${f(ms, 3)} ms per theme ==`);
console.log("limits :", JSON.stringify(LIMITS));
console.log("worst  :", JSON.stringify(Object.fromEntries(Object.entries(worst).map(([a, b]) => [a, +b.toFixed(3)]))));
console.log("fails  :", JSON.stringify(fails));
for (const b of bad) console.log("  e.g.", JSON.stringify(b.k), b.v.join(","), JSON.stringify(generate(b.k, mode)));

const fuzzFails = Object.values(fails).reduce((a, b) => a + b, 0);
if (fuzzFails) problems.push(`fuzz ${mode}: ${fuzzFails} violations`);
}

// ---- status colours ----
const triples: { id: string; s: StatusColors }[] = [];
for (const mode of MODES) {
  console.log(`\n== Status colours, ${mode} (ratios on background / card, distance from accent) ==`);
  for (const p of PRESETS) {
    const { knobs, colors: t } = resolveTheme(p.id, null, mode);
    const s = resolveStatus(p, knobs, t, mode);
    if (mode === "dark") triples.push({ id: p.id, s });
    const v = statusViolations(s, t);
    if (v.length) problems.push(`${p.id} status ${mode}: ${v.join(",")}`);
    const cell = (hex: string) =>
      `${hex} ${f(contrastRatio(hex, t.background), 1)}/${f(contrastRatio(hex, t.raised), 1)} d${f(deltaE(hex, t.accent), 1)}`;
    console.log(pad(p.name, 16) + [cell(s.success), cell(s.warning), cell(s.danger)].map((c) => pad(c, 28)).join("") + (v.length ? v.join(",") : "ok"));
  }
}
// One formula on many backgrounds is the failure this report exists to catch.
const tripleGaps: [number, string][] = [];
for (let i = 0; i < triples.length; i++)
  for (let j = i + 1; j < triples.length; j++) {
    const a = triples[i], b = triples[j];
    const d = (deltaE(a.s.success, b.s.success) + deltaE(a.s.warning, b.s.warning) + deltaE(a.s.danger, b.s.danger)) / 3;
    tripleGaps.push([d, `${a.id} / ${b.id}`]);
  }
console.log("\n== Closest status triples (mean of the three distances) ==");
for (const [d, n] of tripleGaps.sort((x, y) => x[0] - y[0]).slice(0, 8)) console.log(f(d, 1).padStart(5), n);

const statusRand = rng(20261109);
const statusPick = <T,>(a: T[]) => a[Math.floor(statusRand() * a.length)];
function knobsNear(base: Knobs): Knobs {
  const toEdge = statusRand() < 0.5;
  const unit = () => (toEdge ? statusPick([0, 0.5, 1]) : statusRand());
  const angle = () => (toEdge ? statusPick([-180, -90, 0, 90, 180]) : -180 + statusRand() * 360);
  const keep = () => statusRand() < 0.25;
  return {
    hue: keep() ? base.hue : statusRand() * 360,
    neon: keep() ? base.neon : unit(),
    glow: keep() ? base.glow : unit(),
    depth: keep() ? base.depth : unit(),
    tint: keep() ? base.tint : unit(),
    contrast: keep() ? base.contrast : unit(),
    ring: statusRand() < 0.3 ? null : angle(),
    field: keep() ? base.field : angle(),
  };
}
for (const mode of MODES) {
  const statusFails: Record<string, number> = {};
  let statusRuns = 0;
  const examples: string[] = [];
  for (const p of PRESETS) {
    for (let i = 0; i < 1500; i++) {
      const k = knobsNear(p.knobs);
      const t = generate(k, mode);
      statusRuns++;
      const v = statusViolations(statusColors(k, p, t, mode), t);
      for (const x of v) {
        const key = x.replace(/\(.*\)/, "");
        statusFails[key] = (statusFails[key] ?? 0) + 1;
      }
      if (v.length && examples.length < 5) examples.push(`${p.id} ${JSON.stringify(k)} ${v.join(",")}`);
    }
  }
  console.log(`\n== Status fuzz, ${mode}: ${statusRuns} knob sets ==`);
  console.log("fails  :", JSON.stringify(statusFails));
  for (const e of examples) console.log("  e.g.", e);
  const statusFuzzFails = Object.values(statusFails).reduce((a, b) => a + b, 0);
  if (statusFuzzFails) problems.push(`status fuzz ${mode}: ${statusFuzzFails} violations`);
}
console.log(problems.length ? `\nFAIL\n- ${problems.join("\n- ")}` : "\nRESULT: ok");
process.exit(problems.length ? 1 : 0);
