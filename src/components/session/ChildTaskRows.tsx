import {
  ArrowRight,
  CornerDownRight,
  RotateCcw,
  Square,
  Unlink,
} from "lucide-react";
import {
  useCallback,
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
} from "react";
import {
  useChildTasks,
  type ChildTaskActionResult,
  type ChildTaskListingSource,
} from "@/components/session/useChildTasks";
import { Button, Textarea } from "@/components/ui";
import { getProviderLabel } from "@/lib/providers/model-catalog";
import { sx, cx } from "@/components/ads/utils/stylex";
import {
  childTaskRowsStyles as styles,
  childTaskPhaseToneStyles,
} from "./child-task-rows.styles";
import {
  resolveChildTaskControls,
  type ChildTaskExpectedIdentity,
  type ChildTaskSummary,
} from "@/lib/runs/child-task";
import {
  buildChildTaskExpectedIdentity,
  describeChildTaskPhase,
  selectChildTaskBlockedKinds,
  type ChildTaskBlockedKind,
} from "@/lib/runs/child-task-view";
import { useAppStore } from "@/store/app.store";

/**
 * The delegations a parent task owns, listed on the parent's own surface. A row
 * shows who the child is, what phase it is in and why it ended — never the
 * child's transcript, which stays behind the child task's own surfaces.
 */

const BLOCKED_HINT: Record<ChildTaskBlockedKind, string> = {
  "user-input":
    "This child task asked a question and cannot continue until it is answered.",
  approval:
    "This child task is waiting on a tool approval, which expires if nobody responds.",
};

type ChildTaskComposerKind = "follow-up" | "retry";

const COMPOSER_COPY: Record<
  ChildTaskComposerKind,
  { label: string; placeholder: string; submit: string }
> = {
  "follow-up": {
    label: "Follow-up turn",
    placeholder: "What should the child task do next?",
    submit: "Send follow-up",
  },
  retry: {
    label: "Retry instructions",
    placeholder: "What should the new attempt do?",
    submit: "Start retry",
  },
};

