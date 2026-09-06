import { Button as AdsButton } from "@/components/ads/components/Button";
import {
  Check,
  FileDiff,
  GitBranch,
  GitCompareArrows,
  LockKeyhole,
} from "lucide-react";
import { useId, useMemo, useRef, useState } from "react";
import {
  COMPOSER_CONTROL_BUTTON,
  ComposerControlLabel,
  composerControlAttributes,
} from "@/components/ai-elements/composer-control-density";
import { Button, Loader, Textarea } from "@/components/ui";
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
import { cx, sx } from "@/components/ads/utils/stylex";
import { localChangeReviewStyles as styles } from "./local-change-review-dialog.styles";
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
            className={COMPOSER_CONTROL_BUTTON}
            {...composerControlAttributes}
            data-review-control="true"
            aria-label="Review local changes"
            title={`Review with ${providerLabel}`}
          />
        }
      >
        <FileDiff className={sx(styles.triggerIcon)} />
        <ComposerControlLabel>
          <span>Review</span>
        </ComposerControlLabel>
      </DialogTrigger>
      <DialogContent
        xstyle={styles.content}
        showCloseButton={!isSubmitting}
      >
        <DialogHeader className={sx(styles.header)}>
          <div className={sx(styles.headerRow)}>
            <div className={sx(styles.headerBadge)}>
              <GitCompareArrows className={sx(styles.iconLg)} />
            </div>
            <div className={sx(styles.headerText)}>
              <DialogTitle className={sx(styles.title)}>
                Review local changes
              </DialogTitle>
              <DialogDescription className={sx(styles.description)}>
                Get a read-only second opinion before you push. The reviewer
                inspects local Git changes directly—no pull request required.
              </DialogDescription>
            </div>
          </div>
        </DialogHeader>

        <div className={sx(styles.body)} data-review-scroll="true">
          <section className={sx(styles.section)} aria-labelledby={`${idPrefix}-scope`}>
            <div className={sx(styles.sectionHeaderRow)}>
              <h3 id={`${idPrefix}-scope`} className={sx(styles.sectionHeading)}>
                Review scope
              </h3>
              <div
                className={sx(styles.status)}
                aria-live="polite"
              >
                {changeStatus.state === "loading" ? (
                  <>
                    <Loader aria-hidden size="xs" variant="verify" />
                    Inspecting workspace…
                  </>
                ) : null}
                {changeStatus.state === "ready" ? (
                  <>
                    <GitBranch className={sx(styles.iconSm)} />
                    <span className={sx(styles.branchName)}>
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
            <div className={sx(styles.cardGrid)}>
              {REVIEW_SCOPE_OPTIONS.map((option) => {
                const Icon = option.icon;
                const selected = scope === option.value;
                return (
                  <AdsButton
                    layout="host"
                    key={option.value}
                    type="button"
                    aria-pressed={selected}
                    onClick={() => setScope(option.value)}
                    xstyle={[
                      styles.scopeCard,
                      selected ? styles.cardSelected : styles.cardUnselected,
                    ]}
                  >
                    <Icon
                      className={sx(
                        styles.scopeIcon,
                        selected
                          ? styles.scopeIconSelected
                          : styles.scopeIconUnselected,
                      )}
                    />
                    <span className={sx(styles.scopeBody)}>
                      <span className={sx(styles.scopeLabelRow)}>
                        {option.label}
                        {option.value === "working-tree" ? (
                          <span className={sx(styles.defaultTag)}>
                            Default
                          </span>
                        ) : null}
                      </span>
                      <span className={sx(styles.scopeDescription)}>
                        {option.description}
                      </span>
                    </span>
                  </AdsButton>
                );
              })}
            </div>
            {changeSummary ? (
              <p className={sx(styles.summaryLine)}>
                {changeSummary.staged} staged · {changeSummary.unstaged}{" "}
                unstaged · {changeSummary.untracked} untracked
                {changeSummary.conflicts > 0
                  ? ` · ${changeSummary.conflicts} conflicted`
                  : ""}
              </p>
            ) : null}
          </section>

          <section
            className={sx(styles.section)}
            aria-labelledby={`${idPrefix}-reviewer`}
          >
            <div className={sx(styles.labelStack)}>
              <h3 id={`${idPrefix}-reviewer`} className={sx(styles.sectionHeading)}>
                Review by
              </h3>
              <p className={sx(styles.focusDescription)}>
                Choose any available provider, model, and reasoning effort. This
                does not change the task&apos;s active provider.
              </p>
            </div>
            <div className={sx(styles.cardGrid)}>
              {providerIds.map((providerId) => {
                const selected = reviewer.providerId === providerId;
                const label = getProviderLabel({
                  providerId,
                  variant: "full",
                });
                return (
                  <AdsButton
                    layout="host"
                    key={providerId}
                    type="button"
                    aria-pressed={selected}
                    onClick={() => selectProvider(providerId)}
                    xstyle={[
                      styles.reviewerCard,
                      selected
                        ? [styles.cardSelected, styles.cardSelectedText]
                        : styles.cardUnselectedMuted,
                    ]}
                  >
                    <ModelIcon providerId={providerId} className={sx(styles.reviewerIcon)} />
                    <span className={sx(styles.reviewerLabel)}>
                      {label}
                    </span>
                    {selected ? (
                      <Check className={sx(styles.reviewerCheck)} />
                    ) : null}
                  </AdsButton>
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
              className={sx(styles.modelSelector)}
              triggerClassName={sx(styles.modelTrigger)}
              menuClassName={sx(styles.modelMenu)}
            />
          </section>

          <section className={sx(styles.section)} aria-labelledby={`${idPrefix}-focus`}>
            <div className={sx(styles.labelStack)}>
              <h3 id={`${idPrefix}-focus`} className={sx(styles.sectionHeading)}>
                Focus
              </h3>
              <p className={sx(styles.focusDescription)}>
                Each selected focus adds an explicit instruction to the review
                prompt. Unselected areas are still read for context.
              </p>
            </div>
            <div className={sx(styles.cardGrid)}>
              {LOCAL_CHANGE_REVIEW_FOCUS_OPTIONS.map((option) => {
                const selected = focuses.includes(option.value);
                return (
                  <AdsButton
                    layout="host"
                    key={option.value}
                    type="button"
                    aria-pressed={selected}
                    onClick={() => toggleFocus(option.value)}
                    xstyle={[
                      styles.focusCard,
                      selected ? styles.cardSelected : styles.cardUnselected,
                    ]}
                  >
                    <span
                      aria-hidden="true"
                      className={sx(
                        styles.focusCheckbox,
                        selected
                          ? styles.focusCheckboxSelected
                          : styles.focusCheckboxUnselected,
                      )}
                    >
                      {selected ? <Check className={sx(styles.iconXs)} /> : null}
                    </span>
                    <span className={sx(styles.focusBody)}>
                      <span className={sx(styles.focusLabel)}>
                        {option.label}
                      </span>
                      <span className={sx(styles.focusDescription)}>
                        {option.description}
                      </span>
                    </span>
                  </AdsButton>
                );
              })}
            </div>
          </section>

          <section className={sx(styles.section)}>
            <div className={sx(styles.labelStack)}>
              <label
                htmlFor={`${idPrefix}-instructions`}
                className={sx(styles.instructionsLabel)}
              >
                Additional instructions
              </label>
              <p className={sx(styles.focusDescription)}>
                Add product intent, risk areas, or files that deserve special
                attention.
              </p>
            </div>
            <Textarea
              id={`${idPrefix}-instructions`}
              value={instructions}
              onChange={(event) => setInstructions(event.target.value)}
              placeholder="For example: verify the task-switching regression and make sure draft state is preserved."
              className={sx(styles.instructionsTextarea)}
              onKeyDown={(event) => {
                if (event.key === "Enter" && (event.metaKey || event.ctrlKey)) {
                  event.preventDefault();
                  void handleSubmit();
                }
              }}
            />
          </section>
        </div>

        <DialogFooter className={sx(styles.footer)}>
          <p className={sx(styles.footerNote)}>
            <LockKeyhole className={sx(styles.iconSm)} />
            Read-only review · no PR lookup
          </p>
          <div className={sx(styles.footerActions)}>
            <DialogClose
              render={
                <Button
                  type="button"
                  variant="outline"
                  className={sx(styles.cancelButton)}
                  disabled={isSubmitting}
                />
              }
            >
              Cancel
            </DialogClose>
            <Button
              type="button"
              className={sx(styles.submitButton)}
              disabled={isSubmitting}
              onClick={() => void handleSubmit()}
            >
              {isSubmitting ? (
                <Loader aria-hidden size="xs" variant="verify" />
              ) : (
                <FileDiff className={sx(styles.triggerIcon)} />
              )}
              {isSubmitting ? "Starting review…" : "Review changes"}
            </Button>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
