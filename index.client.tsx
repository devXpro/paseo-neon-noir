import type { PluginClientContext } from "@getpaseo/plugin/client";
import { createLiveTheme } from "./client/live-theme.ts";
import { STUDIO_SCREEN_ID, createStudioScreen } from "./client/screen.tsx";
import { createSidebarItem } from "./client/sidebar.tsx";
import { createStyleRuntime } from "./client/style/runtime.ts";

export default function contribute(client: PluginClientContext) {
  // First, so the app paints black from the start rather than in Paseo's own theme.
  const live = createLiveTheme(client);
  const style = createStyleRuntime(client, live);
  const removeScreen = client.addScreen({
    id: STUDIO_SCREEN_ID,
    title: "Neon Noir",
    Component: createStudioScreen(live, style),
  });
  const removeItem = client.addSidebarHeaderItem({
    id: STUDIO_SCREEN_ID,
    title: "Neon Noir",
    Component: createSidebarItem(live, style),
  });

  return () => {
    void removeItem();
    void removeScreen();
    style.dispose();
    live.dispose();
  };
}
