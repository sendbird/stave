import { i18n } from "@/i18n";
import { buildPrContextAttachment, type PrContextIndex, type PrContextSelection, type PrCheckLogExcerpt } from "@/lib/pr-context";
import { useAppStore } from "@/store/app.store";

export async function readPrAttachment(index: PrContextIndex, selection: PrContextSelection, cwd?: string, allowMissingLogs = false) {
  let excerpts: PrCheckLogExcerpt[] = [];
  if (selection.checkIds.length && index.headSha) {
    try {
      const result = await window.api?.sourceControl?.fetchPrCheckLogs?.({
        prUrl: index.ref.url, headSha: index.headSha, checkIds: selection.checkIds, cwd: cwd || undefined,
      });
      if (!result?.ok) throw new Error(result?.stderr || i18n.t("sourceControl:prContextDialog.couldNotReadTheCheckLogs"));
      excerpts = result.excerpts;
    } catch (error) {
      if (!allowMissingLogs) throw error;
    }
  }
  return {
    attachment: buildPrContextAttachment({ index, selection, logExcerpts: excerpts }),
    unavailable: index.failedChecks.filter(check => selection.checkIds.includes(check.id) &&
      !excerpts.some(log => log.checkId === check.id && log.source !== "unavailable")).map(check => check.name),
  };
}

export function attachPrEvidence(taskId: string, attachment: ReturnType<typeof buildPrContextAttachment>) {
  const { sourceId, title, content } = attachment;
  useAppStore.getState().attachTaskSourceContext({ taskId, sourceContext: { type: "retrieved_context", sourceId, title, content } });
}
