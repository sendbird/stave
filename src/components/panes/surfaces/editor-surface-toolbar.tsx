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
  PANEL_HEADER_ICON_CLASS,
  panelBarStyles,
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
import { sx } from "@/components/ads/utils/stylex";
import { transition } from "@/components/ads/recipes/transition";
import { editorSurfaceToolbarStyles as s } from "./editor-surface-toolbar.styles";
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
    <div className={sx(s.bar, panelBarStyles.bar)}>
      <TooltipProvider>
        <Tooltip>
          <TooltipTrigger render={<p className={sx(s.pathTrigger)} />}>
            <FileCode2 className={PANEL_HEADER_ICON_CLASS} />
            <span className={sx(s.pathText)}>{args.tab.filePath}</span>
            {args.tab.isDirty ? (
              <span className={sx(s.dirtyDot)} aria-hidden="true" />
            ) : null}
          </TooltipTrigger>
          <TooltipContent side="bottom" className={sx(s.tooltipContent)}>
            {args.absolutePath}
          </TooltipContent>
        </Tooltip>
        <div className={sx(s.actions)}>
          <Tooltip>
            <TooltipTrigger render={<span className={sx(s.inlineFlex)} />}>
              <Button
                size="sm"
                variant="ghost"
                xstyle={s.iconButton}
                disabled={!args.tab.isDirty || args.tabIsImage}
                onClick={args.onSave}
              >
                <Save size={16} />
              </Button>
            </TooltipTrigger>
            <TooltipContent side="bottom">Save (Ctrl S)</TooltipContent>
          </Tooltip>
          <Tooltip>
            <TooltipTrigger render={<span className={sx(s.inlineFlex)} />}>
              <Button
                size="sm"
                variant="ghost"
                xstyle={s.iconButton}
                disabled={!args.tab.originalContent || args.tabIsImage}
                onClick={args.onToggleDiffMode}
              >
                {args.diffMode ? <PenLine size={16} /> : <Columns2 size={16} />}
              </Button>
            </TooltipTrigger>
            <TooltipContent side="bottom">
              {args.diffMode ? "Back to Edit" : "View Diff"}
            </TooltipContent>
          </Tooltip>
          {args.tabIsMarkdown ? (
            <Tooltip>
              <TooltipTrigger render={<span className={sx(s.inlineFlex)} />}>
                <Button
                  size="sm"
                  variant="ghost"
                  xstyle={[
                    s.iconButton,
                    transition.colors,
                    args.markdownPreviewMode && s.iconButtonActive,
                  ]}
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
                    size={16}
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
            <div className={sx(s.diffViewGroup)}>
              <Tooltip>
                <TooltipTrigger
                  render={
                    <Button
                      size="sm"
                      variant="ghost"
                      xstyle={[
                        s.diffViewButton,
                        args.diffViewMode === "unified" &&
                          s.diffViewButtonActive,
                      ]}
                      onClick={() => args.onChangeDiffViewMode("unified")}
                      aria-label="Unified Diff"
                    />
                  }
                >
                  <AlignJustify size={14} />
                </TooltipTrigger>
                <TooltipContent side="bottom">Unified Diff</TooltipContent>
              </Tooltip>
              <Tooltip>
                <TooltipTrigger
                  render={
                    <Button
                      size="sm"
                      variant="ghost"
                      xstyle={[
                        s.diffViewButton,
                        args.diffViewMode === "split" && s.diffViewButtonActive,
                      ]}
                      onClick={() => args.onChangeDiffViewMode("split")}
                      aria-label="Split Diff"
                    />
                  }
                >
                  <Columns2 size={14} />
                </TooltipTrigger>
                <TooltipContent side="bottom">Split Diff</TooltipContent>
              </Tooltip>
            </div>
          ) : null}
          {args.showDiffDisplayControls ? (
            <>
              <Tooltip>
                <TooltipTrigger render={<span className={sx(s.inlineFlex)} />}>
                  <Button
                    size="sm"
                    variant="ghost"
                    xstyle={s.iconButton}
                    disabled={!args.canAddReviewComment}
                    onClick={args.onAddReviewComment}
                    aria-label="Add review comment"
                  >
                    <MessageSquarePlus size={16} />
                  </Button>
                </TooltipTrigger>
                <TooltipContent side="bottom">
                  Add review comment
                </TooltipContent>
              </Tooltip>
              <Tooltip>
                <TooltipTrigger render={<span className={sx(s.inlineFlex)} />}>
                  <Button
                    size="sm"
                    variant="ghost"
                    xstyle={s.reviewButton}
                    disabled={!args.canSubmitReviewFeedback}
                    onClick={args.onSubmitReviewFeedback}
                    aria-label="Send review to agent"
                  >
                    <MessagesSquare size={16} />
                    {args.reviewCommentCount > 0 ? (
                      <span className={sx(s.reviewCountBadge)}>
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
            <TooltipTrigger render={<span className={sx(s.inlineFlex)} />}>
              <Button
                size="sm"
                variant="ghost"
                xstyle={s.iconButton}
                disabled={args.sendToAgentDisabled}
                onClick={args.onSendToAgent}
              >
                <Send size={16} />
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
                  xstyle={s.iconButton}
                  aria-label="More editor tab actions"
                />
              }
            >
              <MoreHorizontal size={16} />
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
