import {
  BrainCircuit,
  GitBranch,
  Play,
  ShieldCheck,
  SplitSquareHorizontal,
} from "lucide-react";
import { useMemo, useState } from "react";
import { sx } from "@/components/ads/utils/stylex";
import {
  buildModelSelectorOptions,
  buildModelSelectorValue,
  ModelSelector,
} from "@/components/ai-elements/model-selector";
import { Button, Textarea } from "@/components/ui";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  DEFAULT_COMPARE_REVIEW_CRITERIA,
  normalizeCompareReviewCriteria,
  type CompareRunJudgeConfig,
  type CompareRunVariantConfig,
} from "@/lib/compare-runs";
import {
  isManagedExecutionProviderId,
  listManagedExecutionProviderIds,
} from "@/lib/providers/model-catalog";
import { resolveModelEffortFromSettings } from "@/lib/providers/model-effort";
import { useCodexModelCatalog } from "@/lib/providers/use-codex-model-catalog";
import { formatBranchLabel } from "@/lib/source-control-branch-label";
import { useAppStore } from "@/store/app.store";
import { compareRunPrepareDialogStyles as styles } from "./compare-run-prepare-dialog.styles";

const COMPARE_PROVIDER_IDS = listManagedExecutionProviderIds();

export interface CompareRunPreparation {
  seedPrompt: string;
  variants: CompareRunVariantConfig[];
  judge: CompareRunJudgeConfig;
  reviewCriteria: string[];
}

interface CompareRunPrepareDialogProps {
  open: boolean;
  seedPrompt: string;
  submitting: boolean;
  onOpenChange: (open: boolean) => void;
  onSubmit: (preparation: CompareRunPreparation) => void;
}

