import { i18n, useTranslation } from "@/i18n";
import { Input as AdsInput } from "@/components/ui/input";
import { Button as AdsButton } from "@/components/ads/components/Button";
import { Tooltip } from "@/components/ads/components/Tooltip";
import type { IDockviewPanelHeaderProps } from "dockview-react";
import {
  FileCode2,
  GitGraph,
  Globe,
  Pin,
  SplitSquareHorizontal,
  SquareTerminal,
  X,
} from "lucide-react";
import {
  memo,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type MouseEvent as ReactMouseEvent,
  type RefObject,
} from "react";
import { useShallow } from "zustand/react/shallow";
import { ModelIcon } from "@/components/ai-elements";
import { Badge, Loader } from "@/components/ui";
import { AgentRunMark } from "@/components/system/AgentRunMark";
import { toProviderWaveHueClass } from "@/components/ai-elements/provider-wave-tone.styles";
import { sx } from "@/components/ads/utils/stylex";
import { focusRing } from "@/components/ads/recipes/focus-ring";
import { transition } from "@/components/ads/recipes/transition";
import type { ProviderId } from "@/lib/providers/provider.types";
import { resolveProviderTurnDisplayState } from "@/lib/providers/turn-status";
import { getRespondingProviderId, isTaskManaged } from "@/lib/tasks";
import {
  buildPanePanelId,
  parsePanePanelId,
  type PaneSurfaceDescriptor,
} from "@/lib/panes/types";
import { useAppStore } from "@/store/app.store";
import { TaskSupervisionMarks } from "@/components/agent-runs/TaskSupervisionMarks";
import { paneTabChipStyles as c } from "@/components/panes/PaneTabChip.styles";
import type { ChatMessage, EditorTab } from "@/types/chat";
import {
  PANE_RENAME_REQUEST_EVENT,
  closePaneSurface,
} from "@/components/panes/pane-surface-actions";
import { isGitGraphEditorTab } from "@/components/panes/editor-tab-presentation";
import {
  describePaneTabAccessibleName,
  findActiveTurnPendingInteraction,
  resolvePaneSurfaceTitle,
  resolvePaneTabTaskStatus,
} from "@/components/panes/pane-tab-accessibility";
import { PROVIDER_IDENTITIES } from "@/lib/providers/provider-identity";
import {
  useLensTabState,
  type LensTabState,
} from "@/components/panes/lens-tab-state";
import {
  PaneCustomIcon,
  resolvePaneCustomIcon,
} from "@/components/panes/pane-tab-icon-options";

const EMPTY_MESSAGES: ChatMessage[] = [];

function resolveProviderToneClass(providerId: ProviderId): string {
  return toProviderWaveHueClass({ providerId });
}

interface TaskChipState {
  title: string;
  isResponding: boolean;
  isStalled: boolean;
  isManaged: boolean;
  toneClass: string;
  provider: ProviderId | null;
  /** The running turn waits on a person (read only while a turn runs). */
  waiting: "approval" | "user_input" | null;
}

/** Row-local subscription: each chip only tracks its own entity. */
function useTaskChipState(taskId: string): TaskChipState {
  useTranslation();
  const [title, isResponding, isStalled, isManaged, toneClass, provider, waiting] =
    useAppStore(
      useShallow((state) => {
        const task = state.tasks.find((item) => item.id === taskId) ?? null;
        const activeTurnId = state.activeTurnIdsByTask[taskId] ?? null;
        const turnState = resolveProviderTurnDisplayState({
          activeTurnId,
          activity: state.providerTurnActivityByTask[taskId] ?? null,
        });
        const messages = state.messagesByTask[taskId] ?? EMPTY_MESSAGES;
        const respondingProviderId = getRespondingProviderId({
          fallbackProviderId: task?.provider ?? "claude-code",
          messages,
        });
        return [
          task?.title ?? i18n.t("panes:paneTabChip.task"),
          turnState !== "idle",
          turnState === "stalled",
          isTaskManaged(task),
          resolveProviderToneClass(respondingProviderId),
          task?.provider ?? null,
          activeTurnId
            ? (state.providerTurnActivityByTask[taskId]?.pendingInteraction ??
              findActiveTurnPendingInteraction(messages, activeTurnId))
            : null,
        ] as const;
      }),
    );
  return { title, isResponding, isStalled, isManaged, toneClass, provider, waiting };
}

