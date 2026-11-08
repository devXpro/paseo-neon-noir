import { readFile, readdir, realpath, stat } from "node:fs/promises";
import path from "node:path";
import type { PluginServerContext, PluginSettings } from "@getpaseo/plugin/server";
import { FONTS, fileFor, filesOf, fontById, fontRpc, fontsRpc, styleSettings, wallpaperRpc, wallpapersRpc } from "../shared/style.ts";
import { expandHome, locatePlugin } from "./style-home.ts";

const IMAGE_TYPES: Readonly<Record<string, string>> = {
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".png": "image/png",
  ".webp": "image/webp",
  ".gif": "image/gif",
  ".avif": "image/avif",
};
/** A wallpaper travels as base64 in one RPC answer, and the relay carries frames up to 32 MB. */
const MAX_WALLPAPER_BYTES = 16 * 1024 * 1024;
const MAX_LISTED = 200;

const imageType = (file: string) => IMAGE_TYPES[path.extname(file).toLowerCase()] ?? null;
const describe = (error: unknown) => (error instanceof Error ? error.message : String(error));

/**
 * Fonts from the plugin's fonts/ folder; wallpapers only from the folder saved in the style
 * settings, by its real path, so neither a path from the caller nor a symlink reaches elsewhere.
 */
export function registerStyleRpcs(server: PluginServerContext, style: PluginSettings<typeof styleSettings.schema>): void {
  let fontsDirectory: string | null = null;
  /** The fonts folder by its real path, so a file can be held to it. */
  async function findFonts(): Promise<string | null> {
    if (fontsDirectory !== null) return fontsDirectory;
    const located = locatePlugin();
    if (located === null) {
      console.warn("[neon-noir] Could not find the plugin's own directory for its fonts");
      return null;
    }
    fontsDirectory = await realpath(path.join(located.directory, "fonts"));
    return fontsDirectory;
  }

  /** A registry path under fonts/, by its real path: neither `..` nor a symlink leads out of the folder. */
  async function fontFile(directory: string, relative: string): Promise<string> {
    const file = await realpath(path.resolve(directory, relative));
    if (!file.startsWith(directory + path.sep)) throw new Error("The font file is outside the fonts folder");
    return file;
  }

  async function wallpaperFolder(): Promise<string> {
    const state = await style.read();
    if (state.status !== "ready") throw new Error("The style settings cannot be read");
    return realpath(path.resolve(expandHome(state.values.fx.folder)));
  }

  server.handle(fontsRpc, async () => {
    const directory = await findFonts().catch(() => null);
    if (directory === null) return { fonts: [], error: "The plugin's fonts folder was not found on the host" };
    const sizeOf = (relative: string) =>
      fontFile(directory, relative).then((file) => stat(file)).then((info) => (info.isFile() ? info.size : null), () => null);
    const fonts = [];
    for (const font of FONTS) {
      const sizes = await Promise.all(filesOf(font).map((file) => sizeOf(file.path)));
      if (!sizes.every((size) => size !== null)) continue;
      const { id, family, kind, scripts, tags } = font;
      fonts.push({ id, family, kind, scripts, tags: [...tags], bytes: sizes.reduce((sum, size) => sum + size, 0) });
    }
    return { fonts, error: null };
  });

  server.handle(fontRpc, async ({ id, weight, italic }) => {
    const font = fontById(id);
    if (font === null) throw new Error(`Unknown font: ${id}`);
    const directory = await findFonts();
    if (directory === null) throw new Error("The plugin's fonts folder was not found on the host");
    const file = fileFor(font, weight, italic === true);
    const bytes = await readFile(await fontFile(directory, file.path));
    const format: "opentype" | "truetype" = file.path.endsWith(".otf") ? "opentype" : "truetype";
    return { base64: bytes.toString("base64"), format };
  });

  server.handle(wallpapersRpc, async () => {
    let folder: string;
    try {
      folder = await wallpaperFolder();
    } catch (error) {
      const missing = (error as { code?: unknown }).code === "ENOENT";
      return { folder: "", images: [], error: missing ? "The folder does not exist" : describe(error) };
    }
    try {
      const entries = await readdir(folder, { withFileTypes: true });
      // Regular files only: a symlink is never listed, wherever it points.
      const names = entries
        .filter((entry) => entry.isFile() && !entry.name.startsWith(".") && imageType(entry.name) !== null)
        .map((entry) => entry.name)
        .sort((a, b) => a.localeCompare(b))
        .slice(0, MAX_LISTED);
      const images = await Promise.all(
        names.map(async (name) => {
          const file = path.join(folder, name);
          return { name, path: file, bytes: (await stat(file)).size };
        }),
      );
      return { folder, images: images.filter((image) => image.bytes <= MAX_WALLPAPER_BYTES), error: null };
    } catch (error) {
      return { folder, images: [], error: describe(error) };
    }
  });

  server.handle(wallpaperRpc, async ({ path: requested }) => {
    const folder = await wallpaperFolder();
    const file = await realpath(path.resolve(expandHome(requested)));
    if (path.dirname(file) !== folder) throw new Error("The image is not in the wallpaper folder");
    const mimeType = imageType(file);
    if (mimeType === null) throw new Error("Not an image file");
    const info = await stat(file);
    if (!info.isFile()) throw new Error("Not a file");
    if (info.size > MAX_WALLPAPER_BYTES) throw new Error("The image is larger than 16 MB");
    return { base64: (await readFile(file)).toString("base64"), mimeType };
  });
}
