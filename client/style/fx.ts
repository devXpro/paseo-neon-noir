import type { PluginClientContext } from "@getpaseo/plugin/client";
import { wallpaperRpc, type FxValues } from "../../shared/style.ts";

/** A dark wallpaper drawn in CSS: soft glows on near-black, so the blend lights only the dark parts. */
export interface Gradient {
  id: string;
  label: string;
  /** CSS background layers, without the base colour. */
  layers: string;
  base: string;
  /** The brightest colour, for the swatch on a phone, which cannot draw CSS gradients. */
  glow: string;
}

export const GRADIENTS: readonly Gradient[] = [
  {
    id: "noir",
    label: "Noir",
    layers:
      "linear-gradient(118deg, transparent 0 40%, rgba(255,24,58,0.85) 48%, rgba(255,24,58,0.85) 51%, transparent 59% 100%), radial-gradient(80% 60% at 85% 110%, rgba(140,0,24,0.9), transparent 70%)",
    base: "#000000",
    glow: "#FF183A",
  },
  {
    id: "neon",
    label: "Neon",
    layers:
      "radial-gradient(55% 50% at 12% 88%, #ff2bd6, transparent 70%), radial-gradient(50% 45% at 88% 12%, #00e5ff, transparent 70%), radial-gradient(45% 40% at 55% 55%, #5b00ff, transparent 72%)",
    base: "#04020a",
    glow: "#FF2BD6",
  },
  {
    id: "ember",
    label: "Ember",
    layers:
      "radial-gradient(90% 60% at 50% 115%, #ff5a1f, transparent 65%), radial-gradient(50% 40% at 15% 10%, #8a1a00, transparent 70%), radial-gradient(40% 35% at 85% 30%, #c2410c, transparent 70%)",
    base: "#0a0302",
    glow: "#FF5A1F",
  },
  {
    id: "luxe",
    label: "Luxe",
    layers:
      "radial-gradient(60% 50% at 78% 22%, #d6a84a, transparent 65%), radial-gradient(55% 45% at 18% 82%, #6b4512, transparent 70%), linear-gradient(160deg, #120c04, #000000 70%)",
    base: "#000000",
    glow: "#D6A84A",
  },
  {
    id: "frost",
    label: "Frost",
    layers:
      "radial-gradient(60% 55% at 25% 18%, #57c7ff, transparent 65%), radial-gradient(55% 50% at 82% 85%, #2343c4, transparent 70%), radial-gradient(35% 30% at 70% 30%, #b8e6ff, transparent 70%)",
    base: "#01050b",
    glow: "#57C7FF",
  },
  {
    id: "phosphor",
    label: "Phosphor",
    layers:
      "radial-gradient(75% 60% at 50% 45%, #00ff69, transparent 62%), radial-gradient(40% 35% at 10% 90%, #00b34a, transparent 70%)",
    base: "#000804",
    glow: "#00FF69",
  },
];

const STYLE_ID = "neon-noir-fx";
const LAYER_ID = "neon-noir-fx-layer";
/** Above Paseo's own layers, menus and sheets included. */
const TOP = 2147483000;

const fixed = (value: number) => Number(value.toFixed(3));

/** Film grain: white specks whose opacity follows the noise, so they show on black too. */
function grain(amount: number): string {
  const alpha = fixed(amount * 1.6);
  const offset = fixed(-amount * 0.75);
  const svg =
    "<svg xmlns='http://www.w3.org/2000/svg' width='200' height='200'><filter id='g'>" +
    "<feTurbulence type='fractalNoise' baseFrequency='0.85' numOctaves='3' stitchTiles='stitch'/>" +
    `<feColorMatrix values='0 0 0 0 1 0 0 0 0 1 0 0 0 0 1 ${alpha} 0 0 0 ${offset}'/>` +
    "</filter><rect width='100%' height='100%' filter='url(#g)'/></svg>";
  return `url("data:image/svg+xml,${encodeURIComponent(svg)}") 0 0 / 200px 200px repeat`;
}

/**
 * The effects as one stylesheet. The wallpaper is a screen-blended layer over the whole app, not a
 * background behind it: Paseo paints its surfaces opaque, stacked several deep, so a background
 * never shows, while a screen blend lights the dark surfaces and leaves light text as it is.
 * Scanlines, grain and vignette sit in one overlay element; the glow uses Paseo's own accent
 * variable on the composer, the one surface with a stable hook.
 */
