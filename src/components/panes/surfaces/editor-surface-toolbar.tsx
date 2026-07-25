import {
  AlignJustify,
  Columns2,
  Eye,
  FileCode2,
  MessageSquarePlus,
  MessagesSquare,
  MoreHorizontal,
  PenLine,
  Save,
  Send,
} from "lucide-react";
import {
  PANEL_BAR_HEIGHT_CLASS,
  PANEL_HEADER_ICON_CLASS,
} from "@/components/layout/panel-bar.constants";
import type { EditorBulkCloseKind } from "@/components/panes/editor-tab-actions";
import {
  Button,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui";
import { cn } from "@/lib/utils";
import type { EditorTab } from "@/types/chat";

/**
 * Toolbar row rendered above a single editor pane surface. Ported from the
 * legacy `editor-main-toolbar.tsx` minus the "Close Editor" button (panels
 * close through their pane tab) plus an overflow menu carrying the bulk-close
 * and copy-path actions that used to live in the editor tab strip context
 * menu.
 */
export function EditorSurfaceToolbar(args: {
  tab: EditorTab;
  absolutePath: string;
  tabIsImage: boolean;
  tabIsMarkdown: boolean;
  sendToAgentDisabled: boolean;
  diffMode: boolean;
  markdownPreviewMode: boolean;
  diffViewMode: "unified" | "split";
  showDiffDisplayControls: boolean;
  reviewCommentCount: number;
  canAddReviewComment: boolean;
  canSubmitReviewFeedback: boolean;
  onSave: () => void;
  onToggleDiffMode: () => void;
  onToggleMarkdownPreviewMode: () => void;
  onChangeDiffViewMode: (mode: "unified" | "split") => void;
  onAddReviewComment: () => void;
  onSubmitReviewFeedback: () => void;
  onSendToAgent: () => void;
  onBulkClose: (kind: EditorBulkCloseKind) => void;
  onCopyPath: () => void;
  onCopyRelativePath: () => void;
  onCopyBreadcrumbsPath: () => void;
}) {
  return (
    <div
      className={cn(
        "flex shrink-0 items-center justify-between gap-2 border-b border-border/80 px-3 text-sm",
        PANEL_BAR_HEIGHT_CLASS,
      )}
    >
      <TooltipProvider>
        <Tooltip>
          <TooltipTrigger
            render={
              <p className="flex min-w-0 items-center gap-1.5 text-xs text-muted-foreground" />
            }
          >
            <FileCode2 className={PANEL_HEADER_ICON_CLASS} />
            <span className="truncate">{args.tab.filePath}</span>
            {args.tab.isDirty ? (
              <span
                className="size-1.5 shrink-0 rounded-full bg-success"
                aria-hidden="true"
              />
            ) : null}
          </TooltipTrigger>
          <TooltipContent side="bottom" className="max-w-sm break-all">
            {args.absolutePath}
          </TooltipContent>
        </Tooltip>
        <div className="flex items-center gap-1.5">
          <Tooltip>
            <TooltipTrigger render={<span className="inline-flex" />}>
              <Button
                size="sm"
                variant="ghost"
                className="h-7 w-7 rounded-sm p-0 text-muted-foreground"
                disabled={!args.tab.isDirty || args.tabIsImage}
                onClick={args.onSave}
              >
                <Save className="size-4" />
              </Button>
            </TooltipTrigger>
            <TooltipContent side="bottom">Save (Ctrl S)</TooltipContent>
          </Tooltip>
          <Tooltip>
            <TooltipTrigger render={<span className="inline-flex" />}>
              <Button
                size="sm"
                variant="ghost"
                className="h-7 w-7 rounded-sm p-0 text-muted-foreground"
                disabled={!args.tab.originalContent || args.tabIsImage}
                onClick={args.onToggleDiffMode}
              >
                {args.diffMode ? (
                  <PenLine className="size-4" />
                ) : (
                  <Columns2 className="size-4" />
                )}
              </Button>
            </TooltipTrigger>
            <TooltipContent side="bottom">
              {args.diffMode ? "Back to Edit" : "View Diff"}
            </TooltipContent>
          </Tooltip>
          {args.tabIsMarkdown ? (
            <Tooltip>
              <TooltipTrigger render={<span className="inline-flex" />}>
                <Button
                  size="sm"
                  variant="ghost"
                  className={cn(
                    "h-7 w-7 rounded-sm p-0 transition-colors",
                    args.markdownPreviewMode
                      ? "border-primary/40 bg-primary/10 text-primary ring-1 ring-primary/25 hover:bg-primary/20 hover:text-primary"
                      : "text-muted-foreground",
                  )}
                  disabled={args.tabIsImage}
                  onClick={args.onToggleMarkdownPreviewMode}
                  aria-label={
                    args.markdownPreviewMode
                      ? "Show Markdown Source"
                      : "Show Markdown Preview"
                  }
                  aria-pressed={args.markdownPreviewMode}
                  data-testid="editor-markdown-preview-toggle"
                >
                  <Eye
                    className="size-4"
                    strokeWidth={args.markdownPreviewMode ? 2.25 : 2}
                  />
                </Button>
              </TooltipTrigger>
              <TooltipContent side="bottom">
                {args.markdownPreviewMode
                  ? "Show Markdown Source"
                  : "Preview Markdown"}
              </TooltipContent>
            </Tooltip>
          ) : null}
          {args.showDiffDisplayControls ? (
            <div className="flex items-center gap-0.5 rounded-md border border-border/80 bg-background/70 p-0.5">
              <Tooltip>
                <TooltipTrigger
                  render={
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
                    />
                  }
                >
                  <AlignJustify className="size-3.5" />
                </TooltipTrigger>
                <TooltipContent side="bottom">Unified Diff</TooltipContent>
              </Tooltip>
              <Tooltip>
                <TooltipTrigger
                  render={
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
                    />
                  }
                >
                  <Columns2 className="size-3.5" />
                </TooltipTrigger>
                <TooltipContent side="bottom">Split Diff</TooltipContent>
              </Tooltip>
            </div>
          ) : null}
          {args.showDiffDisplayControls ? (
            <>
              <Tooltip>
                <TooltipTrigger render={<span className="inline-flex" />}>
                  <Button
                    size="sm"
                    variant="ghost"
                    className="h-7 w-7 rounded-sm p-0 text-muted-foreground"
                    disabled={!args.canAddReviewComment}
                    onClick={args.onAddReviewComment}
                    aria-label="Add review comment"
                  >
                    <MessageSquarePlus className="size-4" />
                  </Button>
                </TooltipTrigger>
                <TooltipContent side="bottom">
                  Add review comment
                </TooltipContent>
              </Tooltip>
              <Tooltip>
                <TooltipTrigger render={<span className="inline-flex" />}>
                  <Button
                    size="sm"
                    variant="ghost"
                    className="relative h-7 w-7 rounded-sm p-0 text-muted-foreground"
                    disabled={!args.canSubmitReviewFeedback}
                    onClick={args.onSubmitReviewFeedback}
                    aria-label="Send review to agent"
                  >
                    <MessagesSquare className="size-4" />
                    {args.reviewCommentCount > 0 ? (
                      <span className="absolute -right-1 -top-1 inline-flex h-4 min-w-4 items-center justify-center rounded-full border border-background bg-primary px-1 text-[9px] font-semibold text-primary-foreground">
                        {args.reviewCommentCount > 9
                          ? "9+"
                          : args.reviewCommentCount}
                      </span>
                    ) : null}
                  </Button>
                </TooltipTrigger>
                <TooltipContent side="bottom">
                  Send review to agent
                </TooltipContent>
              </Tooltip>
            </>
          ) : null}
          <Tooltip>
            <TooltipTrigger render={<span className="inline-flex" />}>
              <Button
                size="sm"
                variant="ghost"
                className="h-7 w-7 rounded-sm p-0 text-muted-foreground"
                disabled={args.sendToAgentDisabled}
                onClick={args.onSendToAgent}
              >
                <Send className="size-4" />
              </Button>
            </TooltipTrigger>
            <TooltipContent side="bottom">Send to Agent</TooltipContent>
          </Tooltip>
          <DropdownMenu>
            <DropdownMenuTrigger
              render={
                <Button
                  size="sm"
                  variant="ghost"
                  className="h-7 w-7 rounded-sm p-0 text-muted-foreground"
                  aria-label="More editor tab actions"
                />
              }
            >
              <MoreHorizontal className="size-4" />
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem onSelect={() => args.onBulkClose("others")}>
                Close Others
              </DropdownMenuItem>
              <DropdownMenuItem onSelect={() => args.onBulkClose("right")}>
                Close to the Right
              </DropdownMenuItem>
              <DropdownMenuItem onSelect={() => args.onBulkClose("saved")}>
                Close Saved
              </DropdownMenuItem>
              <DropdownMenuItem onSelect={() => args.onBulkClose("all")}>
                Close All
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem onSelect={() => args.onCopyPath()}>
                Copy Path
              </DropdownMenuItem>
              <DropdownMenuItem onSelect={() => args.onCopyRelativePath()}>
                Copy Relative Path
              </DropdownMenuItem>
              <DropdownMenuItem onSelect={() => args.onCopyBreadcrumbsPath()}>
                Copy Breadcrumbs Path
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </TooltipProvider>
    </div>
  );
}
