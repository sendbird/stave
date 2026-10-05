import { i18n, useTranslation } from "@/i18n";
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
import { CountBadge } from "@/components/system/CountBadge";
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
  useTranslation();
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
            <TooltipContent side="bottom">{i18n.t("panes:editorSurfaceToolbar.saveCtrlS")}</TooltipContent>
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
              {args.diffMode ? i18n.t("panes:editorSurfaceToolbar.backToEdit") : i18n.t("panes:editorSurfaceToolbar.viewDiff")}
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
                      ? i18n.t("panes:editorSurfaceToolbar.showMarkdownSource")
                      : i18n.t("panes:editorSurfaceToolbar.showMarkdownPreview")
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
                  ? i18n.t("panes:editorSurfaceToolbar.showMarkdownSource")
                  : i18n.t("panes:editorSurfaceToolbar.previewMarkdown")}
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
                      aria-label={i18n.t("panes:editorSurfaceToolbar.unifiedDiff")}
                    />
                  }
                >
                  <AlignJustify size={14} />
                </TooltipTrigger>
                <TooltipContent side="bottom">{i18n.t("panes:editorSurfaceToolbar.unifiedDiff")}</TooltipContent>
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
                      aria-label={i18n.t("panes:editorSurfaceToolbar.splitDiff")}
                    />
                  }
                >
                  <Columns2 size={14} />
                </TooltipTrigger>
                <TooltipContent side="bottom">{i18n.t("panes:editorSurfaceToolbar.splitDiff")}</TooltipContent>
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
                    aria-label={i18n.t("panes:editorSurfaceToolbar.addReviewComment")}
                  >
                    <MessageSquarePlus size={16} />
                  </Button>
                </TooltipTrigger>
                <TooltipContent side="bottom">
                  {i18n.t("panes:editorSurfaceToolbar.addReviewComment")}
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
                    aria-label={i18n.t("panes:editorSurfaceToolbar.sendReviewToAgent")}
                    indicator={
                      args.reviewCommentCount > 0 ? (
                        <CountBadge cap={9} count={args.reviewCommentCount} />
                      ) : null
                    }
                  >
                    <MessagesSquare size={16} />
                  </Button>
                </TooltipTrigger>
                <TooltipContent side="bottom">
                  {i18n.t("panes:editorSurfaceToolbar.sendReviewToAgent")}
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
            <TooltipContent side="bottom">{i18n.t("panes:editorSurfaceToolbar.sendToAgent")}</TooltipContent>
          </Tooltip>
          <DropdownMenu>
            <DropdownMenuTrigger
              render={
                <Button
                  size="sm"
                  variant="ghost"
                  xstyle={s.iconButton}
                  aria-label={i18n.t("panes:editorSurfaceToolbar.moreEditorTabActions")}
                />
              }
            >
              <MoreHorizontal size={16} />
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem onSelect={() => args.onBulkClose("others")}>
                {i18n.t("panes:editorSurfaceToolbar.closeOthers")}
              </DropdownMenuItem>
              <DropdownMenuItem onSelect={() => args.onBulkClose("right")}>
                {i18n.t("panes:editorSurfaceToolbar.closeToTheRight")}
              </DropdownMenuItem>
              <DropdownMenuItem onSelect={() => args.onBulkClose("saved")}>
                {i18n.t("panes:editorSurfaceToolbar.closeSaved")}
              </DropdownMenuItem>
              <DropdownMenuItem onSelect={() => args.onBulkClose("all")}>
                {i18n.t("panes:editorSurfaceToolbar.closeAll")}
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem onSelect={() => args.onCopyPath()}>
                {i18n.t("panes:editorSurfaceToolbar.copyPath")}
              </DropdownMenuItem>
              <DropdownMenuItem onSelect={() => args.onCopyRelativePath()}>
                {i18n.t("panes:editorSurfaceToolbar.copyRelativePath")}
              </DropdownMenuItem>
              <DropdownMenuItem onSelect={() => args.onCopyBreadcrumbsPath()}>
                {i18n.t("panes:editorSurfaceToolbar.copyBreadcrumbsPath")}
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </TooltipProvider>
    </div>
  );
}
