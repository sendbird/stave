import { FileCode2, X } from "lucide-react";
import type { DragEvent } from "react";
import { Button } from "@/components/ui";
import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuSeparator,
  ContextMenuTrigger,
} from "@/components/ui/context-menu";
import { resolvePathBaseName } from "@/lib/path-utils";
import { cn } from "@/lib/utils";
import type { EditorTab } from "@/types/chat";

function formatTabLabel(filePath: string) {
  return resolvePathBaseName({ path: filePath, fallback: filePath });
}

export function EditorMainTabStrip(args: {
  editorTabs: EditorTab[];
  activeEditorTabId: string | null;
  draggingTabId: string | null;
  dropTargetTabId: string | null;
  onSetDraggingTabId: (tabId: string | null) => void;
  onSetDropTargetTabId: (tabId: string | null) => void;
  onTabDragStart: (event: DragEvent<HTMLDivElement>, tabId: string) => void;
  onTabDrop: (event: DragEvent<HTMLDivElement>, toTabId: string) => void;
  onActivateTab: (tabId: string) => void;
  onRequestCloseTab: (tabId: string) => void;
  onRequestCloseTabs: (args: { tabIds: string[]; title: string; description: string }) => void;
  onCopyPath: (filePath: string) => void;
  onCopyRelativePath: (filePath: string) => void;
  onCopyBreadcrumbs: (filePath: string) => void;
}) {
  if (args.editorTabs.length === 0) {
    return null;
  }

  return (
    <div
      className="tab-strip-scroll min-w-0 w-full max-w-full flex items-stretch overflow-x-auto border-b border-success/30 bg-editor/65"
      onWheel={(event) => {
        if (event.deltaY !== 0) {
          event.currentTarget.scrollLeft += event.deltaY;
          event.preventDefault();
        }
      }}
    >
      {args.editorTabs.map((tab) => {
        const isActive = tab.id === args.activeEditorTabId;
        const closeButtonClassName = isActive
          ? "opacity-100"
          : "opacity-0 group-hover:opacity-100 group-focus-within:opacity-100";

        return (
          <ContextMenu key={tab.id} onOpenChange={(open) => { if (open) args.onActivateTab(tab.id); }}>
            <ContextMenuTrigger asChild>
              <div
                draggable
                onDragStart={(event) => args.onTabDragStart(event, tab.id)}
                onDragEnd={() => {
                  args.onSetDraggingTabId(null);
                  args.onSetDropTargetTabId(null);
                }}
                onDragOver={(event) => {
                  event.preventDefault();
                  if (args.draggingTabId && args.draggingTabId !== tab.id) {
                    args.onSetDropTargetTabId(tab.id);
                  }
                }}
                onDrop={(event) => args.onTabDrop(event, tab.id)}
                onAuxClick={(event) => {
                  if (event.button === 1) {
                    event.preventDefault();
                    args.onRequestCloseTab(tab.id);
                  }
                }}
                className={cn(
                  "group relative flex h-8 shrink-0 items-stretch overflow-hidden px-2 transition-[background-color,color,opacity] duration-150",
                  isActive
                    ? "bg-editor-tab-active text-editor-foreground"
                    : "bg-transparent text-muted-foreground hover:bg-editor-muted/60 hover:text-editor-foreground",
                  args.draggingTabId === tab.id && "opacity-70",
                  args.dropTargetTabId === tab.id && args.draggingTabId && args.draggingTabId !== tab.id && "ring-1 ring-success/60 ring-inset",
                )}
              >
                <button
                  type="button"
                  className="flex min-w-0 flex-1 items-center gap-1.5 text-left"
                  title={tab.filePath}
                  onClick={() => args.onActivateTab(tab.id)}
                >
                  <FileCode2
                    className={cn(
                      "size-3.5 shrink-0 transition-colors",
                      isActive ? "text-success" : "text-muted-foreground group-hover:text-editor-foreground",
                    )}
                  />
                  <span className="truncate text-xs font-medium leading-tight">{formatTabLabel(tab.filePath)}</span>
                  {tab.isDirty ? <span className="size-1.5 shrink-0 rounded-full bg-success" aria-hidden="true" /> : null}
                </button>
                <div className="flex items-center pl-1">
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    aria-label={`close-${tab.filePath}`}
                    className={cn(
                      "size-5 rounded-sm p-0 text-muted-foreground transition-[opacity,color,background-color] duration-150 hover:bg-editor-muted hover:text-editor-foreground",
                      closeButtonClassName,
                    )}
                    onClick={() => args.onRequestCloseTab(tab.id)}
                  >
                    <X className="size-3" />
                  </Button>
                </div>
                <span
                  className={cn(
                    "pointer-events-none absolute inset-x-0 bottom-0 h-0.5 bg-success transition-opacity duration-150",
                    isActive ? "opacity-100" : "opacity-0 group-hover:opacity-40",
                  )}
                />
              </div>
            </ContextMenuTrigger>
            <ContextMenuContent>
              <ContextMenuItem onSelect={() => args.onRequestCloseTab(tab.id)}>Close</ContextMenuItem>
              <ContextMenuItem
                onSelect={() =>
                  args.onRequestCloseTabs({
                    tabIds: args.editorTabs.filter((editorTab) => editorTab.id !== tab.id).map((editorTab) => editorTab.id),
                    title: "Close Other Tabs",
                    description: "Close all tabs except this tab?",
                  })
                }
              >
                Close Others
              </ContextMenuItem>
              <ContextMenuItem
                onSelect={() => {
                  const startIndex = args.editorTabs.findIndex((editorTab) => editorTab.id === tab.id);
                  const rightTabIds = startIndex >= 0
                    ? args.editorTabs.slice(startIndex + 1).map((editorTab) => editorTab.id)
                    : [];
                  args.onRequestCloseTabs({
                    tabIds: rightTabIds,
                    title: "Close Tabs to the Right",
                    description: "Close all tabs to the right?",
                  });
                }}
              >
                Close to the Right
              </ContextMenuItem>
              <ContextMenuItem
                onSelect={() =>
                  args.onRequestCloseTabs({
                    tabIds: args.editorTabs.filter((editorTab) => !editorTab.isDirty).map((editorTab) => editorTab.id),
                    title: "Close Saved Tabs",
                    description: "Close all saved tabs?",
                  })
                }
              >
                Close Saved
              </ContextMenuItem>
              <ContextMenuItem
                onSelect={() =>
                  args.onRequestCloseTabs({
                    tabIds: args.editorTabs.map((editorTab) => editorTab.id),
                    title: "Close All Tabs",
                    description: "Close all open tabs?",
                  })
                }
              >
                Close All
              </ContextMenuItem>
              <ContextMenuSeparator />
              <ContextMenuItem onSelect={() => args.onCopyPath(tab.filePath)}>
                Copy Path
              </ContextMenuItem>
              <ContextMenuItem onSelect={() => args.onCopyRelativePath(tab.filePath)}>
                Copy Relative Path
              </ContextMenuItem>
              <ContextMenuItem onSelect={() => args.onCopyBreadcrumbs(tab.filePath)}>
                Copy Breadcrumbs Path
              </ContextMenuItem>
            </ContextMenuContent>
          </ContextMenu>
        );
      })}
    </div>
  );
}
