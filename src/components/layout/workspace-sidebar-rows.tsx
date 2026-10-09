import { i18n, useTranslation } from "@/i18n";
import { Button as AdsButton } from "@/components/ads/components/Button";
import {
  AlertTriangle,
  GitBranch,
  GitMerge,
  MoreVertical,
  ShieldCheck,
  UserRound,
} from "lucide-react";
import {
  memo,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type KeyboardEvent as ReactKeyboardEvent,
  type ReactElement,
  type ReactNode,
} from "react";
import { useShallow } from "zustand/react/shallow";
import { repositorySidebarStyles } from "@/components/layout/repository-workspace-sidebar.styles";
import { focusRing } from "@/components/ads/recipes/focus-ring";
import { transition } from "@/components/ads/recipes/transition";
import { sx } from "@/components/ads/utils/stylex";
import {
  formatWorkQueueWorkspaceLabel,
  formatWorkspaceDisplayName,
  buildWorkspaceHoverPreview,
  getWorkspaceHoverActionVisibilityStyle,
  getWorkspaceLeadingAttentionKind,
  getWorkspaceRespondingCountVisibilityStyle,
  type RepositorySidebarAttentionAlert,
  type SidebarWorkQueueEntry,
} from "@/components/layout/RepositoryWorkspaceSidebar.utils";
import { PrStatusIcon } from "@/components/layout/PrStatusIcon";
import { WorkspaceShortcutChip } from "@/components/layout/WorkspaceShortcutChip";
import { WorkspaceIdentityMark } from "@/components/layout/workspace-accent";
import { WorkspaceAccountLimitIcon } from "@/components/layout/WorkspaceAccountLimitIcon";
import { WorkspaceProgressTaskTree } from "@/components/layout/WorkspaceProgressTaskTree";
import { dispatchOpenTaskHistory } from "@/components/panes/pane-surface-actions";
import {
  SortableDropIndicator,
  useSortableRow,
} from "@/hooks/use-sortable-list";
import {
  Badge,
  Button,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
  Tooltip,
  TooltipContent,
  TooltipTrigger,
  Loader,
  Input,
} from "@/components/ui";
import { WorkspaceSettingsDialog } from "./WorkspaceSettingsDialog";
import {
  loadWorkspaceShellSummary,
  type WorkspaceShellSummary,
} from "@/lib/db/workspaces.db";
import { summarizeFleetRespondingTasks } from "@/lib/fleet/task-status";
import type { FleetAttentionKind } from "@/lib/fleet/attention-projection";
import { formatBranchLabel } from "@/lib/source-control-branch-label";
import type { ProviderTurnActivitySnapshot } from "@/lib/providers/turn-status";
import { useAppStore } from "@/store/app.store";
import { isDefaultWorkspaceName } from "@/store/repository.utils";
import type { ChatMessage, Task } from "@/types/chat";

const EMPTY_MESSAGES: ChatMessage[] = [];

const EMPTY_TASKS: Task[] = [];

const EMPTY_MESSAGES_BY_TASK: Record<string, ChatMessage[]> = {};

const EMPTY_MESSAGE_COUNT_BY_TASK: Record<string, number> = {};

const EMPTY_ACTIVE_TURN_IDS_BY_TASK: Record<string, string | undefined> = {};

function resolveRespondingToneClass(args: {
  tasks: ReturnType<typeof useAppStore.getState>["tasks"];
  messagesByTask: Record<string, ChatMessage[]>;
  activeTurnIdsByTask: Record<string, string | undefined>;
  providerTurnActivityByTask: Record<
    string,
    ProviderTurnActivitySnapshot | undefined
  >;
}) {
  const summary = summarizeFleetRespondingTasks({
    tasks: args.tasks,
    messagesByTask: args.messagesByTask,
    activeTurnIdsByTask: args.activeTurnIdsByTask,
    providerTurnActivityByTask: args.providerTurnActivityByTask,
  });
  if (summary.respondingTaskCount === 0) {
    return {
      respondingTaskCount: 0,
      respondingToneClass: sx(repositorySidebarStyles.toneAccent),
    };
  }

  return {
    respondingTaskCount: summary.respondingTaskCount,
    // The workspace row is a container, not one provider. Theme primary keeps
    // it stable when several tasks run under different brands.
    respondingToneClass: summary.hasWarningTask
      ? sx(repositorySidebarStyles.toneWarning)
      : sx(repositorySidebarStyles.toneAccent),
  };
}

