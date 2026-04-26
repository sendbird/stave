import {
  Check,
  ChevronDown,
  ChevronRight,
  Crown,
  Focus,
  Gavel,
  LayoutGrid,
  Maximize2,
  Minus,
  PlusCircle,
  Swords,
  Trash2,
  Trophy,
  Undo2,
  X,
} from "lucide-react";
import { Fragment, memo, useEffect, useMemo, useRef, useState } from "react";
import { useShallow } from "zustand/react/shallow";
import {
  Badge,
  Button,
  ResizableHandle,
  ResizablePanel,
  ResizablePanelGroup,
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
  WaveIndicator,
} from "@/components/ui";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Message, MessageContent, ModelIcon } from "@/components/ai-elements";
import {
  getLatestRenderableAssistantMessage,
  getMessageScrollFingerprint,
} from "@/components/session/chat-panel.utils";
import { AssistantMessageBody } from "@/components/session/message/assistant-trace";
import { ColiseumReviewerDialog } from "@/components/session/ColiseumReviewerDialog";
import {
  getProviderLabel,
  getProviderWaveToneClass,
  toHumanModelName,
} from "@/lib/providers/model-catalog";
import type { ProviderId } from "@/lib/providers/provider.types";
import { cn } from "@/lib/utils";
import { useAppStore } from "@/store/app.store";
import type {
  ChatMessage,
  ColiseumBranchMeta,
  ColiseumGroupState,
} from "@/types/chat";

/**
 * Coliseum arena — the multi-model comparison surface.
 *
 * Key UX goals (v2):
 * - Models are clearly identified from the start (header reads from
 *   `group.branchMeta`, not the first assistant message which streams in
 *   lazily).
 * - Parent conversation is hidden by default; only the branch's own turn is
 *   shown so side-by-side comparison is easy.
 * - Each branch shows a per-branch file-change summary so the user can tell
 *   what each model actually did.
 * - Pick is non-destructive — branches stay alive so the user can re-pick,
 *   compare further, or discard explicitly.
 * - A grid/focus toggle lets the user zoom into a single branch without
 *   losing the others, and a minimize button steps out to the chat without
 *   destroying anything.
 */

const EMPTY_MESSAGES: ChatMessage[] = [];

interface ColiseumArenaPanelProps {
  parentTaskId: string;
}

export const ColiseumArenaPanel = memo(ColiseumArenaPanelImpl);