export function CompareRunPrepareDialog(props: CompareRunPrepareDialogProps) {
  const [preparedPrompt, setPreparedPrompt] = useState(props.seedPrompt);
  const [criteriaDraft, setCriteriaDraft] = useState(
    DEFAULT_COMPARE_REVIEW_CRITERIA.join("\n"),
  );
  const activeWorkspaceId = useAppStore((state) => state.activeWorkspaceId);
  const workspaces = useAppStore((state) => state.workspaces);
  const workspaceBranchById = useAppStore((state) => state.workspaceBranchById);
  const providerAvailability = useAppStore(
    (state) => state.providerAvailability,
  );
  const settings = useAppStore((state) => state.settings);
  const { modelClaude, modelCodex } = settings;
  const workspace = workspaces.find((entry) => entry.id === activeWorkspaceId);
  const codexModelCatalog = useCodexModelCatalog({
    enabled: props.open,
    codexBinaryPath: settings.codexBinaryPath,
  });
  const modelOptions = useMemo(
    () =>
      buildModelSelectorOptions({
        providerIds: COMPARE_PROVIDER_IDS,
        availabilityByProvider: providerAvailability,
        modelsByProvider: { codex: codexModelCatalog.models },
      }),
    [codexModelCatalog.models, providerAvailability],
  );
  const [candidates, setCandidates] = useState<CompareRunVariantConfig[]>(
    () => [
      {
        provider: "claude-code",
        model: modelClaude,
        effort: resolveModelEffortFromSettings({
          settings,
          providerId: "claude-code",
          model: modelClaude,
        }),
        label: "Candidate A",
      },
      {
        provider: "codex",
        model: modelCodex,
        effort: resolveModelEffortFromSettings({
          settings,
          providerId: "codex",
          model: modelCodex,
        }),
        label: "Candidate B",
      },
    ],
  );
  const [judge, setJudge] = useState<CompareRunJudgeConfig>(() => ({
    provider: "codex",
    model: modelCodex,
    effort: resolveModelEffortFromSettings({
      settings,
      providerId: "codex",
      model: modelCodex,
    }),
  }));
  const baseBranch =
    formatBranchLabel(workspaceBranchById[activeWorkspaceId]) ||
    workspace?.name ||
    "Current branch";
  const reviewCriteria = normalizeCompareReviewCriteria(
    criteriaDraft.split("\n"),
  );
  const canSubmit =
    preparedPrompt.trim().length > 0 &&
    candidates.every((candidate) => candidate.model?.trim()) &&
    Boolean(judge.model?.trim()) &&
    !props.submitting;

  function updateCandidate(
    index: number,
    patch: Partial<CompareRunVariantConfig>,
  ) {
    setCandidates((current) =>
      current.map((candidate, candidateIndex) =>
        candidateIndex === index ? { ...candidate, ...patch } : candidate,
      ),
    );
  }

  function buildSelectorValue(config: {
    provider: CompareRunVariantConfig["provider"];
    model?: string;
  }) {
    return buildModelSelectorValue({
      providerId: config.provider,
      model: config.model ?? "",
      available: providerAvailability[config.provider],
    });
  }

  return (
    <Dialog
      open={props.open}
      onOpenChange={(open) => {
        if (!props.submitting) {
          props.onOpenChange(open);
        }
      }}
    >
      <DialogContent xstyle={styles.content}>
        <DialogHeader className={sx(styles.header)}>
          <div className={sx(styles.headerRow)}>
            <span className={sx(styles.headerMark)}>
              <SplitSquareHorizontal className={sx(styles.markIcon)} />
            </span>
            <div className={sx(styles.headerText)}>
              <div className={sx(styles.headerTitleRow)}>
                <DialogTitle className={sx(styles.headerTitle)}>
                  Prepare comparison
                </DialogTitle>
                <span className={sx(styles.headerStep)}>Step 1 of 5</span>
              </div>
              <DialogDescription className={sx(styles.headerDescription)}>
                Give both candidates the same brief and review contract before
                Stave creates isolated worktrees.
              </DialogDescription>
            </div>
          </div>
        </DialogHeader>

        <div className={sx(styles.scroller)}>
          <section className={sx(styles.section)} aria-labelledby="compare-shared-brief">
            <div className={sx(styles.sectionIntro)}>
              <h3 id="compare-shared-brief" className={sx(styles.heading)}>
                Shared brief
              </h3>
              <p className={sx(styles.helpText)}>
                This exact request is sent to every candidate.
              </p>
            </div>
            <Textarea
              aria-label="Compare shared brief"
              value={preparedPrompt}
              onChange={(event) => setPreparedPrompt(event.target.value)}
              xstyle={styles.textarea}
            />
          </section>

          <section
            className={sx(styles.sectionBordered)}
            aria-labelledby="compare-candidates"
          >
            <div className={sx(styles.sectionHeadingRow)}>
              <div className={sx(styles.sectionHeadingGroup)}>
                <h3 id="compare-candidates" className={sx(styles.heading)}>
                  Candidates
                </h3>
                <p className={sx(styles.helpText)}>
                  Both start from the same branch with independent files and
                  provider sessions. Pick a model and reasoning effort for each.
                </p>
              </div>
              <span className={sx(styles.branchTag)}>
                <GitBranch className={sx(styles.smallIcon)} />
                {baseBranch}
              </span>
            </div>
            <div className={sx(styles.candidateList)}>
              {candidates.map((candidate, index) => {
                const candidateName =
                  candidate.label ?? `Candidate ${index + 1}`;
                const candidateModel = buildSelectorValue(candidate);
                return (
                  <div
                    key={candidate.label}
                    className={sx(
                      styles.candidateRow,
                      index > 0 && styles.candidateRowDivider,
                    )}
                  >
                    <span className={sx(styles.candidateIndex)}>
                      {String(index + 1).padStart(2, "0")}
                    </span>
                    <div className={sx(styles.candidateMain)}>
                      <p className={sx(styles.candidateName)}>
                        {candidate.label}
                      </p>
                      <p className={sx(styles.candidateSub)}>
                        Isolated worktree
                      </p>
                    </div>
                    <ModelSelector
                      value={candidateModel}
                      options={modelOptions}
                      effort={candidate.effort}
                      disabled={props.submitting}
                      onSelect={({ selection, effort }) => {
                        if (!isManagedExecutionProviderId(selection.providerId)) {
                          return;
                        }
                        updateCandidate(index, {
                          provider: selection.providerId,
                          model: selection.model,
                          effort,
                        })
                      }}
                      className={sx(styles.selectorFull)}
                      triggerAriaLabel={`${candidateName} model and effort: ${candidateModel.label}${candidate.effort ? ` · ${candidate.effort}` : ""}`}
                      triggerClassName={sx(styles.selectorTrigger)}
                      menuClassName={sx(styles.selectorMenu)}
                    />
                  </div>
                );
              })}
            </div>
          </section>

          <section
            className={sx(styles.sectionBordered)}
            aria-labelledby="compare-judge"
          >
            <div className={sx(styles.judgeGrid)}>
              <div className={sx(styles.judgeIntro)}>
                <span className={sx(styles.judgeMark)}>
                  <BrainCircuit className={sx(styles.markIcon)} />
                </span>
                <div className={sx(styles.judgeIntroText)}>
                  <h3 id="compare-judge" className={sx(styles.heading)}>
                    Independent judge
                  </h3>
                  <p className={sx(styles.helpText)}>
                    Runs after every candidate finishes with fresh context and
                    read-only access.
                  </p>
                </div>
              </div>
              <ModelSelector
                value={buildSelectorValue(judge)}
                options={modelOptions}
                effort={judge.effort}
                disabled={props.submitting}
                onSelect={({ selection, effort }) => {
                  if (!isManagedExecutionProviderId(selection.providerId)) {
                    return;
                  }
                  setJudge({
                    provider: selection.providerId,
                    model: selection.model,
                    effort,
                  })
                }}
                className={sx(styles.selectorFull)}
                triggerAriaLabel={`Independent judge model and effort: ${buildSelectorValue(judge).label}${judge.effort ? ` · ${judge.effort}` : ""}`}
                triggerClassName={sx(styles.selectorTrigger)}
                menuClassName={sx(styles.selectorMenu)}
              />
            </div>
          </section>

          <section
            className={sx(styles.sectionBordered)}
            aria-labelledby="compare-review-contract"
          >
            <div className={sx(styles.sectionIntro)}>
              <h3
                id="compare-review-contract"
                className={sx(styles.heading)}
              >
                Review contract
              </h3>
              <p className={sx(styles.helpText)}>
                One criterion per line. These remain visible in the Review
                stage. Leave this empty to use Stave&apos;s default rubric.
              </p>
            </div>
            <Textarea
              aria-label="Compare review criteria"
              value={criteriaDraft}
              onChange={(event) => setCriteriaDraft(event.target.value)}
              xstyle={styles.textareaShort}
            />
          </section>

          <div className={sx(styles.safetyRow)}>
            <ShieldCheck className={sx(styles.safetyIcon)} />
            <p className={sx(styles.safetyText)}>
              Keeping a candidate preserves its workspace. Stave closes the
              other compare workspaces only after your explicit Keep choice.
              Keeping does not merge code.
            </p>
          </div>
        </div>

        <DialogFooter className={sx(styles.footer)}>
          <span className={sx(styles.footerTrail)}>
            Prepare → Run → Judge → Review → Keep
          </span>
          <div className={sx(styles.footerActions)}>
            <DialogClose
              render={<Button variant="ghost" disabled={props.submitting} />}
            >
              Cancel
            </DialogClose>
            <Button
              type="button"
              disabled={!canSubmit}
              onClick={() =>
                props.onSubmit({
                  seedPrompt: preparedPrompt.trim(),
                  variants: candidates.map((candidate) => ({
                    ...candidate,
                    model: candidate.model?.trim(),
                  })),
                  judge: {
                    provider: judge.provider,
                    model: judge.model?.trim(),
                    effort: judge.effort,
                  },
                  reviewCriteria,
                })
              }
            >
              <Play className={sx(styles.playIcon)} />
              {props.submitting ? "Preparing…" : "Start comparison"}
            </Button>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
