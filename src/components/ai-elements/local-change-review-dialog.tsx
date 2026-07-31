import {
  Check,
  FileDiff,
  GitBranch,
  GitCompareArrows,
  LoaderCircle,
  LockKeyhole,
} from "lucide-react";
import { useId, useMemo, useRef, useState } from "react";
import { Button, Textarea } from "@/components/ui";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  hasSourceControlConflicts,
  hasSourceControlStagedChanges,
  hasSourceControlUnstagedChanges,
  isSourceControlUntracked,
  type SourceControlStatusItem,
} from "@/lib/source-control-status";
import {
  LOCAL_CHANGE_REVIEW_FOCUS_OPTIONS,
  type LocalChangeReviewFocus,
  type LocalChangeReviewScope,
} from "@/lib/local-change-review";
import {
  clampModelEffort,
  resolveModelEffortFromSettings,
  type ModelEffort,
} from "@/lib/providers/model-effort";
import { getProviderLabel } from "@/lib/providers/model-catalog";
import { cn } from "@/lib/utils";
import { useAppStore } from "@/store/app.store";
import { ModelIcon } from "./model-icon";
import { ModelSelector, type ModelSelectorOption } from "./model-selector";

const DEFAULT_REVIEW_FOCUSES: readonly LocalChangeReviewFocus[] = [
  "correctness",
  "tests",
];

const REVIEW_SCOPE_OPTIONS: ReadonlyArray<{
  value: LocalChangeReviewScope;
  label: string;
  description: string;
  icon: typeof FileDiff;
}> = [
  {
    value: "working-tree",
    label: "Uncommitted changes",
    description: "Staged, unstaged, and untracked files in this workspace.",
    icon: FileDiff,
  },
  {
    value: "branch",
    label: "Entire local branch",
    description: "Committed branch changes plus the current working tree.",
    icon: GitBranch,
  },
];

type ReviewChangeStatus =
  | { state: "idle" | "loading" }
  | { state: "ready"; branch: string; items: SourceControlStatusItem[] }
  | { state: "error"; detail: string };

export interface LocalChangeReviewRequest {
  reviewer: ModelSelectorOption;
  effort: ModelEffort;
  scope: LocalChangeReviewScope;
  focuses: readonly LocalChangeReviewFocus[];
  instructions?: string;
}

interface LocalChangeReviewDialogProps {
  disabled?: boolean;
  workspaceCwd?: string;
  reviewerOptions: readonly ModelSelectorOption[];
  preferredReviewerKey?: string;
  onSubmit: (request: LocalChangeReviewRequest) => boolean | Promise<boolean>;
}

function getPreferredReviewer(args: {
  reviewerOptions: readonly ModelSelectorOption[];
  preferredReviewerKey?: string;
}) {
  return (
    args.reviewerOptions.find(
      (option) => option.key === args.preferredReviewerKey,
    ) ?? args.reviewerOptions[0]
  );
}

function buildChangeSummary(items: readonly SourceControlStatusItem[]) {
  return items.reduce(
    (summary, item) => ({
      staged:
        summary.staged + (hasSourceControlStagedChanges({ item }) ? 1 : 0),
      unstaged:
        summary.unstaged + (hasSourceControlUnstagedChanges({ item }) ? 1 : 0),
      untracked:
        summary.untracked + (isSourceControlUntracked({ item }) ? 1 : 0),
      conflicts:
        summary.conflicts + (hasSourceControlConflicts({ item }) ? 1 : 0),
    }),
    { staged: 0, unstaged: 0, untracked: 0, conflicts: 0 },
  );
}

