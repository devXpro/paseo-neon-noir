import { existsSync, readFileSync, readdirSync } from "node:fs";
import os from "node:os";
import path from "node:path";

const PLUGIN_ID = "neon-noir";

export function expandHome(input: string): string {
  if (input === "~") return os.homedir();
  if (input.startsWith("~/")) return path.join(os.homedir(), input.slice(2));
  return input;
}

/** Paseo's state directory; the daemon hands PASEO_HOME on to the plugin processes it forks. */
const paseoHome = () => path.resolve(expandHome(process.env.PASEO_HOME ?? "~/.paseo"));

function isPluginDirectory(directory: string): boolean {
  try {
    const manifest = JSON.parse(readFileSync(path.join(directory, "paseo-plugin.json"), "utf8")) as { id?: unknown };
    return manifest.id === PLUGIN_ID && existsSync(path.join(directory, "fonts"));
  } catch {
    return false;
  }
}

function configuredPath(home: string): string | null {
  try {
    const config = JSON.parse(readFileSync(path.join(home, "config.json"), "utf8")) as {
      plugins?: Record<string, { path?: unknown } | undefined>;
    };
    const configured = config.plugins?.[PLUGIN_ID]?.path;
    return typeof configured === "string" ? configured : null;
  } catch {
    return null;
  }
}

/** A git install lives in $PASEO_HOME/plugins/<id>/<version>/checkout. */
function checkouts(home: string): string[] {
  const root = path.join(home, "plugins", PLUGIN_ID);
  try {
    return readdirSync(root, { withFileTypes: true })
      .filter((entry) => entry.isDirectory())
      .map((entry) => path.join(root, entry.name, "checkout"));
  } catch {
    return [];
  }
}

/**
 * Finds this plugin's own directory, for the files next to the code. The daemon evaluates the
 * server bundle from a string in a forked process, so neither import.meta.url nor __dirname
 * exist and the working directory is the daemon's. Paseo's plugin registry ($PASEO_HOME/config.json)
 * records the path of every install, directory, git and npm alike, so it is read first.
 */
export function locatePlugin(): { directory: string; via: string } | null {
  const home = paseoHome();
  const candidates: [string | null, string][] = [
    [configuredPath(home), "config.json"],
    ...checkouts(home).map((candidate): [string, string] => [candidate, "git checkout"]),
    [process.cwd(), "working directory"],
  ];
  for (const [candidate, via] of candidates) {
    if (candidate !== null && isPluginDirectory(candidate)) return { directory: candidate, via };
  }
  return null;
}