function ChildTaskRow(props: {
  child: ChildTaskSummary;
  busy: boolean;
  blockedKind?: ChildTaskBlockedKind | null;
  error?: string | null;
  onOpen: (child: ChildTaskSummary) => void;
  onFollowUp: (child: ChildTaskSummary, prompt: string) => void;
  onRetry: (child: ChildTaskSummary, prompt: string) => void;
  onStop: (child: ChildTaskSummary) => void;
  onDetach: (child: ChildTaskSummary) => void;
}) {
  const { child } = props;
  const composerId = useId();
  const [composer, setComposer] = useState<ChildTaskComposerKind | null>(null);
  const [prompt, setPrompt] = useState("");
  const phase = describeChildTaskPhase(child, props.blockedKind);
  const controls = resolveChildTaskControls(child);
  const copy = composer ? COMPOSER_COPY[composer] : null;
  const requestedDetails = [
    child.requestedModel ? `model ${child.requestedModel}` : null,
    child.requestedEffort ? `effort ${child.requestedEffort}` : null,
  ].filter((detail): detail is string => detail !== null);

  const openComposer = (kind: ChildTaskComposerKind) => {
    setComposer((current) => (current === kind ? null : kind));
    setPrompt("");
  };

  const submitComposer = () => {
    const trimmed = prompt.trim();
    if (!trimmed || !composer) {
      return;
    }
    if (composer === "follow-up") {
      props.onFollowUp(child, trimmed);
    } else {
      props.onRetry(child, trimmed);
    }
    setComposer(null);
    setPrompt("");
  };

  return (
    <div
      data-child-task-delegation-key={child.delegationKey}
      data-child-task-blocked={phase.blocked ? "true" : undefined}
      className={sx(
        styles.row,
        phase.blocked ? styles.rowBorderBlocked : styles.rowBorderDefault,
      )}
    >
      <div className={sx(styles.headerRow)}>
        <span
          className={sx(
            styles.phaseBadge,
            childTaskPhaseToneStyles[phase.tone],
          )}
        >
          {phase.label}
        </span>
        <span className={sx(styles.delegationName)}>{child.delegationKey}</span>
        <span className={sx(styles.metaText)}>
          {getProviderLabel({ providerId: child.providerId })}
        </span>
        {requestedDetails.length ? (
          <span
            className={sx(styles.metaText)}
            data-testid="child-task-requested-details"
          >
            Requested: {requestedDetails.join(" · ")}
          </span>
        ) : null}
        {child.attempt > 0 ? (
          <span className={sx(styles.metaTextNums)}>
            Attempt {child.attempt + 1}
          </span>
        ) : null}
      </div>

      {phase.blocked && props.blockedKind ? (
        <p className={sx(styles.blockedHint)}>
          {BLOCKED_HINT[props.blockedKind]}
        </p>
      ) : null}

      {child.reason ? (
        <p className={sx(styles.reasonText)}>{child.reason}</p>
      ) : null}

      {props.error ? (
        <p className={sx(styles.errorText)} role="alert">
          {props.error}
        </p>
      ) : null}

      <div className={sx(styles.actionsRow)}>
        <Button
          type="button"
          size="xs"
          variant="outline"
          onClick={() => props.onOpen(child)}
        >
          Open
          <ArrowRight className={sx(styles.actionIcon)} aria-hidden="true" />
        </Button>
        {controls.canFollowUp ? (
          <Button
            type="button"
            size="xs"
            variant="ghost"
            disabled={props.busy}
            aria-expanded={composer === "follow-up"}
            onClick={() => openComposer("follow-up")}
          >
            <CornerDownRight
              className={sx(styles.actionIcon)}
              aria-hidden="true"
            />
            Follow-up
          </Button>
        ) : null}
        {controls.canStop ? (
          <Button
            type="button"
            size="xs"
            variant="ghost"
            disabled={props.busy}
            onClick={() => props.onStop(child)}
          >
            <Square className={sx(styles.actionIcon)} aria-hidden="true" />
            Stop
          </Button>
        ) : null}
        {controls.canRetry ? (
          <Button
            type="button"
            size="xs"
            variant="ghost"
            disabled={props.busy}
            aria-expanded={composer === "retry"}
            onClick={() => openComposer("retry")}
          >
            <RotateCcw className={sx(styles.actionIcon)} aria-hidden="true" />
            Retry
          </Button>
        ) : null}
        {controls.canDetach ? (
          <Button
            type="button"
            size="xs"
            variant="ghost"
            disabled={props.busy}
            onClick={() => props.onDetach(child)}
          >
            <Unlink className={sx(styles.actionIcon)} aria-hidden="true" />
            Detach
          </Button>
        ) : null}
      </div>

      {copy ? (
        <div className={sx(styles.composer)}>
          <label htmlFor={composerId} className={sx(styles.composerLabel)}>
            {copy.label}
          </label>
          <Textarea
            id={composerId}
            autoFocus
            value={prompt}
            disabled={props.busy}
            xstyle={styles.composerTextarea}
            placeholder={copy.placeholder}
            onChange={(event) => setPrompt(event.target.value)}
          />
          <div className={sx(styles.composerActions)}>
            <Button
              type="button"
              size="xs"
              disabled={props.busy || !prompt.trim()}
              onClick={submitComposer}
            >
              {copy.submit}
            </Button>
            <Button
              type="button"
              size="xs"
              variant="ghost"
              onClick={() => {
                setComposer(null);
                setPrompt("");
              }}
            >
              Cancel
            </Button>
            <span className={sx(styles.composerHint)}>
              Runs with guided permissions.
            </span>
          </div>
        </div>
      ) : null}
    </div>
  );
}

export interface ChildTaskRowsSurfaceProps {
  rows: readonly ChildTaskSummary[];
  errorByDelegationKey?: Readonly<Record<string, string>>;
  /** Delegations currently stalled on a question or a tool approval. */
  blockedByDelegationKey?: Readonly<Record<string, ChildTaskBlockedKind>>;
  busyDelegationKey?: string | null;
  onOpen: (child: ChildTaskSummary) => void;
  onFollowUp: (child: ChildTaskSummary, prompt: string) => void;
  onRetry: (child: ChildTaskSummary, prompt: string) => void;
  onStop: (child: ChildTaskSummary) => void;
  onDetach: (child: ChildTaskSummary) => void;
  className?: string;
}

