import { useCallback, useEffect, useMemo, useState } from "react";
import { useShallow } from "zustand/react/shallow";
import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui";
import { Sparkles } from "lucide-react";
import { ScriptsManager } from "@/components/scripts";
import { useAppStore } from "@/store/app.store";
import type { RecentProjectState } from "@/store/project.utils";
import type { ResolvedWorkspaceScriptsConfig } from "@/lib/workspace-scripts/types";

export function ScriptsSection(props: {
  projects: RecentProjectState[];
  currentProjectPath?: string | null;
  selectedProjectPath?: string | null;
}) {
  const [
    activeWorkspaceId,
    workspaces,
    workspacePathById,
    workspaceBranchById,
    storeProjectPath,
  ] = useAppStore(
    useShallow(
      (state) =>
        [
          state.activeWorkspaceId,
          state.workspaces,
          state.workspacePathById,
          state.workspaceBranchById,
          state.projectPath,
        ] as const,
    ),
  );

  const currentProjectPath =
    props.currentProjectPath ?? storeProjectPath ?? null;
  const [selectedProjectPath, setSelectedProjectPath] = useState<string | null>(
    () =>
      props.selectedProjectPath ??
      currentProjectPath ??
      props.projects[0]?.projectPath ??
      null,
  );

  // Keep a valid selection if the projects list changes underneath us.
  useEffect(() => {
    if (
      selectedProjectPath &&
      props.projects.some(
        (project) => project.projectPath === selectedProjectPath,
      )
    ) {
      return;
    }
    setSelectedProjectPath(
      currentProjectPath ?? props.projects[0]?.projectPath ?? null,
    );
  }, [currentProjectPath, props.projects, selectedProjectPath]);

  const isCurrent =
    Boolean(selectedProjectPath) && selectedProjectPath === currentProjectPath;
  const selectedProjectLabel = useMemo(() => {
    const project = props.projects.find(
      (candidate) => candidate.projectPath === selectedProjectPath,
    );
    if (!project) {
      return undefined;
    }
    return `${project.projectName}${isCurrent ? " (current)" : ""}`;
  }, [isCurrent, props.projects, selectedProjectPath]);
  const scriptsWorkspacePath = isCurrent
    ? (workspacePathById[activeWorkspaceId] ?? selectedProjectPath ?? "")
    : (selectedProjectPath ?? "");

  const [resolvedConfig, setResolvedConfig] =
    useState<ResolvedWorkspaceScriptsConfig | null>(null);

  const loadResolvedScriptsConfig = useCallback(async () => {
    const getConfig = window.api?.scripts?.getConfig;
    if (!getConfig || !selectedProjectPath || !scriptsWorkspacePath) {
      setResolvedConfig(null);
      return;
    }
    const result = await getConfig({
      projectPath: selectedProjectPath,
      workspacePath: scriptsWorkspacePath,
    });
    setResolvedConfig(result.ok ? result.config : null);
  }, [scriptsWorkspacePath, selectedProjectPath]);

  useEffect(() => {
    void loadResolvedScriptsConfig();
  }, [loadResolvedScriptsConfig]);

  const runtime = useMemo(() => {
    if (!isCurrent || !activeWorkspaceId) {
      return undefined;
    }
    const branch = workspaceBranchById[activeWorkspaceId] ?? "";
    const workspaceName =
      workspaces.find((workspace) => workspace.id === activeWorkspaceId)
        ?.name ??
      branch ??
      "workspace";
    return {
      workspaceId: activeWorkspaceId,
      workspaceName,
      branch: branch || workspaceName,
    };
  }, [activeWorkspaceId, isCurrent, workspaceBranchById, workspaces]);

  return (
    <div className="flex flex-col gap-4">
      {props.projects.length === 0 ? (
        <Empty className="border border-dashed border-border/70 bg-muted/15">
          <EmptyHeader>
            <EmptyMedia>
              <Sparkles className="size-4" />
            </EmptyMedia>
            <EmptyTitle>No projects yet</EmptyTitle>
            <EmptyDescription>
              Open a project from the sidebar to configure its commands and
              processes.
            </EmptyDescription>
          </EmptyHeader>
        </Empty>
      ) : (
        <>
          <label className="flex max-w-md flex-col gap-1.5">
            <span className="text-sm font-medium text-foreground">
              Configuration project
            </span>
            <Select
              value={selectedProjectPath ?? undefined}
              onValueChange={(value) => setSelectedProjectPath(value)}
            >
              <SelectTrigger className="w-full">
                <SelectValue placeholder="Select a project">
                  {selectedProjectLabel}
                </SelectValue>
              </SelectTrigger>
              <SelectContent>
                {props.projects.map((project) => (
                  <SelectItem
                    key={project.projectPath}
                    value={project.projectPath}
                  >
                    {project.projectName}
                    {project.projectPath === currentProjectPath
                      ? " (current)"
                      : ""}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </label>

          {selectedProjectPath ? (
            <ScriptsManager
              key={selectedProjectPath}
              projectPath={selectedProjectPath}
              workspacePath={scriptsWorkspacePath}
              resolvedConfig={resolvedConfig}
              onSaved={loadResolvedScriptsConfig}
              {...(runtime ? { runtime } : {})}
            />
          ) : null}
        </>
      )}
    </div>
  );
}