export function LocalChangeReviewDialog(args: LocalChangeReviewDialogProps) {
  const idPrefix = useId();
  const [open, setOpen] = useState(false);
  const [reviewerKey, setReviewerKey] = useState<string>();
  const [selectedEffort, setSelectedEffort] = useState<ModelEffort>();
  const [scope, setScope] = useState<LocalChangeReviewScope>("working-tree");
  const [focuses, setFocuses] = useState<readonly LocalChangeReviewFocus[]>(
    DEFAULT_REVIEW_FOCUSES,
  );
  const [instructions, setInstructions] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [changeStatus, setChangeStatus] = useState<ReviewChangeStatus>({
    state: "idle",
  });
  const statusRequestIdRef = useRef(0);

  const settings = useAppStore((state) => state.settings);
  const preferredReviewer = getPreferredReviewer(args);
  const reviewer =
    args.reviewerOptions.find((option) => option.key === reviewerKey) ??
    preferredReviewer;
  // The reviewer's own model preference is the default; an explicit pick is
  // kept across provider switches and clamped to what the new model accepts.
  const effort = reviewer
    ? clampModelEffort({
        providerId: reviewer.providerId,
        model: reviewer.model,
        effort: selectedEffort,
        fallback: resolveModelEffortFromSettings({
          settings,
          providerId: reviewer.providerId,
          model: reviewer.model,
        }),
      })
    : undefined;
  const providerIds = useMemo(
    () => [...new Set(args.reviewerOptions.map((option) => option.providerId))],
    [args.reviewerOptions],
  );
  const providerModelOptions = useMemo(
    () =>
      reviewer
        ? args.reviewerOptions.filter(
            (option) => option.providerId === reviewer.providerId,
          )
        : [],
    [args.reviewerOptions, reviewer],
  );
  const changeSummary = useMemo(
    () =>
      changeStatus.state === "ready"
        ? buildChangeSummary(changeStatus.items)
        : null,
    [changeStatus],
  );

  async function loadChangeStatus() {
    const requestId = ++statusRequestIdRef.current;
    const getStatus = window.api?.sourceControl?.getStatus;
    if (!getStatus) {
      setChangeStatus({
        state: "error",
        detail: "Local change preview is unavailable.",
      });
      return;
    }

    setChangeStatus({ state: "loading" });
    try {
      const result = await getStatus({ cwd: args.workspaceCwd });
      if (requestId !== statusRequestIdRef.current) {
        return;
      }
      if (!result.ok) {
        setChangeStatus({
          state: "error",
          detail: result.stderr || "Could not inspect local changes.",
        });
        return;
      }
      setChangeStatus({
        state: "ready",
        branch: result.branch,
        items: result.items,
      });
    } catch {
      if (requestId === statusRequestIdRef.current) {
        setChangeStatus({
          state: "error",
          detail: "Could not inspect local changes.",
        });
      }
    }
  }

  function handleOpenChange(nextOpen: boolean) {
    if (!nextOpen && isSubmitting) {
      return;
    }
    setOpen(nextOpen);
    if (nextOpen) {
      void loadChangeStatus();
    }
  }

  function selectProvider(providerId: ModelSelectorOption["providerId"]) {
    const nextReviewer =
      args.reviewerOptions.find(
        (option) =>
          option.providerId === providerId && option.isDefault === true,
      ) ??
      args.reviewerOptions.find((option) => option.providerId === providerId);
    if (nextReviewer) {
      setReviewerKey(nextReviewer.key);
    }
  }

  function toggleFocus(focus: LocalChangeReviewFocus) {
    setFocuses((current) =>
      current.includes(focus)
        ? current.filter((item) => item !== focus)
        : [...current, focus],
    );
  }

  async function handleSubmit() {
    if (!reviewer || !effort || isSubmitting) {
      return;
    }
    setIsSubmitting(true);
    try {
      const submitted = await args.onSubmit({
        reviewer,
        effort,
        scope,
        focuses,
        instructions: instructions.trim() || undefined,
      });
      if (submitted) {
        setOpen(false);
        setInstructions("");
      }
    } finally {
      setIsSubmitting(false);
    }
  }

  if (!reviewer || !effort) {
    return null;
  }

  const providerLabel = getProviderLabel({
    providerId: reviewer.providerId,
    variant: "short",
  });

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogTrigger
        render={
          <Button
            type="button"
            variant="ghost"
            size="sm"
            disabled={args.disabled}
            className="h-9 gap-1.5 px-2.5 text-xs text-muted-foreground hover:bg-secondary/30 hover:text-foreground"
            aria-label="Review local changes"
            title={`Review with ${providerLabel}`}
          />
        }
      >
        <FileDiff className="size-4" />
        <span>Review</span>
      </DialogTrigger>
      <DialogContent
        className="max-h-[calc(100vh-2rem)] grid-rows-[auto_minmax(0,1fr)_auto] gap-0 overflow-hidden p-0 sm:max-w-2xl"
        showCloseButton={!isSubmitting}
      >
        <DialogHeader className="border-b border-border/70 px-6 py-5 pr-14">
          <div className="flex items-start gap-3">
            <div className="flex size-10 shrink-0 items-center justify-center rounded-lg border border-border/70 bg-muted/40 text-foreground">
              <GitCompareArrows className="size-5" />
            </div>
            <div className="min-w-0 space-y-1.5">
              <DialogTitle className="text-lg leading-tight">
                Review local changes
              </DialogTitle>
              <DialogDescription className="leading-6">
                Get a read-only second opinion before you push. The reviewer
                inspects local Git changes directly—no pull request required.
              </DialogDescription>
            </div>
          </div>
        </DialogHeader>

        <div className="min-h-0 space-y-6 overflow-y-auto px-6 py-5">
          <section className="space-y-3" aria-labelledby={`${idPrefix}-scope`}>
            <div className="flex flex-wrap items-center justify-between gap-2">
              <h3 id={`${idPrefix}-scope`} className="text-sm font-medium">
                Review scope
              </h3>
              <div
                className="flex min-h-6 items-center gap-2 text-sm text-muted-foreground"
                aria-live="polite"
              >
                {changeStatus.state === "loading" ? (
                  <>
                    <LoaderCircle className="size-3.5 animate-spin motion-reduce:animate-none" />
                    Inspecting workspace…
                  </>
                ) : null}
                {changeStatus.state === "ready" ? (
                  <>
                    <GitBranch className="size-3.5" />
                    <span className="max-w-48 truncate">
                      {changeStatus.branch || "Current branch"}
                    </span>
                    <span aria-hidden="true">·</span>
                    <span>
                      {changeStatus.items.length} changed file
                      {changeStatus.items.length === 1 ? "" : "s"}
                    </span>
                  </>
                ) : null}
                {changeStatus.state === "error" ? changeStatus.detail : null}
              </div>
            </div>
            <div className="grid gap-2 sm:grid-cols-2">
              {REVIEW_SCOPE_OPTIONS.map((option) => {
                const Icon = option.icon;
                const selected = scope === option.value;
                return (
                  <button
                    key={option.value}
                    type="button"
                    aria-pressed={selected}
                    onClick={() => setScope(option.value)}
                    className={cn(
                      "flex min-h-20 items-start gap-3 rounded-lg border px-4 py-3 text-left outline-none transition-colors focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50",
                      selected
                        ? "border-primary/50 bg-primary/5"
                        : "border-border/80 bg-background hover:bg-muted/40",
                    )}
                  >
                    <Icon
                      className={cn(
                        "mt-0.5 size-4 shrink-0",
                        selected ? "text-primary" : "text-muted-foreground",
                      )}
                    />
                    <span className="min-w-0 space-y-1">
                      <span className="flex items-center gap-2 text-sm font-medium text-foreground">
                        {option.label}
                        {option.value === "working-tree" ? (
                          <span className="rounded bg-muted px-1.5 py-0.5 text-sm font-normal text-muted-foreground">
                            Default
                          </span>
                        ) : null}
                      </span>
                      <span className="block text-sm leading-5 text-muted-foreground">
                        {option.description}
                      </span>
                    </span>
                  </button>
                );
              })}
            </div>
            {changeSummary ? (
              <p className="text-sm text-muted-foreground">
                {changeSummary.staged} staged · {changeSummary.unstaged}{" "}
                unstaged · {changeSummary.untracked} untracked
                {changeSummary.conflicts > 0
                  ? ` · ${changeSummary.conflicts} conflicted`
                  : ""}
              </p>
            ) : null}
          </section>

          <section
            className="space-y-3"
            aria-labelledby={`${idPrefix}-reviewer`}
          >
            <div className="space-y-1">
              <h3 id={`${idPrefix}-reviewer`} className="text-sm font-medium">
                Review by
              </h3>
              <p className="text-sm leading-5 text-muted-foreground">
                Choose any available provider, model, and reasoning effort. This
                does not change the task&apos;s active provider.
              </p>
            </div>
            <div className="grid gap-2 sm:grid-cols-2">
              {providerIds.map((providerId) => {
                const selected = reviewer.providerId === providerId;
                const label = getProviderLabel({
                  providerId,
                  variant: "full",
                });
                return (
                  <button
                    key={providerId}
                    type="button"
                    aria-pressed={selected}
                    onClick={() => selectProvider(providerId)}
                    className={cn(
                      "flex min-h-14 items-center gap-3 rounded-lg border px-4 py-3 text-left outline-none transition-colors focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50",
                      selected
                        ? "border-primary/50 bg-primary/5 text-foreground"
                        : "border-border/80 bg-background text-muted-foreground hover:bg-muted/40 hover:text-foreground",
                    )}
                  >
                    <ModelIcon providerId={providerId} className="size-5" />
                    <span className="min-w-0 flex-1 text-sm font-medium">
                      {label}
                    </span>
                    {selected ? (
                      <Check className="size-4 text-primary" />
                    ) : null}
                  </button>
                );
              })}
            </div>
            <ModelSelector
              value={reviewer}
              options={providerModelOptions}
              effort={effort}
              onSelect={({ selection, effort: nextEffort }) => {
                setReviewerKey(selection.key);
                setSelectedEffort(nextEffort);
              }}
              className="w-full"
              triggerClassName="h-11 w-full max-w-none border-border/80 bg-background px-3"
              menuClassName="sm:max-w-lg"
            />
          </section>

          <section className="space-y-3" aria-labelledby={`${idPrefix}-focus`}>
            <div className="space-y-1">
              <h3 id={`${idPrefix}-focus`} className="text-sm font-medium">
                Focus
              </h3>
              <p className="text-sm leading-5 text-muted-foreground">
                Each selected focus adds an explicit instruction to the review
                prompt. Unselected areas are still read for context.
              </p>
            </div>
            <div className="grid gap-2 sm:grid-cols-2">
              {LOCAL_CHANGE_REVIEW_FOCUS_OPTIONS.map((option) => {
                const selected = focuses.includes(option.value);
                return (
                  <button
                    key={option.value}
                    type="button"
                    aria-pressed={selected}
                    onClick={() => toggleFocus(option.value)}
                    className={cn(
                      "flex min-h-16 items-start gap-2.5 rounded-lg border px-3 py-2.5 text-left outline-none transition-colors focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50",
                      selected
                        ? "border-primary/50 bg-primary/5"
                        : "border-border/80 bg-background hover:bg-muted/40",
                    )}
                  >
                    <span
                      aria-hidden="true"
                      className={cn(
                        "mt-0.5 flex size-4 shrink-0 items-center justify-center rounded border",
                        selected
                          ? "border-primary bg-primary text-primary-foreground"
                          : "border-border",
                      )}
                    >
                      {selected ? <Check className="size-3" /> : null}
                    </span>
                    <span className="min-w-0 space-y-0.5">
                      <span className="block text-sm font-medium text-foreground">
                        {option.label}
                      </span>
                      <span className="block text-sm leading-5 text-muted-foreground">
                        {option.description}
                      </span>
                    </span>
                  </button>
                );
              })}
            </div>
          </section>

          <section className="space-y-3">
            <div className="space-y-1">
              <label
                htmlFor={`${idPrefix}-instructions`}
                className="text-sm font-medium"
              >
                Additional instructions
              </label>
              <p className="text-sm leading-5 text-muted-foreground">
                Add product intent, risk areas, or files that deserve special
                attention.
              </p>
            </div>
            <Textarea
              id={`${idPrefix}-instructions`}
              value={instructions}
              onChange={(event) => setInstructions(event.target.value)}
              placeholder="For example: verify the task-switching regression and make sure draft state is preserved."
              className="min-h-36 resize-y text-sm leading-6"
              onKeyDown={(event) => {
                if (event.key === "Enter" && (event.metaKey || event.ctrlKey)) {
                  event.preventDefault();
                  void handleSubmit();
                }
              }}
            />
          </section>
        </div>

        <DialogFooter className="items-center border-t border-border/70 bg-muted/20 px-6 py-4 sm:justify-between">
          <p className="flex items-center gap-2 text-sm text-muted-foreground">
            <LockKeyhole className="size-3.5" />
            Read-only review · no PR lookup
          </p>
          <div className="flex items-center justify-end gap-2">
            <DialogClose
              render={
                <Button
                  type="button"
                  variant="outline"
                  className="h-11"
                  disabled={isSubmitting}
                />
              }
            >
              Cancel
            </DialogClose>
            <Button
              type="button"
              className="h-11 min-w-36"
              disabled={isSubmitting}
              onClick={() => void handleSubmit()}
            >
              {isSubmitting ? (
                <LoaderCircle className="size-4 animate-spin motion-reduce:animate-none" />
              ) : (
                <FileDiff className="size-4" />
              )}
              {isSubmitting ? "Starting review…" : "Review changes"}
            </Button>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