function formatWorkspaceName(name: string, branch?: string) {
  const isDefault = isDefaultWorkspaceName(name);
  if (isDefault) {
    return (
      <>
        {i18n.t("workspace:workspaceSidebarRows.default")}{branch ? (
          <span className={sx(repositorySidebarStyles.defaultBranchChip)}>
            {formatBranchLabel(branch)}
          </span>
        ) : null}
      </>
    );
  }
  return formatWorkspaceDisplayName({ name, branch, isDefault });
}

function formatWorkspaceTitle(args: {
  name: string;
  branch?: string;
  isDefault: boolean;
}) {
  return formatWorkspaceDisplayName(args);
}

export function isWorkspaceActivationKey(event: ReactKeyboardEvent<HTMLElement>) {
  return event.key === "Enter" || event.key === " ";
}

function formatWorkspaceBranchLabel(args: {
  branch?: string;
  isDefault: boolean;
}) {
  const label = formatBranchLabel(args.branch);
  if (label) {
    return label;
  }
  return args.isDefault ? "default" : "worktree";
}

function formatCountLabel(count: number, singular: string) {
  return `${count} ${singular}${count === 1 ? "" : "s"}`;
}

function useWorkspaceSidebarActivityState(workspaceId: string) {
  const [
    tasks,
    messagesByTask,
    activeTurnIdsByTask,
    providerTurnActivityByTask,
    prStatus,
  ] = useAppStore(
    useShallow((state) => {
      if (state.activeWorkspaceId === workspaceId) {
        return [
          state.tasks,
          state.messagesByTask,
          state.activeTurnIdsByTask,
          state.providerTurnActivityByTask,
          state.workspacePrInfoById[workspaceId]?.derived ?? null,
        ] as const;
      }
      const runtimeState = state.workspaceRuntimeCacheById[workspaceId];
      return [
        runtimeState?.tasks ?? EMPTY_TASKS,
        runtimeState?.messagesByTask ?? EMPTY_MESSAGES_BY_TASK,
        runtimeState?.activeTurnIdsByTask ?? EMPTY_ACTIVE_TURN_IDS_BY_TASK,
        state.providerTurnActivityByTask,
        state.workspacePrInfoById[workspaceId]?.derived ?? null,
      ] as const;
    }),
  );

  return useMemo(
    () => ({
      ...resolveRespondingToneClass({
        tasks,
        messagesByTask,
        activeTurnIdsByTask,
        providerTurnActivityByTask,
      }),
      prStatus,
    }),
    [
      activeTurnIdsByTask,
      messagesByTask,
      prStatus,
      providerTurnActivityByTask,
      tasks, i18n.resolvedLanguage],
  );
}

function useWorkspaceHoverPreviewState(workspaceId: string) {
  const [tasks, messageCountByTask, activeTurnIdsByTask, hasRuntimeState] =
    useAppStore(
      useShallow((state) => {
        if (state.activeWorkspaceId === workspaceId) {
          return [
            state.tasks,
            state.messageCountByTask,
            state.activeTurnIdsByTask,
            true,
          ] as const;
        }
        const runtimeState = state.workspaceRuntimeCacheById[workspaceId];
        return [
          runtimeState?.tasks ?? EMPTY_TASKS,
          runtimeState?.messageCountByTask ?? EMPTY_MESSAGE_COUNT_BY_TASK,
          runtimeState?.activeTurnIdsByTask ?? EMPTY_ACTIVE_TURN_IDS_BY_TASK,
          Boolean(runtimeState),
        ] as const;
      }),
    );

  return useMemo(
    () => ({
      tasks,
      messageCountByTask,
      activeTurnIdsByTask,
      hasRuntimeState,
    }),
    [activeTurnIdsByTask, hasRuntimeState, messageCountByTask, tasks, i18n.resolvedLanguage],
  );
}

