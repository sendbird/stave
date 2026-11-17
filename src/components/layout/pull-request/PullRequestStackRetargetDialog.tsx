import { useState } from "react";
import * as stylex from "@stylexjs/stylex";
import { vars } from "@/components/aui/tokens/tokens.stylex";
import { sx } from "@/components/aui/utils/stylex";
import { Button, Loader } from "@/components/ui";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { i18n, useTranslation, type I18nKey } from "@/i18n";
import type { RetargetChildResult, RetargetPlan, RetargetReason, StackErrorCode, StackPr } from "@/lib/pull-request-stack";

/** Host results carry codes; these are their sentences. */
const REASON_KEYS = {
  "not-yours": "sourceControl:prStack.reason.notYours",
  fork: "sourceControl:prStack.reason.fork",
  "not-open": "sourceControl:prStack.reason.notOpen",
  "base-changed": "sourceControl:prStack.reason.baseChanged",
  "target-changed": "sourceControl:prStack.reason.targetChanged",
  "not-a-child": "sourceControl:prStack.reason.notAChild",
  "read-failed": "sourceControl:prStack.reason.readFailed",
  "edit-failed": "sourceControl:prStack.reason.editFailed",
  "merge-conflict": "sourceControl:prStack.reason.mergeConflict",
  "update-failed": "sourceControl:prStack.reason.updateFailed",
} as const satisfies Record<RetargetReason, I18nKey>;
const ERROR_KEYS = {
  auth: "sourceControl:prStack.error.auth",
  "read-failed": "sourceControl:prStack.error.readFailed",
  "parent-ineligible": "sourceControl:prStack.error.parentIneligible",
  "parent-not-merged": "sourceControl:prStack.error.parentNotMerged",
  "invalid-response": "sourceControl:prStack.error.invalidResponse",
} as const satisfies Record<StackErrorCode, I18nKey>;
const EXCLUDED_KEYS = {
  "not-yours": "sourceControl:prStack.excluded.notYours",
  fork: "sourceControl:prStack.excluded.fork",
} as const satisfies Record<RetargetPlan["excluded"][number]["reason"], I18nKey>;
const RESULT_KEYS = {
  updated: "sourceControl:prStack.result.updated",
  conflict: "sourceControl:prStack.result.conflict",
  skipped: "sourceControl:prStack.result.skipped",
} as const satisfies Record<RetargetChildResult["status"], I18nKey>;

/** Skips worth one more try; the rest need a person or no longer apply. */
const RETRYABLE = new Set<RetargetChildResult["reason"]>(["edit-failed", "read-failed"]);

/** Children of the attempted list that a retry may still change. */
export function remainingRetargetChildren(attempted: readonly StackPr[], results: readonly RetargetChildResult[]) {
  return attempted.filter((child) => {
    const result = results.find((row) => row.number === child.number);
    return !result || (result.status === "skipped" && RETRYABLE.has(result.reason));
  });
}

/**
 * Lists exactly what will change (PR, base from → to, author), performs only
 * that after confirmation, and keeps per-child results until it is closed.
 * Mounted outside menus by its owner.
 */
