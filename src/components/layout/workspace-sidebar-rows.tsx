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
import { projectSidebarStyles } from "@/components/layout/project-workspace-sidebar.styles";
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
  type ProjectSidebarAttentionAlert,
  type SidebarWorkQueueEntry,
} from "@/components/layout/ProjectWorkspaceSidebar.utils";
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
  BorderBeam,
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
import { isDefaultWorkspaceName } from "@/store/project.utils";
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
      respondingToneClass: sx(projectSidebarStyles.toneAccent),
    };
  }

  return {
    respondingTaskCount: summary.respondingTaskCount,
    // The workspace row is a container, not one provider. Theme primary keeps
    // it stable when several tasks run under different brands.
    respondingToneClass: summary.hasWarningTask
      ? sx(projectSidebarStyles.toneWarning)
      : sx(projectSidebarStyles.toneAccent),
  };
}

function formatWorkspaceName(name: string, branch?: string) {
  const isDefault = isDefaultWorkspaceName(name);
  if (isDefault) {
    return (
      <>
        Default
        {branch ? (
          <span className={sx(projectSidebarStyles.defaultBranchChip)}>
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
      tasks,
    ],
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
    [activeTurnIdsByTask, hasRuntimeState, messageCountByTask, tasks],
  );
}

export function WorkspaceHoverPreviewTooltip(args: {
  workspaceId: string;
  workspaceName: string;
  branch?: string;
  projectName?: string;
  shortcutLabel?: string | null;
  side: "top" | "right";
  /**
   * Extra anchor gap for rows that render in-flow controls beside the
   * trigger: the popup must clear them or it swallows their clicks.
   */
  sideOffset?: number;
  children: ReactElement;
}) {
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
    tasks,
  ]);

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
        className={sx(projectSidebarStyles.previewContent)}
      >
        <div className={sx(projectSidebarStyles.previewStack)}>
          <div className={sx(projectSidebarStyles.previewHeadStack)}>
            <p className={sx(projectSidebarStyles.previewTitle)}>
              {formatWorkspaceName(args.workspaceName, args.branch)}
            </p>
            {args.projectName ? (
              <p className={sx(projectSidebarStyles.previewMeta)}>
                {args.projectName}
              </p>
            ) : null}
          </div>
          <div className={sx(projectSidebarStyles.previewBodyStack)}>
            {didShellLoadFail && !preview ? (
              <p className={sx(projectSidebarStyles.previewMeta)}>
                Preview unavailable
              </p>
            ) : !preview || isShellLoading ? (
              <p className={sx(projectSidebarStyles.previewMeta)}>
                Loading summary...
              </p>
            ) : preview.isEmpty ? (
              <p className={sx(projectSidebarStyles.previewMeta)}>
                No tasks yet
              </p>
            ) : (
              <>
                <div className={sx(projectSidebarStyles.previewMetaRow)}>
                  <span>{metaLabel}</span>
                  {preview.runningTaskCount > 0 ? (
                    <span
                      className={sx(projectSidebarStyles.previewRunningChip)}
                    >
                      {`${preview.runningTaskCount} running`}
                    </span>
                  ) : null}
                </div>
                <div className={sx(projectSidebarStyles.previewTaskStack)}>
                  {preview.taskTitles.map((title, index) => (
                    <p
                      key={`${args.workspaceId}:${index}`}
                      className={sx(projectSidebarStyles.previewTaskTitle)}
                    >
                      {title}
                    </p>
                  ))}
                  {preview.moreTaskCount > 0 ? (
                    <p className={sx(projectSidebarStyles.previewMeta)}>
                      +{preview.moreTaskCount} more
                    </p>
                  ) : null}
                </div>
              </>
            )}
            {args.shortcutLabel ? (
              <WorkspaceShortcutChip
                modifier={workspaceShortcutModifierLabel}
                label={args.shortcutLabel}
                className={sx(projectSidebarStyles.previewShortcutChip)}
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
          className={sx(projectSidebarStyles.statusMuted)}
          size="xs"
          variant="spinner"
        />
      );
    }

    if (leadingAttentionKind === "user-input") {
      return (
        <UserRound
          className={sx(projectSidebarStyles.statusIconWarning)}
          aria-hidden="true"
        />
      );
    }
    if (leadingAttentionKind === "approval") {
      return (
        <ShieldCheck
          className={sx(projectSidebarStyles.statusIconWarning)}
          aria-hidden="true"
        />
      );
    }
    if (leadingAttentionKind === "run-failed") {
      return (
        <AlertTriangle
          className={sx(projectSidebarStyles.statusIconDanger)}
          aria-hidden="true"
        />
      );
    }
    if (leadingAttentionKind === "pr-behind-base") {
      return (
        <AlertTriangle
          className={sx(projectSidebarStyles.statusIconGitModified)}
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
          className={sx(projectSidebarStyles.statusIconGitClosed)}
          aria-hidden="true"
        />
      );
    }
    if (leadingAttentionKind === "pr-ready-to-merge") {
      return (
        <GitMerge
          className={sx(projectSidebarStyles.statusIconGitOpen)}
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
          className={sx(projectSidebarStyles.statusIcon)}
        />
      );
    }

    return (
      <WorkspaceIdentityMark
        workspaceName={args.workspaceName}
        isDefault={args.isDefault}
        className={sx(projectSidebarStyles.identityMark)}
        iconClassName={sx(projectSidebarStyles.identityMarkIcon)}
      />
    );
  },
);

