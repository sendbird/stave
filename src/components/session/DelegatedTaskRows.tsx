import { i18n, useTranslation } from "@/i18n";
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
  type DelegatedTaskActionResult,
  type DelegatedTaskListingSource,
} from "@/components/session/useDelegatedTasks";
import { Button, Textarea } from "@/components/ui";
import { sx, cx } from "@/components/aui/utils/stylex";
import { delegatedTaskRowsStyles as styles } from "./delegated-task-rows.styles";
import {
  resolveDelegatedTaskControls,
  type DelegatedTaskExpectedIdentity,
  type DelegatedTaskSummary,
} from "@/lib/runs/delegated-task";
import {
  buildDelegatedTaskExpectedIdentity,
  selectDelegatedTaskBlockedKinds,
  type DelegatedTaskBlockedKind,
} from "@/lib/runs/delegated-task-view";
import { useAppStore } from "@/store/app.store";

type DelegatedTaskComposerKind = "follow-up" | "retry";

const COMPOSER_COPY: Record<
  DelegatedTaskComposerKind,
  { label: string; placeholder: string; submit: string }
> = {
  "follow-up": {
    get label() { return i18n.t("session:delegatedTaskRows.label"); },
    get placeholder() { return i18n.t("session:delegatedTaskRows.placeholder"); },
    get submit() { return i18n.t("session:delegatedTaskRows.submit"); },
  },
  retry: {
    get label() { return i18n.t("session:delegatedTaskRows.label2"); },
    get placeholder() { return i18n.t("session:delegatedTaskRows.placeholder2"); },
    get submit() { return i18n.t("session:delegatedTaskRows.submit2"); },
  },
};

export interface DelegatedTaskRowActionHandlers {
  onOpen: (child: DelegatedTaskSummary) => void;
  onFollowUp: (child: DelegatedTaskSummary, prompt: string) => void;
  onRetry: (child: DelegatedTaskSummary, prompt: string) => void;
  onStop: (child: DelegatedTaskSummary) => void;
  onDetach: (child: DelegatedTaskSummary) => void;
}

/**
 * The action row for one delegation — Open · Follow-up · Stop · Retry ·
 * Detach — plus the inline prompt composer the follow-up and retry need.
 * Shared by the delegated-task row here and the delegated-task exchange detail in the
 * Turn Activity shelf and the Delegations panel, so both surfaces offer the
 * same controls and the same refusals.
 */
