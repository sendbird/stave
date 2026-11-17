import * as stylex from "@stylexjs/stylex";
import { MoreHorizontal } from "lucide-react";
import { i18n, useTranslation } from "@/i18n";
import { Button } from "@/components/aui/components/Button";
import { DropdownMenu } from "@/components/aui/components/DropdownMenu";
import { vars } from "@/components/aui/tokens/tokens.stylex";
import { sx } from "@/components/aui/utils/stylex";
import { setTaskReadState, useTaskUnread } from "@/lib/task-read-state-client";
import { toast } from "@/lib/notifications/toast";

/**
 * The unread mark. A row whose own accessible name already says "unread"
 * passes `decorative`, so assistive tech hears the state once.
 */
export function TaskUnreadDot({ workspaceId, taskId, decorative = false }: { workspaceId: string; taskId: string; decorative?: boolean }) {
  const { t } = useTranslation(["panes"]);
  const unread = useTaskUnread(workspaceId, taskId);
  if (!unread) return null;
  return decorative
    ? <span aria-hidden data-task-unread={taskId} className={sx(styles.dot)} />
    : <span role="img" aria-label={t("panes:taskReading.unread")} data-task-unread={taskId} className={sx(styles.dot)} />;
}

/** `name`, plus the unread state when there is one, for a row's accessible name. */
export function withUnreadName(name: string, unread: boolean) {
  return unread ? i18n.t("panes:taskReading.unreadName", { name }) : name;
}

export async function changeTaskReadState(workspaceId: string, taskId: string, read: boolean) {
  try { await setTaskReadState({ workspaceId, taskId, read }); }
  catch { toast(i18n.t("panes:taskReading.failed")); }
}

export function TaskReadMenu({ workspaceId, taskId, title }: { workspaceId: string; taskId: string; title: string }) {
  const { t } = useTranslation(["panes"]);
  return <DropdownMenu trigger={<Button size="xs" variant="quiet" iconOnly aria-label={t("panes:taskReading.menu", { title })}><MoreHorizontal /></Button>}
    groups={[{ items: [
      { label: t("panes:taskReading.markRead"), onSelect: () => { void changeTaskReadState(workspaceId, taskId, true); } },
      { label: t("panes:taskReading.markUnread"), onSelect: () => { void changeTaskReadState(workspaceId, taskId, false); } },
    ] }]} />;
}

const styles = stylex.create({ dot: {
  display: "inline-block", width: 8, height: 8, flexShrink: 0,
  borderRadius: vars["--aui-radius-full"], backgroundColor: vars["--aui-color-accent"],
} });
