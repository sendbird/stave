import * as stylex from "@stylexjs/stylex";
import { MoreHorizontal } from "lucide-react";
import { useTranslation } from "@/i18n";
import { Button } from "@/components/aui/components/Button";
import { DropdownMenu } from "@/components/aui/components/DropdownMenu";
import { vars } from "@/components/aui/tokens/tokens.stylex";
import { sx } from "@/components/aui/utils/stylex";
import { setTaskReadState, useTaskUnread } from "@/lib/task-read-state-client";
import { toast } from "@/lib/notifications/toast";

export function TaskUnreadDot({ workspaceId, taskId }: { workspaceId: string; taskId: string }) {
  const { t } = useTranslation(["panes"]);
  const unread = useTaskUnread(workspaceId, taskId);
  return unread ? <span role="img" aria-label={t("panes:taskReading.unread")} data-task-unread={taskId} className={sx(styles.dot)} /> : null;
}

export async function changeTaskReadState(workspaceId: string, taskId: string, read: boolean) {
  try { await setTaskReadState({ workspaceId, taskId, read }); }
  catch { const { i18n } = await import("@/i18n"); toast(i18n.t("panes:taskReading.failed")); }
}

export function TaskReadMenu({ workspaceId, taskId }: { workspaceId: string; taskId: string }) {
  const { t } = useTranslation(["panes"]);
  return <DropdownMenu trigger={<Button size="xs" variant="quiet" iconOnly aria-label={t("panes:taskReading.menu")}><MoreHorizontal /></Button>}
    groups={[{ items: [
      { label: t("panes:taskReading.markRead"), onSelect: () => { void changeTaskReadState(workspaceId, taskId, true); } },
      { label: t("panes:taskReading.markUnread"), onSelect: () => { void changeTaskReadState(workspaceId, taskId, false); } },
    ] }]} />;
}

const styles = stylex.create({ dot: {
  display: "inline-block", width: 8, height: 8, flexShrink: 0,
  borderRadius: vars["--aui-radius-full"], backgroundColor: vars["--aui-color-accent"],
} });
