import { useEffect, useMemo, useRef, useState } from "react";
import { Cable, ExternalLink, Loader2, ShieldCheck } from "lucide-react";
import {
  Button,
  Input,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  Switch,
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
  dismissCraneDispatchApproval,
  setCraneConnectorClientStatus,
  useCraneConnectorClientState,
} from "@/lib/crane-connector/client-state";
import {
  getDefaultModelForProvider,
  getProviderLabel,
  getSdkModelOptions,
  toHumanModelName,
} from "@/lib/providers/model-catalog";
import type {
  AdvisorTarget,
  ProviderId,
} from "@/lib/providers/provider.types";
import { useAppStore } from "@/store/app.store";

type WorkspaceStrategy = "new" | "existing";
type AdvisorProvider = ProviderId | "off";

function defaultBranchName(issueKey: string) {
  const normalized = issueKey
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9._-]+/g, "-")
    .replace(/^-+|-+$/g, "");
  return `crane/${normalized || "issue"}`;
}

function modelsForProvider(providerId: ProviderId, selected: string) {
  return Array.from(
    new Set([
      selected,
      ...getSdkModelOptions({ providerId }),
    ]),
  ).filter(Boolean);
}

export function CraneDispatchApprovalDialog() {
  const { approval } = useCraneConnectorClientState();
  const declineButtonRef = useRef<HTMLButtonElement>(null);
  const [submitting, setSubmitting] = useState(false);
  const activeProjectPath = useAppStore((state) => state.projectPath);
  const projects = useAppStore((state) => state.recentProjects);
  const draftProvider = useAppStore((state) => state.draftProvider);
  const modelClaude = useAppStore((state) => state.settings.modelClaude);
  const modelCodex = useAppStore((state) => state.settings.modelCodex);
  const defaultClaudePermissionMode = useAppStore(
    (state) => state.settings.claudePermissionMode,
  );
  const defaultClaudeSandboxEnabled = useAppStore(
    (state) => state.settings.claudeSandboxEnabled,
  );
  const defaultCodexFileAccess = useAppStore(
    (state) => state.settings.codexFileAccess,
  );
  const defaultCodexNetworkAccess = useAppStore(
    (state) => state.settings.codexNetworkAccess,
  );
  const defaultCodexApprovalPolicy = useAppStore(
    (state) => state.settings.codexApprovalPolicy,
  );
  const [projectPath, setProjectPath] = useState("");
  const [workspaceStrategy, setWorkspaceStrategy] =
    useState<WorkspaceStrategy>("new");
  const [workspaceId, setWorkspaceId] = useState("");
  const [branchName, setBranchName] = useState("");
  const [provider, setProvider] = useState<ProviderId>("claude-code");
  const [model, setModel] = useState("");
  const [claudePermissionMode, setClaudePermissionMode] =
    useState(defaultClaudePermissionMode);
  const [claudeSandboxEnabled, setClaudeSandboxEnabled] = useState(
    defaultClaudeSandboxEnabled,
  );
  const [codexFileAccess, setCodexFileAccess] = useState(
    defaultCodexFileAccess,
  );
  const [codexNetworkAccess, setCodexNetworkAccess] = useState(
    defaultCodexNetworkAccess,
  );
  const [codexApprovalPolicy, setCodexApprovalPolicy] = useState(
    defaultCodexApprovalPolicy,
  );
  const [advisorProvider, setAdvisorProvider] =
    useState<AdvisorProvider>("off");
  const [advisorModel, setAdvisorModel] = useState("");

  const selectedProject = useMemo(
    () =>
      projects.find((project) => project.projectPath === projectPath) ??
      null,
    [projectPath, projects],
  );
  const providerModels = useMemo(
    () => modelsForProvider(provider, model),
    [model, provider],
  );
  const advisorModels = useMemo(
    () =>
      advisorProvider === "off"
        ? []
        : modelsForProvider(advisorProvider, advisorModel),
    [advisorModel, advisorProvider],
  );

  useEffect(() => {
    if (!approval) {
      return;
    }
    const preferredProjectPath =
      (activeProjectPath &&
      projects.some(
        (project) => project.projectPath === activeProjectPath,
      )
        ? activeProjectPath
        : projects[0]?.projectPath) ?? "";
    const preferredProvider = draftProvider;
    setProjectPath(preferredProjectPath);
    setWorkspaceStrategy("new");
    setWorkspaceId("");
    setBranchName(defaultBranchName(approval.job.issue.key));
    setProvider(preferredProvider);
    setModel(
      preferredProvider === "claude-code" ? modelClaude : modelCodex,
    );
    setClaudePermissionMode(defaultClaudePermissionMode);
    setClaudeSandboxEnabled(defaultClaudeSandboxEnabled);
    setCodexFileAccess(defaultCodexFileAccess);
    setCodexNetworkAccess(defaultCodexNetworkAccess);
    setCodexApprovalPolicy(defaultCodexApprovalPolicy);
    setAdvisorProvider("off");
    setAdvisorModel("");
    const frame = window.requestAnimationFrame(() => {
      declineButtonRef.current?.focus();
    });
    return () => window.cancelAnimationFrame(frame);
  }, [
    activeProjectPath,
    approval,
    defaultClaudePermissionMode,
    defaultClaudeSandboxEnabled,
    defaultCodexApprovalPolicy,
    defaultCodexFileAccess,
    defaultCodexNetworkAccess,
    draftProvider,
    modelClaude,
    modelCodex,
    projects,
  ]);

  const changeProvider = (nextProvider: ProviderId) => {
    setProvider(nextProvider);
    setModel(
      nextProvider === "claude-code"
        ? modelClaude
        : modelCodex,
    );
  };

  const changeAdvisorProvider = (nextProvider: AdvisorProvider) => {
    setAdvisorProvider(nextProvider);
    setAdvisorModel(
      nextProvider === "off"
        ? ""
        : getDefaultModelForProvider({ providerId: nextProvider }),
    );
  };

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

    const advisorTarget: AdvisorTarget | null =
      advisorProvider === "off"
        ? null
        : {
            providerId: advisorProvider,
            model: advisorModel,
          };
    setSubmitting(true);
    try {
      const result = await approveJob({
        jobId: approval.job.id,
        projectPath,
        workspace:
          workspaceStrategy === "new"
            ? { strategy: "new", branchName: branchName.trim() }
            : { strategy: "existing", workspaceId },
        runtime:
          provider === "claude-code"
            ? {
                provider,
                model,
                claudePermissionMode,
                claudeSandboxEnabled,
                advisorTarget,
              }
            : {
                provider,
                model,
                codexFileAccess,
                codexNetworkAccess,
                codexApprovalPolicy,
                advisorTarget,
              },
      });
      setCraneConnectorClientStatus(result.status);
      if (!result.ok || !result.workspaceId || !result.taskId) {
        toast.error("Could not start the Crane job", {
          description: result.message,
        });
        return;
      }
      dismissCraneDispatchApproval(approval.job.id);
      toast.success(`Started ${approval.job.issue.key} in Stave`);
      void useAppStore.getState().focusTaskAttention({
        projectPath,
        workspaceId: result.workspaceId,
        taskId: result.taskId,
        refreshFromPersistence: true,
      }).catch(() => {
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
                This request came from your paired Crane account. Nothing
                starts until you approve these local choices.
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
              </div>
              <Button
                type="button"
                size="sm"
                variant="outline"
                onClick={() => {
                  const href = approval?.job.issue.href;
                  if (href) {
                    void window.api?.shell?.openExternal?.({ url: href }).catch(
                      () => {
                        toast.error("Could not open the Crane issue.");
                      },
                    );
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
              <details className="text-xs">
                <summary className="cursor-pointer font-medium text-muted-foreground">
                  Issue description
                </summary>
                <p className="mt-2 max-h-40 overflow-y-auto whitespace-pre-wrap leading-5 text-foreground">
                  {approval.job.issue.description}
                </p>
              </details>
            ) : null}
          </section>

          <section
            className="grid gap-4"
            aria-labelledby="crane-dispatch-target-heading"
          >
            <h3
              id="crane-dispatch-target-heading"
              className="text-sm font-semibold"
            >
              Local target
            </h3>
            <div className="grid gap-2">
              <label
                htmlFor="crane-dispatch-project"
                className="text-xs font-medium text-muted-foreground"
              >
                Registered project
              </label>
              <Select value={projectPath} onValueChange={setProjectPath}>
                <SelectTrigger id="crane-dispatch-project">
                  <SelectValue placeholder="Choose a project" />
                </SelectTrigger>
                <SelectContent>
                  {projects.map((project) => (
                    <SelectItem
                      key={project.projectPath}
                      value={project.projectPath}
                    >
                      {project.projectName}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <p className="truncate font-mono text-[11px] text-muted-foreground">
                {projectPath || "No registered project available"}
              </p>
            </div>
            <div className="grid gap-2">
              <label
                htmlFor="crane-dispatch-workspace-strategy"
                className="text-xs font-medium text-muted-foreground"
              >
                Workspace
              </label>
              <Select
                value={workspaceStrategy}
                onValueChange={(value) =>
                  setWorkspaceStrategy(value as WorkspaceStrategy)
                }
              >
                <SelectTrigger id="crane-dispatch-workspace-strategy">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="new">
                    Create a new workspace
                  </SelectItem>
                  <SelectItem value="existing">
                    Use an existing workspace
                  </SelectItem>
                </SelectContent>
              </Select>
            </div>
            {workspaceStrategy === "new" ? (
              <div className="grid gap-2">
                <label
                  htmlFor="crane-dispatch-branch"
                  className="text-xs font-medium text-muted-foreground"
                >
                  Branch name
                </label>
                <Input
                  id="crane-dispatch-branch"
                  value={branchName}
                  onChange={(event) => setBranchName(event.target.value)}
                  autoComplete="off"
                />
                <p className="text-xs text-muted-foreground">
                  Based on the selected project&apos;s remote default branch.
                </p>
              </div>
            ) : (
              <div className="grid gap-2">
                <label
                  htmlFor="crane-dispatch-existing-workspace"
                  className="text-xs font-medium text-muted-foreground"
                >
                  Existing workspace
                </label>
                <Select value={workspaceId} onValueChange={setWorkspaceId}>
                  <SelectTrigger id="crane-dispatch-existing-workspace">
                    <SelectValue placeholder="Choose a workspace" />
                  </SelectTrigger>
                  <SelectContent>
                    {(selectedProject?.workspaces ?? []).map((workspace) => (
                      <SelectItem key={workspace.id} value={workspace.id}>
                        {workspace.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}
          </section>

          <section
            className="grid gap-4"
            aria-labelledby="crane-dispatch-runtime-heading"
          >
            <h3
              id="crane-dispatch-runtime-heading"
              className="text-sm font-semibold"
            >
              Local runtime
            </h3>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <div className="grid gap-2">
                <label
                  htmlFor="crane-dispatch-provider"
                  className="text-xs font-medium text-muted-foreground"
                >
                  Provider
                </label>
                <Select
                  value={provider}
                  onValueChange={(value) =>
                    changeProvider(value as ProviderId)
                  }
                >
                  <SelectTrigger id="crane-dispatch-provider">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="claude-code">Claude</SelectItem>
                    <SelectItem value="codex">Codex</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="grid gap-2">
                <label
                  htmlFor="crane-dispatch-model"
                  className="text-xs font-medium text-muted-foreground"
                >
                  Model
                </label>
                <Select value={model} onValueChange={setModel}>
                  <SelectTrigger id="crane-dispatch-model">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {providerModels.map((value) => (
                      <SelectItem key={value} value={value}>
                        {toHumanModelName({ model: value })}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>

            {provider === "claude-code" ? (
              <div className="grid gap-3 rounded-lg border border-border p-3">
                <div className="grid gap-2">
                  <label
                    htmlFor="crane-dispatch-claude-permissions"
                    className="text-xs font-medium text-muted-foreground"
                  >
                    Claude permission mode
                  </label>
                  <Select
                    value={claudePermissionMode}
                    onValueChange={(value) =>
                      setClaudePermissionMode(
                        value as typeof claudePermissionMode,
                      )
                    }
                  >
                    <SelectTrigger id="crane-dispatch-claude-permissions">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {[
                        "default",
                        "acceptEdits",
                        "auto",
                        "dontAsk",
                        "plan",
                        "bypassPermissions",
                      ].map((value) => (
                        <SelectItem key={value} value={value}>
                          {value}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="flex items-center justify-between gap-3">
                  <label
                    htmlFor="crane-dispatch-claude-sandbox"
                    className="text-sm"
                  >
                    Claude sandbox
                  </label>
                  <Switch
                    id="crane-dispatch-claude-sandbox"
                    checked={claudeSandboxEnabled}
                    onCheckedChange={setClaudeSandboxEnabled}
                  />
                </div>
              </div>
            ) : (
              <div className="grid gap-3 rounded-lg border border-border p-3">
                <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                  <div className="grid gap-2">
                    <label
                      htmlFor="crane-dispatch-codex-files"
                      className="text-xs font-medium text-muted-foreground"
                    >
                      File access
                    </label>
                    <Select
                      value={codexFileAccess}
                      onValueChange={(value) =>
                        setCodexFileAccess(value as typeof codexFileAccess)
                      }
                    >
                      <SelectTrigger id="crane-dispatch-codex-files">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="read-only">Read only</SelectItem>
                        <SelectItem value="workspace-write">
                          Workspace write
                        </SelectItem>
                        <SelectItem value="danger-full-access">
                          Full access
                        </SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="grid gap-2">
                    <label
                      htmlFor="crane-dispatch-codex-approval"
                      className="text-xs font-medium text-muted-foreground"
                    >
                      Approval policy
                    </label>
                    <Select
                      value={codexApprovalPolicy}
                      onValueChange={(value) =>
                        setCodexApprovalPolicy(
                          value as typeof codexApprovalPolicy,
                        )
                      }
                    >
                      <SelectTrigger id="crane-dispatch-codex-approval">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="on-request">
                          On request
                        </SelectItem>
                        <SelectItem value="untrusted">Untrusted</SelectItem>
                        <SelectItem value="on-failure">
                          On failure
                        </SelectItem>
                        <SelectItem value="never">Never</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </div>
                <div className="flex items-center justify-between gap-3">
                  <label
                    htmlFor="crane-dispatch-codex-network"
                    className="text-sm"
                  >
                    Network access
                  </label>
                  <Switch
                    id="crane-dispatch-codex-network"
                    checked={codexNetworkAccess}
                    onCheckedChange={setCodexNetworkAccess}
                  />
                </div>
              </div>
            )}

            <div className="grid gap-3 rounded-lg border border-border p-3">
              <div className="grid gap-2">
                <label
                  htmlFor="crane-dispatch-advisor"
                  className="text-xs font-medium text-muted-foreground"
                >
                  Advisor
                </label>
                <Select
                  value={advisorProvider}
                  onValueChange={(value) =>
                    changeAdvisorProvider(value as AdvisorProvider)
                  }
                >
                  <SelectTrigger id="crane-dispatch-advisor">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="off">Off</SelectItem>
                    <SelectItem value="claude-code">
                      Claude Advisor
                    </SelectItem>
                    <SelectItem value="codex">Codex Advisor</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              {advisorProvider !== "off" ? (
                <div className="grid gap-2">
                  <label
                    htmlFor="crane-dispatch-advisor-model"
                    className="text-xs font-medium text-muted-foreground"
                  >
                    {getProviderLabel({
                      providerId: advisorProvider,
                    })}{" "}
                    Advisor model
                  </label>
                  <Select
                    value={advisorModel}
                    onValueChange={setAdvisorModel}
                  >
                    <SelectTrigger id="crane-dispatch-advisor-model">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {advisorModels.map((value) => (
                        <SelectItem key={value} value={value}>
                          {toHumanModelName({ model: value })}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <p className="text-xs leading-5 text-muted-foreground">
                    Adds one isolated read-only preflight and extra latency
                    before the primary run.
                  </p>
                </div>
              ) : null}
            </div>
          </section>

          <section className="flex items-start gap-3 rounded-lg border border-border bg-muted/30 p-4">
            <ShieldCheck className="mt-0.5 size-4 shrink-0 text-muted-foreground" />
            <div className="space-y-1 text-xs leading-5">
              <p className="font-medium text-foreground">
                Status-only reporting
              </p>
              <p className="text-muted-foreground">
                Crane receives lifecycle state, sequence, timestamps, and
                safe error codes only. Prompts, responses, reasoning, files,
                paths, diffs, and credentials stay local.
              </p>
            </div>
          </section>
        </div>

        <DialogFooter className="shrink-0 border-t border-border/70 bg-muted/20 px-6 py-4">
          <span className="mr-auto text-xs text-muted-foreground">
            Approval applies to this job only.
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
            disabled={submitting || !projectPath || !model}
            onClick={() => void approve()}
          >
            {submitting ? <Loader2 className="size-4 animate-spin" /> : null}
            Approve and run locally
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