export function DelegatedTaskRowActions(
  props: {
    child: DelegatedTaskSummary;
    busy: boolean;
    readOnly?: boolean;
  } & DelegatedTaskRowActionHandlers,
) {
  useTranslation();
  const { child } = props;
  const composerId = useId();
  const [composer, setComposer] = useState<DelegatedTaskComposerKind | null>(null);
  const [prompt, setPrompt] = useState("");
  const controls = resolveDelegatedTaskControls(child);
  const copy = composer ? COMPOSER_COPY[composer] : null;

  const openComposer = (kind: DelegatedTaskComposerKind) => {
    setComposer((current) => (current === kind ? null : kind));
    setPrompt("");
  };

  const submitComposer = () => {
    const trimmed = prompt.trim();
    if (props.readOnly || !trimmed || !composer) {
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
    <>
      <div className={sx(styles.actionsRow)} data-testid="delegated-task-actions">
        <Button
          type="button"
          size="xs"
          variant="outline"
          onClick={() => props.onOpen(child)}
        >
          {i18n.t("session:delegatedTaskRows.delegatedTaskRowActions")}<ArrowRight className={sx(styles.actionIcon)} aria-hidden="true" />
        </Button>
        {!props.readOnly && controls.canFollowUp ? (
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
            {i18n.t("session:delegatedTaskRows.delegatedTaskRowActions2")}</Button>
        ) : null}
        {!props.readOnly && controls.canStop ? (
          <Button
            type="button"
            size="xs"
            variant="ghost"
            disabled={props.busy}
            onClick={() => props.onStop(child)}
          >
            <Square className={sx(styles.actionIcon)} aria-hidden="true" />
            {i18n.t("session:delegatedTaskRows.delegatedTaskRowActions3")}</Button>
        ) : null}
        {!props.readOnly && controls.canRetry ? (
          <Button
            type="button"
            size="xs"
            variant="ghost"
            disabled={props.busy}
            aria-expanded={composer === "retry"}
            onClick={() => openComposer("retry")}
          >
            <RotateCcw className={sx(styles.actionIcon)} aria-hidden="true" />
            {i18n.t("session:delegatedTaskRows.delegatedTaskRowActions4")}</Button>
        ) : null}
        {!props.readOnly && controls.canDetach ? (
          <Button
            type="button"
            size="xs"
            variant="ghost"
            disabled={props.busy}
            onClick={() => props.onDetach(child)}
          >
            <Unlink className={sx(styles.actionIcon)} aria-hidden="true" />
            {i18n.t("session:delegatedTaskRows.delegatedTaskRowActions5")}</Button>
        ) : null}
      </div>

      {!props.readOnly && copy ? (
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
              {i18n.t("session:delegatedTaskRows.delegatedTaskRowActions6")}</Button>
            <span className={sx(styles.composerHint)}>
              {i18n.t("session:delegatedTaskRows.delegatedTaskRowActions7")}</span>
          </div>
        </div>
      ) : null}
    </>
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
  repositoryPath?: string | null;
}) {
  await useAppStore.getState().focusTaskAttention({
    taskId: args.taskId,
    workspaceId: args.workspaceId ?? undefined,
    repositoryPath: args.repositoryPath ?? undefined,
    refreshFromPersistence: true,
  });
  return useAppStore.getState().tasks.some((task) => task.id === args.taskId);
}

export interface DelegatedTaskRowController extends DelegatedTaskRowActionHandlers {
  /**
   * Settles once the coordinator answered, `false` when it refused, so a
   * caller can retry several in turn and say how many started.
   */
  onRetry: (child: DelegatedTaskSummary, prompt: string) => Promise<boolean>;
  children: readonly DelegatedTaskSummary[];
  errorByDelegationKey: Readonly<Record<string, string>>;
  blockedByDelegationKey: Readonly<Record<string, DelegatedTaskBlockedKind>>;
  busyDelegationKey: string | null;
}

/**
 * The action plumbing behind a delegated-task listing: busy/refusal state per
 * delegation, blocked-kind derivation, and the five handlers. Owned here so the
 * child rows and the exchange rows in the shelf and the panel run the same
 * actions through the same coordinator, with the same refusals shown.
 */
export function useDelegatedTaskRowController(args: {
  source: DelegatedTaskListingSource;
  repositoryPath?: string | null;
}): DelegatedTaskRowController {
  const { children, actions } = args.source;
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
    () => selectDelegatedTaskBlockedKinds({ children, notifications }),
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
    (delegationKey: string, result: DelegatedTaskActionResult) => {
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
      child: DelegatedTaskSummary,
      invoke: (
        expected: DelegatedTaskExpectedIdentity,
      ) => Promise<DelegatedTaskActionResult>,
    ) => {
      setBusyDelegationKey(child.delegationKey);
      return invoke(buildDelegatedTaskExpectedIdentity(child)).then((result) => {
        applyResult(child.delegationKey, result);
        return result.ok;
      });
    },
    [applyResult],
  );

  const repositoryPath = args.repositoryPath;
  const handleOpen = useCallback(
    (child: DelegatedTaskSummary) => {
      void openTaskInWorkspace({
        taskId: child.delegatedTaskId,
        workspaceId: child.delegatedWorkspaceId,
        repositoryPath,
      })
        .then((opened) => {
          if (opened) {
            return;
          }
          applyResult(child.delegationKey, {
            ok: false,
            error: i18n.t("session:delegatedTaskRows.extraCopy91"),
          });
        })
        .catch(() => {
          applyResult(child.delegationKey, {
            ok: false,
            error: i18n.t("session:delegatedTaskRows.extraCopy92"),
          });
        });
    },
    [applyResult, repositoryPath, i18n.language],
  );

  const handleFollowUp = useCallback(
    (child: DelegatedTaskSummary, prompt: string) => {
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
    (child: DelegatedTaskSummary, prompt: string) =>
      runAction(child, (expected) =>
        actions.retry({ delegationKey: child.delegationKey, expected, prompt }),
      ),
    [actions, runAction],
  );

  const handleStop = useCallback(
    (child: DelegatedTaskSummary) => {
      runAction(child, (expected) =>
        actions.stop({ delegationKey: child.delegationKey, expected }),
      );
    },
    [actions, runAction],
  );

  const handleDetach = useCallback(
    (child: DelegatedTaskSummary) => {
      runAction(child, (expected) =>
        actions.detach({ delegationKey: child.delegationKey, expected }),
      );
    },
    [actions, runAction],
  );

  return {
    children,
    errorByDelegationKey,
    blockedByDelegationKey,
    busyDelegationKey,
    onOpen: handleOpen,
    onFollowUp: handleFollowUp,
    onRetry: handleRetry,
    onStop: handleStop,
    onDetach: handleDetach,
  };
}

/**
 * The mirror of a child row, shown on the child's own surface: one line naming
 * the task that delegated this one, with the same navigation the parent uses to
 * reach its children. Renders nothing when the task was not delegated.
 */
export function DelegatedTaskParentBacklink(props: {
  taskId: string | null | undefined;
  repositoryPath?: string | null;
  className?: string;
}) {
  useTranslation();
  const { taskId } = props;
  const [link, setLink] = useState<DelegatedTaskSummary | null>(null);
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
    const getDelegatedTaskLink = window.api?.runs?.getDelegatedTaskLink;
    if (!getDelegatedTaskLink) {
      setLink(null);
      return;
    }
    let cancelled = false;
    void getDelegatedTaskLink({ delegatedTaskId: taskId })
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
      data-testid="delegated-task-parent-backlink"
    >
      <span className={sx(styles.backlinkLabel)}>{i18n.t("session:delegatedTaskRows.delegatedTaskParentBacklink")}</span>
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
            repositoryPath: props.repositoryPath,
          });
        }}
      >
        {i18n.t("session:delegatedTaskRows.delegatedTaskParentBacklink2")}<ArrowRight className={sx(styles.actionIcon)} aria-hidden="true" />
      </Button>
    </div>
  );
}