function ColiseumArenaPanelImpl(args: ColiseumArenaPanelProps) {
  const [
    group,
    runningBranches,
    championTaskId,
    hasReviewerVerdict,
    reviewerRunning,
    reviewerDefaultProvider,
    reviewerDefaultModel,
    pickColiseumChampion,
    unpickColiseumChampion,
    setColiseumViewMode,
    minimizeColiseum,
    discardColiseumRun,
    enqueueParentFollowUp,
  ] = useAppStore(
    useShallow((state) => {
      const grp = state.activeColiseumsByTask[args.parentTaskId];
      const runningCount = grp
        ? grp.branchTaskIds.reduce(
            (count, branchId) =>
              count + (state.activeTurnIdsByTask[branchId] ? 1 : 0),
            0,
          )
        : 0;
      // Seed reviewer defaults from the parent task so the picker opens to a
      // sensible starting provider/model without the user having to re-pick.
      const parentTask = state.tasks.find((t) => t.id === args.parentTaskId);
      const parentDraft = state.promptDraftByTask[args.parentTaskId];
      const reviewerProvider: ProviderId =
        (parentTask?.provider as ProviderId | undefined) ?? "claude-code";
      const reviewerModel = parentDraft?.runtimeOverrides?.model ?? "";
      return [
        grp,
        runningCount,
        grp?.championTaskId ?? null,
        Boolean(grp?.reviewerVerdict),
        grp?.reviewerVerdict?.status === "running",
        reviewerProvider,
        reviewerModel,
        state.pickColiseumChampion,
        state.unpickColiseumChampion,
        state.setColiseumViewMode,
        state.minimizeColiseum,
        state.discardColiseumRun,
        state.enqueueColiseumIncorporateFollowUp,
      ] as const;
    }),
  );

  const [reviewerDialogOpen, setReviewerDialogOpen] = useState(false);

  if (!group) {
    return null;
  }

  const totalBranches = group.branchTaskIds.length;
  const completedBranches = totalBranches - runningBranches;
  const anyComplete = completedBranches > 0;
  const allComplete = runningBranches === 0;

  const viewMode = group.viewMode;
  const focusedBranchId =
    viewMode === "focus"
      ? (group.focusedBranchTaskId ??
        group.championTaskId ??
        group.branchTaskIds[0] ??
        null)
      : null;

  const headerStatusLabel = allComplete
    ? championTaskId
      ? "Champion picked"
      : "All branches complete"
    : `${completedBranches}/${totalBranches} complete · ${runningBranches} running`;

  const canOpenReviewer = anyComplete || hasReviewerVerdict || reviewerRunning;

  // Branches available as "Use ideas from…" targets — everything that
  // isn't the champion and has produced at least one assistant message is a
  // candidate. Filtering here keeps the dropdown lean.
  const incorporateCandidates = group.branchTaskIds.filter(
    (branchId) => branchId !== championTaskId,
  );

  const handleToggleView = () => {
    setColiseumViewMode({
      parentTaskId: args.parentTaskId,
      viewMode: viewMode === "grid" ? "focus" : "grid",
    });
  };

  // "Exit" = close + discard merged into one status-aware action so the user
  // can start a follow-up Coliseum on the same task immediately afterwards.
  //
  // Three distinct UX states:
  // - `championTaskId` set → "Finish arena" (non-destructive). The champion's
  //   answer is already grafted onto the parent, so closing is lossless. No
  //   confirm — one click commits the run and unblocks the launcher.
  // - No champion, but branches are still running → "Discard run" with
  //   confirm that flags the abort cost.
  // - No champion, all branches ready → "Discard run" with a softer confirm;
  //   none of the branches' work has been committed yet.
  const isClose = Boolean(championTaskId);
  const handleExit = () => {
    if (!isClose) {
      const confirmMessage =
        runningBranches > 0
          ? `Discard Coliseum? ${runningBranches} branch(es) are still running and will be aborted.`
          : `Discard Coliseum? No champion was picked — every branch will be dropped.`;
      const ok = window.confirm(confirmMessage);
      if (!ok) return;
    }
    discardColiseumRun({ parentTaskId: args.parentTaskId });
  };

  return (
    <div className="flex h-full min-h-0 w-full flex-col bg-background">
      <header className="flex h-11 shrink-0 items-center justify-between gap-2 border-b border-border/80 bg-card px-3 text-sm">
        <div className="flex min-w-0 items-center gap-2">
          <Swords className="size-4 shrink-0 text-muted-foreground" />
          <span className="truncate font-medium text-foreground">
            Coliseum · {totalBranches} entrants
          </span>
          <Badge
            variant="secondary"
            className="shrink-0 rounded-sm text-[10px] uppercase tracking-[0.14em]"
          >
            {championTaskId
              ? "Promoted"
              : runningBranches > 0
                ? "Running"
                : "Ready"}
          </Badge>
          <span className="shrink-0 text-xs text-muted-foreground">
            {headerStatusLabel}
          </span>
        </div>
        <div className="flex shrink-0 items-center gap-1.5">
          <TooltipProvider delayDuration={200}>
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  className="h-7 gap-1.5 rounded-sm px-2 text-xs shadow-none"
                  onClick={handleToggleView}
                  aria-pressed={viewMode === "focus"}
                >
                  {viewMode === "grid" ? (
                    <>
                      <Focus className="size-3.5" /> Focus
                    </>
                  ) : (
                    <>
                      <LayoutGrid className="size-3.5" /> Grid
                    </>
                  )}
                </Button>
              </TooltipTrigger>
              <TooltipContent side="bottom" className="max-w-xs text-xs">
                {viewMode === "grid"
                  ? "Focus on one branch at a time. Others collapse into a rail."
                  : "Back to the grid — all branches side-by-side."}
              </TooltipContent>
            </Tooltip>
          </TooltipProvider>
          {championTaskId ? (
            <TooltipProvider delayDuration={200}>
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    className="h-7 gap-1.5 rounded-sm px-2 text-xs shadow-none"
                    onClick={() =>
                      unpickColiseumChampion({
                        parentTaskId: args.parentTaskId,
                      })
                    }
                  >
                    <Undo2 className="size-3.5" />
                    Unpick
                  </Button>
                </TooltipTrigger>
                <TooltipContent side="bottom" className="max-w-xs text-xs">
                  Roll the parent conversation back to pre-fan-out so you can
                  re-pick a different branch.
                </TooltipContent>
              </Tooltip>
            </TooltipProvider>
          ) : null}
          {championTaskId && incorporateCandidates.length > 0 ? (
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  className="h-7 gap-1.5 rounded-sm px-2 text-xs shadow-none"
                >
                  <PlusCircle className="size-3.5" />
                  Use ideas from
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="min-w-[220px]">
                <DropdownMenuLabel className="text-[10px] uppercase tracking-[0.14em] text-muted-foreground">
                  Bring in ideas from…
                </DropdownMenuLabel>
                <DropdownMenuSeparator />
                {incorporateCandidates.map((branchId) => {
                  const meta = group.branchMeta[branchId];
                  return (
                    <DropdownMenuItem
                      key={branchId}
                      onSelect={() =>
                        enqueueParentFollowUp({
                          parentTaskId: args.parentTaskId,
                          branchTaskId: branchId,
                        })
                      }
                      className="flex items-center gap-2 text-xs"
                    >
                      <ModelIcon
                        providerId={meta?.provider ?? "stave"}
                        model={meta?.model}
                        className="size-3.5"
                      />
                      <span className="flex-1 truncate">
                        {displayBranchName(meta)}
                      </span>
                    </DropdownMenuItem>
                  );
                })}
              </DropdownMenuContent>
            </DropdownMenu>
          ) : null}
          <TooltipProvider delayDuration={200}>
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  className="h-7 gap-1.5 rounded-sm px-2 text-xs shadow-none"
                  disabled={!canOpenReviewer}
                  onClick={() => setReviewerDialogOpen(true)}
                >
                  <Gavel className="size-3.5" />
                  {reviewerRunning
                    ? "Review running…"
                    : hasReviewerVerdict
                      ? "Open review"
                      : "Review & compare"}
                </Button>
              </TooltipTrigger>
              <TooltipContent side="bottom" className="max-w-xs text-xs">
                {!anyComplete
                  ? "Waiting for at least one branch to finish before review."
                  : reviewerRunning
                    ? "Open the live review dialog to watch the reviewer compare branches."
                    : hasReviewerVerdict
                      ? "Open the latest review, compare branches, and pick a champion from there."
                      : "Launch a reviewer model that compares every branch's answer and produces a verdict."}
              </TooltipContent>
            </Tooltip>
          </TooltipProvider>
          <TooltipProvider delayDuration={200}>
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  type="button"
                  size="sm"
                  variant="ghost"
                  className="h-7 gap-1.5 rounded-sm px-2 text-xs shadow-none"
                  onClick={() =>
                    minimizeColiseum({ parentTaskId: args.parentTaskId })
                  }
                >
                  <Minus className="size-3.5" />
                  Minimize
                </Button>
              </TooltipTrigger>
              <TooltipContent side="bottom" className="max-w-xs text-xs">
                Return to chat without ending the Coliseum. Branches keep
                running; you can reopen the arena from the pill above the
                composer.
              </TooltipContent>
            </Tooltip>
          </TooltipProvider>
          <TooltipProvider delayDuration={200}>
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  type="button"
                  size="sm"
                  variant={isClose ? "default" : "ghost"}
                  className={cn(
                    "h-7 gap-1.5 rounded-sm px-2 text-xs shadow-none",
                    !isClose && "text-destructive hover:text-destructive",
                  )}
                  onClick={handleExit}
                >
                  {isClose ? (
                    <>
                      <Check className="size-3.5" />
                      Finish arena
                    </>
                  ) : (
                    <>
                      <Trash2 className="size-3.5" />
                      Discard run
                    </>
                  )}
                </Button>
              </TooltipTrigger>
              <TooltipContent side="bottom" className="max-w-xs text-xs">
                {isClose
                  ? "Keep the picked champion on the parent task and leave the arena. You can start a new Coliseum right after."
                  : "Drop every branch and the arena. Nothing has been grafted onto the parent conversation, so this cannot be undone."}
              </TooltipContent>
            </Tooltip>
          </TooltipProvider>
        </div>
      </header>

      {viewMode === "focus" && focusedBranchId ? (
        <ArenaFocusLayout
          parentTaskId={args.parentTaskId}
          focusedBranchId={focusedBranchId}
          group={group}
          anyComplete={anyComplete}
          allComplete={allComplete}
          championTaskId={championTaskId}
          showFocusButton={false}
          onPick={(branchId) =>
            pickColiseumChampion({
              parentTaskId: args.parentTaskId,
              championTaskId: branchId,
            })
          }
          onFocus={(branchId) =>
            setColiseumViewMode({
              parentTaskId: args.parentTaskId,
              viewMode: "focus",
              focusedBranchTaskId: branchId,
            })
          }
        />
      ) : (
        <ArenaGridLayout
          parentTaskId={args.parentTaskId}
          group={group}
          anyComplete={anyComplete}
          allComplete={allComplete}
          championTaskId={championTaskId}
          showFocusButton
          onPick={(branchId) =>
            pickColiseumChampion({
              parentTaskId: args.parentTaskId,
              championTaskId: branchId,
            })
          }
          onFocus={(branchId) =>
            setColiseumViewMode({
              parentTaskId: args.parentTaskId,
              viewMode: "focus",
              focusedBranchTaskId: branchId,
            })
          }
        />
      )}
      <ColiseumReviewerDialog
        parentTaskId={args.parentTaskId}
        open={reviewerDialogOpen}
        onOpenChange={setReviewerDialogOpen}
        defaultProvider={reviewerDefaultProvider}
        defaultModel={reviewerDefaultModel || undefined}
      />
    </div>
  );
}