export function WorkspaceHoverPreviewTooltip(args: {
  workspaceId: string;
  workspaceName: string;
  branch?: string;
  repositoryName?: string;
  shortcutLabel?: string | null;
  side: "top" | "right";
  /**
   * Extra anchor gap for rows that render in-flow controls beside the
   * trigger: the popup must clear them or it swallows their clicks.
   */
  sideOffset?: number;
  children: ReactElement;
}) {
  const { t: tI18n } = useTranslation(["workspace"]);
  const { tasks, messageCountByTask, activeTurnIdsByTask, hasRuntimeState } =
    useWorkspaceHoverPreviewState(args.workspaceId);
  const [loadedShell, setLoadedShell] = useState<
    WorkspaceShellSummary | null | undefined
  >(undefined);
  const [isShellLoading, setIsShellLoading] = useState(false);
  const [didShellLoadFail, setDidShellLoadFail] = useState(false);

  const preview = useMemo(() => {
    if (hasRuntimeState) {
      return buildWorkspaceHoverPreview({
        tasks,
        messageCountByTask,
        activeTurnIdsByTask,
      });
    }
    if (loadedShell !== undefined) {
      return buildWorkspaceHoverPreview({
        tasks: loadedShell?.tasks ?? EMPTY_TASKS,
        messageCountByTask:
          loadedShell?.messageCountByTask ?? EMPTY_MESSAGE_COUNT_BY_TASK,
      });
    }
    return null;
  }, [
    activeTurnIdsByTask,
    hasRuntimeState,
    loadedShell,
    messageCountByTask,
    tasks, i18n.resolvedLanguage]);

  const handleOpenChange = useCallback(
    (open: boolean) => {
      if (
        !open ||
        hasRuntimeState ||
        loadedShell !== undefined ||
        isShellLoading
      ) {
        return;
      }

      setIsShellLoading(true);
      setDidShellLoadFail(false);
      void loadWorkspaceShellSummary({ workspaceId: args.workspaceId })
        .then((shell) => {
          setLoadedShell(shell);
        })
        .catch(() => {
          setDidShellLoadFail(true);
        })
        .finally(() => {
          setIsShellLoading(false);
        });
    },
    [args.workspaceId, hasRuntimeState, isShellLoading, loadedShell],
  );

  const metaLabel = preview
    ? [
        formatCountLabel(preview.taskCount, "task"),
        preview.messageCount > 0
          ? formatCountLabel(preview.messageCount, "message")
          : null,
      ]
        .filter(Boolean)
        .join(" • ")
    : "";

  return (
    <Tooltip onOpenChange={handleOpenChange}>
      <TooltipTrigger render={args.children} />
      <TooltipContent
        side={args.side}
        sideOffset={args.sideOffset}
        align="start"
        className={sx(repositorySidebarStyles.previewContent)}
      >
        <div className={sx(repositorySidebarStyles.previewStack)}>
          <div className={sx(repositorySidebarStyles.previewHeadStack)}>
            <p className={sx(repositorySidebarStyles.previewTitle)}>
              {formatWorkspaceName(args.workspaceName, args.branch)}
            </p>
            {args.repositoryName ? (
              <p className={sx(repositorySidebarStyles.previewMeta)}>
                {args.repositoryName}
              </p>
            ) : null}
          </div>
          <div className={sx(repositorySidebarStyles.previewBodyStack)}>
            {didShellLoadFail && !preview ? (
              <p className={sx(repositorySidebarStyles.previewMeta)}>
                {tI18n("workspace:workspaceSidebarRows.previewUnavailable")}</p>
            ) : !preview || isShellLoading ? (
              <p className={sx(repositorySidebarStyles.previewMeta)}>
                {tI18n("workspace:workspaceSidebarRows.loadingSummary")}</p>
            ) : preview.isEmpty ? (
              <p className={sx(repositorySidebarStyles.previewMeta)}>
                {tI18n("workspace:workspaceSidebarRows.noTasksYet")}</p>
            ) : (
              <>
                <div className={sx(repositorySidebarStyles.previewMetaRow)}>
                  <span>{metaLabel}</span>
                  {preview.runningTaskCount > 0 ? (
                    <span
                      className={sx(repositorySidebarStyles.previewRunningChip)}
                    >
                      {tI18n("workspace:workspaceSidebarRows.valueRunning", { value1: preview.runningTaskCount })}
                    </span>
                  ) : null}
                </div>
                <div className={sx(repositorySidebarStyles.previewTaskStack)}>
                  {preview.taskTitles.map((title, index) => (
                    <p
                      key={`${args.workspaceId}:${index}`}
                      className={sx(repositorySidebarStyles.previewTaskTitle)}
                    >
                      {title}
                    </p>
                  ))}
                  {preview.moreTaskCount > 0 ? (
                    <p className={sx(repositorySidebarStyles.previewMeta)}>
                      {tI18n("workspace:workspaceSidebarRows.moreCount", { count: preview.moreTaskCount })}</p>
                  ) : null}
                </div>
              </>
            )}
            {args.shortcutLabel ? (
              <WorkspaceShortcutChip
                modifier={workspaceShortcutModifierLabel}
                label={args.shortcutLabel}
                className={sx(repositorySidebarStyles.previewShortcutChip)}
              />
            ) : null}
          </div>
        </div>
      </TooltipContent>
    </Tooltip>
  );
}

