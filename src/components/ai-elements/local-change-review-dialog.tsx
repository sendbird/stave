import { Button as AdsButton } from "@/components/ads/components/Button";
import {
  Check,
  FileDiff,
  GitBranch,
  GitCommitHorizontal,
  GitCompareArrows,
  LockKeyhole,
  MessageSquareText,
} from "lucide-react";
import { useId, useMemo, useRef, useState } from "react";
import { ReviewPromptPicker } from "./review-prompt-picker";
import { useScopedTaskId } from "@/components/session/task-scope-context";
import {
  COMPOSER_CONTROL_BUTTON,
  ComposerControlLabel,
  composerControlAttributes,
} from "@/components/ai-elements/composer-control-density";
import { Checkbox } from "@/components/ads/components/Checkbox";
import { Button, Input, Loader, Textarea } from "@/components/ui";
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
  normalizeReviewCommitRef,
  type LocalChangeReviewFocus,
} from "@/lib/local-change-review";
import {
  REVIEW_TARGET_LABEL,
  REVIEW_TASK_INSTRUCTIONS_MAX_CHARS,
  hasReviewableReply,
  type ReviewTarget,
} from "@/lib/reviews/review-task";
import { getEffectiveSkillEntries } from "@/lib/skills/catalog";
import { isReviewTaskDelegationAvailable } from "@/store/review-task-runtime";
import type { ChatMessage } from "@/types/chat";
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
import {
  normalizeReviewPromptSelection,
  type ReviewPromptSelection,
} from "@/lib/reviews/review-prompts";

const NO_MESSAGES: readonly ChatMessage[] = [];
const NO_SKILL = "";

const REVIEW_TARGET_OPTIONS: ReadonlyArray<{
  value: ReviewTarget;
  label: string;
  description: string;
  icon: typeof FileDiff;
}> = [
  {
    value: "working-tree",
    label: REVIEW_TARGET_LABEL["working-tree"],
    description: "Staged, unstaged, and untracked files in this workspace.",
    icon: FileDiff,
  },
  {
    value: "branch",
    label: "Entire local branch",
    description: "Committed branch changes plus the current working tree.",
    icon: GitBranch,
  },
  {
    value: "commit",
    label: "Specific commit",
    description: "One commit or a range, such as HEAD~1 or main..HEAD.",
    icon: GitCommitHorizontal,
  },
  {
    value: "latest-reply",
    label: REVIEW_TARGET_LABEL["latest-reply"],
    description: "A second opinion on this task's latest answer or plan.",
    icon: MessageSquareText,
  },
];

type ReviewChangeStatus =
  | { state: "idle" | "loading" }
  | { state: "ready"; branch: string; items: SourceControlStatusItem[] }
  | { state: "error"; detail: string };