function PaneChipIcon(args: {
  surface: PaneSurfaceDescriptor;
  lensState: LensTabState;
}) {
  useTranslation();
  const surface = args.surface;
  switch (surface.kind) {
    case "terminal":
      return <SquareTerminal className={sx(c.icon)} />;
    case "lens":
      return args.lensState.loading ? (
        <Loader
          aria-hidden
          className={sx(c.mutedColor)}
          size="xs"
          variant="scan"
        />
      ) : args.lensState.faviconUrl ? (
        <img
          src={args.lensState.faviconUrl}
          alt=""
          className={sx(c.faviconImage)}
        />
      ) : (
        <Globe className={sx(c.icon)} />
      );
    case "editor":
      return <EditorPaneChipIcon editorTabId={surface.editorTabId} />;
    case "compare-run":
      return <SplitSquareHorizontal className={sx(c.icon)} />;
    default:
      return null;
  }
}

export function EditorPaneChipGlyph(args: { kind: EditorTab["kind"] }) {
  useTranslation();
  return isGitGraphEditorTab(args) ? (
    <GitGraph data-pane-tab-icon="git-graph" className={sx(c.icon)} />
  ) : (
    <FileCode2 data-pane-tab-icon="file" className={sx(c.icon)} />
  );
}

function EditorPaneChipIcon(args: { editorTabId: string }) {
  useTranslation();
  const kind = useAppStore(
    (state) =>
      state.editorTabs.find((tab) => tab.id === args.editorTabId)?.kind,
  );
  return <EditorPaneChipGlyph kind={kind} />;
}

function CliSessionChipIcon(args: { cliSessionTabId: string }) {
  useTranslation();
  const provider = useAppStore(
    (state) =>
      state.cliSessionTabs.find((tab) => tab.id === args.cliSessionTabId)
        ?.provider ?? null,
  );
  return (
    <span className={sx(c.cliIconWrap)}>
      {provider ? (
        <ModelIcon providerId={provider} className={sx(c.icon)} />
      ) : (
        <SquareTerminal className={sx(c.icon)} />
      )}
      <SquareTerminal className={sx(c.cliIconBadge)} strokeWidth={2.5} />
    </span>
  );
}

function TaskChipIcon(args: { taskChip: TaskChipState }) {
  useTranslation();
  const { taskChip } = args;
  return (
    <span className={sx(c.taskIconWrap)}>
      {taskChip.isResponding ? (
        taskChip.isStalled ? (
          <AgentRunMark kind="stalled" />
        ) : (
          <Loader
            aria-hidden
            className={taskChip.toneClass}
            size="xs"
            variant="pulse"
          />
        )
      ) : taskChip.provider ? (
        <ModelIcon providerId={taskChip.provider} className={sx(c.icon)} />
      ) : null}
    </span>
  );
}

function usePaneChipTitle(
  surface: PaneSurfaceDescriptor,
  lensState: LensTabState,
): string {
  useTranslation();
  const panelId = buildPanePanelId(surface);
  return useAppStore((state) =>
    resolvePaneSurfaceTitle(state, surface, panelId, lensState),
  );
}

function EditorDirtyIndicator(args: { editorTabId: string }) {
  useTranslation();
  const isDirty = useAppStore(
    (state) =>
      state.editorTabs.find((tab) => tab.id === args.editorTabId)?.isDirty ??
      false,
  );
  return isDirty ? (
    <span className={sx(c.dirtyDot)} aria-label={i18n.t("panes:paneTabChip.unsavedChanges")} />
  ) : null;
}

function TaskChipBadges(args: { taskChip: TaskChipState }) {
  useTranslation();
  return (
    <>
      {args.taskChip.isStalled ? (
        <Badge variant="warning" className={sx(c.statusBadge)}>
          {i18n.t("panes:paneTabChip.stalled")}
        </Badge>
      ) : null}
      {args.taskChip.isManaged ? (
        <Badge variant="secondary" className={sx(c.statusBadge)}>
          {i18n.t("panes:paneTabChip.managed")}
        </Badge>
      ) : null}
    </>
  );
}

