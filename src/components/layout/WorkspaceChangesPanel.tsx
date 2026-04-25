import { Check, Copy, File, GitBranch, GitCommitHorizontal, History, LoaderCircle, Minus, Plus, RefreshCw, RotateCcw, Timer } from "lucide-react";
import { useState, type ReactNode } from "react";
import { Badge, Button, Input, Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui";
import { ContextMenu, ContextMenuContent, ContextMenuItem, ContextMenuSeparator, ContextMenuTrigger } from "@/components/ui/context-menu";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import type { SourceControlStatusItem } from "@/lib/source-control-status";
import { cn } from "@/lib/utils";
import { WorkspaceFileIcon } from "./explorer-entry-icon";
import type { SourceControlItemViewModel, SourceControlSection, SourceControlSummary } from "./editor-panel.utils";

type SourceControlPanelView = "changes" | "history";

interface SourceControlHistoryEntry {
  hash: string;
  relativeDate: string;
  subject: string;
}

const AUTO_REFRESH_OPTIONS: Array<{ seconds: number; label: string }> = [
  { seconds: 0, label: "Off" },
  { seconds: 5, label: "Every 5 seconds" },
  { seconds: 10, label: "Every 10 seconds" },
  { seconds: 30, label: "Every 30 seconds" },
  { seconds: 60, label: "Every minute" },
];

function formatAutoRefreshShortLabel(seconds: number) {
  if (seconds <= 0) return "Off";
  if (seconds < 60) return `${seconds}s`;
  const minutes = Math.round(seconds / 60);
  return `${minutes}m`;
}

function formatFileCount(count: number) {
  return `${count} file${count === 1 ? "" : "s"}`;
}

function formatRecentCommitCount(count: number) {
  return `${count} recent commit${count === 1 ? "" : "s"}`;
}

function SourceControlActionButton(args: {
  disabled?: boolean;
  icon: ReactNode;
  label: string;
  onClick: () => void;
  tone?: "default" | "destructive" | "success";
}) {
  const toneClassName = args.tone === "destructive"
    ? "text-destructive hover:bg-destructive/10 hover:text-destructive"
    : args.tone === "success"
      ? "text-success hover:bg-success/10 hover:text-success"
      : "text-muted-foreground hover:bg-muted hover:text-foreground";

  return (
    <Button
      type="button"
      size="icon-xs"
      variant="ghost"
      aria-label={args.label}
      title={args.label}
      className={cn("size-6 rounded-sm border border-transparent p-0 transition-colors", toneClassName)}
      disabled={args.disabled}
      onClick={args.onClick}
    >
      {args.icon}
    </Button>
  );
}

function SourceControlRow(args: {
  isScmBusy: boolean;
  item: SourceControlItemViewModel;
  onCopyPath: (path: string) => void;
  onDiscard: (item: SourceControlStatusItem) => void;
  onOpenDiff: (path: string) => void;
  onStage: (item: SourceControlStatusItem) => void;
  onUnstage: (item: SourceControlStatusItem) => void;
}) {
  const statusClassName = args.item.isConflict
    ? "text-destructive"
    : args.item.hasMixedChanges || args.item.hasUnstagedChanges
      ? "text-warning"
      : args.item.hasStagedChanges
        ? "text-success"
        : "text-muted-foreground";

  return (
    <ContextMenu>
      <ContextMenuTrigger asChild>
        <div className="group flex items-center gap-2 rounded-lg border border-transparent px-2 py-1.5 transition-colors hover:bg-muted/30 focus-within:bg-muted/30">
          <button
            type="button"
            className="flex min-w-0 flex-1 items-center gap-2 rounded-md text-left outline-none focus-visible:ring-2 focus-visible:ring-ring/50"
            onClick={() => args.onOpenDiff(args.item.item.path)}
          >
            <WorkspaceFileIcon fileName={args.item.fileName} className="h-4 w-[14px]" />
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-2">
                <span className="truncate text-sm font-medium">{args.item.fileName}</span>
                {args.item.hasMixedChanges ? (
                  <Badge variant="outline" className="rounded-md px-1.5 text-[10px]">
                    partial
                  </Badge>
                ) : null}
                {args.item.isUntracked ? (
                  <Badge variant="outline" className="rounded-md px-1.5 text-[10px]">
                    new
                  </Badge>
                ) : null}
              </div>
              <p className="truncate text-[11px] text-muted-foreground">
                {args.item.pathDetail}
              </p>
            </div>
          </button>

          <div className="relative flex h-6 w-[84px] shrink-0 items-center justify-end">
            <span
              className={cn(
                "pointer-events-none absolute inset-0 flex items-center justify-end pr-1 font-mono text-[11px] font-medium transition-opacity duration-150 group-hover:opacity-0 group-focus-within:opacity-0",
                statusClassName,
              )}
            >
              {args.item.displayCode}
            </span>
            <div className="pointer-events-none absolute inset-0 flex items-center justify-end gap-0.5 opacity-0 transition-opacity duration-150 group-hover:pointer-events-auto group-hover:opacity-100 group-focus-within:pointer-events-auto group-focus-within:opacity-100">
              {args.item.canStage ? (
                <SourceControlActionButton
                  label="Stage"
                  disabled={args.isScmBusy}
                  icon={<Plus className="size-3.5" />}
                  onClick={() => args.onStage(args.item.item)}
                  tone="success"
                />
              ) : null}
              {args.item.canUnstage ? (
                <SourceControlActionButton
                  label="Unstage"
                  disabled={args.isScmBusy}
                  icon={<Minus className="size-3.5" />}
                  onClick={() => args.onUnstage(args.item.item)}
                  tone="default"
                />
              ) : null}
              {args.item.canDiscard ? (
                <SourceControlActionButton
                  label="Discard"
                  disabled={args.isScmBusy}
                  icon={<RotateCcw className="size-3.5" />}
                  onClick={() => args.onDiscard(args.item.item)}
                  tone="destructive"
                />
              ) : null}
            </div>
          </div>
        </div>
      </ContextMenuTrigger>
      <ContextMenuContent className="w-52">
        <ContextMenuItem onSelect={() => args.onOpenDiff(args.item.item.path)}>
          <File className="size-4" />
          Open Changes
        </ContextMenuItem>
        {(args.item.canStage || args.item.canUnstage || args.item.canDiscard) ? <ContextMenuSeparator /> : null}
        {args.item.canStage ? (
          <ContextMenuItem disabled={args.isScmBusy} onSelect={() => args.onStage(args.item.item)}>
            <Plus className="size-4" />
            Stage
          </ContextMenuItem>
        ) : null}
        {args.item.canUnstage ? (
          <ContextMenuItem disabled={args.isScmBusy} onSelect={() => args.onUnstage(args.item.item)}>
            <Minus className="size-4" />
            Unstage
          </ContextMenuItem>
        ) : null}
        {args.item.canDiscard ? (
          <ContextMenuItem
            variant="destructive"
            disabled={args.isScmBusy}
            onSelect={() => args.onDiscard(args.item.item)}
          >
            <RotateCcw className="size-4" />
            Discard
          </ContextMenuItem>
        ) : null}
        <ContextMenuSeparator />
        <ContextMenuItem onSelect={() => args.onCopyPath(args.item.pathLabel)}>
          <Copy className="size-4" />
          Copy path
        </ContextMenuItem>
      </ContextMenuContent>
    </ContextMenu>
  );
}

function SourceControlHistoryRow(args: {
  isLast: boolean;
  item: SourceControlHistoryEntry;
}) {
  return (
    <div className="flex gap-3 rounded-lg px-1 py-2 transition-colors hover:bg-muted/20">
      <div className="relative flex w-5 shrink-0 justify-center pt-1.5">
        <span className="size-2.5 rounded-full border border-border/80 bg-background shadow-xs" />
        {!args.isLast ? <span className="absolute bottom-[-12px] top-4 w-px bg-border/70" /> : null}
      </div>
      <div className="min-w-0 flex-1 py-0.5">
        <div className="flex items-start gap-3">
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-medium text-foreground">{args.item.subject}</p>
            <div className="mt-1 flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
              <span className="font-mono text-[11px] text-foreground/70">{args.item.hash}</span>
              <span className="size-1 rounded-full bg-border" />
              <span>{args.item.relativeDate}</span>
            </div>
          </div>
          <GitCommitHorizontal className="mt-0.5 size-4 shrink-0 text-muted-foreground/70" />
        </div>
      </div>
    </div>
  );
}

export function WorkspaceChangesPanel(props: {
  sourceBranch: string;
  filteredScmItems: SourceControlStatusItem[];
  sourceControlSummary: SourceControlSummary;
  sourceControlHint: string;
  isScmBusy: boolean;
  commitMessage: string;
  onCommitMessageChange: (value: string) => void;
  canCommitStagedChanges: boolean;
  canUnstageAnyChanges: boolean;
  onCommit: () => Promise<void>;
  onStageAll: () => Promise<void>;
  onUnstageAll: () => Promise<void>;
  hasConflicts: boolean;
  sourceError: string;
  sourceControlSections: SourceControlSection[];
  onCopySourceControlPath: (path: string) => Promise<void>;
  onSelectDiff: (path: string) => Promise<void>;
  onStageAction: (args: { action: "stage" | "unstage"; item: SourceControlStatusItem }) => Promise<void>;
  onDiscardChange: (item: SourceControlStatusItem) => Promise<void>;
  sourceHistory: SourceControlHistoryEntry[];
  onRefresh: () => Promise<void>;
  autoRefreshSeconds: number;
  onAutoRefreshSecondsChange: (seconds: number) => void;
}) {
  const [view, setView] = useState<SourceControlPanelView>("changes");
  const showStageAll = props.sourceControlSummary.workingTreeCount > 0;
  const showUnstageAll = props.canUnstageAnyChanges;
  const showComposer = props.filteredScmItems.length > 0 || props.commitMessage.trim().length > 0;
  const summaryLabels = [
    props.sourceControlSummary.stagedCount > 0
      ? { className: "text-success", text: `Staged ${props.sourceControlSummary.stagedCount}` }
      : null,
    props.sourceControlSummary.workingTreeCount > 0
      ? { className: "text-muted-foreground", text: `Working tree ${props.sourceControlSummary.workingTreeCount}` }
      : null,
    props.sourceControlSummary.conflictCount > 0
      ? { className: "text-destructive", text: `Conflicts ${props.sourceControlSummary.conflictCount}` }
      : null,
  ].filter(Boolean) as Array<{ className: string; text: string }>;

  return (
    <Tabs value={view} onValueChange={(nextValue) => setView(nextValue as SourceControlPanelView)} className="flex h-full min-h-0 flex-col gap-0">
      <div className="flex items-center gap-2 border-b border-border/80 px-3 py-2">
        <TabsList className="h-auto flex-1 justify-start rounded-xl border border-border/70 bg-muted/30 p-1">
          <TabsTrigger value="changes" className="h-8 flex-none gap-2 rounded-lg px-3 text-xs font-medium">
            <span>Changes</span>
            <span className="text-[11px] text-muted-foreground">{props.filteredScmItems.length}</span>
          </TabsTrigger>
          <TabsTrigger value="history" className="h-8 flex-none gap-2 rounded-lg px-3 text-xs font-medium">
            <History className="size-3.5" />
            <span>History</span>
            <span className="text-[11px] text-muted-foreground">{props.sourceHistory.length}</span>
          </TabsTrigger>
        </TabsList>
        <div className="flex shrink-0 items-center gap-1">
          <Button
            type="button"
            size="icon-xs"
            variant="ghost"
            aria-label="Refresh source control"
            title="Refresh"
            className="size-8 rounded-lg text-muted-foreground hover:text-foreground"
            disabled={props.isScmBusy}
            onClick={() => void props.onRefresh()}
          >
            <RefreshCw className={cn("size-3.5", props.isScmBusy && "animate-spin")} />
          </Button>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button
                type="button"
                size="icon-xs"
                variant="ghost"
                aria-label="Auto refresh options"
                title={props.autoRefreshSeconds > 0
                  ? `Auto refresh: ${formatAutoRefreshShortLabel(props.autoRefreshSeconds)}`
                  : "Auto refresh: Off"}
                className={cn(
                  "h-8 gap-1 rounded-lg px-1.5 text-muted-foreground hover:text-foreground",
                  props.autoRefreshSeconds > 0 && "text-success hover:text-success",
                )}
              >
                <Timer className="size-3.5" />
                <span className="text-[11px] font-medium tracking-tight">
                  {formatAutoRefreshShortLabel(props.autoRefreshSeconds)}
                </span>
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-44">
              <DropdownMenuLabel className="text-[11px] font-medium uppercase tracking-[0.14em] text-muted-foreground">
                Auto refresh
              </DropdownMenuLabel>
              <DropdownMenuSeparator />
              {AUTO_REFRESH_OPTIONS.map((option) => {
                const isActive = option.seconds === props.autoRefreshSeconds;
                return (
                  <DropdownMenuItem
                    key={option.seconds}
                    onSelect={() => props.onAutoRefreshSecondsChange(option.seconds)}
                    className="justify-between"
                  >
                    <span>{option.label}</span>
                    {isActive ? <Check className="size-3.5 text-success" /> : null}
                  </DropdownMenuItem>
                );
              })}
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>

      <TabsContent value="changes" className="min-h-0 flex-1 overflow-auto">
        <div className="space-y-4 px-3 py-2">
          <section className="space-y-3 px-1">
            <div className="flex items-center justify-between gap-3">
              <div className="flex min-w-0 flex-wrap items-center gap-2">
                <Badge variant="outline" className="h-6 max-w-full justify-start gap-1 rounded-md border-border/70 bg-background/80 px-2 font-normal">
                  <GitBranch className="size-3.5 text-muted-foreground" />
                  <span className="truncate">{props.sourceBranch}</span>
                </Badge>
                <p className="text-sm font-medium text-foreground">
                  {formatFileCount(props.filteredScmItems.length)} changed
                </p>
              </div>
              {props.isScmBusy ? <LoaderCircle className="size-4 shrink-0 animate-spin text-muted-foreground" /> : null}
            </div>

            {summaryLabels.length > 0 ? (
              <div className="flex flex-wrap items-center gap-2 text-xs">
                {summaryLabels.map((item) => (
                  <span key={item.text} className={item.className}>
                    {item.text}
                  </span>
                ))}
              </div>
            ) : null}

            <p className="text-xs text-muted-foreground">{props.sourceControlHint}</p>

            {showComposer ? (
              <div className="space-y-3 border-t border-border/70 pt-3">
                <div className="flex items-start gap-2">
                  <Input
                    className="h-9 rounded-lg border-border/70 bg-background/90 text-sm"
                    placeholder={`Commit staged changes on "${props.sourceBranch}"`}
                    value={props.commitMessage}
                    onChange={(event) => props.onCommitMessageChange(event.target.value)}
                    onKeyDown={(event) => {
                      if ((event.metaKey || event.ctrlKey) && event.key === "Enter" && props.commitMessage.trim() && props.canCommitStagedChanges && !props.isScmBusy) {
                        event.preventDefault();
                        void props.onCommit();
                      }
                    }}
                    disabled={props.isScmBusy}
                  />
                  <Button
                    size="sm"
                    className="h-9 rounded-lg px-3 text-sm"
                    disabled={props.isScmBusy || !props.commitMessage.trim() || !props.canCommitStagedChanges}
                    onClick={() => void props.onCommit()}
                  >
                    Commit
                  </Button>
                </div>
                {(showStageAll || showUnstageAll) ? (
                  <div className="flex flex-wrap items-center gap-2">
                    {showStageAll ? (
                      <Button
                        size="sm"
                        variant="outline"
                        className="h-8 rounded-lg text-sm"
                        disabled={props.isScmBusy}
                        onClick={() => void props.onStageAll()}
                      >
                        Stage All
                      </Button>
                    ) : null}
                    {showUnstageAll ? (
                      <Button
                        size="sm"
                        variant="ghost"
                        className="h-8 rounded-lg text-sm"
                        disabled={props.isScmBusy}
                        onClick={() => void props.onUnstageAll()}
                      >
                        Unstage All
                      </Button>
                    ) : null}
                  </div>
                ) : null}
              </div>
            ) : null}
          </section>

          <div className="space-y-3">
            {props.hasConflicts ? (
              <div className="rounded-xl border border-warning/40 bg-warning/10 px-3 py-2 text-sm text-warning dark:bg-warning/15">
                Conflict detected. Resolve, stage, or discard the affected files before committing.
              </div>
            ) : null}
            {props.sourceError ? (
              <div className="rounded-xl border border-destructive/40 bg-destructive/10 px-3 py-2 text-sm text-destructive">
                {props.sourceError}
              </div>
            ) : null}
            {!props.sourceError && props.filteredScmItems.length === 0 ? (
              <div className="rounded-xl border border-dashed border-border/70 bg-muted/15 px-3 py-3">
                <p className="text-sm text-muted-foreground">No local changes.</p>
              </div>
            ) : null}
            {props.sourceControlSections.map((section) => (
              <section key={section.id} className="space-y-1.5">
                <div className="flex items-center justify-between gap-2 px-1">
                  <p className="text-[11px] font-medium uppercase tracking-[0.14em] text-muted-foreground">
                    {section.title}
                  </p>
                  <Badge variant={section.badgeVariant} className="rounded-md px-2 font-normal">
                    {section.items.length}
                  </Badge>
                </div>
                <div className="space-y-1.5">
                  {section.items.map((item) => (
                    <SourceControlRow
                      key={`${item.displayCode}:${item.pathLabel}`}
                      item={item}
                      isScmBusy={props.isScmBusy}
                      onCopyPath={(path) => void props.onCopySourceControlPath(path)}
                      onOpenDiff={(path) => void props.onSelectDiff(path)}
                      onStage={(sourceItem) => void props.onStageAction({ action: "stage", item: sourceItem })}
                      onUnstage={(sourceItem) => void props.onStageAction({ action: "unstage", item: sourceItem })}
                      onDiscard={(sourceItem) => void props.onDiscardChange(sourceItem)}
                    />
                  ))}
                </div>
              </section>
            ))}
          </div>
        </div>
      </TabsContent>

      <TabsContent value="history" className="min-h-0 flex-1 overflow-auto">
        <div className="space-y-3 px-3 py-2">
          <div className="flex items-center justify-between gap-3 px-1">
            <div className="flex min-w-0 flex-wrap items-center gap-2">
              <Badge variant="outline" className="h-6 max-w-full justify-start gap-1 rounded-md border-border/70 bg-background/80 px-2 font-normal">
                <GitBranch className="size-3.5 text-muted-foreground" />
                <span className="truncate">{props.sourceBranch}</span>
              </Badge>
              <p className="text-xs text-muted-foreground">{formatRecentCommitCount(props.sourceHistory.length)}</p>
            </div>
            {props.isScmBusy ? <LoaderCircle className="size-4 shrink-0 animate-spin text-muted-foreground" /> : null}
          </div>

          {props.sourceHistory.length === 0 ? (
            <div className="rounded-xl border border-dashed border-border/70 bg-muted/15 px-3 py-3">
              <p className="text-sm text-muted-foreground">Initial commit</p>
            </div>
          ) : (
            <div className="space-y-0">
              {props.sourceHistory.map((item, index) => (
                <SourceControlHistoryRow
                  key={`${item.hash}:${item.subject}`}
                  item={item}
                  isLast={index === props.sourceHistory.length - 1}
                />
              ))}
            </div>
          )}
        </div>
      </TabsContent>
    </Tabs>
  );
}
