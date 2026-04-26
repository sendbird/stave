import { Crown, Gavel, Loader2 } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { useShallow } from "zustand/react/shallow";
import { Message, MessageContent, ModelIcon } from "@/components/ai-elements";
import { ProviderModelPicker } from "@/components/session/ProviderModelPicker";
import {
  getColiseumDefaultModelForProvider,
  resolveColiseumInitialModel,
} from "@/components/session/coliseum-launcher-dialog.utils";
import {
  getLatestRenderableAssistantMessage,
  getMessageScrollFingerprint,
} from "@/components/session/chat-panel.utils";
import { AssistantMessageBody } from "@/components/session/message/assistant-trace";
import { Button, toast } from "@/components/ui";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Badge } from "@/components/ui";
import {
  getProviderLabel,
  toHumanModelName,
} from "@/lib/providers/model-catalog";
import type { ProviderId } from "@/lib/providers/provider.types";
import { useAppStore } from "@/store/app.store";
import type { ChatMessage, ColiseumBranchMeta } from "@/types/chat";

const EMPTY_MESSAGES: ChatMessage[] = [];

interface ColiseumReviewerDialogProps {
  parentTaskId: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  defaultProvider?: ProviderId;
  defaultModel?: string;
}

export function ColiseumReviewerDialog(props: ColiseumReviewerDialogProps) {
  const [
    group,
    reviewerMessages,
    launchColiseumReviewer,
    clearColiseumReviewerVerdict,
    enqueueColiseumMergedFollowUp,
    providerAvailability,
    chatStreamingEnabled,
    showInterimMessages,
  ] = useAppStore(
    useShallow((state) => {
      const group = state.activeColiseumsByTask[props.parentTaskId] ?? null;
      const reviewerTaskId = group?.reviewerTaskId;
      return [
        group,
        reviewerTaskId
          ? state.messagesByTask[reviewerTaskId] ?? EMPTY_MESSAGES
          : EMPTY_MESSAGES,
        state.launchColiseumReviewer,
        state.clearColiseumReviewerVerdict,
        state.enqueueColiseumMergedFollowUp,
        state.providerAvailability,
        state.settings.chatStreamingEnabled,
        state.settings.showInterimMessages,
      ] as const;
    }),
  );

  const reviewerVerdict = group?.reviewerVerdict ?? null;
  const reviewerRunning = reviewerVerdict?.status === "running";
  const reviewerError = reviewerVerdict?.status === "error";
  const defaultProvider: ProviderId = props.defaultProvider ?? "claude-code";
  const defaultModel = resolveColiseumInitialModel({
    providerId: defaultProvider,
    preferredModel: props.defaultModel,
  });

  const [provider, setProvider] = useState<ProviderId>(defaultProvider);
  const [model, setModel] = useState<string>(defaultModel);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (!props.open) {
      return;
    }
    setProvider(defaultProvider);
    setModel(defaultModel);
  }, [defaultModel, defaultProvider, props.open]);

  const providerAvailable = providerAvailability[provider] !== false;
  const canSubmit =
    Boolean(group) && !submitting && !reviewerRunning && providerAvailable;
  const canDraftMergedAnswer =
    Boolean(group) && reviewerVerdict?.status === "complete";

  const latestReviewerAssistant = useMemo(
    () => getLatestRenderableAssistantMessage(reviewerMessages),
    [reviewerMessages],
  );
  const latestReviewerAssistantFingerprint = useMemo(
    () => getMessageScrollFingerprint(latestReviewerAssistant ?? undefined),
    [latestReviewerAssistant],
  );
  const scrollContainerRef = useRef<HTMLDivElement | null>(null);
  const shouldStickToBottomRef = useRef(true);

  useEffect(() => {
    const container = scrollContainerRef.current;
    if (!container) {
      return;
    }
    if (!reviewerRunning && !shouldStickToBottomRef.current) {
      return;
    }
    container.scrollTop = container.scrollHeight;
  }, [latestReviewerAssistantFingerprint, reviewerRunning]);

  const confirmLabel = useMemo(() => {
    if (submitting) {
      return reviewerVerdict ? "Re-running…" : "Starting…";
    }
    if (reviewerRunning) {
      return "Review running…";
    }
    return reviewerVerdict ? "Re-run review" : "Start review";
  }, [reviewerRunning, reviewerVerdict, submitting]);

  const handleSubmit = async () => {
    if (!canSubmit) {
      return;
    }
    setSubmitting(true);
    try {
      const result = await launchColiseumReviewer({
        parentTaskId: props.parentTaskId,
        reviewerProvider: provider,
        reviewerModel: model,
      });
      if (result.status === "started") {
        toast.success("Reviewer is comparing the branches…");
      } else {
        toast.error(result.reason);
      }
    } catch (error) {
      toast.error(
        `Failed to start reviewer: ${error instanceof Error ? error.message : String(error)}`,
      );
    } finally {
      setSubmitting(false);
    }
  };

  const title = reviewerRunning
    ? "Review running…"
    : reviewerVerdict
      ? "Arena review"
      : "Review & compare";

  const handleDraftMergedAnswer = () => {
    if (!canDraftMergedAnswer) {
      return;
    }
    enqueueColiseumMergedFollowUp({ parentTaskId: props.parentTaskId });
    toast.success("Merged answer draft was added to the parent task.");
    props.onOpenChange(false);
  };

  return (
    <Dialog
      open={props.open}
      onOpenChange={(next) => {
        if (submitting) {
          return;
        }
        props.onOpenChange(next);
      }}
    >
      <DialogContent className="flex max-h-[85vh] flex-col overflow-hidden sm:max-w-5xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            {reviewerRunning ? (
              <Loader2 className="size-4 animate-spin" />
            ) : (
              <Gavel className="size-4" />
            )}
            {title}
          </DialogTitle>
          <DialogDescription>
            Reviewer output streams here like a normal turn. Use it to compare
            the branches, then pick a champion without leaving the dialog.
          </DialogDescription>
        </DialogHeader>

        <div className="flex min-h-0 flex-1 flex-col gap-3">
          {group ? (
            <div className="flex flex-wrap items-center gap-2 rounded-md border border-border/70 bg-muted/20 px-3 py-2 text-xs">
              <Badge
                variant="secondary"
                className="rounded-sm text-[10px] uppercase tracking-[0.14em]"
              >
                {group.branchTaskIds.length} branches
              </Badge>
              {reviewerVerdict ? (
                <Badge
                  variant="secondary"
                  className="gap-1 rounded-sm text-[10px] uppercase tracking-[0.14em]"
                >
                  <ModelIcon
                    providerId={reviewerVerdict.providerId}
                    model={reviewerVerdict.model}
                    className="size-3"
                  />
                  {toHumanModelName({ model: reviewerVerdict.model })}
                </Badge>
              ) : null}
              {group.championTaskId ? (
                <div className="flex items-center gap-1.5 text-[11px] text-muted-foreground">
                  <Crown className="size-3 text-amber-500" />
                  <span>
                    Current champion:{" "}
                    {displayBranchName(group.branchMeta[group.championTaskId])}
                  </span>
                </div>
              ) : null}
            </div>
          ) : (
            <div className="rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2 text-sm text-destructive">
              Coliseum arena not found.
            </div>
          )}

          {reviewerError ? (
            <div className="rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2 text-sm text-destructive">
              {reviewerVerdict?.errorMessage ?? "Reviewer failed."}
            </div>
          ) : null}

          <div
            ref={scrollContainerRef}
            className="min-h-0 flex-1 overflow-y-auto rounded-md border border-border/70 bg-background/70 px-3 py-3"
            onScroll={(event) => {
              const container = event.currentTarget;
              shouldStickToBottomRef.current =
                container.scrollHeight - container.scrollTop - container.clientHeight < 48;
            }}
          >
            {!latestReviewerAssistant ? (
              <div className="flex h-full min-h-40 items-center justify-center text-sm text-muted-foreground">
                {reviewerRunning
                  ? "Waiting for the reviewer to respond…"
                  : "Start a review to compare the branches here."}
              </div>
            ) : (
              <Message from="assistant">
                <div className="flex w-full max-w-none flex-col gap-2">
                  <div className="text-[10px] uppercase tracking-[0.14em] text-muted-foreground">
                    {latestReviewerAssistant.isStreaming
                      ? "Live review"
                      : "Latest review"}
                  </div>
                  <MessageContent>
                    <AssistantMessageBody
                      message={latestReviewerAssistant}
                      taskId={group?.reviewerTaskId ?? props.parentTaskId}
                      messageId={latestReviewerAssistant.id}
                      streamingEnabled={chatStreamingEnabled}
                      showInterimMessages={showInterimMessages}
                      traceExpansionMode="auto"
                    />
                  </MessageContent>
                </div>
              </Message>
            )}
          </div>

          {group ? (
            <div className="flex flex-col gap-3 rounded-md border border-border/70 bg-card/70 p-3">
              <div className="flex flex-col gap-2">
                <div className="text-[11px] font-medium text-foreground">
                  Pick a champion from the review
                </div>
                <div className="flex flex-wrap gap-2">
                  {group.branchTaskIds.map((branchTaskId) => (
                    <ReviewerChampionButton
                      key={branchTaskId}
                      parentTaskId={props.parentTaskId}
                      branchTaskId={branchTaskId}
                      branchMeta={group.branchMeta[branchTaskId]}
                      parentMessageCountAtFanout={group.parentMessageCountAtFanout}
                      isChampion={group.championTaskId === branchTaskId}
                    />
                  ))}
                </div>
              </div>

              {reviewerVerdict?.status === "complete" ? (
                <div className="flex flex-col gap-2 rounded-md border border-border/60 bg-background/60 p-2">
                  <div className="text-[11px] font-medium text-foreground">
                    Need a merged version?
                  </div>
                  <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                    <div className="text-xs text-muted-foreground">
                      Draft a merged follow-up on the parent task using this
                      review plus the branch outputs.
                    </div>
                    <Button
                      type="button"
                      size="sm"
                      variant="outline"
                      className="h-8 shrink-0 gap-1.5 rounded-sm px-3 text-xs shadow-none"
                      onClick={handleDraftMergedAnswer}
                    >
                      Draft merged answer
                    </Button>
                  </div>
                </div>
              ) : null}

              <div className="flex flex-col gap-2 rounded-md border border-border/60 bg-muted/20 p-2">
                <div className="text-[11px] font-medium text-foreground">
                  {reviewerVerdict ? "Run another review" : "Reviewer model"}
                </div>
                <ProviderModelPicker
                  selectedProvider={provider}
                  selectedModel={model}
                  onProviderChange={(next) => {
                    setProvider(next);
                    setModel(
                      getColiseumDefaultModelForProvider({ providerId: next }),
                    );
                  }}
                  onModelChange={setModel}
                  providerAvailable={providerAvailable}
                />
                {!providerAvailable ? (
                  <div className="text-xs text-destructive">
                    This provider is unavailable. Check provider status and retry.
                  </div>
                ) : null}
              </div>
            </div>
          ) : null}
        </div>

        <DialogFooter>
          {reviewerVerdict ? (
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={() =>
                clearColiseumReviewerVerdict({
                  parentTaskId: props.parentTaskId,
                })
              }
            >
              Clear review
            </Button>
          ) : null}
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={() => props.onOpenChange(false)}
            disabled={submitting}
          >
            Close
          </Button>
          <Button
            type="button"
            size="sm"
            onClick={() => void handleSubmit()}
            disabled={!canSubmit}
          >
            {confirmLabel}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function ReviewerChampionButton(args: {
  parentTaskId: string;
  branchTaskId: string;
  branchMeta: ColiseumBranchMeta | undefined;
  parentMessageCountAtFanout: number;
  isChampion: boolean;
}) {
  const [fullMessages, isRunning, pickColiseumChampion] = useAppStore(
    useShallow((state) => [
      state.messagesByTask[args.branchTaskId] ?? EMPTY_MESSAGES,
      Boolean(state.activeTurnIdsByTask[args.branchTaskId]),
      state.pickColiseumChampion,
    ] as const),
  );

  const branchMessages = useMemo(
    () => fullMessages.slice(args.parentMessageCountAtFanout),
    [args.parentMessageCountAtFanout, fullMessages],
  );
  const latestAssistant = useMemo(
    () => getLatestRenderableAssistantMessage(branchMessages),
    [branchMessages],
  );
  const canPick = Boolean(latestAssistant) || !isRunning;

  return (
    <Button
      type="button"
      size="sm"
      variant={args.isChampion ? "default" : "outline"}
      className="h-8 gap-1.5 rounded-sm px-3 text-xs shadow-none"
      disabled={!canPick || args.isChampion}
      onClick={() =>
        pickColiseumChampion({
          parentTaskId: args.parentTaskId,
          championTaskId: args.branchTaskId,
        })
      }
    >
      <ModelIcon
        providerId={args.branchMeta?.provider ?? "stave"}
        model={args.branchMeta?.model}
        className="size-3.5"
      />
      <span className="max-w-44 truncate">
        {displayBranchName(args.branchMeta)}
      </span>
      {args.isChampion ? (
        <Crown className="size-3.5 text-amber-500" />
      ) : null}
    </Button>
  );
}

function displayBranchName(meta: ColiseumBranchMeta | undefined) {
  if (!meta) {
    return "Branch";
  }
  if (meta.model) {
    return toHumanModelName({ model: meta.model });
  }
  return getProviderLabel({ providerId: meta.provider, variant: "full" });
}
