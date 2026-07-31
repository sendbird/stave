import type { IDockviewPanelHeaderProps } from "dockview-react";
import {
  FileCode2,
  GitGraph,
  Globe,
  LoaderCircle,
  Pin,
  SplitSquareHorizontal,
  SquareTerminal,
  X,
} from "lucide-react";
import {
  memo,
  useEffect,
  useRef,
  useState,
  type MouseEvent as ReactMouseEvent,
} from "react";
import { useShallow } from "zustand/react/shallow";
import { ModelIcon } from "@/components/ai-elements";
import { Badge, WaveIndicator } from "@/components/ui";
import { resolvePathBaseName } from "@/lib/path-utils";
import { getProviderWaveToneClass } from "@/lib/providers/model-catalog";
import { resolveProviderTurnDisplayState } from "@/lib/providers/turn-status";
import { getRespondingProviderId, isTaskManaged } from "@/lib/tasks";
import {
  buildPanePanelId,
  parsePanePanelId,
  type PaneSurfaceDescriptor,
} from "@/lib/panes/types";
import { cn } from "@/lib/utils";
import { useAppStore } from "@/store/app.store";
import type { ChatMessage, EditorTab } from "@/types/chat";
import {
  PANE_RENAME_REQUEST_EVENT,
  closePaneSurface,
} from "@/components/panes/pane-surface-actions";
import { isGitGraphEditorTab } from "@/components/panes/editor-tab-presentation";
import {
  useLensTabState,
  type LensTabState,
} from "@/components/panes/lens-tab-state";
import {
  PaneCustomIcon,
  resolvePaneCustomIcon,
} from "@/components/panes/pane-tab-icon-options";

const EMPTY_MESSAGES: ChatMessage[] = [];

interface TaskChipState {
  title: string;
  isResponding: boolean;
  isStalled: boolean;
  isManaged: boolean;
  toneClass: string;
  provider: "claude-code" | "codex" | null;
}

/** Row-local subscription: each chip only tracks its own entity. */
function useTaskChipState(taskId: string): TaskChipState {
  const [title, isResponding, isStalled, isManaged, toneClass, provider] =
    useAppStore(
      useShallow((state) => {
        const task = state.tasks.find((item) => item.id === taskId) ?? null;
        const activeTurnId = state.activeTurnIdsByTask[taskId] ?? null;
        const turnState = resolveProviderTurnDisplayState({
          activeTurnId,
          activity: state.providerTurnActivityByTask[taskId] ?? null,
        });
        const respondingProviderId = getRespondingProviderId({
          fallbackProviderId: task?.provider ?? "claude-code",
          messages: state.messagesByTask[taskId] ?? EMPTY_MESSAGES,
        });
        return [
          task?.title ?? "Task",
          turnState !== "idle",
          turnState === "stalled",
          isTaskManaged(task),
          getProviderWaveToneClass({ providerId: respondingProviderId }),
          task?.provider ?? null,
        ] as const;
      }),
    );
  return { title, isResponding, isStalled, isManaged, toneClass, provider };
}

function PaneChipIcon(args: {
  surface: PaneSurfaceDescriptor;
  lensState: LensTabState;
}) {
  const surface = args.surface;
  switch (surface.kind) {
    case "terminal":
      return <SquareTerminal className="size-4 text-muted-foreground" />;
    case "lens":
      return args.lensState.loading ? (
        <LoaderCircle className="size-4 animate-spin text-muted-foreground" />
      ) : args.lensState.faviconUrl ? (
        <img
          src={args.lensState.faviconUrl}
          alt=""
          className="size-4 rounded-sm object-contain"
        />
      ) : (
        <Globe className="size-4 text-muted-foreground" />
      );
    case "editor":
      return <EditorPaneChipIcon editorTabId={surface.editorTabId} />;
    case "compare-run":
      return <SplitSquareHorizontal className="size-4 text-muted-foreground" />;
    default:
      return null;
  }
}

export function EditorPaneChipGlyph(args: { kind: EditorTab["kind"] }) {
  return isGitGraphEditorTab(args) ? (
    <GitGraph
      data-pane-tab-icon="git-graph"
      className="size-4 text-muted-foreground"
    />
  ) : (
    <FileCode2
      data-pane-tab-icon="file"
      className="size-4 text-muted-foreground"
    />
  );
}

function EditorPaneChipIcon(args: { editorTabId: string }) {
  const kind = useAppStore(
    (state) =>
      state.editorTabs.find((tab) => tab.id === args.editorTabId)?.kind,
  );
  return <EditorPaneChipGlyph kind={kind} />;
}

function CliSessionChipIcon(args: { cliSessionTabId: string }) {
  const provider = useAppStore(
    (state) =>
      state.cliSessionTabs.find((tab) => tab.id === args.cliSessionTabId)
        ?.provider ?? null,
  );
  return (
    <span className="relative flex h-5 w-5 shrink-0 items-center justify-center">
      {provider ? (
        <ModelIcon
          providerId={provider}
          className="size-4 text-muted-foreground"
        />
      ) : (
        <SquareTerminal className="size-4 text-muted-foreground" />
      )}
      <SquareTerminal
        className="absolute -bottom-0.5 -right-0.5 size-2.5 rounded-sm bg-background text-muted-foreground"
        strokeWidth={2.5}
      />
    </span>
  );
}

