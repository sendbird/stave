import * as stylex from "@stylexjs/stylex";
import { vars } from "@/components/aui/tokens/tokens.stylex";
import { sx } from "@/components/aui/utils/stylex";
import { SettingsDelegationSection } from "@/components/layout/settings-dialog-delegation-section";
import { FleetTaskActivityLine } from "@/components/layout/FleetTaskActivityLine";
import { startProviderTurnActivity, applyProviderTurnActivityEvents } from "@/lib/providers/turn-status";

const activity = applyProviderTurnActivityEvents({
  activityByTask: startProviderTurnActivity({ activityByTask: {}, taskId: "queued", turnId: "queued-turn", providerId: "codex" }),
  taskId: "queued", turnId: "queued-turn", providerId: "codex",
  events: [{ type: "turn_admission", state: "queued", ahead: 3 }],
}).queued;

export function TurnAdmissionPreview() {
  return <main className={sx(styles.page)}>
    <SettingsDelegationSection />
    <FleetTaskActivityLine activity={activity} status="running" />
  </main>;
}
const styles = stylex.create({
  page: { padding: vars["--aui-space-24"], display: "grid", gap: vars["--aui-space-16"], color: vars["--aui-color-text"], backgroundColor: vars["--aui-color-canvas"], minHeight: "100vh", alignContent: "start" },
});
