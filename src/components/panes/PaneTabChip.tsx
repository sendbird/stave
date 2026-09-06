import { Input as AdsInput } from "@/components/ui/input";
import { Button as AdsButton } from "@/components/ads/components/Button";
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
  useRef,
  useState,
  type MouseEvent as ReactMouseEvent,
} from "react";
import { useShallow } from "zustand/react/shallow";
import { ModelIcon } from "@/components/ai-elements";
import { Badge, Loader } from "@/components/ui";
import { resolvePathBaseName } from "@/lib/path-utils";
import { COMMIT_GRAPH_TITLE } from "@/lib/git-graph/presentation";
import { getProviderWaveTone } from "@/lib/providers/model-catalog";
import * as stylex from "@stylexjs/stylex";
import { sx } from "@/components/ads/utils/stylex";
import { focusRing } from "@/components/ads/recipes/focus-ring";
import { transition } from "@/components/ads/recipes/transition";
import { vars } from "@/components/ads/tokens/tokens.stylex";
import type { ProviderId } from "@/lib/providers/provider.types";
import { resolveProviderTurnDisplayState } from "@/lib/providers/turn-status";
import { getRespondingProviderId, isTaskManaged } from "@/lib/tasks";
import {
  buildPanePanelId,
  parsePanePanelId,
  type PaneSurfaceDescriptor,
} from "@/lib/panes/types";
import { useAppStore } from "@/store/app.store";
import { paneTabChipStyles as c } from "@/components/panes/PaneTabChip.styles";
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

// Provider wave tone → StyleX style. `getProviderWaveTone` returns a semantic
// tone (this file is a consumer of that contract, not part of its own
// migration surface); the themed provider CSS variables carry the color.
const providerToneStyles = stylex.create({
  claude: { color: "var(--provider-claude)" },
  codex: { color: "var(--provider-codex)" },
  accent: { color: vars.colorAccent },
});

function resolveProviderToneClass(providerId: ProviderId): string {
  const tone = getProviderWaveTone({ providerId });
  return sx(providerToneStyles[tone]);
}

interface TaskChipState {
  title: string;
  isResponding: boolean;
  isStalled: boolean;
  isManaged: boolean;
  toneClass: string;
  provider: ProviderId | null;
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
          resolveProviderToneClass(respondingProviderId),
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
  return isGitGraphEditorTab(args) ? (
    <GitGraph data-pane-tab-icon="git-graph" className={sx(c.icon)} />
  ) : (
    <FileCode2 data-pane-tab-icon="file" className={sx(c.icon)} />
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
  const { taskChip } = args;
  return (
    <span className={sx(c.taskIconWrap)}>
      {taskChip.isResponding ? (
        <Loader
          aria-hidden
          className={taskChip.toneClass}
          size="xs"
          variant="pulse"
        />
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
          ? isGitGraphEditorTab(editorTab)
            ? COMMIT_GRAPH_TITLE
            : resolvePathBaseName({
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
    <span className={sx(c.dirtyDot)} aria-label="Unsaved changes" />
  ) : null;
}

function TaskChipBadges(args: { taskChip: TaskChipState }) {
  return (
    <>
      {args.taskChip.isStalled ? (
        <Badge variant="warning" className={sx(c.statusBadge)}>
          Stalled
        </Badge>
      ) : null}
      {args.taskChip.isManaged ? (
        <Badge variant="secondary" className={sx(c.statusBadge)}>
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

  return (
    <div
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
      {surface.kind === "editor" && !isEditing ? (
        <EditorDirtyIndicator editorTabId={surface.editorTabId} />
      ) : null}
      {pinned ? (
        <Pin className={sx(c.pinIcon)} />
      ) : (
        <AdsButton
          layout="host"
          type="button"
          xstyle={[
            c.closeButton,
            focusRing.ring,
            transition.colors,
            isActive ? c.closeVisible : c.closeHidden,
          ]}
          aria-label={`close-pane-${panelId}`}
          onMouseDown={(event) => event.stopPropagation()}
          onClick={(event) => {
            event.preventDefault();
            event.stopPropagation();
            closePaneSurface(surface);
          }}
        >
          <X className={sx(c.closeIcon)} />
        </AdsButton>
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
