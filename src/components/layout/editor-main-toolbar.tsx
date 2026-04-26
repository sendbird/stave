import {
  AlignJustify,
  Code2,
  Columns2,
  Eye,
  FileCode2,
  PenLine,
  Save,
  Send,
  X,
} from "lucide-react";
import {
  PANEL_BAR_HEIGHT_CLASS,
  PANEL_HEADER_ICON_CLASS,
  PANEL_HEADER_TITLE_CLASS,
} from "@/components/layout/panel-bar.constants";
import {
  Button,
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui";
import { cn } from "@/lib/utils";
import type { EditorTab } from "@/types/chat";

export function EditorMainToolbar(args: {
  activeTab: EditorTab | null;
  activeTabIsImage: boolean;
  activeTabIsMarkdown: boolean;
  sendToAgentDisabled: boolean;
  editorDiffMode: boolean;
  editorMarkdownPreviewMode: boolean;
  diffViewMode: "unified" | "split";
  showDiffDisplayControls: boolean;
  onSave: () => void;
  onToggleEditorDiffMode: () => void;
  onToggleEditorMarkdownPreviewMode: () => void;
  onChangeDiffViewMode: (mode: "unified" | "split") => void;
  onSendToAgent: () => void;
  onCloseEditor: () => void;
}) {
  return (
    <div
      className={cn(
        "flex shrink-0 items-center justify-between border-b border-border/80 px-3 text-sm",
        PANEL_BAR_HEIGHT_CLASS,
      )}
    >
      <p className={PANEL_HEADER_TITLE_CLASS}>
        <FileCode2 className={PANEL_HEADER_ICON_CLASS} />
        Editor
      </p>
      <TooltipProvider>
        <div className="flex items-center gap-1.5">
          <Tooltip>
            <TooltipTrigger asChild>
              <span className="inline-flex">
                <Button
                  size="sm"
                  variant="ghost"
                  className="h-7 w-7 rounded-sm p-0 text-muted-foreground"
                  disabled={!args.activeTab?.isDirty || args.activeTabIsImage}
                  onClick={args.onSave}
                >
                  <Save className="size-4" />
                </Button>
              </span>
            </TooltipTrigger>
            <TooltipContent side="bottom">Save (Ctrl S)</TooltipContent>
          </Tooltip>
          <Tooltip>
            <TooltipTrigger asChild>
              <span className="inline-flex">
                <Button
                  size="sm"
                  variant="ghost"
                  className="h-7 w-7 rounded-sm p-0 text-muted-foreground"
                  disabled={
                    !args.activeTab?.originalContent || args.activeTabIsImage
                  }
                  onClick={args.onToggleEditorDiffMode}
                >
                  {args.editorDiffMode ? (
                    <PenLine className="size-4" />
                  ) : (
                    <Columns2 className="size-4" />
                  )}
                </Button>
              </span>
            </TooltipTrigger>
            <TooltipContent side="bottom">
              {args.editorDiffMode ? "Back to Edit" : "View Diff"}
            </TooltipContent>
          </Tooltip>
          {args.activeTabIsMarkdown ? (
            <Tooltip>
              <TooltipTrigger asChild>
                <span className="inline-flex">
                  <Button
                    size="sm"
                    variant="ghost"
                    className="h-7 w-7 rounded-sm p-0 text-muted-foreground"
                    disabled={args.activeTabIsImage}
                    onClick={args.onToggleEditorMarkdownPreviewMode}
                    aria-label={
                      args.editorMarkdownPreviewMode
                        ? "Show Markdown Source"
                        : "Show Markdown Preview"
                    }
                    aria-pressed={args.editorMarkdownPreviewMode}
                    data-testid="editor-markdown-preview-toggle"
                  >
                    {args.editorMarkdownPreviewMode ? (
                      <Code2 className="size-4" />
                    ) : (
                      <Eye className="size-4" />
                    )}
                  </Button>
                </span>
              </TooltipTrigger>
              <TooltipContent side="bottom">
                {args.editorMarkdownPreviewMode
                  ? "Show Markdown Source"
                  : "Preview Markdown"}
              </TooltipContent>
            </Tooltip>
          ) : null}
          {args.showDiffDisplayControls ? (
            <div className="flex items-center gap-0.5 rounded-md border border-border/80 bg-background/70 p-0.5">
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button
                    size="sm"
                    variant="ghost"
                    className={cn(
                      "h-6 w-6 rounded-sm p-0 text-muted-foreground",
                      args.diffViewMode === "unified" &&
                        "bg-secondary text-foreground",
                    )}
                    onClick={() => args.onChangeDiffViewMode("unified")}
                    aria-label="Unified Diff"
                  >
                    <AlignJustify className="size-3.5" />
                  </Button>
                </TooltipTrigger>
                <TooltipContent side="bottom">Unified Diff</TooltipContent>
              </Tooltip>
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button
                    size="sm"
                    variant="ghost"
                    className={cn(
                      "h-6 w-6 rounded-sm p-0 text-muted-foreground",
                      args.diffViewMode === "split" &&
                        "bg-secondary text-foreground",
                    )}
                    onClick={() => args.onChangeDiffViewMode("split")}
                    aria-label="Split Diff"
                  >
                    <Columns2 className="size-3.5" />
                  </Button>
                </TooltipTrigger>
                <TooltipContent side="bottom">Split Diff</TooltipContent>
              </Tooltip>
            </div>
          ) : null}
          <Tooltip>
            <TooltipTrigger asChild>
              <span className="inline-flex">
                <Button
                  size="sm"
                  variant="ghost"
                  className="h-7 w-7 rounded-sm p-0 text-muted-foreground"
                  disabled={args.sendToAgentDisabled}
                  onClick={args.onSendToAgent}
                >
                  <Send className="size-4" />
                </Button>
              </span>
            </TooltipTrigger>
            <TooltipContent side="bottom">Send to Agent</TooltipContent>
          </Tooltip>
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                size="sm"
                variant="ghost"
                className="h-7 w-7 rounded-sm p-0 text-muted-foreground"
                onClick={args.onCloseEditor}
              >
                <X className="size-4" />
              </Button>
            </TooltipTrigger>
            <TooltipContent side="bottom">Close Editor</TooltipContent>
          </Tooltip>
        </div>
      </TooltipProvider>
    </div>
  );
}