export function WorkQueueRow(args: {
  entry: SidebarWorkQueueEntry;
  attentionKind?: FleetAttentionKind;
  onOpen: (target: { projectPath: string; workspaceId: string }) => void;
}) {
  const { entry } = args;

  return (
    <div className={sx(projectSidebarStyles.queueRow)}>
      <WorkspaceHoverPreviewTooltip
        workspaceId={entry.workspaceId}
        workspaceName={entry.workspaceName}
        branch={entry.branch}
        projectName={entry.projectName}
        side="right"
      >
        <AdsButton
          layout="host"
          type="button"
          onClick={() =>
            args.onOpen({
              projectPath: entry.projectPath,
              workspaceId: entry.workspaceId,
            })
          }
          aria-label={`active-workspace-${entry.workspaceId}`}
          xstyle={[
            projectSidebarStyles.queueButton,
            transition.colors,
            entry.isActive
              ? projectSidebarStyles.queueButtonActive
              : projectSidebarStyles.queueButtonIdle,
          ]}
        >
          <WorkspaceLeadingStatusIcon
            workspaceId={entry.workspaceId}
            workspaceName={entry.workspaceName}
            isDefault={entry.isDefault}
            busy={false}
            attentionKind={args.attentionKind}
          />
          <span className={sx(projectSidebarStyles.queueLabel)}>
            {formatWorkQueueWorkspaceLabel({
              name: entry.workspaceName,
              branch: entry.branch,
              isDefault: entry.isDefault,
            })}
          </span>
          <span className={sx(projectSidebarStyles.queueProject)}>
            {entry.projectName}
          </span>
          <WorkspaceAccountLimitIcon workspaceId={entry.workspaceId} />
        </AdsButton>
      </WorkspaceHoverPreviewTooltip>
      <WorkspaceProgressTaskTree
        workspaceId={entry.workspaceId}
        projectPath={entry.projectPath}
      />
    </div>
  );
}