function TaskChipIcon(args: { taskChip: TaskChipState }) {
  const { taskChip } = args;
  return (
    <span className="flex h-5 w-5 shrink-0 items-center justify-center">
      {taskChip.isResponding ? (
        <WaveIndicator
          className={cn("gap-px", taskChip.toneClass)}
          barClassName="h-3 w-0.5 rounded-[2px]"
        />
      ) : taskChip.provider ? (
        <ModelIcon
          providerId={taskChip.provider}
          className="size-4 text-muted-foreground"
        />
      ) : null}
    </span>
  );
}

function usePaneChipTitle(
  surface: PaneSurfaceDescriptor,
  lensState: LensTabState,
): string {
  const panelId = buildPanePanelId(surface);
  return useAppStore((state) => {
    const customTitle = state.paneTabMeta[panelId]?.customTitle;
    if (customTitle?.trim()) {
      return customTitle;
    }
    switch (surface.kind) {
      case "task":
        return (
          state.tasks.find((task) => task.id === surface.taskId)?.title ??
          "Task"
        );
      case "cli-session":
        return (
          state.cliSessionTabs.find((tab) => tab.id === surface.cliSessionTabId)
            ?.title ?? "CLI Session"
        );
      case "terminal":
        return (
          state.terminalTabs.find((tab) => tab.id === surface.terminalTabId)
            ?.title ?? "Terminal"
        );
      case "editor": {
        const editorTab = state.editorTabs.find(
          (tab) => tab.id === surface.editorTabId,
        );
        return editorTab
          ? resolvePathBaseName({
              path: editorTab.filePath,
              fallback: "Editor",
            })
          : "Editor";
      }
      case "lens":
        return lensState.title?.trim() || lensState.url?.trim() || "Lens";
      case "compare-run":
        return "Compare Run";
    }
  });
}

function EditorDirtyIndicator(args: { editorTabId: string }) {
  const isDirty = useAppStore(
    (state) =>
      state.editorTabs.find((tab) => tab.id === args.editorTabId)?.isDirty ??
      false,
  );
  return isDirty ? (
    <span
      className="size-2 shrink-0 rounded-full bg-primary"
      aria-label="Unsaved changes"
    />
  ) : null;
}

function TaskChipBadges(args: { taskChip: TaskChipState }) {
  return (
    <>
      {args.taskChip.isStalled ? (
        <Badge
          variant="warning"
          className="rounded-sm text-[10px] uppercase tracking-[0.14em]"
        >
          Stalled
        </Badge>
      ) : null}
      {args.taskChip.isManaged ? (
        <Badge
          variant="secondary"
          className="rounded-sm text-[10px] uppercase tracking-[0.14em]"
        >
          Managed
        </Badge>
      ) : null}
    </>
  );
}

export const PaneTabChip = memo(function PaneTabChip(
  props: IDockviewPanelHeaderProps,
) {
  const surface = parsePanePanelId(props.api.id);
  const panelId = props.api.id;
  const [isActive, setIsActive] = useState(props.api.isActive);
  const [isEditing, setIsEditing] = useState(false);
  const [editValue, setEditValue] = useState("");
  const inputRef = useRef<HTMLInputElement | null>(null);
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

  const closeVisibility = isActive
    ? "opacity-100"
    : "opacity-0 group-hover:opacity-100 focus-within:opacity-100 transition-opacity duration-150";

  return (
    <div
      className="group flex h-full min-w-0 items-center gap-1.5 px-2"
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
        <input
          ref={inputRef}
          className="h-5 w-32 min-w-0 rounded-sm border border-border/80 bg-background px-1 text-xs text-foreground outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-1 focus-visible:ring-offset-background"
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
        <span className="max-w-48 truncate text-sm font-medium">{title}</span>
      )}
      {surface.kind === "task" && !isEditing ? (
        <TaskChipBadgesSlot taskId={surface.taskId} />
      ) : null}
      {surface.kind === "editor" && !isEditing ? (
        <EditorDirtyIndicator editorTabId={surface.editorTabId} />
      ) : null}
      {pinned ? (
        <Pin className="size-3 shrink-0 text-muted-foreground" />
      ) : (
        <button
          type="button"
          className={cn(
            "flex h-5 w-5 shrink-0 items-center justify-center rounded-sm text-muted-foreground outline-none hover:bg-muted hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-1 focus-visible:ring-offset-background",
            closeVisibility,
          )}
          aria-label={`close-pane-${panelId}`}
          onMouseDown={(event) => event.stopPropagation()}
          onClick={(event) => {
            event.preventDefault();
            event.stopPropagation();
            closePaneSurface(surface);
          }}
        >
          <X className="size-3.5" />
        </button>
      )}
    </div>
  );
});

/**
 * Task status pieces are split into slot components so only task chips pay
 * for the turn-activity subscription.
 */
function TaskChipIconSlot(args: { taskId: string }) {
  const taskChip = useTaskChipState(args.taskId);
  return <TaskChipIcon taskChip={taskChip} />;
}

function TaskChipBadgesSlot(args: { taskId: string }) {
  const taskChip = useTaskChipState(args.taskId);
  return <TaskChipBadges taskChip={taskChip} />;
}