export const WorkspaceLeadingStatusIcon = memo(
  function WorkspaceLeadingStatusIcon(args: {
    workspaceId: string;
    workspaceName: string;
    isDefault: boolean;
    busy: boolean;
    attentionKind?: FleetAttentionKind;
  }) {
    const { respondingTaskCount, respondingToneClass, prStatus } =
      useWorkspaceSidebarActivityState(args.workspaceId);
    const leadingAttentionKind = getWorkspaceLeadingAttentionKind(
      args.attentionKind,
    );

    if (args.busy) {
      return (
        <Loader
          aria-hidden
          className={sx(repositorySidebarStyles.statusMuted)}
          size="xs"
          variant="spinner"
        />
      );
    }

    if (leadingAttentionKind === "user-input") {
      return (
        <UserRound
          className={sx(repositorySidebarStyles.statusIconWarning)}
          aria-hidden="true"
        />
      );
    }
    if (leadingAttentionKind === "approval") {
      return (
        <ShieldCheck
          className={sx(repositorySidebarStyles.statusIconWarning)}
          aria-hidden="true"
        />
      );
    }
    if (leadingAttentionKind === "run-failed") {
      return (
        <AlertTriangle
          className={sx(repositorySidebarStyles.statusIconDanger)}
          aria-hidden="true"
        />
      );
    }
    if (leadingAttentionKind === "pr-behind-base") {
      return (
        <AlertTriangle
          className={sx(repositorySidebarStyles.statusIconGitModified)}
          aria-hidden="true"
        />
      );
    }
    if (
      leadingAttentionKind === "pr-changes-requested" ||
      leadingAttentionKind === "pr-checks-failed" ||
      leadingAttentionKind === "pr-merge-conflict"
    ) {
      return (
        <AlertTriangle
          className={sx(repositorySidebarStyles.statusIconGitClosed)}
          aria-hidden="true"
        />
      );
    }
    if (leadingAttentionKind === "pr-ready-to-merge") {
      return (
        <GitMerge
          className={sx(repositorySidebarStyles.statusIconGitOpen)}
          aria-hidden="true"
        />
      );
    }

    if (respondingTaskCount > 0) {
      return (
        <Loader
          aria-hidden
          className={respondingToneClass}
          size="xs"
          variant="matrix"
        />
      );
    }

    if (!args.isDefault && prStatus) {
      return (
        <PrStatusIcon
          status={prStatus}
          className={sx(repositorySidebarStyles.statusIcon)}
        />
      );
    }

    return (
      <WorkspaceIdentityMark
        workspaceName={args.workspaceName}
        isDefault={args.isDefault}
        className={sx(repositorySidebarStyles.identityMark)}
        iconClassName={sx(repositorySidebarStyles.identityMarkIcon)}
      />
    );
  },
);

