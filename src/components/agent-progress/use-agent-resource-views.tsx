import { useEffect, useMemo, useState } from "react";
import { Button } from "@/components/aui/components/Button";
import { sx } from "@/components/aui/utils/stylex";
import { ScratchFilePreview } from "@/components/layout/WorkspaceScratchPreview";
import { useWorkspaceScratchLive } from "@/components/layout/useWorkspaceScratchLive";
import { BackgroundTaskList, useTaskBackground } from "@/components/session/BackgroundTasksSection";
import { useTranslation } from "@/i18n";
import { formatClaudeScratchFolder, type WorkspaceScratchFile, type WorkspaceScratchListing } from "@/lib/workspace-scratch";
import { scratchAgentId, scratchDisplayName } from "@/lib/workspace-scratch-view";
import { useAppStore } from "@/store/app.store";
import { useWorkspaceScratchStore } from "@/store/workspace-scratch-store";
import { agentProgressStyles as s } from "./agent-progress.styles";
import type { AgentProgressExtraView } from "./AgentProgressView";
import type { AgentProgressController } from "./use-agent-progress";

type Subagent = NonNullable<NonNullable<AgentProgressController["resourceScope"]>["subagent"]>;

export async function assignedFolder(agent: Subagent) {
  if (agent.providerId === "claude-code" && agent.agentId && globalThis.crypto?.subtle) {
    const digest = await crypto.subtle.digest("SHA-1", new TextEncoder().encode(agent.agentId));
    const hash = Array.from(new Uint8Array(digest, 0, 3), byte => byte.toString(16).padStart(2, "0")).join("");
    return formatClaudeScratchFolder(hash, agent.type);
  }
  return agent.prompt?.match(/Stave scratch folder for this sub-agent: `\.stave\/scratch\/agents\/([\w.-]+)\/`/)?.[1];
}

/** A shared workspace can contain several tasks' outputs. Match the assigned directory or a cited file. */
export function agentOutputFiles(listing: WorkspaceScratchListing | undefined, folder: string | undefined, result: string) {
  if (!listing) return [];
  const cited = new Set(Array.from(result.matchAll(/`([^`\n]+)`|\]\(([^)\n]+)\)|(?:^|\s)(\.stave\/scratch\/[^\s`<>()[\]]+)/g),
    match => (match[1] ?? match[2] ?? match[3] ?? "").replace(/^<|>$/g, "")));
  return [...listing.files, ...(listing.olderArtifacts ?? [])].filter(file =>
    (folder !== undefined && scratchAgentId(file.path) === folder) || cited.has(file.path));
}

function Outputs({ files, root }: { files: WorkspaceScratchFile[]; root: string }) {
  const [path, setPath] = useState<string>();
  const file = files.find(item => item.path === path) ?? files[0];
  return <div className={sx(s.content)}>
    {files.map(item => <Button key={item.path} size="xs" variant="quiet" aria-pressed={item === file}
      title={item.path} onClick={() => setPath(item.path)}>{scratchDisplayName(item.path)}</Button>)}
    {file && <ScratchFilePreview key={file.path} rootPath={root} file={file} />}
  </div>;
}

export function useAgentResourceViews(controller: AgentProgressController, readOnly: boolean) {
  const { t } = useTranslation("session");
  const { workspaceId = "", taskId = "" } = controller.context;
  const scope = controller.resourceScope;
  const agent = scope?.subagent;
  const { providerId, agentId, type, prompt } = agent ?? {};
  const [folder, setFolder] = useState<string>();
  useEffect(() => {
    let active = true;
    setFolder(undefined);
    void assignedFolder({ agentId, providerId, type, prompt }).then(value => {
      if (active) setFolder(value);
    }).catch(() => { /* Cited files still work when native folder lookup is unavailable. */ });
    return () => { active = false; };
  }, [agentId, providerId, type, prompt]);
  const root = useAppStore(state => state.workspacePathById[workspaceId] ??
    (workspaceId === state.activeWorkspaceId ? state.repositoryPath ?? undefined : undefined));
  const result = controller.progress?.result ?? "";
  const enabled = Boolean(folder || result.includes(".stave/scratch/"));
  useWorkspaceScratchLive({ workspaceId, rootPath: root, enabled });
  const listing = useWorkspaceScratchStore(state => state.listingByWorkspace[workspaceId]);
  const files = useMemo(() => agentOutputFiles(listing, folder, result), [listing, folder, result]);
  const { rows, turnId, liveTurnId } = useTaskBackground(taskId);
  const views: AgentProgressExtraView[] = [];
  if (files.length && root) views.push({ value: "outputs", label: t("agentProgress.panel.tabOutputs"), content: <Outputs files={files} root={root} /> });
  const commands = agent ? rows.filter(row => agent.toolUseId && row.parentToolUseId === agent.toolUseId) : rows.filter(row => !row.parentToolUseId);
  if (taskId && workspaceId && turnId && commands.length && (!scope?.turnIds || scope.turnIds.includes(turnId))) {
    views.push({ value: "background", label: t("agentProgress.panel.tabBackground"), content: <div className={sx(s.content)}>
      <BackgroundTaskList workspaceId={workspaceId} taskId={taskId} turnId={turnId} liveTurnId={liveTurnId} rows={commands} readOnly={readOnly} />
    </div> });
  }
  return views;
}