interface ArenaLayoutProps {
  parentTaskId: string;
  group: ColiseumGroupState;
  anyComplete: boolean;
  allComplete: boolean;
  championTaskId: string | null;
  showFocusButton: boolean;
  onPick: (branchId: string) => void;
  onFocus: (branchId: string) => void;
}

function ArenaGridLayout(props: ArenaLayoutProps) {
  const {
    parentTaskId,
    group,
    anyComplete,
    allComplete,
    championTaskId,
    showFocusButton,
    onPick,
    onFocus,
  } = props;
  return (
    <div className="min-h-0 flex-1">
      <ResizablePanelGroup orientation="horizontal" className="h-full w-full">
        {group.branchTaskIds.map((branchTaskId, index) => {
          const isLast = index === group.branchTaskIds.length - 1;
          return (
            <Fragment key={branchTaskId}>
              <ResizablePanel
                defaultSize={100 / group.branchTaskIds.length}
                minSize={15}
                className="flex min-w-0 flex-col"
              >
                <ColiseumBranchColumn
                  parentTaskId={parentTaskId}
                  branchTaskId={branchTaskId}
                  branchMeta={group.branchMeta[branchTaskId]}
                  index={index}
                  totalBranches={group.branchTaskIds.length}
                  parentMessageCountAtFanout={group.parentMessageCountAtFanout}
                  isChampion={championTaskId === branchTaskId}
                  anyBranchComplete={anyComplete}
                  allBranchesComplete={allComplete}
                  showFocusButton={showFocusButton}
                  onPick={() => onPick(branchTaskId)}
                  onFocus={() => onFocus(branchTaskId)}
                />
              </ResizablePanel>
              {!isLast ? (
                <ResizableHandle withHandle={false} className="bg-border/80" />
              ) : null}
            </Fragment>
          );
        })}
      </ResizablePanelGroup>
    </div>
  );
}

