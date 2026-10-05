import { I18N_NAMESPACES, i18n, useTranslation } from "@/i18n";
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
import type { RecentRepositoryState } from "@/store/repository.utils";
import type { ResolvedWorkspaceScriptsConfig } from "@/lib/workspace-scripts/types";
import { sx } from "@/components/ads/utils/stylex";
import { scriptsSectionStyles } from "./settings-dialog-scripts-section.styles";

export function ScriptsSection(props: {
  repositories: RecentRepositoryState[];
  currentRepositoryPath?: string | null;
  selectedRepositoryPath?: string | null;
}) {
  const { t } = useTranslation(I18N_NAMESPACES);
  const [
    activeWorkspaceId,
    workspaces,
    workspacePathById,
    workspaceBranchById,
    storeRepositoryPath,
  ] = useAppStore(
    useShallow(
      (state) =>
        [
          state.activeWorkspaceId,
          state.workspaces,
          state.workspacePathById,
          state.workspaceBranchById,
          state.repositoryPath,
        ] as const,
    ),
  );

  const currentRepositoryPath =
    props.currentRepositoryPath ?? storeRepositoryPath ?? null;
  const [selectedRepositoryPath, setSelectedRepositoryPath] = useState<string | null>(
    () =>
      props.selectedRepositoryPath ??
      currentRepositoryPath ??
      props.repositories[0]?.repositoryPath ??
      null,
  );

  // Keep a valid selection if the repositories list changes underneath us.
  useEffect(() => {
    if (
      selectedRepositoryPath &&
      props.repositories.some(
        (repository) => repository.repositoryPath === selectedRepositoryPath,
      )
    ) {
      return;
    }
    setSelectedRepositoryPath(
      currentRepositoryPath ?? props.repositories[0]?.repositoryPath ?? null,
    );
  }, [currentRepositoryPath, props.repositories, selectedRepositoryPath]);

  const isCurrent =
    Boolean(selectedRepositoryPath) && selectedRepositoryPath === currentRepositoryPath;
  const selectedRepositoryLabel = useMemo(() => {
    const repository = props.repositories.find(
      (candidate) => candidate.repositoryPath === selectedRepositoryPath,
    );
    if (!repository) {
      return undefined;
    }
    return `${repository.repositoryName}${isCurrent ? i18n.t("settings:settingsDialogScriptsSection.current") : ""}`;
  }, [isCurrent, props.repositories, selectedRepositoryPath]);
  const scriptsWorkspacePath = isCurrent
    ? (workspacePathById[activeWorkspaceId] ?? selectedRepositoryPath ?? "")
    : (selectedRepositoryPath ?? "");

  const [resolvedConfig, setResolvedConfig] =
    useState<ResolvedWorkspaceScriptsConfig | null>(null);

  const loadResolvedScriptsConfig = useCallback(async () => {
    const getConfig = window.api?.scripts?.getConfig;
    if (!getConfig || !selectedRepositoryPath || !scriptsWorkspacePath) {
      setResolvedConfig(null);
      return;
    }
    const result = await getConfig({
      repositoryPath: selectedRepositoryPath,
      workspacePath: scriptsWorkspacePath,
    });
    setResolvedConfig(result.ok ? result.config : null);
  }, [scriptsWorkspacePath, selectedRepositoryPath]);

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
    <div className={sx(scriptsSectionStyles.root)}>
      {props.repositories.length === 0 ? (
        <Empty xstyle={scriptsSectionStyles.emptyState}>
          <EmptyHeader>
            <EmptyMedia>
              <Sparkles className={sx(scriptsSectionStyles.emptyIcon)} />
            </EmptyMedia>
            <EmptyTitle>{t("settings:dialog.noRepositories")}</EmptyTitle>
            <EmptyDescription>
              {t("settings:settingsDialogScriptsSection.openARepositoryFromTheSidebar")}</EmptyDescription>
          </EmptyHeader>
        </Empty>
      ) : (
        <>
          <label className={sx(scriptsSectionStyles.repositoryLabel)}>
            <span className={sx(scriptsSectionStyles.repositoryLabelText)}>
              {t("settings:settingsDialogScriptsSection.configurationRepository")}</span>
            <Select
              value={selectedRepositoryPath ?? undefined}
              onValueChange={(value) => setSelectedRepositoryPath(value)}
            >
              <SelectTrigger className={sx(scriptsSectionStyles.triggerFull)}>
                <SelectValue placeholder={t("settings:settingsDialogScriptsSection.selectARepository")}>
                  {selectedRepositoryLabel}
                </SelectValue>
              </SelectTrigger>
              <SelectContent>
                {props.repositories.map((repository) => (
                  <SelectItem
                    key={repository.repositoryPath}
                    value={repository.repositoryPath}
                  >
                    {repository.repositoryName}
                    {repository.repositoryPath === currentRepositoryPath
                      ? i18n.t("settings:settingsDialogScriptsSection.current")
                      : ""}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </label>

          {selectedRepositoryPath ? (
            <ScriptsManager
              key={selectedRepositoryPath}
              repositoryPath={selectedRepositoryPath}
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