/**
 * Fully controlled listing, so the same rows render from the turn-activity
 * shelf and from the Fleet control panel without either owning the transport.
 */
export function ChildTaskRowsSurface(props: ChildTaskRowsSurfaceProps) {
  if (!props.rows.length) {
    return null;
  }
  return (
    <section
      className={cx(sx(styles.sectionRoot), props.className)}
      aria-label="Child tasks"
      data-testid="child-task-rows"
    >
      <h3 className={sx(styles.sectionHeading)}>Child tasks</h3>
      <div className={sx(styles.sectionList)}>
        {props.rows.map((child) => (
          <ChildTaskRow
            key={child.delegationKey}
            child={child}
            busy={props.busyDelegationKey === child.delegationKey}
            blockedKind={
              props.blockedByDelegationKey?.[child.delegationKey] ?? null
            }
            error={props.errorByDelegationKey?.[child.delegationKey] ?? null}
            onOpen={props.onOpen}
            onFollowUp={props.onFollowUp}
            onRetry={props.onRetry}
            onStop={props.onStop}
            onDetach={props.onDetach}
          />
        ))}
      </div>
    </section>
  );
}

/**
 * Opening a child reuses the same navigation every other cross-workspace task
 * link in the app uses, so a child opens exactly like a task opened from Fleet
 * or from an automation run.
 */
async function openTaskInWorkspace(args: {
  taskId: string;
  /** Omitted for a parent task, whose workspace the store already knows. */
  workspaceId?: string | null;
  projectPath?: string | null;
}) {
  await useAppStore.getState().focusTaskAttention({
    taskId: args.taskId,
    workspaceId: args.workspaceId ?? undefined,
    projectPath: args.projectPath ?? undefined,
    refreshFromPersistence: true,
  });
  return useAppStore.getState().tasks.some((task) => task.id === args.taskId);
}

export function ChildTaskRows(props: {
  parentTaskId: string | null | undefined;
  parentWorkspaceId?: string | null;
  projectPath?: string | null;
  enabled?: boolean;
  /**
   * A listing already loaded by an ancestor that needs it for something else
   * too — the turn activity shelf reads it to fold delegated children into the
   * turn's work graph. Passing it down keeps one subscription per parent task
   * instead of one per view, and guarantees both views show the same rows.
   */
  source?: ChildTaskListingSource;
  className?: string;
}) {
  // Disabled rather than skipped: a hook cannot be conditional, and an disabled
  // `useChildTasks` neither lists nor subscribes.
  const ownListing = useChildTasks({
    parentTaskId: props.parentTaskId,
    parentWorkspaceId: props.parentWorkspaceId,
    projectPath: props.projectPath,
    enabled: props.source ? false : props.enabled,
  });
  const { children, actions } = props.source ?? ownListing;
  const [errorByDelegationKey, setErrorByDelegationKey] = useState<
    Record<string, string>
  >({});
  const [busyDelegationKey, setBusyDelegationKey] = useState<string | null>(
    null,
  );
  // Subscribes to the stable store array and derives outside the selector, so
  // this never hands Zustand a fresh object to compare.
  const notifications = useAppStore((state) => state.notifications);
  const blockedByDelegationKey = useMemo(
    () => selectChildTaskBlockedKinds({ children, notifications }),
    [children, notifications],
  );
  const mountedRef = useRef(true);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
    };
  }, []);

  const applyResult = useCallback(
    (delegationKey: string, result: ChildTaskActionResult) => {
      if (!mountedRef.current) {
        return;
      }
      setBusyDelegationKey((current) =>
        current === delegationKey ? null : current,
      );
      setErrorByDelegationKey((current) => {
        if (result.ok) {
          if (!(delegationKey in current)) {
            return current;
          }
          const next = { ...current };
          delete next[delegationKey];
          return next;
        }
        const message = result.error ?? "";
        return current[delegationKey] === message
          ? current
          : { ...current, [delegationKey]: message };
      });
    },
    [],
  );

  const runAction = useCallback(
    (
      child: ChildTaskSummary,
      invoke: (
        expected: ChildTaskExpectedIdentity,
      ) => Promise<ChildTaskActionResult>,
    ) => {
      setBusyDelegationKey(child.delegationKey);
      void invoke(buildChildTaskExpectedIdentity(child)).then((result) => {
        applyResult(child.delegationKey, result);
      });
    },
    [applyResult],
  );

  const handleOpen = useCallback(
    (child: ChildTaskSummary) => {
      void openTaskInWorkspace({
        taskId: child.childTaskId,
        workspaceId: child.childWorkspaceId,
        projectPath: props.projectPath,
      })
        .then((opened) => {
          if (opened) {
            return;
          }
          applyResult(child.delegationKey, {
            ok: false,
            error: "This child task's conversation could not be found.",
          });
        })
        .catch(() => {
          applyResult(child.delegationKey, {
            ok: false,
            error: "This child task could not be opened.",
          });
        });
    },
    [applyResult, props.projectPath],
  );

  const handleFollowUp = useCallback(
    (child: ChildTaskSummary, prompt: string) => {
      runAction(child, (expected) =>
        actions.followUp({
          delegationKey: child.delegationKey,
          expected,
          prompt,
        }),
      );
    },
    [actions, runAction],
  );

  const handleRetry = useCallback(
    (child: ChildTaskSummary, prompt: string) => {
      runAction(child, (expected) =>
        actions.retry({ delegationKey: child.delegationKey, expected, prompt }),
      );
    },
    [actions, runAction],
  );

  const handleStop = useCallback(
    (child: ChildTaskSummary) => {
      runAction(child, (expected) =>
        actions.stop({ delegationKey: child.delegationKey, expected }),
      );
    },
    [actions, runAction],
  );

  const handleDetach = useCallback(
    (child: ChildTaskSummary) => {
      runAction(child, (expected) =>
        actions.detach({ delegationKey: child.delegationKey, expected }),
      );
    },
    [actions, runAction],
  );

  return (
    <ChildTaskRowsSurface
      rows={children}
      errorByDelegationKey={errorByDelegationKey}
      blockedByDelegationKey={blockedByDelegationKey}
      busyDelegationKey={busyDelegationKey}
      className={props.className}
      onOpen={handleOpen}
      onFollowUp={handleFollowUp}
      onRetry={handleRetry}
      onStop={handleStop}
      onDetach={handleDetach}
    />
  );
}