function ArenaFocusLayout(
  props: ArenaLayoutProps & { focusedBranchId: string },
) {
  const {
    parentTaskId,
    group,
    anyComplete,
    allComplete,
    championTaskId,
    showFocusButton,
    onPick,
    onFocus,
    focusedBranchId,
  } = props;
  const focusedIndex = group.branchTaskIds.indexOf(focusedBranchId);
  const otherBranchIds = group.branchTaskIds.filter(
    (id) => id !== focusedBranchId,
  );
  return (
    <div className="flex min-h-0 flex-1">
      {/* Rail of non-focused branches on the left. */}
      <aside className="flex w-48 shrink-0 flex-col gap-1.5 overflow-y-auto border-r border-border/70 bg-muted/20 p-2">
        <div className="px-1 text-[10px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">
          Other branches
        </div>
        {otherBranchIds.map((branchId, i) => {
          const meta = group.branchMeta[branchId];
          const isChamp = championTaskId === branchId;
          const idx = group.branchTaskIds.indexOf(branchId);
          return (
            <ColiseumBranchRailButton
              key={branchId}
              branchId={branchId}
              branchMeta={meta}
              index={idx >= 0 ? idx : i}
              isChampion={isChamp}
              onClick={() => onFocus(branchId)}
            />
          );
        })}
      </aside>
      <div className="min-w-0 flex-1">
        <ColiseumBranchColumn
          parentTaskId={parentTaskId}
          branchTaskId={focusedBranchId}
          branchMeta={group.branchMeta[focusedBranchId]}
          index={focusedIndex >= 0 ? focusedIndex : 0}
          totalBranches={group.branchTaskIds.length}
          parentMessageCountAtFanout={group.parentMessageCountAtFanout}
          isChampion={championTaskId === focusedBranchId}
          anyBranchComplete={anyComplete}
          allBranchesComplete={allComplete}
          showFocusButton={showFocusButton}
          onPick={() => onPick(focusedBranchId)}
          onFocus={() => onFocus(focusedBranchId)}
        />
      </div>
    </div>
  );
}

