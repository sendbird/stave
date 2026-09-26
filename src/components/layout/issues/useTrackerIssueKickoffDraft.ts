import { useEffect, useMemo, useState } from "react";

import { toast } from "@/components/ui";
import {
  useDispatchRuntimeDraft,
  type DispatchRuntimeDraft,
  type DispatchWorkspaceStrategy,
} from "@/components/layout/dispatch-runtime";
import { proposeDispatchWorkspaceLabel } from "@/lib/crane-connector/workspace-label";
import { proposeTrackerIssueBranchName } from "@/lib/tracker-issues/branch-name";
import {
  kickoffTrackerIssue,
  useTrackerIssueDetail,
} from "@/lib/tracker-issues/client-state";
import { trackerIssueKey } from "@/lib/tracker-issues/client-store";
import { buildTrackerIssueInstruction } from "@/lib/tracker-issues/context";
import {
  describeTrackerIssueScope,
  findTrackerIssueMappedRepositoryPath,
  findTrackerIssueRuntimeMemory,
  readTrackerIssueLastRepository,
  resolveTrackerIssueScopeKey,
  updateCraneTeamProjectMapping,
  updateJiraProjectMapping,
  writeTrackerIssueLastRepository,
} from "@/lib/tracker-issues/kickoff-target";
import type {
  TrackerIssue,
  TrackerIssueKickoffResult,
  TrackerIssueStartMode,
} from "@/lib/tracker-issues/types";
import { useAppStore } from "@/store/app.store";
import { resolveRepositoryKickoffBranchNamingRule } from "@/store/repository.utils";

/**
 * Draft state for one tracker kickoff.
 *
 * Split out of the sheet so the two things worth reasoning about — where the
 * defaults come from, and what is actually sent — are readable without the
 * markup, and so the sheet stays a presentation component.
 */
export interface TrackerIssueKickoffDraft {
  runtime: DispatchRuntimeDraft;
  repositoryPath: string;
  setRepositoryPath: (repositoryPath: string) => void;
  workspaceStrategy: DispatchWorkspaceStrategy;
  setWorkspaceStrategy: (strategy: DispatchWorkspaceStrategy) => void;
  workspaceId: string;
  setWorkspaceId: (workspaceId: string) => void;
  branchName: string;
  setBranchName: (branchName: string) => void;
  workspaceLabel: string;
  setWorkspaceLabel: (workspaceLabel: string) => void;
  instruction: string;
  setInstruction: (instruction: string) => void;
  resetInstruction: () => void;
  startMode: TrackerIssueStartMode;
  setStartMode: (mode: TrackerIssueStartMode) => void;
  rememberDefaults: boolean;
  setRememberDefaults: (remember: boolean) => void;
  craneWriteBack: boolean;
  setCraneWriteBack: (enabled: boolean) => void;
  /** Crane connector is on and the ticket came from Crane. */
  craneWriteBackAvailable: boolean;
  /** Team or repository key the "Remember" switch would file defaults under. */
  scopeLabel: string | null;
  submitting: boolean;
  submit: () => Promise<TrackerIssueKickoffResult | null>;
  /** Workspaces of the selected repository, for the existing-workspace picker. */
  workspaces: readonly { id: string; name: string }[];
}

