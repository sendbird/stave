import { I18N_NAMESPACES, useTranslation, i18n } from "@/i18n";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Badge } from "@/components/ads/components/Badge";
import { Checkbox } from "@/components/ads/components/Checkbox";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ads/components/Table";
import { sx } from "@/components/ads/utils/stylex";
import { AgentIdentity } from "@/components/delegation/AgentIdentity";
import { ActionButton } from "@/components/system/ActionButton";
import { loadTaskMessagesPage } from "@/lib/db/workspaces.db";
import {
  STANCE_DESCRIPTIONS,
  STANCE_LABELS,
  STANCES,
  TASK_CLASS_LABELS,
  withStance,
  type Stance,
  type TaskClass,
} from "@/lib/providers/auto-routing-profile";
import {
  analyzeUsage,
  buildProfileFromUsage,
  collectUsageSamples,
  wizardChangeKey,
  type UsageConfidence,
  type UsageSample,
  type WizardChange,
} from "@/lib/providers/auto-routing-wizard";
import { useAppStore } from "@/store/app.store";
import { ChoiceButtons, LabeledField, SettingsCard } from "./settings-dialog.shared";
import { autoRoutingWizardStyles as styles } from "./settings-dialog-auto-routing-wizard.styles";

type WizardStep = "scan" | "review" | "apply";

const STEPS: ReadonlyArray<{ id: WizardStep; label: string }> = [
  { id: "scan", get label() { return i18n.t("settingsConnections:settingsDialogAutoRoutingWizard.scan"); } },
  { id: "review", get label() { return i18n.t("settingsConnections:settingsDialogAutoRoutingWizard.review"); } },
  { id: "apply", get label() { return i18n.t("common:actions.apply"); } },
];

/** Older tasks whose messages are not resident get fetched, newest first. */
const MAX_TASKS_TO_LOAD = 40;
const MESSAGES_PER_TASK = 200;

const CONFIDENCE_TONE: Readonly<Record<UsageConfidence, "warning" | "info" | "success">> = {
  low: "warning",
  medium: "info",
  high: "success",
};
const CONFIDENCE_LABEL: Readonly<Record<UsageConfidence, string>> = {
  get low() { return i18n.t("settingsConnections:settingsDialogAutoRoutingWizard.lowConfidence"); },
  get medium() { return i18n.t("settingsConnections:settingsDialogAutoRoutingWizard.mediumConfidence"); },
  get high() { return i18n.t("settingsConnections:settingsDialogAutoRoutingWizard.highConfidence"); },
};

interface ScanProgress {
  tasks: number;
  prompts: number;
}

function stepIndex(step: WizardStep) {
  return STEPS.findIndex((entry) => entry.id === step);
}

function changeSubject(change: WizardChange) {
  if (change.skill) {
    return `/${change.skill}`;
  }
  return change.taskClass ? TASK_CLASS_LABELS[change.taskClass] : i18n.t("settingsConnections:flow.headerRule");
}

/**
 * Three-step helper that reads which models answered which kinds of prompts
 * and proposes a routing profile. The parent section mounts it above the role
 * table; applying writes `settings.autoRoutingProfile` through `updateSettings`
 * exactly like a manual edit would.
 */
