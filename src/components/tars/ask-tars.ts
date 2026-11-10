import { i18n } from "@/i18n";
import { toast } from "@/components/ui";
import { fetchTrackerIssueDetail } from "@/lib/tracker-issues/client-state";
import { findTrackerIssueMappedRepositoryPath } from "@/lib/tracker-issues/kickoff-target";
import type { TrackerIssue } from "@/lib/tracker-issues/types";
import { buildTarsDocumentDraft, buildTarsIssueDraft, type TarsIntakeDraft } from "@/lib/tars/intake";
import { useAppStore } from "@/store/app.store";
import { hydrateTarsDraft } from "@/store/tars-draft-store";
import { stageTarsIntake } from "@/store/tars-intake";

/** Opens a reviewable draft; this path never calls sendMessage or admits work. */
export async function openTarsIntake(draft: TarsIntakeDraft): Promise<void> {
  await hydrateTarsDraft(window.api?.tars);
  stageTarsIntake(draft);
  useAppStore.getState().openTars();
}

const pendingIssues = new Set<string>();
export async function askTarsAboutIssue(task: TrackerIssue): Promise<void> {
  const key = `${task.source}:${task.ref}`;
  if (pendingIssues.has(key)) return;
  pendingIssues.add(key);
  try {
    const detail = await fetchTrackerIssueDetail(task.source, task.ref);
    const state = useAppStore.getState();
    const repositoryPath = findTrackerIssueMappedRepositoryPath({ task,
      settings: { craneMappings: state.settings.craneConnector.repositoryMappings,
        jiraMappings: state.settings.jiraConnector.repositoryMappings, githubMappings: state.settings.trackerIssues.githubMappings },
      registeredRepositoryPaths: state.recentRepositories.map((repository) => repository.repositoryPath),
    });
    const repository = state.recentRepositories.find((entry) => entry.repositoryPath === repositoryPath);
    await openTarsIntake(buildTarsIssueDraft({ task, description: detail?.description,
      request: i18n.t("shell:tars.intake.issueRequest"), repositoryPath,
      workspaceId: repository?.workspaces.some((workspace) => workspace.id === repository.activeWorkspaceId)
        ? repository.activeWorkspaceId : null }));
    if (!detail) toast.info(i18n.t("shell:tars.intake.issueBodyUnavailable"));
  } catch { toast.error(i18n.t("shell:tars.intake.failed")); }
  finally { pendingIssues.delete(key); }
}

export async function askTarsAboutDocument(filePath: string, content: string): Promise<void> {
  try {
    await openTarsIntake(buildTarsDocumentDraft({ filePath, content,
      request: i18n.t("shell:tars.intake.documentRequest") }));
  } catch { toast.error(i18n.t("shell:tars.intake.failed")); }
}
