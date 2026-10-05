import { formatDateTime } from "@/i18n/format";
import { i18n, useTranslation } from "@/i18n";
import { useEffect, useMemo, useRef, useState } from "react";
import { Cable, ExternalLink, ShieldCheck } from "lucide-react";
import { sx } from "@/components/ads/utils/stylex";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
  Button,
  Loader,
  toast,
} from "@/components/ui";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  DispatchRuntimeFields,
  DispatchTargetFields,
  RememberTeamDefaultsField,
  useDispatchRuntimeDraft,
  type DispatchWorkspaceStrategy,
} from "@/components/layout/dispatch-runtime";
import { craneApprovalStyles } from "./crane-dispatch-approval-dialog.styles";
import {
  dismissCraneDispatchApproval,
  setCraneConnectorClientStatus,
  useCraneConnectorClientState,
} from "@/lib/crane-connector/client-state";
import {
  buildCraneDispatchBranchName,
  resolveCraneJiraReference,
} from "@/lib/crane-connector/jira-reference";
import { proposeDispatchWorkspaceLabel } from "@/lib/crane-connector/workspace-label";
import {
  findMappedCraneTeamRuntime,
  findMappedStaveRepositoryPath,
  getCraneTeamKey,
  updateCraneTeamRepositoryMapping,
} from "@/lib/crane-connector/project-mapping";
import { useAppStore } from "@/store/app.store";