export function WorkQueueRow(args: {
  entry: SidebarWorkQueueEntry;
  attentionKind?: FleetAttentionKind;
  onOpen: (target: { repositoryPath: string; workspaceId: string }) => void;
  /** Replaces the repository name, e.g. why a shelved row is shelved. */
  secondaryLabel?: string;
  /** Revealed on hover over the row's trailing edge. */
  actions?: ReactNode;
}) {
  const { entry } = args;

  return (
    <div className={sx(repositorySidebarStyles.queueRow)}>
      <div className={sx(repositorySidebarStyles.queueItem)}>
        <WorkspaceHoverPreviewTooltip
          workspaceId={entry.workspaceId}
          workspaceName={entry.workspaceName}
          branch={entry.branch}
          repositoryName={entry.repositoryName}
          side="right"
        >
          <AdsButton
            layout="host"
            type="button"
            onClick={() =>
              args.onOpen({
                repositoryPath: entry.repositoryPath,
                workspaceId: entry.workspaceId,
              })
            }
            data-testid={`active-workspace-${entry.workspaceId}`}
            aria-label={i18n.t("workspace:workspaceSidebarRows.accessibility.openWorkspace", { value1: entry.workspaceName })}
            xstyle={[
              repositorySidebarStyles.queueButton,
              transition.colors,
              entry.isActive
                ? repositorySidebarStyles.queueButtonActive
                : repositorySidebarStyles.queueButtonIdle,
            ]}
          >
            <WorkspaceLeadingStatusIcon
              workspaceId={entry.workspaceId}
              workspaceName={entry.workspaceName}
              isDefault={entry.isDefault}
              busy={false}
              attentionKind={args.attentionKind}
            />
            <span className={sx(repositorySidebarStyles.queueLabel)}>
              {formatWorkQueueWorkspaceLabel({
                name: entry.workspaceName,
                branch: entry.branch,
                isDefault: entry.isDefault,
              })}
            </span>
            <span
              className={sx(
                repositorySidebarStyles.queueRepository,
                args.actions ? repositorySidebarStyles.rowCountYields : null,
              )}
            >
              {args.secondaryLabel ?? entry.repositoryName}
            </span>
            <WorkspaceAccountLimitIcon workspaceId={entry.workspaceId} />
          </AdsButton>
        </WorkspaceHoverPreviewTooltip>
        {args.actions}
      </div>
      <WorkspaceProgressTaskTree
        workspaceId={entry.workspaceId}
        repositoryPath={entry.repositoryPath}
      />
    </div>
  );
}

export const RepositoryAttentionAlertIcon = memo(
  function ProjectAttentionAlertIcon(args: {
    alert: RepositorySidebarAttentionAlert;
    repositoryName: string;
  }) {
    const { alert } = args;
    // Review-tier needs are finished work awaiting confirmation, not a stalled
    // agent. They get a muted dot so the warning glyphs keep meaning "blocked".
    const icon =
      alert.tier === "review" ? (
        <span
          className={sx(repositorySidebarStyles.attentionDot)}
          aria-hidden="true"
        />
      ) : alert.kind === "user-input" ? (
        <UserRound
          className={sx(repositorySidebarStyles.attentionIconWarning)}
          aria-hidden="true"
        />
      ) : alert.kind === "approval" ? (
        <ShieldCheck
          className={sx(repositorySidebarStyles.attentionIconWarning)}
          aria-hidden="true"
        />
      ) : (
        <AlertTriangle
          className={sx(repositorySidebarStyles.attentionIconDanger)}
          aria-hidden="true"
        />
      );

    return (
      <Tooltip>
        <TooltipTrigger
          render={
            <span
              className={sx(repositorySidebarStyles.attentionSlot)}
              role="status"
              data-testid={`project-attention-${args.repositoryName}`}
              aria-label={i18n.t("workspace:workspaceSidebarRows.accessibility.projectAttention", { value1: args.repositoryName })}
            />
          }
        >
          {icon}
          {alert.attentionItemCount > 1 ? (
            <span className={sx(repositorySidebarStyles.attentionCount)}>
              {alert.attentionItemCount}
            </span>
          ) : null}
        </TooltipTrigger>
        {/*
        The tooltip is portaled, so opening to the right escapes the sidebar
        instead of being clamped back over the glyph. `tests/e2e` asserts the
        bubble's rect stays clear of the icon it describes.
      */}
        <TooltipContent side="right">{alert.label}</TooltipContent>
      </Tooltip>
    );
  },
);