export function fxCss(fx: FxValues, wallpaper: string | null): { css: string; overlay: boolean } {
  const rules: string[] = [];
  if (wallpaper !== null && fx.glass > 0) {
    const pad = Math.ceil(fx.blur * 2) + 2;
    rules.push(
      `html::after{content:"";position:fixed;inset:-${pad}px;z-index:${TOP};pointer-events:none;` +
        `background:${wallpaper};filter:blur(${fixed(fx.blur)}px) brightness(${fixed(1 - fx.dim * 0.9)});` +
        `opacity:${fixed(fx.glass)};mix-blend-mode:screen;}`,
    );
  }
  const layers: string[] = [];
  if (fx.grain > 0) layers.push(grain(fx.grain * 0.35));
  if (fx.scanlines > 0) {
    const dark = fixed(fx.scanlines * 0.45);
    const light = fixed(fx.scanlines * 0.05);
    layers.push(
      `repeating-linear-gradient(to bottom, rgba(0,0,0,${dark}) 0 1px, rgba(255,255,255,${light}) 1px 2px, transparent 2px 3px)`,
    );
  }
  if (fx.vignette > 0) {
    layers.push(
      `radial-gradient(ellipse at 50% 50%, transparent ${Math.round(58 - fx.vignette * 23)}%, rgba(0,0,0,${fixed(fx.vignette * 0.85)}) 100%)`,
    );
  }
  if (layers.length > 0) {
    rules.push(`#${LAYER_ID}{position:fixed;inset:0;z-index:${TOP + 1};pointer-events:none;background:${layers.join(",")};}`);
  }
  if (fx.glow > 0) {
    const accent = (share: number) => `color-mix(in srgb, var(--colors-accent) ${Math.round(share)}%, transparent)`;
    rules.push(
      `[data-testid="message-input-root"]{border-radius:16px;box-shadow:0 0 0 1px ${accent(20 + fx.glow * 50)}, 0 0 ${Math.round(8 + fx.glow * 26)}px ${accent(fx.glow * 65)};}`,
      `::selection{background-color:${accent(22 + fx.glow * 28)};text-shadow:0 0 ${Math.round(3 + fx.glow * 9)}px var(--colors-accent);}`,
    );
  }
  return { css: rules.join("\n"), overlay: layers.length > 0 };
}

export const gradientCss = (gradient: Gradient) => `${gradient.layers}, ${gradient.base}`;

export interface FxController {
  /** Draws these effects; null takes every trace of them off the page. */
  apply(fx: FxValues | null): void;
  dispose(): void;
}

/** Effects need a DOM: on the phone this is a no-op. */
export function createFx(client: PluginClientContext): FxController {
  if (typeof document === "undefined") return { apply() {}, dispose() {} };
  let current: FxValues | null = null;
  let drawn = "";
  /** The wallpaper image wanted, and its object URL once it has arrived. */
  let image: { path: string; url: string | null } | null = null;

  function loadImage(path: string) {
    if (image?.path === path) return;
    dropImage();
    const wanted = { path, url: null as string | null };
    image = wanted;
    client
      .rpc(wallpaperRpc, { path })
      .then(({ base64, mimeType }) => {
        const binary = atob(base64);
        const bytes = new Uint8Array(binary.length);
        for (let index = 0; index < binary.length; index++) bytes[index] = binary.charCodeAt(index);
        const url = URL.createObjectURL(new Blob([bytes], { type: mimeType }));
        if (image !== wanted) return URL.revokeObjectURL(url);
        wanted.url = url;
        draw();
      })
      .catch((error: unknown) => console.warn("[neon-noir] Could not load the wallpaper", error));
  }

  function dropImage() {
    if (image?.url) URL.revokeObjectURL(image.url);
    image = null;
  }

  function wallpaperOf(fx: FxValues): string | null {
    const wallpaper = fx.wallpaper;
    if (wallpaper.kind !== "image") dropImage();
    if (wallpaper.kind === "gradient") {
      const gradient = GRADIENTS.find((candidate) => candidate.id === wallpaper.id);
      return gradient === undefined ? null : gradientCss(gradient);
    }
    if (wallpaper.kind === "image" && wallpaper.path.length > 0) {
      loadImage(wallpaper.path);
      return image?.url ? `url("${image.url}") center / cover no-repeat, #000` : null;
    }
    return null;
  }

  function draw() {
    const fx = current;
    const style = document.getElementById(STYLE_ID);
    const layer = document.getElementById(LAYER_ID);
    if (fx === null) {
      style?.remove();
      layer?.remove();
      drawn = "";
      dropImage();
      return;
    }
    const { css, overlay } = fxCss(fx, wallpaperOf(fx));
    if (css === drawn && style !== null) return;
    drawn = css;
    const sheet = style ?? document.head.appendChild(Object.assign(document.createElement("style"), { id: STYLE_ID }));
    sheet.textContent = css;
    if (overlay && layer === null) {
      const element = document.createElement("div");
      element.id = LAYER_ID;
      element.setAttribute("aria-hidden", "true");
      document.body.appendChild(element);
    } else if (!overlay) {
      layer?.remove();
    }
  }

  return {
    apply(fx) {
      current = fx;
      draw();
    },
    dispose() {
      current = null;
      draw();
    },
  };
}
