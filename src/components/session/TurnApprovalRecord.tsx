import { i18n, useTranslation } from "@/i18n";
import { useMemo } from "react";
import * as stylex from "@stylexjs/stylex";
import { useShallow } from "zustand/react/shallow";
import { focusRing } from "@/components/ads/recipes/focus-ring";
import { vars } from "@/components/ads/tokens/tokens.stylex";
import { sx } from "@/components/ads/utils/stylex";
import { ApprovalRecordView, describeApprovalCounts } from "@/components/approvals/ApprovalRecord";
import { collectApprovalRecord, summarizeApprovalRecord } from "@/lib/approvals/approval-record";
import { useAppStore } from "@/store/app.store";
import type { ChatMessage } from "@/types/chat";

const NO_MESSAGES: readonly ChatMessage[] = [];

/** The turn the Activity tab lists: the live one, else the task's latest answered turn. */
function runTurnId(activeTurnId: string | null, messages: readonly ChatMessage[]): string | null {
  if (activeTurnId) return activeTurnId;
  for (let index = messages.length - 1; index >= 0; index -= 1) {
    const message = messages[index];
    if (message?.role === "assistant" && message.turnId) return message.turnId;
  }
  return null;
}

/**
 * Under the Activity tab's list: the approval record of the turn it lists —
 * how many requests you decided and how many were decided automatically, and
 * each request with who decided it. Folded to its counts until opened; absent
 * when the turn asked for nothing.
 */
export function TurnApprovalRecord() {
  useTranslation();
  const [taskId, activeTurnId, messages] = useAppStore(
    useShallow((state) => {
      const activeTaskId = state.activeTaskId;
      const taskWorkspaceId = activeTaskId ? (state.taskWorkspaceIdById[activeTaskId] ?? state.activeWorkspaceId) : null;
      const scoped = activeTaskId != null && taskWorkspaceId === state.activeWorkspaceId;
      return [
        scoped ? activeTaskId : null,
        scoped ? (state.activeTurnIdsByTask[activeTaskId] ?? null) : null,
        scoped ? (state.messagesByTask[activeTaskId] ?? NO_MESSAGES) : NO_MESSAGES,
      ] as const;
    }),
  );
  const turnId = runTurnId(activeTurnId, messages);
  const entries = useMemo(
    () => (turnId ? collectApprovalRecord(messages.filter((message) => message.turnId === turnId)) : []),
    [messages, turnId],
  );
  if (!taskId || entries.length === 0) return null;
  return (
    <details className={sx(styles.record)} data-testid="turn-approval-record">
      <summary className={sx(styles.summary, focusRing.ring)}>
        <span className={sx(styles.title)}>{i18n.t("session:approvalRecord.activityTitle")}</span>
        <span className={sx(styles.counts)}>{describeApprovalCounts(summarizeApprovalRecord(entries)).join(" · ")}</span>
      </summary>
      <div className={sx(styles.body)}>
        <ApprovalRecordView entries={entries} emptyText={i18n.t("session:approvalRecord.none.turn")} showCounts={false} />
      </div>
    </details>
  );
}

const styles = stylex.create({
  record: {
    flexShrink: 0,
    borderTopWidth: vars["--ads-border-width-hairline"],
    borderTopStyle: "solid",
    borderTopColor: vars["--ads-color-border-subtle"],
    paddingBlock: vars["--ads-space-8"],
    paddingInline: vars["--ads-space-12"],
  },
  summary: {
    display: "flex",
    flexWrap: "wrap",
    alignItems: "baseline",
    gap: vars["--ads-space-8"],
    cursor: "pointer",
    borderRadius: vars["--ads-radius-mark"],
    fontSize: vars["--ads-font-size-caption"],
  },
  title: { color: vars["--ads-color-text"], fontWeight: vars["--ads-font-weight-medium"] },
  counts: { color: vars["--ads-color-text-muted"], minWidth: 0, overflowWrap: "anywhere" },
  body: { maxHeight: "40vh", overflowY: "auto", overscrollBehavior: "contain", paddingTop: vars["--ads-space-8"] },
});