export function SettingsAutoRoutingWizard(props: { samplesOverride?: UsageSample[] }) {
  const { t } = useTranslation(I18N_NAMESPACES);
  const profile = useAppStore((state) => state.settings.autoRoutingProfile);
  const updateSettings = useAppStore((state) => state.updateSettings);

  const [step, setStep] = useState<WizardStep>("scan");
  const [scanning, setScanning] = useState(false);
  const [scanError, setScanError] = useState<string | null>(null);
  const [progress, setProgress] = useState<ScanProgress | null>(null);
  const [samples, setSamples] = useState<UsageSample[] | null>(
    props.samplesOverride ?? null,
  );
  const [stance, setStance] = useState<Stance | null>(null);
  const [excluded, setExcluded] = useState<ReadonlySet<string>>(() => new Set());
  const [applied, setApplied] = useState(false);
  const cancelledRef = useRef(false);
  /** Bumped by "Start over" so a scan still in flight drops its result. */
  const scanTokenRef = useRef(0);

  useEffect(() => {
    cancelledRef.current = false;
    return () => {
      cancelledRef.current = true;
    };
  }, []);

  const analysis = useMemo(() => analyzeUsage(samples ?? []), [samples, t]);
  const proposal = useMemo(
    () => buildProfileFromUsage(analysis, { base: profile, include: { stance: false } }),
    [analysis, profile, t],
  );
  const ruleChanges = proposal.changes;
  const selectedStance = stance ?? analysis.recommendedStance;
  const includedChanges = ruleChanges.filter(
    (change) => !excluded.has(wizardChangeKey(change)),
  );
  const stanceChanges = selectedStance !== profile.stance;
  const hasSamples = analysis.totalSamples > 0;
  const hasAnythingToApply = includedChanges.length > 0 || stanceChanges;

  const scan = useCallback(async () => {
    if (props.samplesOverride) {
      setSamples(props.samplesOverride);
      setProgress({ tasks: 0, prompts: props.samplesOverride.length });
      return;
    }
    scanTokenRef.current += 1;
    const token = scanTokenRef.current;
    setScanning(true);
    setScanError(null);
    setApplied(false);
    const state = useAppStore.getState();
    const workspaceId = state.activeWorkspaceId;
    const collected: UsageSample[] = [];
    let scannedTasks = 0;
    const missing: typeof state.tasks = [];
    for (const task of state.tasks) {
      const messages = state.messagesByTask[task.id];
      if (messages && messages.length > 0) {
        collected.push(...collectUsageSamples(messages));
        scannedTasks += 1;
      } else {
        missing.push(task);
      }
    }
    setProgress({ tasks: scannedTasks, prompts: collected.length });

    const toLoad = [...missing]
      .sort((left, right) => right.updatedAt.localeCompare(left.updatedAt))
      .slice(0, MAX_TASKS_TO_LOAD);
    const results = await Promise.allSettled(
      toLoad.map((task) =>
        loadTaskMessagesPage({
          workspaceId,
          taskId: task.id,
          limit: MESSAGES_PER_TASK,
        }),
      ),
    );
    if (cancelledRef.current || scanTokenRef.current !== token) {
      return;
    }
    let failed = 0;
    for (const result of results) {
      if (result.status === "fulfilled") {
        collected.push(...collectUsageSamples(result.value.messages));
        scannedTasks += 1;
      } else {
        failed += 1;
      }
    }
    setProgress({ tasks: scannedTasks, prompts: collected.length });
    setSamples(collected);
    setExcluded(new Set());
    setStance(null);
    setScanning(false);
    if (failed > 0) {
      setScanError(
        t("settingsConnections:messages.skippedTasks", { count: failed }),
      );
    }
  }, [props.samplesOverride, t]);

  const startOver = () => {
    scanTokenRef.current += 1;
    setStep("scan");
    setScanning(false);
    setScanError(null);
    setProgress(null);
    setSamples(props.samplesOverride ?? null);
    setStance(null);
    setExcluded(new Set());
    setApplied(false);
  };

  const toggleChange = (change: WizardChange, include: boolean) => {
    const key = wizardChangeKey(change);
    setExcluded((current) => {
      const next = new Set(current);
      if (include) {
        next.delete(key);
      } else {
        next.add(key);
      }
      return next;
    });
  };

  const apply = () => {
    const taskClasses: TaskClass[] = [];
    const skills: string[] = [];
    for (const change of includedChanges) {
      if (change.skill) {
        skills.push(change.skill);
      } else if (change.taskClass) {
        taskClasses.push(change.taskClass);
      }
    }
    const built = buildProfileFromUsage(analysis, {
      base: profile,
      include: { taskClasses, skills, stance: false },
    });
    const next = stanceChanges
      ? withStance(built.profile, selectedStance)
      : built.profile;
    updateSettings({ patch: { autoRoutingProfile: next } });
    setApplied(true);
  };

  const canVisit = (target: WizardStep) =>
    target === "scan" || (hasSamples && !scanning);

  const summary = hasAnythingToApply
    ? t(stanceChanges ? "settingsConnections:messages.applyWithStance" : "settingsConnections:messages.applyRules", { count: includedChanges.length, samples: analysis.totalSamples, stance: STANCE_LABELS[selectedStance] })
    : t("settingsConnections:settingsDialogAutoRoutingWizard.nothingSelectedIncludeAtLeastOne");

  return (
    <SettingsCard
      title={t("settingsConnections:settingsDialogAutoRoutingWizard.setUpFromMyUsage")}
      description={t("settingsConnections:settingsDialogAutoRoutingWizard.staveReadsWhichModelsYouActually")}
    >
      <div className={sx(styles.stack)}>
        <ol className={sx(styles.stepper)} aria-label={t("settingsConnections:settingsDialogAutoRoutingWizard.setupSteps")}>
          {STEPS.map((entry, index) => {
            const active = entry.id === step;
            const done = stepIndex(entry.id) < stepIndex(step);
            return (
              <li key={entry.id} className={sx(styles.stepItem)}>
                {index > 0 ? <span aria-hidden className={sx(styles.stepConnector)} /> : null}
                <ActionButton
                  size="xs"
                  weight={active ? "secondary" : "quiet"}
                  aria-current={active ? "step" : undefined}
                  disabled={!canVisit(entry.id)}
                  className={sx(done && styles.stepButtonDone)}
                  onClick={() => setStep(entry.id)}
                >
                  <span className={sx(styles.stepIndex)}>{index + 1}</span>
                  {entry.label}
                </ActionButton>
              </li>
            );
          })}
        </ol>

        {step === "scan" ? (
          <ScanStep
            analysis={analysis}
            hasSamples={hasSamples}
            progress={progress}
            scanError={scanError}
            scanning={scanning}
            scanned={samples !== null}
            onContinue={() => setStep("review")}
            onScan={() => void scan()}
          />
        ) : null}

        {step === "review" ? (
          <ReviewStep
            changes={ruleChanges}
            excluded={excluded}
            recommendedStance={analysis.recommendedStance}
            selectedStance={selectedStance}
            onBack={() => setStep("scan")}
            onContinue={() => setStep("apply")}
            onStanceChange={setStance}
            onToggle={toggleChange}
          />
        ) : null}

        {step === "apply" ? (
          <div className={sx(styles.stack)}>
            <p className={sx(styles.body)}>{summary}</p>
            <div className={sx(styles.toolbar)}>
              <ActionButton
                weight="primary"
                disabled={!hasAnythingToApply || applied}
                onClick={apply}
              >
                {t("settingsConnections:settingsDialogAutoRoutingWizard.applyProfile")}</ActionButton>
              <ActionButton weight="quiet" onClick={() => setStep("review")}>
                {t("common:actions.back")}</ActionButton>
              <ActionButton weight="quiet" onClick={startOver}>
                {t("settingsConnections:settingsDialogAutoRoutingWizard.startOver")}</ActionButton>
            </div>
            {applied ? (
              <p className={sx(styles.success)} role="status">
                {t("settingsConnections:settingsDialogAutoRoutingWizard.profileAppliedYouCanStillEdit")}</p>
            ) : null}
          </div>
        ) : null}
      </div>
    </SettingsCard>
  );
}