interface ColiseumBranchColumnProps {
  parentTaskId: string;
  branchTaskId: string;
  branchMeta: ColiseumBranchMeta | undefined;
  index: number;
  totalBranches: number;
  parentMessageCountAtFanout: number;
  isChampion: boolean;
  anyBranchComplete: boolean;
  allBranchesComplete: boolean;
  showFocusButton: boolean;
  onPick: () => void;
  onFocus: () => void;
}

interface ColiseumBranchRailButtonProps {
  branchId: string;
  branchMeta: ColiseumBranchMeta | undefined;
  index: number;
  isChampion: boolean;
  onClick: () => void;
}

const ColiseumBranchRailButton = memo(function ColiseumBranchRailButtonImpl(
  props: ColiseumBranchRailButtonProps,
) {
  const isRunning = useAppStore((state) =>
    Boolean(state.activeTurnIdsByTask[props.branchId]),
  );

  return (
    <button
      type="button"
      onClick={props.onClick}
      className={cn(
        "flex flex-col gap-0.5 rounded-md border border-border/60 bg-background/70 px-2 py-1.5 text-left text-xs transition hover:border-primary/50 hover:bg-background",
        props.isChampion && "border-primary/60",
      )}
    >
      <div className="flex items-center gap-1.5">
        <ModelIcon
          providerId={props.branchMeta?.provider ?? "stave"}
          model={props.branchMeta?.model}
          className="size-3"
        />
        <span className="min-w-0 truncate font-medium text-foreground">
          {displayBranchName(props.branchMeta)}
        </span>
        {props.isChampion ? (
          <Crown className="size-3 shrink-0 text-amber-500" />
        ) : null}
      </div>
      <div className="flex items-center gap-1.5 text-[10px] text-muted-foreground">
        <span>#{props.index + 1}</span>
        <span>·</span>
        <span className={isRunning ? "text-primary" : undefined}>
          {isRunning ? "streaming" : "done"}
        </span>
      </div>
    </button>
  );
});

