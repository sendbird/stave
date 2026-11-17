import { useEffect, useState } from "react";
import * as stylex from "@stylexjs/stylex";
import { i18n } from "@/i18n";
import { FeatureEnableHint } from "@/components/session/FeatureEnableHint";
import { GeneralSection } from "@/components/layout/settings-sections/settings-dialog-general-section";
import { MemoryUsagePopover } from "@/components/layout/ResourcesPopover";
import { useAppStore } from "@/store/app.store";
import { vars } from "@/components/aui/tokens/tokens.stylex";
import { sx } from "@/components/aui/utils/stylex";

/** Actual settings and hint components with simulated metrics from the preview. */
export function DiscoveryFixture() {
  const [ready, setReady] = useState(false);
  const steering = useAppStore((state) => state.settings.midTurnSteeringEnabled);
  const checkpoints = useAppStore((state) => state.settings.claudeEnableFileCheckpointing);
  useEffect(() => {
    const params = new URLSearchParams(location.search);
    useAppStore.setState((state) => ({ settings: {
      ...state.settings,
      developerModeEnabled: params.get("developer") === "1",
      language: params.get("lang") === "ko" ? "ko" : "en",
      themeMode: params.get("theme") === "dark" ? "dark" : "light",
      midTurnSteeringEnabled: false,
      claudeEnableFileCheckpointing: false,
    } }));
    void i18n.changeLanguage(params.get("lang") === "ko" ? "ko" : "en").then(() => setReady(true));
  }, []);
  if (!ready) return null;
  return <div className={sx(styles.body)}>
    <div data-discovery-hints className={sx(styles.hints)}>
      {!steering && <FeatureEnableHint feature="steering" onEnable={() => useAppStore.getState().updateSettings({ patch: { midTurnSteeringEnabled: true } })} />}
      {!checkpoints && <FeatureEnableHint feature="checkpoints" onEnable={() => useAppStore.getState().updateSettings({ patch: { claudeEnableFileCheckpointing: true } })} />}
    </div>
    <GeneralSection />
    <MemoryUsagePopover variant="bar" hideTrigger />
  </div>;
}
const styles = stylex.create({
  body: { width: "100%", maxWidth: "48rem" },
  hints: { display: "flex", flexDirection: "column", gap: vars["--aui-space-4"], marginBottom: vars["--aui-space-16"] },
});
