import { I18N_NAMESPACES, i18n, useTranslation } from "@/i18n";
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
  getDefaultCompareReviewCriteria,
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
  const { t } = useTranslation(I18N_NAMESPACES);
  const [preparedPrompt, setPreparedPrompt] = useState(props.seedPrompt);
  const [criteriaDraft, setCriteriaDraft] = useState(
    getDefaultCompareReviewCriteria().join("\n"),
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
        label: i18n.t("compare:compareRunPrepareDialog.candidateA"),
      },
      {
        provider: "codex",
        model: modelCodex,
        effort: resolveModelEffortFromSettings({
          settings,
          providerId: "codex",
          model: modelCodex,
        }),
        label: i18n.t("compare:compareRunPrepareDialog.candidateB"),
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
    t("compare:compareRunPrepareDialog.currentBranch");
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
                  {t("compare:compareRunPrepareDialog.prepareComparison")}</DialogTitle>
                <span className={sx(styles.headerStep)}>{t("compare:compareRunPrepareDialog.stepOf")}</span>
              </div>
              <DialogDescription className={sx(styles.headerDescription)}>
                {t("compare:compareRunPrepareDialog.giveBothCandidatesTheSameBrief")}</DialogDescription>
            </div>
          </div>
        </DialogHeader>

        <div className={sx(styles.scroller)}>
          <section className={sx(styles.section)} aria-labelledby="compare-shared-brief">
            <div className={sx(styles.sectionIntro)}>
              <h3 id="compare-shared-brief" className={sx(styles.heading)}>
                {t("compare:compareRunPrepareDialog.sharedBrief")}</h3>
              <p className={sx(styles.helpText)}>
                {t("compare:compareRunPrepareDialog.thisExactRequestIsSentTo")}</p>
            </div>
            <Textarea
              aria-label={t("compare:compareRunPrepareDialog.compareSharedBrief")}
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
                  {t("compare:compareRunPrepareDialog.candidates")}</h3>
                <p className={sx(styles.helpText)}>
                  {t("compare:compareRunPrepareDialog.bothStartFromTheSameBranch")}</p>
              </div>
              <span className={sx(styles.branchTag)}>
                <GitBranch className={sx(styles.smallIcon)} />
                {baseBranch}
              </span>
            </div>
            <div className={sx(styles.candidateList)}>
              {candidates.map((candidate, index) => {
                const candidateName =
                  candidate.label ?? i18n.t("compare:compareRunHistory.candidate", { value1: index + 1 });
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
                        {i18n.t("compare:compareRunPrepareDialog.isolatedWorktree")}</p>
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
                      triggerAriaLabel={i18n.t("compare:compareRunPrepareDialog.modelAndEffort", { value1: candidateName, value2: candidateModel.label, value3: candidate.effort ? ` · ${candidate.effort}` : "" })}
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
                    {t("compare:compareRunPrepareDialog.independentJudge")}</h3>
                  <p className={sx(styles.helpText)}>
                    {t("compare:compareRunPrepareDialog.runsAfterEveryCandidateFinishesWith")}</p>
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
                triggerAriaLabel={t("compare:compareRunPrepareDialog.independentJudgeModelAndEffort", { value1: buildSelectorValue(judge).label, value2: judge.effort ? ` · ${judge.effort}` : "" })}
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
                {t("compare:compareRunPrepareDialog.reviewContract")}</h3>
              <p className={sx(styles.helpText)}>
                {t("compare:compareRunPrepareDialog.oneCriterionPerLineTheseRemain")}</p>
            </div>
            <Textarea
              aria-label={t("compare:compareRunPrepareDialog.compareReviewCriteria")}
              value={criteriaDraft}
              onChange={(event) => setCriteriaDraft(event.target.value)}
              xstyle={styles.textareaShort}
            />
          </section>

          <div className={sx(styles.safetyRow)}>
            <ShieldCheck className={sx(styles.safetyIcon)} />
            <p className={sx(styles.safetyText)}>
              {t("compare:compareRunPrepareDialog.keepingACandidatePreservesItsWorkspace")}</p>
          </div>
        </div>

        <DialogFooter className={sx(styles.footer)}>
          <span className={sx(styles.footerTrail)}>
            {t("compare:compareRunPrepareDialog.prepareRunJudgeReviewKeep")}</span>
          <div className={sx(styles.footerActions)}>
            <DialogClose
              render={<Button variant="ghost" disabled={props.submitting} />}
            >
              {t("common:actions.cancel")}</DialogClose>
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
              {props.submitting ? t("settingsProviders:mcpConfigEditor.editor.preparing") : t("compare:compareRunPrepareDialog.startComparison")}
            </Button>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