export const WorkspaceRespondingCountBadge = memo(
  function WorkspaceRespondingCountBadge(args: {
    workspaceId: string;
    hasHoverActions: boolean;
    isClosing: boolean;
  }) {
    const { respondingTaskCount } = useWorkspaceSidebarActivityState(
      args.workspaceId,
    );

    if (respondingTaskCount === 0) {
      return null;
    }

    return (
      <div className={sx(repositorySidebarStyles.respondingSlot)}>
        <Badge
          variant="outline"
          tone="accent"
          className={sx(
            repositorySidebarStyles.respondingBadge,
            transition.fade,
            getWorkspaceRespondingCountVisibilityStyle({
              hasHoverActions: args.hasHoverActions,
              isClosing: args.isClosing,
            }),
          )}
        >
          {respondingTaskCount}
        </Badge>
      </div>
    );
  },
);

export function InlineWorkspaceLabel(args: {
  workspaceId: string;
  workspaceName: string;
  branch?: string;
  isDefault: boolean;
  isActive: boolean;
  compact: boolean;
  showBranchContext: boolean;
  onRename: (args: {
    workspaceId: string;
    name: string;
  }) => Promise<{ ok: boolean; message?: string }>;
}) {
  const { t: tI18n } = useTranslation(["workspace"]);
  const inputRef = useRef<HTMLInputElement | null>(null);
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(args.workspaceName);
  const [saving, setSaving] = useState(false);
  const canEdit = args.isActive && !args.isDefault;
  const displayName = formatWorkspaceTitle({
    name: args.workspaceName,
    branch: args.showBranchContext ? args.branch : undefined,
    isDefault: args.isDefault,
  });

  useEffect(() => {
    if (!editing) {
      setDraft(args.workspaceName);
    }
  }, [args.workspaceName, editing]);

  useEffect(() => {
    if (!editing) {
      return;
    }
    inputRef.current?.focus();
    inputRef.current?.select();
  }, [editing]);

  async function commitDraft() {
    if (!editing || saving) {
      return;
    }
    const nextName = draft.trim();
    if (!nextName || nextName === args.workspaceName.trim()) {
      setDraft(args.workspaceName);
      setEditing(false);
      return;
    }
    setSaving(true);
    try {
      const result = await args.onRename({
        workspaceId: args.workspaceId,
        name: nextName,
      });
      if (!result.ok) {
        setDraft(args.workspaceName);
      }
      setEditing(false);
    } finally {
      setSaving(false);
    }
  }

  if (editing) {
    return (
      <Input
        ref={inputRef}
        value={draft}
        disabled={saving}
        onChange={(event) => setDraft(event.target.value)}
        onClick={(event) => event.stopPropagation()}
        onKeyDown={(event) => {
          event.stopPropagation();
          if (event.key === "Enter") {
            event.preventDefault();
            void commitDraft();
          }
          if (event.key === "Escape") {
            event.preventDefault();
            setDraft(args.workspaceName);
            setEditing(false);
          }
        }}
        onBlur={() => void commitDraft()}
        xstyle={[
          repositorySidebarStyles.labelInput,
          args.compact
            ? repositorySidebarStyles.labelInputCompact
            : repositorySidebarStyles.labelInputWide,
        ]}
        data-testid={`edit-workspace-label-${args.workspaceId}`}
        aria-label={i18n.t("workspace:workspaceSidebarRows.accessibility.editWorkspaceLabel", { value1: args.workspaceName })}
      />
    );
  }

  return (
    <span
      className={sx(
        repositorySidebarStyles.label,
        args.compact && repositorySidebarStyles.labelCompact,
        !args.compact && repositorySidebarStyles.labelRoomy,
        args.isActive && repositorySidebarStyles.labelActive,
        canEdit && repositorySidebarStyles.labelEditable,
        canEdit && focusRing.ring,
      )}
      title={canEdit ? tI18n("workspace:workspaceSidebarRows.editWorkspaceLabel") : String(displayName)}
      tabIndex={canEdit ? 0 : undefined}
      onClick={(event) => {
        if (!canEdit) {
          return;
        }
        event.stopPropagation();
        setEditing(true);
      }}
      onKeyDown={(event) => {
        if (!canEdit || !isWorkspaceActivationKey(event)) {
          return;
        }
        event.preventDefault();
        event.stopPropagation();
        setEditing(true);
      }}
    >
      {displayName}
    </span>
  );
}