export function PullRequestStackRetargetDialog(props: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  cwd: string;
  plan: RetargetPlan | null;
  longLivedBranchPatterns: string[];
  /** Refreshes the stack and PR status after every attempt, failed or not. */
  onSettled?: () => void;
}) {
  const { t } = useTranslation("sourceControl");
  // The plan as confirmed; a refresh while open does not change what was asked.
  const [confirmed, setConfirmed] = useState<RetargetPlan | null>(null);
  const [results, setResults] = useState<RetargetChildResult[]>([]);
  const [error, setError] = useState<StackErrorCode | null>(null);
  const [busy, setBusy] = useState(false);
  const plan = confirmed ?? props.plan;
  const remaining = confirmed ? remainingRetargetChildren(confirmed.children, results) : plan?.children ?? [];

  const close = (open: boolean) => {
    if (busy) return;
    if (!open) { setConfirmed(null); setResults([]); setError(null); }
    props.onOpenChange(open);
  };
  const run = async () => {
    const retarget = window.api?.sourceControl?.retargetPrStack;
    if (!plan || !remaining.length || !retarget) return;
    setConfirmed(plan);
    setBusy(true);
    setError(null);
    try {
      const response = await retarget({
        cwd: props.cwd,
        parentNumber: plan.parent.number,
        children: remaining.map((child) => ({ number: child.number, fromBase: child.baseRefName, toBase: plan.toBase })),
        longLivedBranchPatterns: props.longLivedBranchPatterns,
      });
      setError(response.code);
      setResults((previous) => [...previous.filter((row) => !response.results.some((next) => next.number === row.number)), ...response.results]);
    } catch {
      setError("read-failed");
    } finally {
      setBusy(false);
      props.onSettled?.();
    }
  };

  if (!plan) return null;
  const attempted = confirmed !== null;
  return (
    <Dialog open={props.open} onOpenChange={close}>
      <DialogContent data-pr-stack-retarget>
        <DialogHeader>
          <DialogTitle>{t("prStack.retargetTitle", { number: plan.parent.number })}</DialogTitle>
          <DialogDescription>{t("prStack.retargetDescription", { number: plan.parent.number })}</DialogDescription>
        </DialogHeader>
        <ul className={sx(styles.list)} aria-label={t("prStack.retarget")}>
          {plan.children.map((child) => {
            const result = results.find((row) => row.number === child.number);
            return <li key={child.number} className={sx(styles.row)} data-retarget-child={child.number}>
              <span className={sx(styles.title)}>{t("prStack.retargetRow", { number: child.number, title: child.title })}</span>
              <span className={sx(styles.meta)}>{t("prStack.retargetMove", { from: child.baseRefName, to: plan.toBase })} · {t("prStack.retargetAuthor", { author: child.author })}</span>
              {result ? <span className={sx(result.status === "updated" ? styles.meta : styles.problem)} role="status">
                {i18n.t(RESULT_KEYS[result.status], { number: child.number, reason: result.reason ? i18n.t(REASON_KEYS[result.reason]) : "" })}
              </span> : null}
            </li>;
          })}
        </ul>
        {!plan.children.length ? <p className={sx(styles.meta)}>{t("prStack.retargetNothing")}</p> : null}
        {plan.excluded.length ? <div className={sx(styles.excluded)}>
          <p className={sx(styles.meta)}>{t("prStack.excludedTitle")}</p>
          <ul className={sx(styles.list)}>
            {plan.excluded.map(({ pr, reason }) => <li key={pr.number} className={sx(styles.row)} data-retarget-excluded={pr.number}>
              <span className={sx(styles.title)}>{t("prStack.retargetRow", { number: pr.number, title: pr.title })}</span>
              <span className={sx(styles.meta)}>{i18n.t(EXCLUDED_KEYS[reason])} · {t("prStack.retargetAuthor", { author: pr.author })}</span>
            </li>)}
          </ul>
        </div> : null}
        {error ? <p className={sx(styles.problem)} role="alert">{i18n.t(ERROR_KEYS[error])}</p> : null}
        <DialogFooter showCloseButton>
          {remaining.length ? <Button disabled={busy} onClick={() => { void run(); }}>
            {busy ? <Loader aria-hidden size="xs" variant="persist" /> : null}
            {t(attempted ? "prStack.retargetRetry" : "prStack.retargetConfirm", { count: remaining.length })}
          </Button> : null}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

const styles = stylex.create({
  list: { display: "flex", flexDirection: "column", gap: vars["--aui-space-8"], margin: 0, padding: 0, listStyle: "none", minWidth: 0 },
  row: { display: "flex", flexDirection: "column", gap: vars["--aui-space-2"], minWidth: 0 },
  title: { overflowWrap: "anywhere" },
  meta: { margin: 0, color: vars["--aui-color-text-muted"], fontSize: vars["--aui-font-size-caption"], overflowWrap: "anywhere" },
  problem: { margin: 0, color: vars["--aui-color-danger-text"], fontSize: vars["--aui-font-size-caption"], overflowWrap: "anywhere" },
  excluded: { display: "flex", flexDirection: "column", gap: vars["--aui-space-4"], minWidth: 0 },
});