function ColiseumBranchColumn(args: ColiseumBranchColumnProps) {
  const [
    isRunning,
    messages,
    chatStreamingEnabled,
    showInterimMessages,
    closeColiseumBranch,
  ] = useAppStore(
    useShallow((state) => {
      return [
        Boolean(state.activeTurnIdsByTask[args.branchTaskId]),
        state.messagesByTask[args.branchTaskId] ?? EMPTY_MESSAGES,
        state.settings.chatStreamingEnabled,
        state.settings.showInterimMessages,
        state.closeColiseumBranch,
      ] as const;
    }),
  );

  const [priorOpen, setPriorOpen] = useState(false);
  const [fileChangesOpen, setFileChangesOpen] = useState(false);

  // Header provider/model comes from the authoritative `branchMeta` record
  // (seeded at fan-out), not from the first assistant message. Falls back to
  // the provider label only if metadata is somehow missing.
  const headerProvider: ProviderId = args.branchMeta?.provider ?? "stave";
  const headerModel = args.branchMeta?.model ?? "";

  const priorMessages = useMemo(
    () => messages.slice(0, args.parentMessageCountAtFanout),
    [messages, args.parentMessageCountAtFanout],
  );
  const branchMessages = useMemo(
    () => messages.slice(args.parentMessageCountAtFanout),
    [messages, args.parentMessageCountAtFanout],
  );
  const branchUser = useMemo(
    () => branchMessages.find((msg) => msg.role === "user"),
    [branchMessages],
  );
  const branchAssistants = useMemo(
    () => branchMessages.filter((msg) => msg.role === "assistant"),
    [branchMessages],
  );
  const hasAnyCompletedAssistant = branchAssistants.some((m) => !m.isStreaming);
  const canPromote = hasAnyCompletedAssistant || !isRunning;
  const latestAssistant = useMemo(
    () => getLatestRenderableAssistantMessage(branchAssistants),
    [branchAssistants],
  );

  const fileChanges = useMemo(
    () => extractBranchFileChanges(branchMessages),
    [branchMessages],
  );
  const latestAssistantScrollFingerprint = useMemo(
    () => getMessageScrollFingerprint(latestAssistant ?? undefined),
    [latestAssistant],
  );
  const scrollContainerRef = useRef<HTMLDivElement | null>(null);
  const shouldStickToBottomRef = useRef(true);

  useEffect(() => {
    const container = scrollContainerRef.current;
    if (!container) {
      return;
    }
    if (!isRunning && !shouldStickToBottomRef.current) {
      return;
    }
    container.scrollTop = container.scrollHeight;
  }, [isRunning, latestAssistantScrollFingerprint]);

  return (
    <div className="flex h-full min-h-0 flex-col">
      <header className="flex shrink-0 flex-col gap-1.5 border-b border-border/60 bg-card/80 px-3 py-2 text-xs">
        <div className="flex min-w-0 items-center gap-2">
          <ModelIcon
            providerId={headerProvider}
            model={headerModel || undefined}
            className="size-3.5"
          />
          <span className="min-w-0 truncate font-medium text-foreground">
            {headerModel
              ? toHumanModelName({ model: headerModel })
              : getProviderLabel({
                  providerId: headerProvider,
                  variant: "full",
                })}
          </span>
          <span className="text-[10px] uppercase tracking-[0.14em] text-muted-foreground">
            {getProviderLabel({ providerId: headerProvider, variant: "short" })}
          </span>
          {isRunning ? (
            <WaveIndicator
              className={cn(
                "size-3",
                getProviderWaveToneClass({
                  providerId: headerProvider,
                  model: headerModel || undefined,
                }),
              )}
              animate
            />
          ) : null}
          {args.isChampion ? (
            <Badge
              variant="secondary"
              className="shrink-0 gap-1 rounded-sm border-amber-500/40 bg-amber-500/15 text-[10px] uppercase tracking-[0.14em] text-amber-600"
            >
              <Crown className="size-3" />
              Current
            </Badge>
          ) : null}
          <span className="ml-auto shrink-0 text-[10px] uppercase tracking-[0.14em] text-muted-foreground">
            {args.index + 1} / {args.totalBranches}
          </span>
        </div>
        <div className="flex items-center gap-1.5">
          <TooltipProvider delayDuration={200}>
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  type="button"
                  size="sm"
                  variant={args.isChampion ? "outline" : "default"}
                  className="h-7 flex-1 gap-1.5 rounded-sm px-2 text-xs shadow-none"
                  disabled={!canPromote || args.isChampion}
                  onClick={args.onPick}
                >
                  <Crown className="size-3.5" />
                  {args.isChampion
                    ? "Current champion"
                    : !args.anyBranchComplete
                      ? "Waiting for a response…"
                      : args.allBranchesComplete
                        ? "Pick champion"
                        : "Pick now (others still running)"}
                </Button>
              </TooltipTrigger>
              <TooltipContent side="bottom" className="max-w-xs text-xs">
                {args.isChampion
                  ? "This branch is already the champion. Use Unpick in the header to re-pick."
                  : "Promote this branch's answer into the main conversation. Branches stay alive so you can re-pick at any time."}
              </TooltipContent>
            </Tooltip>
          </TooltipProvider>
          {args.showFocusButton ? (
            <TooltipProvider delayDuration={200}>
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button
                    type="button"
                    size="icon-sm"
                    variant="ghost"
                    aria-label="Focus this branch"
                    onClick={args.onFocus}
                  >
                    <Maximize2 className="size-3.5" />
                  </Button>
                </TooltipTrigger>
                <TooltipContent side="bottom" className="max-w-xs text-xs">
                  Focus on this branch. Others collapse into a rail.
                </TooltipContent>
              </Tooltip>
            </TooltipProvider>
          ) : null}
          <TooltipProvider delayDuration={200}>
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  type="button"
                  size="icon-sm"
                  variant="ghost"
                  aria-label="Close this branch"
                  onClick={() =>
                    closeColiseumBranch({ branchTaskId: args.branchTaskId })
                  }
                >
                  <X className="size-3.5" />
                </Button>
              </TooltipTrigger>
              <TooltipContent side="bottom" className="max-w-xs text-xs">
                Close this branch. The remaining branches continue.
              </TooltipContent>
            </Tooltip>
          </TooltipProvider>
        </div>
      </header>

      <div
        ref={scrollContainerRef}
        className="min-h-0 flex-1 overflow-y-auto px-3 py-3"
        onScroll={(event) => {
          const container = event.currentTarget;
          shouldStickToBottomRef.current =
            container.scrollHeight -
              container.scrollTop -
              container.clientHeight <
            48;
        }}
      >
        {priorMessages.length > 0 ? (
          <button
            type="button"
            onClick={() => setPriorOpen((v) => !v)}
            className="mb-2 flex w-full items-center gap-1.5 rounded-md border border-dashed border-border/60 px-2 py-1 text-left text-[11px] text-muted-foreground transition hover:border-border hover:bg-muted/40"
          >
            {priorOpen ? (
              <ChevronDown className="size-3" />
            ) : (
              <ChevronRight className="size-3" />
            )}
            <span>
              Prior conversation · {priorMessages.length} message
              {priorMessages.length === 1 ? "" : "s"}
            </span>
            <span className="ml-auto text-[10px] uppercase tracking-[0.14em]">
              {priorOpen ? "Hide" : "Show"}
            </span>
          </button>
        ) : null}
        {priorOpen ? (
          <div className="mb-3 flex flex-col gap-2 rounded-md border border-border/60 bg-muted/30 p-2 text-xs">
            {priorMessages.map((msg) => (
              <div key={msg.id} className="flex flex-col gap-1">
                <div className="text-[10px] uppercase tracking-[0.14em] text-muted-foreground">
                  {msg.role === "user" ? "You" : "Assistant"}
                </div>
                <div className="whitespace-pre-wrap break-words text-foreground/90">
                  {msg.content || "(empty)"}
                </div>
              </div>
            ))}
          </div>
        ) : null}

        {branchUser ? (
          <div className="mb-3 rounded-md border border-border/60 bg-muted/40 px-2.5 py-2 text-xs text-foreground">
            <div className="mb-1 text-[10px] uppercase tracking-[0.14em] text-muted-foreground">
              Prompt
            </div>
            <div className="whitespace-pre-wrap break-words">
              {branchUser.content || "(empty)"}
            </div>
          </div>
        ) : null}

        {fileChanges.length > 0 ? (
          <div className="mb-3 rounded-md border border-border/60 bg-muted/20 text-xs">
            <button
              type="button"
              onClick={() => setFileChangesOpen((v) => !v)}
              className="flex w-full items-center gap-1.5 px-2.5 py-1.5 text-left"
            >
              {fileChangesOpen ? (
                <ChevronDown className="size-3" />
              ) : (
                <ChevronRight className="size-3" />
              )}
              <span className="font-medium text-foreground">
                File changes · {fileChanges.length}
              </span>
              <span className="ml-auto text-[10px] uppercase tracking-[0.14em] text-muted-foreground">
                {fileChangesOpen ? "Hide" : "Show"}
              </span>
            </button>
            {fileChangesOpen ? (
              <ul className="flex flex-col gap-0.5 border-t border-border/50 px-2.5 py-1.5 text-[11px] text-foreground/80">
                {fileChanges.map((fc) => (
                  <li
                    key={fc.filePath}
                    className="flex items-center justify-between gap-2"
                  >
                    <span className="truncate font-mono">{fc.filePath}</span>
                    <span className="shrink-0 text-[10px] uppercase tracking-[0.14em] text-muted-foreground">
                      {fc.actions.join(", ")} · {fc.count}
                    </span>
                  </li>
                ))}
              </ul>
            ) : null}
          </div>
        ) : null}

        {!latestAssistant ? (
          <div className="flex h-40 items-center justify-center text-xs text-muted-foreground">
            <div className="flex items-center gap-2">
              <Trophy className="size-3.5" />
              {isRunning
                ? "Waiting for response…"
                : fileChanges.length > 0
                  ? "Completed without a text reply. Review the file changes above."
                  : "No response captured"}
            </div>
          </div>
        ) : (
          <div className="flex flex-col gap-3">
            <div className="text-[10px] uppercase tracking-[0.14em] text-muted-foreground">
              {latestAssistant.isStreaming ? "Live output" : "Latest answer"}
            </div>
            <Message key={latestAssistant.id} from="assistant">
              <div className="flex w-full max-w-none flex-col gap-1.5">
                <MessageContent>
                  <AssistantMessageBody
                    message={latestAssistant}
                    taskId={args.branchTaskId}
                    messageId={latestAssistant.id}
                    streamingEnabled={chatStreamingEnabled}
                    showInterimMessages={showInterimMessages}
                    traceExpansionMode="auto"
                  />
                </MessageContent>
              </div>
            </Message>
          </div>
        )}
      </div>
    </div>
  );
}