export const ProjectAttentionAlertIcon = memo(
  function ProjectAttentionAlertIcon(args: {
    alert: ProjectSidebarAttentionAlert;
    projectName: string;
  }) {
    const { alert } = args;
    // Review-tier needs are finished work awaiting confirmation, not a stalled
    // agent. They get a muted dot so the warning glyphs keep meaning "blocked".
    const icon =
      alert.tier === "review" ? (
        <span
          className={sx(projectSidebarStyles.attentionDot)}
          aria-hidden="true"
        />
      ) : alert.kind === "user-input" ? (
        <UserRound
          className={sx(projectSidebarStyles.attentionIconWarning)}
          aria-hidden="true"
        />
      ) : alert.kind === "approval" ? (
        <ShieldCheck
          className={sx(projectSidebarStyles.attentionIconWarning)}
          aria-hidden="true"
        />
      ) : (
        <AlertTriangle
          className={sx(projectSidebarStyles.attentionIconDanger)}
          aria-hidden="true"
        />
      );

    return (
      <Tooltip>
        <TooltipTrigger
          render={
            <span
              className={sx(projectSidebarStyles.attentionSlot)}
              role="status"
              aria-label={`project-attention-${args.projectName}`}
            />
          }
        >
          {icon}
          {alert.attentionItemCount > 1 ? (
            <span className={sx(projectSidebarStyles.attentionCount)}>
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
      <div className={sx(projectSidebarStyles.respondingSlot)}>
        <Badge
          variant="outline"
          tone="accent"
          className={sx(
            projectSidebarStyles.respondingBadge,
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
          projectSidebarStyles.labelInput,
          args.compact
            ? projectSidebarStyles.labelInputCompact
            : projectSidebarStyles.labelInputWide,
        ]}
        aria-label={`edit-workspace-label-${args.workspaceId}`}
      />
    );
  }

  return (
    <span
      className={sx(
        projectSidebarStyles.label,
        args.compact && projectSidebarStyles.labelCompact,
        !args.compact && projectSidebarStyles.labelRoomy,
        args.isActive && projectSidebarStyles.labelActive,
        canEdit && projectSidebarStyles.labelEditable,
        canEdit && focusRing.ring,
      )}
      title={canEdit ? "Edit workspace label" : String(displayName)}
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

  const hasMetaActions = Boolean(args.shortcutLabel) || respondingTaskCount > 0;

  return (
    <span className={sx(projectSidebarStyles.metaGrid)}>
      <span className={sx(projectSidebarStyles.metaIconSlot)}>
        <GitBranch className={sx(projectSidebarStyles.metaIcon)} />
      </span>
      <span className={sx(projectSidebarStyles.metaBody)}>
        <span className={sx(projectSidebarStyles.metaBranch)}>
          {branchLabel}
        </span>
        {hasMetaActions ? (
          <span
            className={sx(
              projectSidebarStyles.metaActions,
              transition.fade,
              getWorkspaceRespondingCountVisibilityStyle({
                hasHoverActions: args.hasHoverActions,
                isClosing: args.isClosing,
              }),
            )}
          >
            {args.shortcutLabel ? (
              <WorkspaceShortcutChip
                modifier={workspaceShortcutModifierLabel}
                label={args.shortcutLabel}
                className={sx(projectSidebarStyles.metaShortcutChip)}
              />
            ) : null}
            {respondingTaskCount > 0 ? (
              <Badge
                variant="outline"
                tone="accent"
                className={sx(projectSidebarStyles.respondingBadgeInline)}
              >
                {respondingTaskCount}
              </Badge>
            ) : null}
          </span>
        ) : null}
      </span>
    </span>
  );
});

export const WorkspaceBorderBeam = memo(function WorkspaceBorderBeam(args: {
  workspaceId: string;
  children: ReactNode;
}) {
  const { respondingTaskCount } = useWorkspaceSidebarActivityState(
    args.workspaceId,
  );
  const borderBeamEnabled = useAppStore(
    (state) => state.settings.borderBeamEnabled,
  );
  const borderBeamSize = useAppStore((state) => state.settings.borderBeamSize);
  const borderBeamVariant = useAppStore(
    (state) => state.settings.borderBeamVariant,
  );
  const borderBeamStrength = useAppStore(
    (state) => state.settings.borderBeamStrength,
  );

  const active = borderBeamEnabled && respondingTaskCount > 0;

  return (
    <BorderBeam
      active={active}
      size={borderBeamSize}
      colorVariant={borderBeamVariant}
      strength={borderBeamStrength}
      theme="auto"
    >
      {args.children}
    </BorderBeam>
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
        projectSidebarStyles.sortableRow,
        isDragging && projectSidebarStyles.sortableRowDragging,
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
  projectPath: string;
  workspacePath: string;
  canArchiveWorkspace: boolean;
  closingWorkspaceId: string | null;
  onArchive: () => void;
  onRename: (args: {
    projectPath: string;
    workspaceId: string;
    name: string;
  }) => Promise<{ ok: boolean; message?: string }>;
  shortcutLabel?: string | null;
  shortcutModifier: string;
  placement?: "center" | "top";
}) {
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [dropdownOpen, setDropdownOpen] = useState(false);
  const isClosing = args.closingWorkspaceId === args.workspaceId;
  const forceVisible = dropdownOpen || settingsOpen || isClosing;

  return (
    <>
      <div
        className={sx(
          projectSidebarStyles.rowActions,
          transition.fade,
          args.placement === "top"
            ? projectSidebarStyles.rowActionsTop
            : projectSidebarStyles.rowActionsInline,
          forceVisible
            ? projectSidebarStyles.rowActionsPinned
            : getWorkspaceHoverActionVisibilityStyle({ isClosing }),
        )}
      >
        {args.shortcutLabel ? (
          <WorkspaceShortcutChip
            modifier={args.shortcutModifier}
            label={args.shortcutLabel}
            className={sx(projectSidebarStyles.rowActionsShortcut)}
          />
        ) : null}
        <DropdownMenu open={dropdownOpen} onOpenChange={setDropdownOpen}>
          <DropdownMenuTrigger
            render={
              <Button
                type="button"
                variant="ghost"
                size="sm"
                xstyle={projectSidebarStyles.rowActionsTrigger}
                disabled={isClosing}
                aria-label={`workspace-actions-${args.workspaceId}`}
              />
            }
          >
            {isClosing ? (
              <Loader aria-hidden size="xs" variant="spinner" />
            ) : (
              <MoreVertical
                className={sx(projectSidebarStyles.rowActionsIcon)}
              />
            )}
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuItem
              onSelect={() =>
                dispatchOpenTaskHistory({
                  workspaceId: args.workspaceId,
                  projectPath: args.projectPath,
                })
              }
            >
              Task History
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem onSelect={() => setSettingsOpen(true)}>
              Settings
            </DropdownMenuItem>
            {args.canArchiveWorkspace ? (
              <>
                <DropdownMenuSeparator />
                <DropdownMenuItem
                  variant="destructive"
                  onSelect={args.onArchive}
                >
                  Archive
                </DropdownMenuItem>
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
        projectPath={args.projectPath}
        workspacePath={args.workspacePath}
        onRename={({ workspaceId, name }) =>
          args.onRename({
            projectPath: args.projectPath,
            workspaceId,
            name,
          })
        }
      />
    </>
  );
}