export function CraneDispatchApprovalDialog() {
  const { t: tI18n } = useTranslation(["kickoff"]);
  const { approval } = useCraneConnectorClientState();
  const declineButtonRef = useRef<HTMLButtonElement>(null);
  const [submitting, setSubmitting] = useState(false);
  const repositories = useAppStore((state) => state.recentRepositories);
  const settings = useAppStore((state) => state.settings);
  const providerAvailability = useAppStore(
    (state) => state.providerAvailability,
  );
  const [repositoryPath, setRepositoryPath] = useState("");
  const [rememberTeamDefaults, setRememberTeamDefaults] = useState(false);
  const [workspaceStrategy, setWorkspaceStrategy] =
    useState<DispatchWorkspaceStrategy>("new");
  const [workspaceId, setWorkspaceId] = useState("");
  const [branchName, setBranchName] = useState("");
  const [workspaceLabel, setWorkspaceLabel] = useState("");
  const runtime = useDispatchRuntimeDraft({
    settings,
    providerAvailability,
    codexCatalogEnabled: approval !== null,
  });

  const selectedRepository = useMemo(
    () =>
      repositories.find((repository) => repository.repositoryPath === repositoryPath) ?? null,
    [repositoryPath, repositories, i18n.resolvedLanguage],
  );
  const jiraReference = useMemo(
    () => (approval ? resolveCraneJiraReference(approval.job) : null),
    [approval, i18n.resolvedLanguage],
  );
  const craneTeamKey = useMemo(
    () => (approval ? getCraneTeamKey(approval.job.issue.key) : null),
    [approval, i18n.resolvedLanguage],
  );

  // Seeded once per approval from a fresh store read so that changing a Stave
  // setting in another window cannot reset choices already made in this dialog.
  const { seed } = runtime;
  useEffect(() => {
    if (!approval) {
      return;
    }
    const store = useAppStore.getState();
    const currentSettings = store.settings;
    const registeredRepositories = store.recentRepositories;
    const mappings = currentSettings.craneConnector.repositoryMappings;
    const mappedRepositoryPath = findMappedStaveRepositoryPath({
      issueKey: approval.job.issue.key,
      mappings,
      registeredRepositoryPaths: registeredRepositories.map(
        (repository) => repository.repositoryPath,
      ),
    });
    const activeRegisteredRepositoryPath =
      store.repositoryPath &&
      registeredRepositories.some(
        (repository) => repository.repositoryPath === store.repositoryPath,
      )
        ? store.repositoryPath
        : null;
    const rememberedRuntime = findMappedCraneTeamRuntime({
      issueKey: approval.job.issue.key,
      mappings,
    });

    setRepositoryPath(
      mappedRepositoryPath ??
        activeRegisteredRepositoryPath ??
        registeredRepositories[0]?.repositoryPath ??
        "",
    );
    setRememberTeamDefaults(Boolean(getCraneTeamKey(approval.job.issue.key)));
    setWorkspaceStrategy("new");
    setWorkspaceId("");
    setBranchName(buildCraneDispatchBranchName(approval.job));
    setWorkspaceLabel(proposeDispatchWorkspaceLabel(approval.job.issue.title));
    seed({
      settings: currentSettings,
      draftProvider: store.draftProvider,
      memory: rememberedRuntime,
    });
    // Decline holds focus so a stray Enter cannot approve a remote-originated
    // job. A single frame is not enough: surfaces behind the dialog (notably
    // the composer) can autofocus a frame or two after it opens and win the
    // race under load. Re-assert only while focus has actually escaped the
    // dialog, so moving between the dialog's own controls is never disturbed.
    let frame = 0;
    const holdInitialFocus = (remainingFrames: number) => {
      const button = declineButtonRef.current;
      if (!button) {
        return;
      }
      const content = button.closest('[role="dialog"]');
      if (content && !content.contains(button.ownerDocument.activeElement)) {
        button.focus();
      }
      if (remainingFrames > 0) {
        frame = window.requestAnimationFrame(() =>
          holdInitialFocus(remainingFrames - 1),
        );
      }
    };
    frame = window.requestAnimationFrame(() => holdInitialFocus(3));
    return () => window.cancelAnimationFrame(frame);
  }, [approval, seed]);

  const decline = async () => {
    if (!approval || submitting) {
      return;
    }
    const declineJob = window.api?.craneConnector?.decline;
    if (!declineJob) {
      toast.error(tI18n("kickoff:craneDispatchApprovalDialog.craneConnectorControlsAreUnavailable"));
      return;
    }
    setSubmitting(true);
    try {
      const result = await declineJob({ jobId: approval.job.id });
      setCraneConnectorClientStatus(result.status);
      if (!result.ok) {
        toast.error(tI18n("kickoff:craneDispatchApprovalDialog.couldNotDeclineTheCraneJob"), {
          description: result.message,
        });
        return;
      }
      dismissCraneDispatchApproval(approval.job.id);
      toast.info(tI18n("kickoff:craneDispatchApprovalDialog.declinedValue", { value1: approval.job.issue.key }));
    } catch {
      toast.error(tI18n("kickoff:craneDispatchApprovalDialog.couldNotDeclineTheCraneJob2"));
    } finally {
      setSubmitting(false);
    }
  };

  const approve = async () => {
    if (!approval || submitting) {
      return;
    }
    const approveJob = window.api?.craneConnector?.approve;
    if (!approveJob) {
      toast.error(tI18n("kickoff:craneDispatchApprovalDialog.craneConnectorControlsAreUnavailable"));
      return;
    }
    if (!repositoryPath) {
      toast.error(tI18n("kickoff:craneDispatchApprovalDialog.chooseARegisteredStaveRepository"));
      return;
    }
    if (workspaceStrategy === "existing" && !workspaceId) {
      toast.error(tI18n("kickoff:craneDispatchApprovalDialog.chooseAnExistingWorkspace"));
      return;
    }
    if (workspaceStrategy === "new" && !branchName.trim()) {
      toast.error(tI18n("kickoff:craneDispatchApprovalDialog.enterABranchName"));
      return;
    }

    setSubmitting(true);
    try {
      const result = await approveJob({
        jobId: approval.job.id,
        repositoryPath,
        workspace:
          workspaceStrategy === "new"
            ? {
                strategy: "new",
                branchName: branchName.trim(),
                ...(workspaceLabel.trim()
                  ? { workspaceLabel: workspaceLabel.trim() }
                  : {}),
              }
            : { strategy: "existing", workspaceId },
        runtime: runtime.buildRuntimeChoice(),
      });
      setCraneConnectorClientStatus(result.status);
      if (!result.ok || !result.workspaceId || !result.taskId) {
        toast.error(tI18n("kickoff:craneDispatchApprovalDialog.couldNotStartTheCraneJob"), {
          description: result.message,
        });
        return;
      }
      if (craneTeamKey) {
        const store = useAppStore.getState();
        const craneConnector = store.settings.craneConnector;
        store.updateSettings({
          patch: {
            craneConnector: {
              ...craneConnector,
              repositoryMappings: updateCraneTeamRepositoryMapping({
                mappings: craneConnector.repositoryMappings,
                teamKey: craneTeamKey,
                staveProjectPath: rememberTeamDefaults ? repositoryPath : null,
                runtime: rememberTeamDefaults
                  ? runtime.buildTeamRuntimeMemory()
                  : null,
              }),
            },
          },
        });
      }
      dismissCraneDispatchApproval(approval.job.id);
      toast.success(tI18n("kickoff:craneDispatchApprovalDialog.startedValueInStave", { value1: approval.job.issue.key }));
      void useAppStore
        .getState()
        .focusTaskAttention({
          repositoryPath,
          workspaceId: result.workspaceId,
          taskId: result.taskId,
          refreshFromPersistence: true,
        })
        .catch(() => {
          toast.error(tI18n("kickoff:craneDispatchApprovalDialog.theCraneTaskStartedButStaveCould"));
        });
    } catch {
      toast.error(tI18n("kickoff:craneDispatchApprovalDialog.couldNotStartTheCraneJob2"));
    } finally {
      setSubmitting(false);
    }
  };

  const expiresAt = approval
    ? formatDateTime(new Date(approval.job.expiresAt))
    : "";

  return (
    <Dialog
      open={approval !== null}
      onOpenChange={(open) => {
        if (!open) {
          void decline();
        }
      }}
    >
      <DialogContent
        showCloseButton={false}
        xstyle={craneApprovalStyles.content}
        initialFocus={() => declineButtonRef.current}
      >
        <DialogHeader className={sx(craneApprovalStyles.header)}>
          <div className={sx(craneApprovalStyles.headerRow)}>
            <span className={sx(craneApprovalStyles.headerBadge)}>
              <Cable className={sx(craneApprovalStyles.headerIcon)} />
            </span>
            <div className={sx(craneApprovalStyles.headerText)}>
              <DialogTitle>
          {tI18n("kickoff:craneDispatchApprovalDialog.runQuestion", { issue: approval?.job.issue.key ?? tI18n("kickoff:craneDispatchApprovalDialog.craneIssue") })}
        </DialogTitle>
              <DialogDescription className={sx(craneApprovalStyles.headerDescription)}>
                {tI18n("kickoff:craneDispatchApprovalDialog.thisRequestCameFromYourPairedCrane")}</DialogDescription>
            </div>
          </div>
        </DialogHeader>

        <div className={sx(craneApprovalStyles.body)}>
          <section
            className={sx(craneApprovalStyles.panel)}
            aria-labelledby="crane-dispatch-issue-heading"
          >
            <div className={sx(craneApprovalStyles.issueRow)}>
              <div className={sx(craneApprovalStyles.issueText)}>
                <h3
                  id="crane-dispatch-issue-heading"
                  className={sx(craneApprovalStyles.issueTitle)}
                >
                  {approval?.job.issue.title}
                </h3>
                <p className={sx(craneApprovalStyles.issueMeta)}>
          {tI18n("kickoff:craneDispatchApprovalDialog.expiry", { time: expiresAt })}
        </p>
                {jiraReference ? (
                  <p className={sx(craneApprovalStyles.issueMeta)}>
          {tI18n("kickoff:craneDispatchApprovalDialog.jiraPrecedence", { key: jiraReference.key })}
        </p>
                ) : null}
              </div>
              <Button
                type="button"
                size="sm"
                variant="outline"
                onClick={() => {
                  const href = approval?.job.issue.href;
                  if (href) {
                    void window.api?.shell
                      ?.openExternal?.({ url: href })
                      .catch(() => {
                        toast.error(tI18n("kickoff:craneDispatchApprovalDialog.couldNotOpenTheCraneIssue"));
                      });
                  }
                }}
              >
                <ExternalLink className={sx(craneApprovalStyles.buttonIcon)} />
                {tI18n("kickoff:craneDispatchApprovalDialog.openSource")}</Button>
            </div>
            <div className={sx(craneApprovalStyles.instructionGroup)}>
              <p className={sx(craneApprovalStyles.instructionLabel)}>
                {tI18n("kickoff:craneDispatchApprovalDialog.requestedInstruction")}</p>
              <p className={sx(craneApprovalStyles.instruction)}>
                {approval?.job.instruction}
              </p>
            </div>
            {approval?.job.issue.description ? (
              <Accordion className={sx(craneApprovalStyles.descriptionAccordion)}>
                <AccordionItem value="issue-description">
                  <AccordionTrigger
                    className={sx(craneApprovalStyles.descriptionTrigger)}
                  >
                    {tI18n("kickoff:craneDispatchApprovalDialog.issueDescription")}</AccordionTrigger>
                  <AccordionContent
                    className={sx(craneApprovalStyles.descriptionPanel)}
                  >
                    <p className={sx(craneApprovalStyles.descriptionBody)}>
                      {approval.job.issue.description}
                    </p>
                  </AccordionContent>
                </AccordionItem>
              </Accordion>
            ) : null}
          </section>

          <DispatchTargetFields
            idPrefix="crane-dispatch"
            repositories={repositories}
            workspaces={selectedRepository?.workspaces ?? []}
            repositoryPath={repositoryPath}
            onRepositoryPathChange={setRepositoryPath}
            workspaceStrategy={workspaceStrategy}
            onWorkspaceStrategyChange={setWorkspaceStrategy}
            workspaceId={workspaceId}
            onWorkspaceIdChange={setWorkspaceId}
            branchName={branchName}
            onBranchNameChange={setBranchName}
            workspaceLabel={workspaceLabel}
            onWorkspaceLabelChange={setWorkspaceLabel}
          />

          <DispatchRuntimeFields
            idPrefix="crane-dispatch"
            draft={runtime}
            providerTimeoutMs={settings.providerTimeoutMs}
            disabled={submitting}
            footer={
              craneTeamKey ? (
                <RememberTeamDefaultsField
                  idPrefix="crane-dispatch"
                  scopeLabel={craneTeamKey}
                  checked={rememberTeamDefaults}
                  onCheckedChange={setRememberTeamDefaults}
                />
              ) : null
            }
          />

          <section className={sx(craneApprovalStyles.privacyPanel)}>
            <ShieldCheck className={sx(craneApprovalStyles.privacyIcon)} />
            <div className={sx(craneApprovalStyles.privacyText)}>
              <p className={sx(craneApprovalStyles.privacyHeading)}>
                {tI18n("kickoff:craneDispatchApprovalDialog.statusOnlyReporting")}</p>
              <p className={sx(craneApprovalStyles.privacyCopy)}>
                {tI18n("kickoff:craneDispatchApprovalDialog.craneReceivesLifecycleStateSequenceTimestampsAnd")}</p>
            </div>
          </section>
        </div>

        <DialogFooter className={sx(craneApprovalStyles.footer)}>
          <span className={sx(craneApprovalStyles.footerNote)}>
            {rememberTeamDefaults && craneTeamKey
              ? tI18n("kickoff:craneDispatchApprovalDialog.runApprovalIsJobScopedOnlyThese")
              : tI18n("kickoff:craneDispatchApprovalDialog.approvalAppliesToThisJobOnly")}
          </span>
          <Button
            ref={declineButtonRef}
            type="button"
            variant="outline"
            disabled={submitting}
            onClick={() => void decline()}
          >
            {tI18n("kickoff:craneDispatchApprovalDialog.decline")}</Button>
          <Button
            type="button"
            disabled={
              submitting ||
              !repositoryPath ||
              !runtime.model.model ||
              // Approving with an unavailable provider fails inside the host
              // runtime, and that failure is terminal for the Crane job.
              !runtime.providerAvailable
            }
            onClick={() => void approve()}
          >
            {submitting ? (
              <Loader aria-hidden size="xs" variant="spinner" />
            ) : null}
            {tI18n("kickoff:craneDispatchApprovalDialog.approveAndRunLocally")}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