export function useTrackerIssueKickoffDraft(args: {
  task: TrackerIssue | null;
  open: boolean;
}): TrackerIssueKickoffDraft {
  const { task } = args;
  const detail = useTrackerIssueDetail(
    task ? trackerIssueKey(task.source, task.ref) : null,
  );
  const repositories = useAppStore((state) => state.recentRepositories);
  const settings = useAppStore((state) => state.settings);
  const providerAvailability = useAppStore(
    (state) => state.providerAvailability,
  );

  const [submitting, setSubmitting] = useState(false);
  const [repositoryPath, setRepositoryPath] = useState("");
  const [workspaceStrategy, setWorkspaceStrategy] =
    useState<DispatchWorkspaceStrategy>("new");
  const [workspaceId, setWorkspaceId] = useState("");
  const [branchName, setBranchName] = useState("");
  const [workspaceLabel, setWorkspaceLabel] = useState("");
  const [instruction, setInstruction] = useState("");
  const [startMode, setStartMode] = useState<TrackerIssueStartMode>("run");
  const [rememberDefaults, setRememberDefaults] = useState(false);
  const [craneWriteBack, setCraneWriteBack] = useState(false);

  const runtime = useDispatchRuntimeDraft({
    settings,
    providerAvailability,
    codexCatalogEnabled: args.open,
  });
  const { seed } = runtime;

  const craneWriteBackAvailable =
    task?.source === "crane" && settings.craneConnector.enabled;

  // Seeded once per ticket from a fresh store read, so a setting changed in
  // another window cannot reset choices already made in the open sheet.
  useEffect(() => {
    if (!task) {
      return;
    }
    const store = useAppStore.getState();
    const currentSettings = store.settings;
    const registeredRepositories = store.recentRepositories;
    const registeredPaths = registeredRepositories.map(
      (repository) => repository.repositoryPath,
    );
    const mappingSettings = {
      craneMappings: currentSettings.craneConnector.repositoryMappings,
      jiraMappings: currentSettings.jiraConnector.repositoryMappings,
    };
    const lastUsed = readTrackerIssueLastRepository(task.source);
    const activeRegistered =
      store.repositoryPath && registeredPaths.includes(store.repositoryPath)
        ? store.repositoryPath
        : null;
    // Mapping first, then the repository this source was last kicked off into,
    // then whatever is already open: each step is a weaker signal about where
    // this ticket's work belongs than the one before it.
    const nextRepositoryPath =
      findTrackerIssueMappedRepositoryPath({
        task,
        settings: mappingSettings,
        registeredRepositoryPaths: registeredPaths,
      }) ??
      (lastUsed && registeredPaths.includes(lastUsed) ? lastUsed : null) ??
      activeRegistered ??
      registeredPaths[0] ??
      "";

    setRepositoryPath(nextRepositoryPath);
    setWorkspaceStrategy("new");
    setWorkspaceId("");
    setBranchName(
      proposeTrackerIssueBranchName({
        task,
        namingRule: resolveRepositoryKickoffBranchNamingRule({
          repositoryPath: nextRepositoryPath,
          recentRepositories: registeredRepositories,
        }),
      }),
    );
    setWorkspaceLabel(proposeDispatchWorkspaceLabel(task.title));
    setStartMode(currentSettings.trackerIssues.defaultKickoffStartMode);
    setRememberDefaults(false);
    setCraneWriteBack(
      task.source === "crane" && currentSettings.craneConnector.enabled,
    );
    seed({
      settings: currentSettings,
      draftProvider: store.draftProvider,
      memory: findTrackerIssueRuntimeMemory({ task, settings: mappingSettings }),
    });
  }, [seed, task]);

  // Prefilled from the ticket and then owned by the user, so it is rebuilt only
  // when the ticket changes or its body finally arrives — never on an unrelated
  // re-render, which would discard an edit in progress.
  useEffect(() => {
    if (!task) {
      return;
    }
    setInstruction(buildTrackerIssueInstruction(task, detail));
  }, [detail, task]);

  // Write-back only means something for a Crane run that starts now, and the
  // IPC schema rejects every other combination outright.
  useEffect(() => {
    if (startMode !== "run" || !craneWriteBackAvailable) {
      setCraneWriteBack(false);
    }
  }, [craneWriteBackAvailable, startMode]);

  const workspaces = useMemo(
    () =>
      repositories.find((repository) => repository.repositoryPath === repositoryPath)
        ?.workspaces ?? [],
    [repositoryPath, repositories],
  );

  const rememberIfAsked = (chosenRepositoryPath: string) => {
    const scopeKey = task ? resolveTrackerIssueScopeKey(task) : null;
    if (!task || !scopeKey || !rememberDefaults) {
      return;
    }
    const store = useAppStore.getState();
    const memory = runtime.buildTeamRuntimeMemory();
    if (task.source === "crane") {
      const craneConnector = store.settings.craneConnector;
      store.updateSettings({
        patch: {
          craneConnector: {
            ...craneConnector,
            repositoryMappings: updateCraneTeamProjectMapping({
              mappings: craneConnector.repositoryMappings,
              teamKey: scopeKey,
              staveProjectPath: chosenRepositoryPath,
              runtime: memory,
            }),
          },
        },
      });
      return;
    }
    const jiraConnector = store.settings.jiraConnector;
    store.updateSettings({
      patch: {
        jiraConnector: {
          ...jiraConnector,
          repositoryMappings: updateJiraProjectMapping({
            mappings: jiraConnector.repositoryMappings,
            jiraProjectKey: scopeKey,
            staveProjectPath: chosenRepositoryPath,
            runtime: memory,
          }),
        },
      },
    });
  };

  const submit = async (): Promise<TrackerIssueKickoffResult | null> => {
    if (!task || submitting) {
      return null;
    }
    if (!repositoryPath) {
      toast.error("Choose a registered Stave repository.");
      return null;
    }
    if (workspaceStrategy === "existing" && !workspaceId) {
      toast.error("Choose an existing workspace.");
      return null;
    }
    if (workspaceStrategy === "new" && !branchName.trim()) {
      toast.error("Enter a branch name.");
      return null;
    }
    if (!instruction.trim()) {
      toast.error("Enter an instruction for the run.");
      return null;
    }

    setSubmitting(true);
    try {
      const reply = await kickoffTrackerIssue({
        source: task.source,
        taskRef: task.ref,
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
        instruction: instruction.trim(),
        startMode,
        craneWriteBack,
      });
      if (!reply.ok || !reply.result) {
        toast.error(`Could not start ${task.key}`, {
          description: reply.message,
        });
        return null;
      }
      writeTrackerIssueLastRepository(task.source, repositoryPath);
      rememberIfAsked(repositoryPath);
      return reply.result;
    } catch {
      toast.error(`Could not start ${task.key}.`);
      return null;
    } finally {
      setSubmitting(false);
    }
  };

  return {
    runtime,
    repositoryPath,
    setRepositoryPath,
    workspaceStrategy,
    setWorkspaceStrategy,
    workspaceId,
    setWorkspaceId,
    branchName,
    setBranchName,
    workspaceLabel,
    setWorkspaceLabel,
    instruction,
    setInstruction,
    resetInstruction: () => {
      if (task) {
        setInstruction(buildTrackerIssueInstruction(task, detail));
      }
    },
    startMode,
    setStartMode,
    rememberDefaults,
    setRememberDefaults,
    craneWriteBack,
    setCraneWriteBack,
    craneWriteBackAvailable: Boolean(craneWriteBackAvailable),
    scopeLabel: task ? describeTrackerIssueScope(task) : null,
    submitting,
    submit,
    workspaces,
  };
}
