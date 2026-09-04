// ---------------------------------------------------------------------------
// PR context dialog — pick review threads and failed checks to attach
// ---------------------------------------------------------------------------
//
// Used by: `src/components/layout/TopBarOpenPR.tsx` (the "Attach PR context…"
// item in the PR menu). Attaches through `attachTaskSourceContext`, which puts
// the result on the canonical retrieved-context path the task chat already
// reads.
//
// Metadata is fetched when the dialog opens. Log excerpts are fetched only on
// attach, and only for the failed checks the user actually ticked.

import { useCallback, useEffect, useMemo, useState } from "react";
import { AlertTriangle, MessageSquare, Zap } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Loader } from "@/components/ui/loader";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  buildPrContextAttachment,
  PR_CONTEXT_LIMITS,
  type PrCheckLogExcerpt,
  type PrContextIndex,
} from "@/lib/pr-context";
import { useAppStore } from "@/store/app.store";

interface PrContextDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  prUrl: string | null;
  cwd: string;
  taskId: string | null;
}

export function PrContextDialog(props: PrContextDialogProps) {
  const attachTaskSourceContext = useAppStore(
    (state) => state.attachTaskSourceContext,
  );

  const [loading, setLoading] = useState(false);
  const [attaching, setAttaching] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [index, setIndex] = useState<PrContextIndex | null>(null);
  const [selectedThreadIds, setSelectedThreadIds] = useState<string[]>([]);
  const [selectedCheckIds, setSelectedCheckIds] = useState<number[]>([]);

  const { open, prUrl, cwd, taskId, onOpenChange } = props;

  const loadIndex = useCallback(async () => {
    if (!prUrl) {
      setError("This workspace has no pull request yet.");
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const result = await window.api?.sourceControl?.fetchPrContextIndex?.({
        prUrl,
        cwd: cwd || undefined,
      });
      if (!result?.ok || !result.index) {
        setIndex(null);
        setError(result?.stderr || "Could not read this pull request.");
        return;
      }
      setIndex(result.index);
      // Unresolved threads are the ones a reviewer is still waiting on, so
      // they start ticked; resolved and outdated ones do not.
      setSelectedThreadIds(
        result.index.threads
          .filter((thread) => !thread.isResolved && !thread.isOutdated)
          .map((thread) => thread.id),
      );
      setSelectedCheckIds([]);
      if (result.stderr) {
        setError(result.stderr);
      }
    } catch (cause) {
      setIndex(null);
      setError(cause instanceof Error ? cause.message : String(cause));
    } finally {
      setLoading(false);
    }
  }, [cwd, prUrl]);

  useEffect(() => {
    if (!open) {
      return;
    }
    setIndex(null);
    setSelectedThreadIds([]);
    setSelectedCheckIds([]);
    void loadIndex();
  }, [loadIndex, open]);

  const checkSelectionFull =
    selectedCheckIds.length >= PR_CONTEXT_LIMITS.maxSelectedChecks;

  const toggleThread = (threadId: string) => {
    setSelectedThreadIds((current) =>
      current.includes(threadId)
        ? current.filter((id) => id !== threadId)
        : [...current, threadId],
    );
  };

  const toggleCheck = (checkId: number) => {
    setSelectedCheckIds((current) =>
      current.includes(checkId)
        ? current.filter((id) => id !== checkId)
        : current.length >= PR_CONTEXT_LIMITS.maxSelectedChecks
          ? current
          : [...current, checkId],
    );
  };

  const selectionEmpty =
    selectedThreadIds.length === 0 && selectedCheckIds.length === 0;

  const handleAttach = async () => {
    if (!index || !taskId || selectionEmpty) {
      return;
    }
    setAttaching(true);
    setError(null);
    try {
      let excerpts: PrCheckLogExcerpt[] = [];
      if (selectedCheckIds.length > 0 && prUrl && index.headSha) {
        const result = await window.api?.sourceControl?.fetchPrCheckLogs?.({
          prUrl,
          headSha: index.headSha,
          checkIds: selectedCheckIds,
          cwd: cwd || undefined,
        });
        if (!result?.ok) {
          setError(result?.stderr || "Could not read the check logs.");
          return;
        }
        excerpts = result.excerpts;
      }
      const attachment = buildPrContextAttachment({
        index,
        selection: {
          threadIds: selectedThreadIds,
          checkIds: selectedCheckIds,
        },
        logExcerpts: excerpts,
      });
      attachTaskSourceContext({
        taskId,
        sourceContext: {
          type: "retrieved_context",
          sourceId: attachment.sourceId,
          title: attachment.title,
          content: attachment.content,
        },
      });
      onOpenChange(false);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : String(cause));
    } finally {
      setAttaching(false);
    }
  };

  const summary = useMemo(() => {
    if (!index) {
      return "";
    }
    return `${index.threads.length} review thread(s) · ${index.failedChecks.length} failed check(s)`;
  }, [index]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="flex max-h-[80vh] flex-col sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>Attach PR context</DialogTitle>
          <DialogDescription>
            Review threads and failed-check evidence are attached to this task
            as untrusted context and re-sent with every turn until you remove
            them.
          </DialogDescription>
        </DialogHeader>

        {loading ? (
          <div className="flex items-center gap-2 py-8 text-sm text-muted-foreground">
            <Loader aria-hidden="true" size="xs" variant="scan" />
            Reading the pull request…
          </div>
        ) : null}

        {error ? (
          <p
            role="alert"
            className="flex items-start gap-2 rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2 text-xs text-destructive"
          >
            <AlertTriangle
              className="mt-0.5 size-3.5 shrink-0"
              aria-hidden="true"
            />
            {error}
          </p>
        ) : null}

        {index && !loading ? (
          <div className="min-h-0 flex-1 space-y-4 overflow-y-auto pr-1">
            <p className="text-xs text-muted-foreground">
              {index.ref.owner}/{index.ref.repo}#{index.ref.number} · {summary}{" "}
              · head {index.headSha.slice(0, 7) || "unknown"}
            </p>

            <section aria-labelledby="pr-context-threads">
              <h3
                id="pr-context-threads"
                className="mb-1.5 flex items-center gap-1.5 text-xs font-medium text-foreground"
              >
                <MessageSquare
                  className="size-3.5 text-muted-foreground"
                  aria-hidden="true"
                />
                Review threads
              </h3>
              {index.threads.length === 0 ? (
                <p className="text-xs text-muted-foreground">
                  No review threads on this pull request.
                </p>
              ) : (
                <ul className="space-y-1">
                  {index.threads.map((thread) => (
                    <li key={thread.id}>
                      <label className="flex min-w-0 cursor-pointer items-start gap-2 rounded-md px-1.5 py-1.5 hover:bg-muted/50">
                        <input
                          type="checkbox"
                          className="mt-0.5 size-3.5 shrink-0 accent-primary"
                          checked={selectedThreadIds.includes(thread.id)}
                          onChange={() => toggleThread(thread.id)}
                        />
                        <span className="min-w-0 flex-1">
                          <span className="flex items-baseline gap-2">
                            <span className="truncate text-xs font-medium text-foreground">
                              {thread.path || "(no file)"}
                              {thread.line === null ? "" : `:${thread.line}`}
                            </span>
                            <span className="shrink-0 text-[10px] text-muted-foreground">
                              {thread.isResolved ? "resolved" : "unresolved"}
                              {thread.isOutdated ? " · outdated" : ""}
                            </span>
                          </span>
                          <span className="line-clamp-2 text-xs text-muted-foreground">
                            {thread.comments.at(-1)?.author
                              ? `${thread.comments.at(-1)?.author}: `
                              : ""}
                            {thread.comments.at(-1)?.body ?? "(no comment)"}
                          </span>
                        </span>
                      </label>
                    </li>
                  ))}
                </ul>
              )}
              {index.truncatedThreads > 0 ? (
                <p className="mt-1 text-[10px] text-muted-foreground">
                  {index.truncatedThreads} further thread(s) not listed.
                </p>
              ) : null}
            </section>

            <section aria-labelledby="pr-context-checks">
              <h3
                id="pr-context-checks"
                className="mb-1.5 flex items-center gap-1.5 text-xs font-medium text-foreground"
              >
                <Zap
                  className="size-3.5 text-muted-foreground"
                  aria-hidden="true"
                />
                Failed checks
              </h3>
              {index.failedChecks.length === 0 ? (
                <p className="text-xs text-muted-foreground">
                  No failed checks on this commit.
                </p>
              ) : (
                <ul className="space-y-1">
                  {index.failedChecks.map((check) => {
                    const checked = selectedCheckIds.includes(check.id);
                    return (
                      <li key={check.id}>
                        <label
                          className={`flex min-w-0 items-start gap-2 rounded-md px-1.5 py-1.5 ${
                            !checked && checkSelectionFull
                              ? "cursor-not-allowed opacity-50"
                              : "cursor-pointer hover:bg-muted/50"
                          }`}
                        >
                          <input
                            type="checkbox"
                            className="mt-0.5 size-3.5 shrink-0 accent-primary"
                            checked={checked}
                            disabled={!checked && checkSelectionFull}
                            onChange={() => toggleCheck(check.id)}
                          />
                          <span className="min-w-0 flex-1">
                            <span className="truncate text-xs font-medium text-foreground">
                              {check.name || `Check ${check.id}`}
                            </span>
                            <span className="block truncate text-[10px] text-muted-foreground">
                              {check.workflowName
                                ? `${check.workflowName} · `
                                : ""}
                              {check.conclusion}
                              {check.annotationCount > 0
                                ? ` · ${check.annotationCount} annotation(s)`
                                : " · log excerpt"}
                            </span>
                          </span>
                        </label>
                      </li>
                    );
                  })}
                </ul>
              )}
              <p className="mt-1 text-[10px] text-muted-foreground">
                Log evidence is fetched only for the checks you tick, at most{" "}
                {PR_CONTEXT_LIMITS.maxSelectedChecks} at a time.
                {index.truncatedFailedChecks > 0
                  ? ` ${index.truncatedFailedChecks} further failed check(s) not listed.`
                  : ""}
              </p>
            </section>
          </div>
        ) : null}

        <DialogFooter>
          <Button
            variant="ghost"
            onClick={() => onOpenChange(false)}
            disabled={attaching}
          >
            Cancel
          </Button>
          <Button
            onClick={() => void handleAttach()}
            disabled={!index || selectionEmpty || !taskId || attaching}
          >
            {attaching ? <Loader aria-hidden size="xs" variant="scan" /> : null}
            Attach to task
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