export const WorkspaceExpandedMeta = memo(function WorkspaceExpandedMeta(args: {
  workspaceId: string;
  branch?: string;
  isDefault: boolean;
  shortcutLabel?: string | null;
  hasHoverActions: boolean;
  isClosing: boolean;
}) {
  const { respondingTaskCount } = useWorkspaceSidebarActivityState(
    args.workspaceId,
  );
  const branchLabel = formatWorkspaceBranchLabel({
    branch: args.branch,
    isDefault: args.isDefault,
  });

  // The shortcut is a hover/focus hint over the line's end: no width at rest.
  return (
    <span className={sx(repositorySidebarStyles.metaGrid)}>
      <span className={sx(repositorySidebarStyles.metaIconSlot)}>
        <GitBranch className={sx(repositorySidebarStyles.metaIcon)} />
      </span>
      <span className={sx(repositorySidebarStyles.metaBody)}>
        <span className={sx(repositorySidebarStyles.metaBranch)}>{branchLabel}</span>
        {respondingTaskCount > 0 ? (
          <span
            className={sx(
              repositorySidebarStyles.metaActions,
              transition.fade,
              getWorkspaceRespondingCountVisibilityStyle({ hasHoverActions: args.hasHoverActions, isClosing: args.isClosing }),
            )}
          >
            <Badge variant="outline" tone="accent" className={sx(repositorySidebarStyles.respondingBadgeInline)}>
              {respondingTaskCount}
            </Badge>
          </span>
        ) : null}
        {args.shortcutLabel ? (
          <span
            className={sx(
              repositorySidebarStyles.metaShortcutReveal,
              transition.fade,
              getWorkspaceHoverActionVisibilityStyle({ isClosing: args.isClosing }),
            )}
          >
            <WorkspaceShortcutChip
              modifier={workspaceShortcutModifierLabel}
              label={args.shortcutLabel}
              className={sx(repositorySidebarStyles.metaShortcutChip)}
            />
          </span>
        ) : null}
      </span>
    </span>
  );
});

export const IS_MAC =
  typeof window !== "undefined" && window.api?.platform === "darwin";

export const workspaceShortcutModifierLabel = IS_MAC ? "\u2318\u21E7" : "Ctrl+Shift";

interface SortableSidebarItemProps {
  listId: string;
  id: string;
  disabled?: boolean;
  /** Content of the compact fixed-size native drag preview chip. */
  previewTitle: string;
  previewIcon?: ReactNode;
  /** Gap between rows so the drop-indicator line sits centered between them. */
  indicatorGap?: string;
  children: (args: {
    /** Attach to the element that should initiate drags; null when disabled. */
    handleRef: ((element: HTMLElement | null) => void) | null;
    isDragging: boolean;
  }) => ReactNode;
}