export interface LocalChangeReviewRequest extends ReviewPromptSelection {
  reviewer: ModelSelectorOption;
  effort: ModelEffort;
  target: ReviewTarget;
  focuses: readonly LocalChangeReviewFocus[];
  instructions?: string;
  /** Empty runs without a skill. */
  skillSlug?: string;
  /** The commit or range, for the commit target. */
  commitRef?: string;
  /** A plan or acceptance criteria to check the work against. */
  criteria?: string;
  /** A second, independent review on the other provider. */
  secondReviewer?: { reviewer: ModelSelectorOption; effort: ModelEffort };
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
  const [target, setTarget] = useState<ReviewTarget>("working-tree");
  const reviewSettings = useAppStore((state) => state.settings.reviewTask);
  const [focuses, setFocuses] = useState<readonly LocalChangeReviewFocus[]>(
    reviewSettings.focuses,
  );
  const [skillSlug, setSkillSlug] = useState(reviewSettings.skillSlug);
  const [promptSelection, setPromptSelection] = useState<ReviewPromptSelection>(
    () => normalizeReviewPromptSelection({ ...reviewSettings }),
  );
  const [instructions, setInstructions] = useState("");
  const [commitRef, setCommitRef] = useState("HEAD");
  const [criteria, setCriteria] = useState("");
  const [crossCheck, setCrossCheck] = useState(reviewSettings.crossCheck);
  const taskId = useScopedTaskId();
  const hasReply = useAppStore(
    (state) =>
      open && hasReviewableReply(state.messagesByTask[taskId] ?? NO_MESSAGES),
  );
  const skills = useAppStore((state) => state.skillCatalog.skills);
  // A separate task needs the desktop bridge; without it the review runs here.
  const runsSeparately = isReviewTaskDelegationAvailable();
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
  const skillOptions = useMemo(() => {
    const entries = reviewer
      ? getEffectiveSkillEntries({ skills, providerId: reviewer.providerId })
      : [];
    return [
      { value: NO_SKILL, label: "Choose a skill" },
      ...entries.map((entry) => ({
        value: entry.slug,
        label: `$${entry.slug}`,
        description: entry.description || entry.name,
        keywords: [entry.name],
      })),
    ];
  }, [reviewer, skills]);
  const selectedSkill = reviewer ? getEffectiveSkillEntries({ skills, providerId: reviewer.providerId })
    .find((entry) => entry.slug === skillSlug) : undefined;
  const promptMissing = promptSelection.promptSource === "skill" ? !selectedSkill?.instructions.trim()
    : promptSelection.promptSource === "custom" && !promptSelection.customPrompt.trim();
  const effectiveTarget: ReviewTarget =
    target === "latest-reply" && (!hasReply || !runsSeparately)
      ? "working-tree"
      : target;
  const validCommitRef = normalizeReviewCommitRef(commitRef);
  const commitMissing = effectiveTarget === "commit" && !validCommitRef;
  // The cross-check runs on the provider the main reviewer does not, with
  // that provider's review model and its own effort setting.
  const crossReviewer = reviewer
    ? (args.reviewerOptions.find(
        (option) => option.providerId !== reviewer.providerId && option.isDefault === true,
      ) ?? args.reviewerOptions.find((option) => option.providerId !== reviewer.providerId))
    : undefined;
  const crossEffort = crossReviewer
    ? resolveModelEffortFromSettings({
        settings,
        providerId: crossReviewer.providerId,
        model: crossReviewer.model,
      })
    : undefined;
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
      // Each review starts from the saved defaults.
      setFocuses(reviewSettings.focuses);
      setSkillSlug(reviewSettings.skillSlug);
      setPromptSelection(normalizeReviewPromptSelection({ ...reviewSettings }));
      setCrossCheck(reviewSettings.crossCheck);
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
    if (!reviewer || !effort || isSubmitting || commitMissing || promptMissing) {
      return;
    }
    setIsSubmitting(true);
    try {
      const submitted = await args.onSubmit({
        reviewer,
        effort,
        target: effectiveTarget,
        focuses,
        ...promptSelection,
        instructions: instructions.trim() || undefined,
        skillSlug: promptSelection.promptSource === "skill" ? skillSlug : undefined,
        ...(effectiveTarget === "commit" && validCommitRef ? { commitRef: validCommitRef } : {}),
        ...(criteria.trim() ? { criteria: criteria.trim() } : {}),
        ...(runsSeparately && crossCheck && crossReviewer && crossEffort && effectiveTarget !== "latest-reply"
          ? { secondReviewer: { reviewer: crossReviewer, effort: crossEffort } }
          : {}),
      });
      if (submitted) {
        setOpen(false);
        setInstructions("");
        setCriteria("");
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
                {runsSeparately ? "Start a review" : "Review local changes"}
              </DialogTitle>
              <DialogDescription className={sx(styles.description)}>
                {runsSeparately
                  ? "The review runs in its own read-only task with the model you pick, so this task keeps working. Attach the findings here when they are ready."
                  : "Get a read-only second opinion before you push. The reviewer inspects local Git changes directly—no pull request required."}
              </DialogDescription>
            </div>
          </div>
        </DialogHeader>

        <div className={sx(styles.body)} data-review-scroll="true">
          <section className={sx(styles.section)} aria-labelledby={`${idPrefix}-scope`}>
            <div className={sx(styles.sectionHeaderRow)}>
              <h3 id={`${idPrefix}-scope`} className={sx(styles.sectionHeading)}>
                Review
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
              {REVIEW_TARGET_OPTIONS.filter(
                (option) => runsSeparately || option.value !== "latest-reply",
              ).map((option) => {
                const Icon = option.icon;
                const selected = effectiveTarget === option.value;
                const unavailable = option.value === "latest-reply" && !hasReply;
                return (
                  <AdsButton
                    layout="host"
                    key={option.value}
                    type="button"
                    aria-pressed={selected}
                    disabled={unavailable}
                    title={unavailable ? "This task has no finished reply yet." : undefined}
                    onClick={() => setTarget(option.value)}
                    xstyle={[
                      styles.scopeCard,
                      selected ? styles.cardSelected : styles.cardUnselected,
                      unavailable && styles.cardDisabled,
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
            {effectiveTarget === "commit" ? (
              <div className={sx(styles.labelStack)}>
                <label htmlFor={`${idPrefix}-commit`} className={sx(styles.instructionsLabel)}>
                  Commit or range
                </label>
                <Input
                  id={`${idPrefix}-commit`}
                  value={commitRef}
                  onChange={(event) => setCommitRef(event.target.value)}
                  placeholder="HEAD~1, a1b2c3d or main..HEAD"
                  aria-invalid={commitMissing}
                  spellCheck={false}
                />
                {commitMissing ? (
                  <p className={sx(styles.focusDescription)} role="alert">
                    Use a commit, branch or range that starts with a letter or digit and uses only letters, digits and . _ / ~ ^ @ {"{"} {"}"} -.
                  </p>
                ) : null}
              </div>
            ) : null}
            {changeSummary && effectiveTarget !== "latest-reply" && effectiveTarget !== "commit" ? (
              <p className={sx(styles.summaryLine)}>
                {changeSummary.staged} staged · {changeSummary.unstaged}{" "}
                unstaged · {changeSummary.untracked} untracked
                {changeSummary.conflicts > 0
                  ? ` · ${changeSummary.conflicts} conflicted`
                  : ""}
              </p>
            ) : null}
            {effectiveTarget === "latest-reply" ? (
              <p className={sx(styles.summaryLine)} role="note">
                The reviewer can still search the web: Claude always, Codex
                when web search is on in its settings. The reply reaches it as
                data to evaluate, not as instructions.
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
            {/* A reply review already goes to the other model; a cross-check would
                hand the reply back to the model that wrote it. */}
            {runsSeparately && crossReviewer && effectiveTarget !== "latest-reply" ? (
              <Checkbox
                checked={crossCheck}
                onCheckedChange={(checked) => setCrossCheck(checked === true)}
                label={`Also review with ${crossReviewer.label}`}
                description={`Runs a second, independent read-only review on ${getProviderLabel({
                  providerId: crossReviewer.providerId,
                  variant: "full",
                })} at the same time, so each model checks the work on its own.`}
              />
            ) : null}
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

          <ReviewPromptPicker selection={promptSelection} skillSlug={skillSlug}
            skillOptions={skillOptions} skillInstructions={selectedSkill?.instructions}
            onChange={({ skillSlug: nextSkill, ...patch }) => {
              if (nextSkill !== undefined) setSkillSlug(nextSkill);
              setPromptSelection((current) => ({ ...current, ...patch }));
            }} />

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
                {reviewSettings.instructions.trim()
                  ? " Your saved review instructions from Settings are included too."
                  : null}
              </p>
            </div>
            <Textarea
              id={`${idPrefix}-instructions`}
              maxLength={REVIEW_TASK_INSTRUCTIONS_MAX_CHARS}
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

          <section className={sx(styles.section)}>
            <div className={sx(styles.labelStack)}>
              <label htmlFor={`${idPrefix}-criteria`} className={sx(styles.instructionsLabel)}>
                Check against a plan or acceptance criteria
              </label>
              <p className={sx(styles.focusDescription)}>
                Optional. Paste the plan or the criteria the work must meet; each
                one that is not met becomes a finding.
              </p>
            </div>
            <Textarea
              id={`${idPrefix}-criteria`}
              value={criteria}
              onChange={(event) => setCriteria(event.target.value)}
              placeholder="For example: a dismissed review stays dismissed after a restart."
              className={sx(styles.instructionsTextarea)}
            />
          </section>
        </div>

        <DialogFooter className={sx(styles.footer)}>
          <p className={sx(styles.footerNote)}>
            <LockKeyhole className={sx(styles.iconSm)} />
            {runsSeparately
              ? "Read-only task · runs beside this one"
              : "Read-only review · no PR lookup"}
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
              disabled={isSubmitting || commitMissing || promptMissing}
              onClick={() => void handleSubmit()}
            >
              {isSubmitting ? (
                <Loader aria-hidden size="xs" variant="verify" />
              ) : (
                <FileDiff className={sx(styles.triggerIcon)} />
              )}
              {isSubmitting
                ? "Starting review…"
                : runsSeparately
                  ? "Start review"
                  : "Review changes"}
            </Button>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