/**
 * The mirror of a child row, shown on the child's own surface: one line naming
 * the task that delegated this one, with the same navigation the parent uses to
 * reach its children. Renders nothing when the task was not delegated.
 */
export function ChildTaskParentBacklink(props: {
  taskId: string | null | undefined;
  projectPath?: string | null;
  className?: string;
}) {
  const { taskId } = props;
  const [link, setLink] = useState<ChildTaskSummary | null>(null);
  const parentTaskId = link?.parentTaskId ?? null;
  const parentTitle = useAppStore((state) =>
    parentTaskId
      ? (state.tasks.find((task) => task.id === parentTaskId)?.title ?? null)
      : null,
  );

  useEffect(() => {
    if (!taskId) {
      setLink(null);
      return;
    }
    const getChildTaskLink = window.api?.runs?.getChildTaskLink;
    if (!getChildTaskLink) {
      setLink(null);
      return;
    }
    let cancelled = false;
    void getChildTaskLink({ childTaskId: taskId })
      .then((resolved) => {
        if (!cancelled) {
          setLink(resolved);
        }
      })
      .catch(() => {
        if (!cancelled) {
          setLink(null);
        }
      });
    return () => {
      cancelled = true;
    };
  }, [taskId]);

  if (!link || !parentTaskId) {
    return null;
  }

  return (
    <div
      className={cx(sx(styles.backlink), props.className)}
      data-testid="child-task-parent-backlink"
    >
      <span className={sx(styles.backlinkLabel)}>Delegated by</span>
      <span className={sx(styles.backlinkTitle)}>
        {parentTitle?.trim() || parentTaskId}
      </span>
      <span className={sx(styles.metaText)}>{link.delegationKey}</span>
      <Button
        type="button"
        size="xs"
        variant="ghost"
        onClick={() => {
          void openTaskInWorkspace({
            taskId: parentTaskId,
            projectPath: props.projectPath,
          });
        }}
      >
        Open parent task
        <ArrowRight className={sx(styles.actionIcon)} aria-hidden="true" />
      </Button>
    </div>
  );
}