export function SortableSidebarItem(args: SortableSidebarItemProps) {
  const { setRowElement, setHandleElement, isDragging, closestEdge } =
    useSortableRow({
      listId: args.listId,
      itemId: args.id,
      disabled: args.disabled,
      preview: { title: args.previewTitle, icon: args.previewIcon },
    });

  return (
    <div
      ref={setRowElement}
      className={sx(
        repositorySidebarStyles.sortableRow,
        isDragging && repositorySidebarStyles.sortableRowDragging,
      )}
    >
      {args.children({
        isDragging,
        handleRef: args.disabled ? null : setHandleElement,
      })}
      {closestEdge ? (
        <SortableDropIndicator edge={closestEdge} gap={args.indicatorGap} />
      ) : null}
    </div>
  );
}

export function WorkspaceRowActions(args: {
  workspaceId: string;
  workspaceName: string;
  isDefault: boolean;
  branch?: string;
  repositoryPath: string;
  workspacePath: string;
  canArchiveWorkspace: boolean;
  closingWorkspaceId: string | null;
  onArchive: () => void;
  onRename: (args: {
    repositoryPath: string;
    workspaceId: string;
    name: string;
  }) => Promise<{ ok: boolean; message?: string }>;
  shortcutLabel?: string | null;
  shortcutModifier: string;
  placement?: "center" | "top";
}) {
  const { t: tI18n } = useTranslation(["workspace"]);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [dropdownOpen, setDropdownOpen] = useState(false);
  const isClosing = args.closingWorkspaceId === args.workspaceId;
  const forceVisible = dropdownOpen || settingsOpen || isClosing;

  return (
    <>
      <div
        className={sx(
          repositorySidebarStyles.rowActions,
          transition.fade,
          args.placement === "top"
            ? repositorySidebarStyles.rowActionsTop
            : repositorySidebarStyles.rowActionsInline,
          forceVisible
            ? repositorySidebarStyles.rowActionsPinned
            : getWorkspaceHoverActionVisibilityStyle({ isClosing }),
        )}
      >
        {args.shortcutLabel ? (
          <WorkspaceShortcutChip
            modifier={args.shortcutModifier}
            label={args.shortcutLabel}
            className={sx(repositorySidebarStyles.rowActionsShortcut)}
          />
        ) : null}
        <DropdownMenu open={dropdownOpen} onOpenChange={setDropdownOpen}>
          <DropdownMenuTrigger
            render={
              <Button
                type="button"
                variant="ghost"
                size="sm"
                xstyle={repositorySidebarStyles.rowActionsTrigger}
                disabled={isClosing}
                data-testid={`workspace-actions-${args.workspaceId}`}
                aria-label={i18n.t("workspace:workspaceSidebarRows.accessibility.workspaceActions", { value1: args.workspaceName })}
              />
            }
          >
            {isClosing ? (
              <Loader aria-hidden size="xs" variant="spinner" />
            ) : (
              <MoreVertical
                className={sx(repositorySidebarStyles.rowActionsIcon)}
              />
            )}
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuItem
              onSelect={() =>
                dispatchOpenTaskHistory({
                  workspaceId: args.workspaceId,
                  repositoryPath: args.repositoryPath,
                })
              }
            >
              {tI18n("workspace:workspaceSidebarRows.taskHistory")}</DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem onSelect={() => setSettingsOpen(true)}>
              {tI18n("workspace:workspaceSidebarRows.settings")}</DropdownMenuItem>
            {args.canArchiveWorkspace ? (
              <>
                <DropdownMenuSeparator />
                <DropdownMenuItem
                  variant="destructive"
                  onSelect={args.onArchive}
                >
                  {tI18n("workspace:workspaceSidebarRows.archive")}</DropdownMenuItem>
              </>
            ) : null}
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
      <WorkspaceSettingsDialog
        open={settingsOpen}
        onOpenChange={setSettingsOpen}
        workspaceId={args.workspaceId}
        workspaceName={args.workspaceName}
        isDefault={args.isDefault}
        branch={args.branch}
        repositoryPath={args.repositoryPath}
        workspacePath={args.workspacePath}
        onRename={({ workspaceId, name }) =>
          args.onRename({
            repositoryPath: args.repositoryPath,
            workspaceId,
            name,
          })
        }
      />
    </>
  );
}
