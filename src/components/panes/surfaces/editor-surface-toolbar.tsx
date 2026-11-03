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
import { ReviewEditorOriginButton } from "@/components/review/ReviewEditorOriginButton";
import { sx } from "@/components/ads/utils/stylex";
import { SegmentedControl } from "@/components/system/SegmentedControl";
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
/** A tab type whose toolbar toggles between its rendered view and source. */
export type EditorPreviewKind = "markdown" | "html";

const PREVIEW_TOGGLE_LABEL_KEYS = {
  markdown: {
    showSource: "panes:editorSurfaceToolbar.showMarkdownSource",
    showPreview: "panes:editorSurfaceToolbar.showMarkdownPreview",
    preview: "panes:editorSurfaceToolbar.previewMarkdown",
  },
  html: {
    showSource: "panes:editorSurfaceToolbar.showHtmlSource",
    showPreview: "panes:editorSurfaceToolbar.showHtmlPreview",
    preview: "panes:editorSurfaceToolbar.previewHtml",
  },
} as const satisfies Record<
  EditorPreviewKind,
  { showSource: string; showPreview: string; preview: string }
>;

export function EditorSurfaceToolbar(args: {
  tab: EditorTab;
  absolutePath: string;
  tabIsImage: boolean;
  /** Set when the tab offers a rendered preview; null hides the toggle. */
  previewKind: EditorPreviewKind | null;
  sendToAgentDisabled: boolean;
  diffMode: boolean;
  previewMode: boolean;
  diffViewMode: "unified" | "split";
  showDiffDisplayControls: boolean;
  reviewCommentCount: number;
  /** Pending review comments on this tab's file. */
  fileReviewCommentCount: number;
  canAddReviewComment: boolean;
  canSubmitReviewFeedback: boolean;
  onSave: () => void;
  onToggleDiffMode: () => void;
  onTogglePreviewMode: () => void;
  onChangeDiffViewMode: (mode: "unified" | "split") => void;
  onAddReviewComment: () => void;
  onSubmitReviewFeedback: () => void;
  onSubmitFileReviewFeedback: () => void;
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
          <ReviewEditorOriginButton editorTabId={args.tab.id} />
          <Tooltip>
            <TooltipTrigger render={<span className={sx(s.inlineFlex)} />}>
              <Button
                size="sm"
                variant="ghost"
                xstyle={s.iconButton}
                disabled={!args.tab.isDirty || args.tabIsImage}
                onClick={args.onSave}
                aria-label={i18n.t("common:actions.save")}
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
                aria-label={
                  args.diffMode
                    ? i18n.t("panes:editorSurfaceToolbar.backToEdit")
                    : i18n.t("panes:editorSurfaceToolbar.viewDiff")
                }
              >
                {args.diffMode ? <PenLine size={16} /> : <Columns2 size={16} />}
              </Button>
            </TooltipTrigger>
            <TooltipContent side="bottom">
              {args.diffMode ? i18n.t("panes:editorSurfaceToolbar.backToEdit") : i18n.t("panes:editorSurfaceToolbar.viewDiff")}
            </TooltipContent>
          </Tooltip>
          {args.previewKind ? (
            <Tooltip>
              <TooltipTrigger render={<span className={sx(s.inlineFlex)} />}>
                <Button
                  size="sm"
                  variant="ghost"
                  xstyle={[
                    s.iconButton,
                    transition.colors,
                    args.previewMode && s.iconButtonActive,
                  ]}
                  disabled={args.tabIsImage}
                  onClick={args.onTogglePreviewMode}
                  aria-label={
                    args.previewMode
                      ? i18n.t(PREVIEW_TOGGLE_LABEL_KEYS[args.previewKind].showSource)
                      : i18n.t(PREVIEW_TOGGLE_LABEL_KEYS[args.previewKind].showPreview)
                  }
                  aria-pressed={args.previewMode}
                  data-testid={`editor-${args.previewKind}-preview-toggle`}
                >
                  <Eye
                    size={16}
                    strokeWidth={args.previewMode ? 2.25 : undefined}
                  />
                </Button>
              </TooltipTrigger>
              <TooltipContent side="bottom">
                {args.previewMode
                  ? i18n.t(PREVIEW_TOGGLE_LABEL_KEYS[args.previewKind].showSource)
                  : i18n.t(PREVIEW_TOGGLE_LABEL_KEYS[args.previewKind].preview)}
              </TooltipContent>
            </Tooltip>
          ) : null}
          {args.showDiffDisplayControls ? (
            <SegmentedControl
              aria-label={i18n.t("panes:editorSurfaceToolbar.diffLayout")}
              iconOnly
              value={args.diffViewMode}
              onValueChange={args.onChangeDiffViewMode}
              options={[
                { value: "unified", label: i18n.t("panes:editorSurfaceToolbar.unifiedDiff"), icon: <AlignJustify aria-hidden /> },
                { value: "split", label: i18n.t("panes:editorSurfaceToolbar.splitDiff"), icon: <Columns2 aria-hidden /> },
              ]}
            />
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
                aria-label={i18n.t("panes:editorSurfaceToolbar.sendToAgent")}
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
              {args.fileReviewCommentCount > 0 &&
              args.fileReviewCommentCount < args.reviewCommentCount ? (
                <>
                  <DropdownMenuItem onSelect={() => args.onSubmitFileReviewFeedback()}>
                    {i18n.t("panes:editorSurfaceToolbar.sendThisFileReviewComments", { count: args.fileReviewCommentCount })}
                  </DropdownMenuItem>
                  <DropdownMenuSeparator />
                </>
              ) : null}
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