function displayBranchName(meta: ColiseumBranchMeta | undefined): string {
  if (!meta) return "Branch";
  if (meta.model) return toHumanModelName({ model: meta.model });
  return getProviderLabel({ providerId: meta.provider, variant: "full" });
}

interface BranchFileChange {
  filePath: string;
  actions: string[];
  count: number;
}

/**
 * Extract a deduped list of files touched by a branch by scanning tool_use and
 * code_diff parts. Returns one entry per unique file path; `actions` collects
 * the tool names observed (Edit, Write, NotebookEdit, …) and `count` is the
 * number of occurrences — useful as a rough "activity" signal.
 */
function extractBranchFileChanges(messages: ChatMessage[]): BranchFileChange[] {
  const byPath = new Map<string, { actions: Set<string>; count: number }>();
  for (const message of messages) {
    if (message.role !== "assistant") continue;
    for (const part of message.parts) {
      if (part.type === "code_diff") {
        const entry = byPath.get(part.filePath) ?? {
          actions: new Set<string>(),
          count: 0,
        };
        entry.actions.add("diff");
        entry.count += 1;
        byPath.set(part.filePath, entry);
        continue;
      }
      if (part.type === "tool_use") {
        const filePath = extractFilePathFromToolInput(part.input);
        if (!filePath) continue;
        const entry = byPath.get(filePath) ?? {
          actions: new Set<string>(),
          count: 0,
        };
        entry.actions.add(part.toolName);
        entry.count += 1;
        byPath.set(filePath, entry);
      }
    }
  }
  return Array.from(byPath.entries())
    .map(([filePath, { actions, count }]) => ({
      filePath,
      actions: Array.from(actions),
      count,
    }))
    .sort((a, b) => a.filePath.localeCompare(b.filePath));
}

function extractFilePathFromToolInput(raw: string): string | null {
  // Tool inputs are stored as JSON strings. We only care about the common
  // write-tool shapes; anything else silently skips. Parse defensively — a
  // malformed input should not crash the arena.
  try {
    const parsed = JSON.parse(raw) as Record<string, unknown>;
    if (typeof parsed.file_path === "string") return parsed.file_path;
    if (typeof parsed.filePath === "string") return parsed.filePath;
    if (typeof parsed.notebook_path === "string") return parsed.notebook_path;
    if (typeof parsed.path === "string") return parsed.path;
  } catch {
    // Streaming inputs may be partial JSON; ignore.
  }
  return null;
}
