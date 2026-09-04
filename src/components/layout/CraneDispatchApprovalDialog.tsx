import { useEffect, useMemo, useRef, useState } from "react";
import { Cable, ExternalLink, ShieldCheck } from "lucide-react";
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
import {
  dismissCraneDispatchApproval,
  setCraneConnectorClientStatus,
  useCraneConnectorClientState,
} from "@/lib/crane-connector/client-state";
import {
  buildCraneDispatchBranchName,
  resolveCraneJiraReference,
} from "@/lib/crane-connector/jira-reference";
import {
  findMappedCraneTeamRuntime,
  findMappedStaveProjectPath,
  getCraneTeamKey,
  updateCraneTeamProjectMapping,
} from "@/lib/crane-connector/project-mapping";
import { useAppStore } from "@/store/app.store";

export function CraneDispatchApprovalDialog() {
  const { approval } = useCraneConnectorClientState();
  const declineButtonRef = useRef<HTMLButtonElement>(null);
  const [submitting, setSubmitting] = useState(false);
  const projects = useAppStore((state) => state.recentProjects);
  const settings = useAppStore((state) => state.settings);
  const providerAvailability = useAppStore(
    (state) => state.providerAvailability,
  );
  const [projectPath, setProjectPath] = useState("");
  const [rememberTeamDefaults, setRememberTeamDefaults] = useState(false);
  const [workspaceStrategy, setWorkspaceStrategy] =
    useState<DispatchWorkspaceStrategy>("new");
  const [workspaceId, setWorkspaceId] = useState("");
  const [branchName, setBranchName] = useState("");
  const runtime = useDispatchRuntimeDraft({
    settings,
    providerAvailability,
    codexCatalogEnabled: approval !== null,
  });

  const selectedProject = useMemo(
    () =>
      projects.find((project) => project.projectPath === projectPath) ?? null,
    [projectPath, projects],
  );
  const jiraReference = useMemo(
    () => (approval ? resolveCraneJiraReference(approval.job) : null),
    [approval],
  );
  const craneTeamKey = useMemo(
    () => (approval ? getCraneTeamKey(approval.job.issue.key) : null),
    [approval],
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
    const registeredProjects = store.recentProjects;
    const mappings = currentSettings.craneConnector.projectMappings;
    const mappedProjectPath = findMappedStaveProjectPath({
      issueKey: approval.job.issue.key,
      mappings,
      registeredProjectPaths: registeredProjects.map(
        (project) => project.projectPath,
      ),
    });
    const activeRegisteredProjectPath =
      store.projectPath &&
      registeredProjects.some(
        (project) => project.projectPath === store.projectPath,
      )
        ? store.projectPath
        : null;
    const rememberedRuntime = findMappedCraneTeamRuntime({
      issueKey: approval.job.issue.key,
      mappings,
    });

    setProjectPath(
      mappedProjectPath ??
        activeRegisteredProjectPath ??
        registeredProjects[0]?.projectPath ??
        "",
    );
    setRememberTeamDefaults(Boolean(getCraneTeamKey(approval.job.issue.key)));
    setWorkspaceStrategy("new");
    setWorkspaceId("");
    setBranchName(buildCraneDispatchBranchName(approval.job));
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
      toast.error("Crane connector controls are unavailable.");
      return;
    }
    setSubmitting(true);
    try {
      const result = await declineJob({ jobId: approval.job.id });
      setCraneConnectorClientStatus(result.status);
      if (!result.ok) {
        toast.error("Could not decline the Crane job", {
          description: result.message,
        });
        return;
      }
      dismissCraneDispatchApproval(approval.job.id);
      toast.info(`Declined ${approval.job.issue.key}`);
    } catch {
      toast.error("Could not decline the Crane job.");
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
      toast.error("Crane connector controls are unavailable.");
      return;
    }
    if (!projectPath) {
      toast.error("Choose a registered Stave project.");
      return;
    }
    if (workspaceStrategy === "existing" && !workspaceId) {
      toast.error("Choose an existing workspace.");
      return;
    }
    if (workspaceStrategy === "new" && !branchName.trim()) {
      toast.error("Enter a branch name.");
      return;
    }

    setSubmitting(true);
    try {
      const result = await approveJob({
        jobId: approval.job.id,
        projectPath,
        workspace:
          workspaceStrategy === "new"
            ? { strategy: "new", branchName: branchName.trim() }
            : { strategy: "existing", workspaceId },
        runtime: runtime.buildRuntimeChoice(),
      });
      setCraneConnectorClientStatus(result.status);
      if (!result.ok || !result.workspaceId || !result.taskId) {
        toast.error("Could not start the Crane job", {
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
              projectMappings: updateCraneTeamProjectMapping({
                mappings: craneConnector.projectMappings,
                teamKey: craneTeamKey,
                staveProjectPath: rememberTeamDefaults ? projectPath : null,
                runtime: rememberTeamDefaults
                  ? runtime.buildTeamRuntimeMemory()
                  : null,
              }),
            },
          },
        });
      }
      dismissCraneDispatchApproval(approval.job.id);
      toast.success(`Started ${approval.job.issue.key} in Stave`);
      void useAppStore
        .getState()
        .focusTaskAttention({
          projectPath,
          workspaceId: result.workspaceId,
          taskId: result.taskId,
          refreshFromPersistence: true,
        })
        .catch(() => {
          toast.error("The Crane task started, but Stave could not focus it.");
        });
    } catch {
      toast.error("Could not start the Crane job.");
    } finally {
      setSubmitting(false);
    }
  };

  const expiresAt = approval
    ? new Date(approval.job.expiresAt).toLocaleString()
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
        className="flex max-h-[90vh] flex-col gap-0 overflow-hidden p-0 sm:max-w-2xl"
        initialFocus={() => declineButtonRef.current}
      >
        <DialogHeader className="shrink-0 border-b border-border/70 px-6 pt-6 pb-5 pr-12">
          <div className="flex items-start gap-3">
            <span className="flex size-10 shrink-0 items-center justify-center rounded-lg border border-border bg-muted">
              <Cable className="size-4 text-muted-foreground" />
            </span>
            <div className="min-w-0">
              <DialogTitle>
                Run {approval?.job.issue.key ?? "Crane issue"} in Stave?
              </DialogTitle>
              <DialogDescription className="mt-1 leading-5">
                This request came from your paired Crane account. Nothing starts
                until you approve these local choices.
              </DialogDescription>
            </div>
          </div>
        </DialogHeader>

        <div className="min-h-0 flex-1 space-y-5 overflow-y-auto px-6 py-5">
          <section
            className="space-y-2 rounded-lg border border-border bg-muted/30 p-4"
            aria-labelledby="crane-dispatch-issue-heading"
          >
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <h3
                  id="crane-dispatch-issue-heading"
                  className="text-sm font-semibold text-foreground"
                >
                  {approval?.job.issue.title}
                </h3>
                <p className="mt-1 text-xs text-muted-foreground">
                  Expires {expiresAt}
                </p>
                {jiraReference ? (
                  <p className="mt-1 text-xs text-muted-foreground">
                    Jira {jiraReference.key} takes precedence over the Crane key
                    in the branch name and task title.
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
                        toast.error("Could not open the Crane issue.");
                      });
                  }
                }}
              >
                <ExternalLink className="size-3.5" />
                Open source
              </Button>
            </div>
            <div className="space-y-1">
              <p className="text-xs font-medium text-muted-foreground">
                Requested instruction
              </p>
              <p className="whitespace-pre-wrap text-sm leading-5">
                {approval?.job.instruction}
              </p>
            </div>
            {approval?.job.issue.description ? (
              <Accordion className="border-t border-border/60">
                <AccordionItem value="issue-description" className="border-b-0">
                  <AccordionTrigger className="py-2 text-xs font-medium text-muted-foreground hover:no-underline">
                    Issue description
                  </AccordionTrigger>
                  <AccordionContent className="pb-2">
                    <p className="max-h-40 overflow-y-auto whitespace-pre-wrap text-xs leading-5 text-foreground">
                      {approval.job.issue.description}
                    </p>
                  </AccordionContent>
                </AccordionItem>
              </Accordion>
            ) : null}
          </section>

          <DispatchTargetFields
            idPrefix="crane-dispatch"
            projects={projects}
            workspaces={selectedProject?.workspaces ?? []}
            projectPath={projectPath}
            onProjectPathChange={setProjectPath}
            workspaceStrategy={workspaceStrategy}
            onWorkspaceStrategyChange={setWorkspaceStrategy}
            workspaceId={workspaceId}
            onWorkspaceIdChange={setWorkspaceId}
            branchName={branchName}
            onBranchNameChange={setBranchName}
          />

          <DispatchRuntimeFields
            idPrefix="crane-dispatch"
            draft={runtime}
            advisorConsultLimit={settings.advisorConsultLimit}
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

          <section className="flex items-start gap-3 rounded-lg border border-border bg-muted/30 p-4">
            <ShieldCheck className="mt-0.5 size-4 shrink-0 text-muted-foreground" />
            <div className="space-y-1 text-xs leading-5">
              <p className="font-medium text-foreground">
                Status-only reporting
              </p>
              <p className="text-muted-foreground">
                Crane receives lifecycle state, sequence, timestamps, and safe
                error codes only. Prompts, responses, reasoning, files, paths,
                diffs, and credentials stay local.
              </p>
            </div>
          </section>
        </div>

        <DialogFooter className="shrink-0 border-t border-border/70 bg-muted/20 px-6 py-4">
          <span className="mr-auto text-xs text-muted-foreground">
            {rememberTeamDefaults && craneTeamKey
              ? "Run approval is job-scoped; only these local team defaults are remembered."
              : "Approval applies to this job only."}
          </span>
          <Button
            ref={declineButtonRef}
            type="button"
            variant="outline"
            disabled={submitting}
            onClick={() => void decline()}
          >
            Decline
          </Button>
          <Button
            type="button"
            disabled={
              submitting ||
              !projectPath ||
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
            Approve and run locally
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
