import { useEffect, useState } from "react";
import { bringTaskSurfaceToFront, showTaskConversation } from "@/components/panes/task-surface-entry";
import { Button, toast } from "@/components/ui";
import { DropdownMenuItem } from "@/components/ui/dropdown-menu";
import { useTranslation } from "@/i18n";
import type { GitHubPrPayload } from "@/lib/pr-status";
import type { PrContextIndex } from "@/lib/pr-context";
import { canFixPr, defaultPrSelection, prFixInstruction } from "@/lib/pr-fix-request";
import { useAppStore } from "@/store/app.store";
import { attachPrEvidence, readPrAttachment } from "./pr-context-attachment";

export function PullRequestFixMenuItem({ pr, cwd, button = false }: { pr: GitHubPrPayload; cwd?: string; button?: boolean }) {
  const { t } = useTranslation("sourceControl");
  const task = useAppStore(state => state.tasks.find(item => item.id === state.activeTaskId && !item.archivedAt));
  const workspaceId = useAppStore(state => state.activeWorkspaceId);
  const [index, setIndex] = useState<PrContextIndex | null>(null);
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    let current = true;
    setIndex(null);
    if (pr.state === "OPEN") void window.api?.sourceControl?.fetchPrContextIndex?.({ prUrl: pr.url, cwd })
      .then(result => { if (current && result.ok) setIndex(result.index); }).catch(() => {});
    return () => { current = false; };
  }, [pr.url, pr.state, pr.headRefOid, cwd]);

  if (!index || index.ref.url !== pr.url || !canFixPr(pr, !!index.canPush, defaultPrSelection(index).threadIds.length, index.failedChecks.length)) return null;

  async function prepare() {
    if (!task || busy) return;
    setBusy(true);
    try {
      const result = await window.api?.sourceControl?.fetchPrContextIndex?.({ prUrl: pr.url, cwd });
      if (!result?.ok || !result.index) throw new Error(result?.stderr || t("prContextDialog.couldNotReadThisPullRequest"));
      const selection = defaultPrSelection(result.index);
      const { attachment, unavailable } = await readPrAttachment(result.index, selection, cwd, true);
      const state = useAppStore.getState();
      const latest = state.workspacePrInfoById[workspaceId]?.pr;
      if (state.activeWorkspaceId !== workspaceId || !state.tasks.some(item => item.id === task.id && !item.archivedAt) ||
          latest?.url !== pr.url || !canFixPr(latest, !!result.index.canPush, selection.threadIds.length, selection.checkIds.length)) return;
      attachPrEvidence(task.id, attachment);
      const draft = state.promptDraftByTask[task.id]?.text;
      state.updatePromptDraft({ taskId: task.id, patch: { text: (draft ? draft + "\n\n" : "") + prFixInstruction(latest) } });
      if (state.activeTaskId === task.id) {
        bringTaskSurfaceToFront(task.id);
        showTaskConversation(task.id);
      }
      toast.info(t("prFix.attached", { checks: selection.checkIds.length, threads: selection.threadIds.length }), {
        description: [unavailable.length && t("prFix.unavailable", { names: unavailable.join(", ") }), result.stderr,
          state.activeTurnIdsByTask[task.id] && t("prFix.afterTurn")].filter(Boolean).join(" "),
      });
    } catch (error) {
      toast.warning(error instanceof Error ? error.message : t("prActivity.failed"));
    } finally { setBusy(false); }
  }
  const title = !task ? t("prFix.noTask") : undefined;
  return button
    ? <Button size="sm" variant="ghost" title={title} disabled={!task || busy} onClick={() => void prepare()}>{t("prFix.action")}</Button>
    : <span title={title}><DropdownMenuItem disabled={!task || busy} onSelect={() => void prepare()}>{t("prFix.action")}</DropdownMenuItem></span>;
}
