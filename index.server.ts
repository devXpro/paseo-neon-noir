import type { PluginServerContext } from "@getpaseo/plugin/server";
import { registerRpcs } from "./server/rpc.ts";
import { registerStyleRpcs } from "./server/style.ts";
import { studioSettings } from "./shared/settings.ts";
import { styleSettings } from "./shared/style.ts";

export default function contribute(server: PluginServerContext) {
  // The host keeps the studio's choice (preset + knobs) and the style for every app connected to it.
  server.registerSettings(studioSettings);
  const style = server.registerSettings(styleSettings);
  registerRpcs(server);
  registerStyleRpcs(server, style);
  return () => {};
}