function ScanStep(props: {
  analysis: ReturnType<typeof analyzeUsage>;
  hasSamples: boolean;
  progress: ScanProgress | null;
  scanError: string | null;
  scanning: boolean;
  scanned: boolean;
  onContinue: () => void;
  onScan: () => void;
}) {
  const { t } = useTranslation(I18N_NAMESPACES);
  const { analysis } = props;
  return (
    <div className={sx(styles.stack)}>
      <div className={sx(styles.toolbar)}>
        <ActionButton weight="primary" disabled={props.scanning} onClick={props.onScan}>
          {props.scanning ? t("settingsConnections:settingsDialogAutoRoutingWizard.scanning") : props.scanned ? t("settingsConnections:settingsDialogAutoRoutingWizard.scanAgain") : t("settingsConnections:settingsDialogAutoRoutingWizard.scanMyHistory")}
        </ActionButton>
        {props.progress ? (
          <p className={sx(styles.progress)} role="status">
            {t(props.progress.prompts === 1 ? "settingsConnections:messages.scanProgressOnePrompt" : "settingsConnections:messages.scanProgress", { count: props.progress.tasks, prompts: props.progress.prompts })}
          </p>
        ) : null}
        <span className={sx(styles.toolbarSpacer)} />
        {props.hasSamples ? (
          <ActionButton weight="secondary" onClick={props.onContinue}>
            {t("settingsConnections:settingsDialogAutoRoutingWizard.continueToReview")}</ActionButton>
        ) : null}
      </div>
      {props.scanError ? <p className={sx(styles.error)}>{props.scanError}</p> : null}

      {props.scanned && !props.scanning && !props.hasSamples ? (
        <p className={sx(styles.emptyState)}>
          {t("settingsConnections:settingsDialogAutoRoutingWizard.noHistoryYetUseStaveFor")}</p>
      ) : null}

      {props.hasSamples ? (
        <>
          <div className={sx(styles.headingRow)}>
            <h4 className={sx(styles.heading)}>{t("settingsConnections:settingsDialogAutoRoutingWizard.whatYourHistoryShows")}</h4>
            <Badge tone={CONFIDENCE_TONE[analysis.confidence]} variant="outline" dot>
              {CONFIDENCE_LABEL[analysis.confidence]}
            </Badge>
          </div>
          {analysis.insights.length > 0 ? (
            <ul className={sx(styles.insights)}>
              {analysis.insights.map((insight) => (
                <li key={insight}>{insight}</li>
              ))}
            </ul>
          ) : (
            <p className={sx(styles.helper)}>
              {t("settingsConnections:settingsDialogAutoRoutingWizard.notEnoughRepeatedPromptsYetTo")}</p>
          )}
          <Table density="compact" aria-label={t("settingsConnections:settingsDialogAutoRoutingWizard.dominantModelPerTaskClass")}>
            <TableHeader>
              <TableRow>
                <TableHead>{t("settingsConnections:settingsDialogAutoRoutingSection.taskClass")}</TableHead>
                <TableHead>{t("settingsConnections:settingsDialogAutoRoutingWizard.usuallyRunsOn")}</TableHead>
                <TableHead>{t("settings:sections.prompts.label")}</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {analysis.classes.map((entry) => (
                <TableRow key={entry.taskClass}>
                  <TableCell>
                    <span className={sx(styles.cellLabel)}>
                      {TASK_CLASS_LABELS[entry.taskClass]}
                    </span>
                  </TableCell>
                  <TableCell>
                    <AgentIdentity
                      compact
                      providerId={entry.dominant.providerId}
                      model={entry.dominant.model}
                      effort={entry.dominant.effort ?? null}
                    />
                  </TableCell>
                  <TableCell>
                    <span className={sx(styles.cellMuted)}>
                      {entry.dominantCount} {i18n.t("compare:compareRunHistoryDialog.of")}{entry.count} · {entry.share}%
                    </span>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </>
      ) : null}
    </div>
  );
}

function ReviewStep(props: {
  changes: readonly WizardChange[];
  excluded: ReadonlySet<string>;
  recommendedStance: Stance;
  selectedStance: Stance;
  onBack: () => void;
  onContinue: () => void;
  onStanceChange: (stance: Stance) => void;
  onToggle: (change: WizardChange, include: boolean) => void;
}) {
  const { t } = useTranslation(I18N_NAMESPACES);
  return (
    <div className={sx(styles.stack)}>
      <LabeledField
        layout="stacked"
        title={t("settingsConnections:settingsDialogAutoRoutingWizard.stance")}
        description={t("settingsConnections:settingsDialogAutoRoutingWizard.recommended", { value1: STANCE_LABELS[props.recommendedStance], value2: STANCE_DESCRIPTIONS[props.recommendedStance] })}
      >
        <ChoiceButtons
          columns={3}
          value={props.selectedStance}
          onChange={props.onStanceChange}
          options={STANCES.map((entry) => ({
            value: entry,
            label: STANCE_LABELS[entry],
          }))}
        />
      </LabeledField>

      <div className={sx(styles.headingRow)}>
        <h4 className={sx(styles.heading)}>{t("settingsConnections:settingsDialogAutoRoutingWizard.proposedRuleChanges")}</h4>
        <span className={sx(styles.helper)}>
          {t("settingsConnections:settingsDialogAutoRoutingWizard.untickARowToKeepThe")}</span>
      </div>
      {props.changes.length === 0 ? (
        <p className={sx(styles.helper)}>
          {t("settingsConnections:settingsDialogAutoRoutingWizard.noClassOrSkillRepeatedOften")}</p>
      ) : (
        <ul className={sx(styles.changeList)}>
          {props.changes.map((change) => {
            const key = wizardChangeKey(change);
            const included = !props.excluded.has(key);
            return (
              <li key={key}>
                <label
                  className={sx(styles.changeRow, !included && styles.changeRowExcluded)}
                >
                  <Checkbox
                    controlOnly
                    checked={included}
                    onCheckedChange={(checked) => props.onToggle(change, checked === true)}
                  />
                  <span className={sx(styles.changeText)}>
                    <span className={sx(styles.changeTitle)}>
                      <span className={sx(styles.changeSubject)}>{changeSubject(change)}</span>
                      {change.before ? i18n.t("settingsConnections:settingsDialogAutoRoutingWizard.was", { value1: change.before }) : i18n.t("settingsConnections:settingsDialogAutoRoutingWizard.newRule")}
                      {i18n.t("settingsConnections:settingsDialogAutoRoutingWizard.now", { value1: change.after })}
                    </span>
                    <span className={sx(styles.changeEvidence)}>{change.evidence}</span>
                  </span>
                </label>
              </li>
            );
          })}
        </ul>
      )}

      <div className={sx(styles.toolbar)}>
        <ActionButton weight="quiet" onClick={props.onBack}>
          {t("common:actions.back")}</ActionButton>
        <span className={sx(styles.toolbarSpacer)} />
        <ActionButton weight="primary" onClick={props.onContinue}>
          {t("common:actions.continue")}</ActionButton>
      </div>
    </div>
  );
}