export const PaneTabChip = memo(function PaneTabChip(
  props: IDockviewPanelHeaderProps,
) {
  useTranslation();
  const surface = parsePanePanelId(props.api.id);
  const panelId = props.api.id;
  const [isActive, setIsActive] = useState(props.api.isActive);
  const [isEditing, setIsEditing] = useState(false);
  const [editValue, setEditValue] = useState("");
  const inputRef = useRef<HTMLInputElement | null>(null);
  const rootRef = useRef<HTMLDivElement | null>(null);
  const renamePaneTab = useAppStore((state) => state.renamePaneTab);
  const pinned = useAppStore((state) =>
    Boolean(state.paneTabMeta[panelId]?.pinned),
  );
  const customIcon = useAppStore(
    (state) => state.paneTabMeta[panelId]?.customIcon ?? null,
  );
  const renameDisabled = useAppStore((state) => {
    if (surface?.kind !== "task") {
      return false;
    }
    return isTaskManaged(
      state.tasks.find((task) => task.id === surface.taskId) ?? null,
    );
  });
  const lensState = useLensTabState(
    surface?.kind === "lens" ? surface.lensSessionId : null,
  );
  const title = usePaneChipTitle(
    surface ?? { kind: "task", taskId: "" },
    lensState,
  );

  useEffect(() => {
    const disposable = props.api.onDidActiveChange((event) => {
      setIsActive(event.isActive);
    });
    return () => disposable.dispose();
  }, [props.api]);

  useEffect(() => {
    function handleRenameRequest(event: Event) {
      const detail = (event as CustomEvent<{ panelId: string }>).detail;
      if (detail?.panelId !== panelId || renameDisabled) {
        return;
      }
      setIsEditing(true);
    }
    window.addEventListener(PANE_RENAME_REQUEST_EVENT, handleRenameRequest);
    return () =>
      window.removeEventListener(
        PANE_RENAME_REQUEST_EVENT,
        handleRenameRequest,
      );
  }, [panelId, renameDisabled]);

  useEffect(() => {
    if (!isEditing) {
      return;
    }
    setEditValue(title);
    const timer = window.setTimeout(() => {
      inputRef.current?.focus();
      inputRef.current?.select();
    }, 30);
    return () => window.clearTimeout(timer);
    // The current title only seeds the input when editing starts.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isEditing]);

  if (!surface) {
    return null;
  }

  function commitRename() {
    const nextTitle = editValue.trim();
    setIsEditing(false);
    if (!nextTitle || nextTitle === title) {
      return;
    }
    renamePaneTab({ panelId, title: nextTitle });
  }

  function handleAuxClick(event: ReactMouseEvent<HTMLDivElement>) {
    if (event.button === 1 && !pinned) {
      event.preventDefault();
      closePaneSurface(surface!);
    }
  }

  return (
    <div
      ref={rootRef}
      className={sx(c.root)}
      data-pane-tab-chip={panelId}
      onAuxClick={handleAuxClick}
      onDoubleClick={(event) => {
        event.preventDefault();
        if (!renameDisabled) {
          setIsEditing(true);
        }
      }}
    >
      {customIcon && resolvePaneCustomIcon(customIcon) ? (
        <PaneCustomIcon name={customIcon} />
      ) : surface.kind === "task" ? (
        <TaskChipIconSlot taskId={surface.taskId} />
      ) : surface.kind === "cli-session" ? (
        <CliSessionChipIcon cliSessionTabId={surface.cliSessionTabId} />
      ) : (
        <PaneChipIcon surface={surface} lensState={lensState} />
      )}
      {isEditing ? (
        <AdsInput
          ref={inputRef}
          xstyle={c.renameInput}
          value={editValue}
          onChange={(event) => setEditValue(event.target.value)}
          onBlur={commitRename}
          onKeyDown={(event) => {
            event.stopPropagation();
            if (event.key === "Enter") {
              event.preventDefault();
              commitRename();
            }
            if (event.key === "Escape") {
              event.preventDefault();
              setIsEditing(false);
            }
          }}
          onMouseDown={(event) => event.stopPropagation()}
        />
      ) : (
        <span className={sx(c.title)}>{title}</span>
      )}
      {surface.kind === "task" && !isEditing ? (
        <TaskChipBadgesSlot taskId={surface.taskId} />
      ) : null}
      {/* In this order: Dockview rewrites the tab's label when the title changes. */}
      <PanelTitleSync api={props.api} title={title} rootRef={rootRef} nameTab={surface.kind !== "task"} />
      {surface.kind === "task" ? (
        <TaskTabAccessibleName taskId={surface.taskId} title={title} rootRef={rootRef} />
      ) : null}
      {surface.kind === "editor" && !isEditing ? (
        <EditorDirtyIndicator editorTabId={surface.editorTabId} />
      ) : null}
      {pinned ? (
        <Pin className={sx(c.pinIcon)} />
      ) : (
        <Tooltip content={i18n.t("panes:paneTabChip.closeNamed", { title })}>
          <AdsButton
            layout="host"
            type="button"
            xstyle={[
              c.closeButton,
              focusRing.ring,
              transition.control,
              transition.motionDurationQuick,
              isActive ? c.closeVisible : c.closeHidden,
            ]}
            aria-label={i18n.t("panes:paneTabChip.closeNamed", { title })}
            data-testid={`close-pane-${panelId}`}
            onMouseDown={(event) => event.stopPropagation()}
            onClick={(event) => {
              event.preventDefault();
              event.stopPropagation();
              closePaneSurface(surface);
            }}
          >
            <X className={sx(c.closeIcon)} />
          </AdsButton>
        </Tooltip>
      )}
    </div>
  );
});

/**
 * Task status pieces are split into slot components so only task chips pay
 * for the turn-activity subscription.
 */
function TaskChipIconSlot(args: { taskId: string }) {
  useTranslation();
  const taskChip = useTaskChipState(args.taskId);
  return <TaskChipIcon taskChip={taskChip} />;
}

function TaskChipBadgesSlot(args: { taskId: string }) {
  useTranslation();
  const taskChip = useTaskChipState(args.taskId);
  return (
    <>
      <TaskSupervisionMarks taskId={args.taskId} />
      <TaskChipBadges taskChip={taskChip} />
    </>
  );
}

/**
 * Dockview names the tab, its group and its default announcements after the
 * panel title, which starts as the internal panel id. Give it the title shown
 * on the tab; a task tab's richer name is set by its status slot, after this.
 */
function PanelTitleSync(args: {
  api: IDockviewPanelHeaderProps["api"];
  title: string;
  rootRef: RefObject<HTMLElement | null>;
  nameTab: boolean;
}) {
  const { api, title, rootRef, nameTab } = args;
  useLayoutEffect(() => {
    if (api.title !== title) {
      api.setTitle(title);
    }
    return nameTab ? setTabAccessibleName(rootRef, title) : undefined;
  }, [api, title, rootRef, nameTab]);
  return null;
}

/**
 * Names the tab element Dockview wraps around this chip. A chip can mount
 * before Dockview has moved it into its tab, so the name is retried on the
 * next frame; the returned cleanup cancels that retry.
 */
function setTabAccessibleName(rootRef: RefObject<HTMLElement | null>, name: string) {
  const apply = () => {
    const tab = rootRef.current?.closest('[role="tab"]');
    tab?.setAttribute("aria-label", name);
    return Boolean(tab);
  };
  if (apply()) {
    return undefined;
  }
  const frame = window.requestAnimationFrame(apply);
  return () => window.cancelAnimationFrame(frame);
}

/**
 * A task tab is announced by what it is, not by its id: its title, provider
 * and what its turn is doing ("Persist sidebar state, Claude, awaiting
 * approval"). Set after Dockview's own title-based label, which it rewrites
 * whenever the title changes.
 */
function TaskTabAccessibleName(args: {
  taskId: string;
  title: string;
  rootRef: RefObject<HTMLElement | null>;
}) {
  useTranslation();
  const taskChip = useTaskChipState(args.taskId);
  const status = resolvePaneTabTaskStatus(taskChip);
  const provider = taskChip.provider
    ? (PROVIDER_IDENTITIES[taskChip.provider]?.shortLabel ?? null)
    : null;
  const name = describePaneTabAccessibleName({ title: args.title, provider, status });
  useLayoutEffect(() => setTabAccessibleName(args.rootRef, name), [args.rootRef, name]);
  return null;
}
