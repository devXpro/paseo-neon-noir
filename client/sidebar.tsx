import type { PluginSidebarItemProps } from "@getpaseo/plugin/client";
import { SidebarRow } from "@getpaseo/plugin/client/ui";
import { useEffect, useRef, useSyncExternalStore, type ComponentType } from "react";
import { Text, View } from "react-native";
import type { LiveTheme } from "./live-theme.ts";
import { STUDIO_SCREEN_ID } from "./screen.tsx";
import { StatusOverlay } from "./status-overlay.tsx";
import type { StyleRuntime } from "./style/runtime.ts";

/**
 * The sidebar row that opens the studio. On the right it names the preset painted on this device,
 * or says "Off": Paseo's dots are statuses, and a red one would read as an alert. The text also
 * gives the style runtime a way up to Paseo's settings while the studio is closed.
 */
export function createSidebarItem(live: LiveTheme, style: StyleRuntime): ComponentType<PluginSidebarItemProps> {
  return function NeonSidebarItem({ theme, currentScreen, openScreen }: PluginSidebarItemProps) {
    const presetName = useSyncExternalStore(live.subscribe, live.presetName, live.presetName);
    const anchor = useRef<View>(null);
    useEffect(() => style.anchor(anchor.current), []);
    return (
      <>
        <SidebarRow
          icon="Palette"
          active={currentScreen?.screenId === STUDIO_SCREEN_ID}
          onPress={() => openScreen({ screenId: STUDIO_SCREEN_ID })}
          trailing={
            <View ref={anchor} collapsable={false}>
              <Text style={{ fontSize: 12, color: theme.colors.foregroundMuted }} numberOfLines={1}>
                {live.isShowing(theme.colors) ? presetName : "Off"}
              </Text>
            </View>
          }
        />
        <StatusOverlay anchor={anchor} live={live} theme={theme} />
      </>
    );
  };
}
