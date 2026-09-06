import { Checkbox } from "@/components/ads/components/Checkbox";
import { sx } from "@/components/ads/utils/stylex";
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
import { prContextStyles } from "./pr-context-dialog.styles";

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
      <DialogContent xstyle={prContextStyles.content}>
        <DialogHeader>
          <DialogTitle>Attach PR context</DialogTitle>
          <DialogDescription>
            Review threads and failed-check evidence are attached to this task
            as untrusted context and re-sent with every turn until you remove
            them.
          </DialogDescription>
        </DialogHeader>

        {loading ? (
          <div className={sx(prContextStyles.loading)}>
            <Loader aria-hidden="true" size="xs" variant="scan" />
            Reading the pull request…
          </div>
        ) : null}

        {error ? (
          <p
            role="alert"
            className={sx(prContextStyles.error)}
          >
            <AlertTriangle
              className={sx(prContextStyles.errorIcon)}
              aria-hidden="true"
            />
            {error}
          </p>
        ) : null}

        {index && !loading ? (
          <div className={sx(prContextStyles.body)}>
            <p className={sx(prContextStyles.meta)}>
              {index.ref.owner}/{index.ref.repo}#{index.ref.number} · {summary}{" "}
              · head {index.headSha.slice(0, 7) || "unknown"}
            </p>

            <section aria-labelledby="pr-context-threads">
              <h3
                id="pr-context-threads"
                className={sx(prContextStyles.sectionHeading)}
              >
                <MessageSquare
                  className={sx(prContextStyles.sectionHeadingIcon)}
                  aria-hidden="true"
                />
                Review threads
              </h3>
              {index.threads.length === 0 ? (
                <p className={sx(prContextStyles.emptyNote)}>
                  No review threads on this pull request.
                </p>
              ) : (
                <ul className={sx(prContextStyles.list)}>
                  {index.threads.map((thread) => (
                    <li key={thread.id}>
                      <label
                        className={sx(
                          prContextStyles.row,
                          prContextStyles.rowEnabled,
                        )}
                      >
                        <Checkbox controlOnly
                          className={sx(prContextStyles.rowCheckbox)}
                          checked={selectedThreadIds.includes(thread.id)}
                          onCheckedChange={() => toggleThread(thread.id)}
                        />
                        <span className={sx(prContextStyles.rowText)}>
                          <span className={sx(prContextStyles.rowTitleLine)}>
                            <span className={sx(prContextStyles.rowTitle)}>
                              {thread.path || "(no file)"}
                              {thread.line === null ? "" : `:${thread.line}`}
                            </span>
                            <span className={sx(prContextStyles.rowStatus)}>
                              {thread.isResolved ? "resolved" : "unresolved"}
                              {thread.isOutdated ? " · outdated" : ""}
                            </span>
                          </span>
                          <span className={sx(prContextStyles.rowExcerpt)}>
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
                <p className={sx(prContextStyles.footnote)}>
                  {index.truncatedThreads} further thread(s) not listed.
                </p>
              ) : null}
            </section>

            <section aria-labelledby="pr-context-checks">
              <h3
                id="pr-context-checks"
                className={sx(prContextStyles.sectionHeading)}
              >
                <Zap
                  className={sx(prContextStyles.sectionHeadingIcon)}
                  aria-hidden="true"
                />
                Failed checks
              </h3>
              {index.failedChecks.length === 0 ? (
                <p className={sx(prContextStyles.emptyNote)}>
                  No failed checks on this commit.
                </p>
              ) : (
                <ul className={sx(prContextStyles.list)}>
                  {index.failedChecks.map((check) => {
                    const checked = selectedCheckIds.includes(check.id);
                    return (
                      <li key={check.id}>
                        <label
                          className={sx(
                            prContextStyles.row,
                            !checked && checkSelectionFull
                              ? prContextStyles.rowDisabled
                              : prContextStyles.rowEnabled,
                          )}
                        >
                          <Checkbox controlOnly
                            className={sx(prContextStyles.rowCheckbox)}
                            checked={checked}
                            disabled={!checked && checkSelectionFull}
                            onCheckedChange={() => toggleCheck(check.id)}
                          />
                          <span className={sx(prContextStyles.rowText)}>
                            <span className={sx(prContextStyles.rowTitle)}>
                              {check.name || `Check ${check.id}`}
                            </span>
                            <span className={sx(prContextStyles.rowSubtitle)}>
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
              <p className={sx(prContextStyles.footnote)}>
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
