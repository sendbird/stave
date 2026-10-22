import { I18N_NAMESPACES, i18n, useTranslation } from "@/i18n";
import { Badge } from "@/components/ui";
import { sx } from "@/components/ads/utils/stylex";
import { AsyncBoundary, type AsyncState } from "@/components/system/AsyncBoundary";
import type { ResolvedWorkspaceScriptsConfig } from "@/lib/workspace-scripts/types";
import { settingsSectionsStyles as styles } from "../settings-dialog-sections.styles";

export interface GitRemoteState {
  name: string;
  fetchUrl: string | null;
  pushUrl: string | null;
}

export function parseGitRemotes(args: { stdout: string }) {
  const remoteStateByName = new Map<string, GitRemoteState>();
  const lines = args.stdout
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean);

  for (const line of lines) {
    const match = line.match(/^(\S+)\s+(.+?)\s+\((fetch|push)\)$/i);
    if (!match) {
      continue;
    }
    const [, name, url, kind] = match;
    if (!name || !url || !kind) {
      continue;
    }
    const current = remoteStateByName.get(name) ?? {
      name,
      fetchUrl: null,
      pushUrl: null,
    };
    if (kind.toLowerCase() === "fetch") {
      current.fetchUrl = url;
    } else {
      current.pushUrl = url;
    }
    remoteStateByName.set(name, current);
  }

  return Array.from(remoteStateByName.values());
}

/** What a repository panel read with git: its root and its remotes. */
export interface RepositoryMetadataState {
  status: "idle" | "loading" | "ready" | "error";
  rootPath: string | null;
  remotes: GitRemoteState[];
  detail: string;
  /** Why `git remote -v` failed; the remotes are then unknown, not none. */
  remotesError?: string;
}

/** The remotes as a boundary state: a failed read is an error, never "no remotes". */
export function repositoryRemotesState(state: RepositoryMetadataState): AsyncState<GitRemoteState[]> {
  if (state.status === "error") return { status: "error", error: state.detail };
  if (state.status !== "loading" && state.remotesError) return { status: "error", error: state.remotesError };
  // A refresh keeps the remotes it already showed.
  if (state.status === "ready" || state.remotes.length > 0) return { status: "ready", data: state.remotes };
  return { status: "pending" };
}

export function RepositoryRemoteList(args: { state: AsyncState<GitRemoteState[]>; onRetry: () => void }) {
  const { t } = useTranslation(I18N_NAMESPACES);
  return (
    <AsyncBoundary
      state={args.state}
      onRetry={args.onRetry}
      pending={<p className={sx(styles.mutedBody)}>{t("settings:repositoriesSection.metadata.refreshing")}</p>}
      isEmpty={(remotes) => remotes.length === 0}
      empty={<p className={sx(styles.mutedBody)}>{t("settings:repositoriesSection.settings.remoteStatus.noRemotes")}</p>}
    >
      {(remotes) => (
        <div className={sx(styles.spaceY2)}>
          {remotes.map((remote) => (
            <div key={remote.name} className={sx(styles.remoteCard)}>
              <div className={sx(styles.rowCenter)}>
                <p className={sx(styles.remoteName)}>{remote.name}</p>
                <Badge variant="secondary" className={sx(styles.remoteBadge)}>
                  {i18n.t("settings:repositoriesSection.settings.remoteStatus.configured")}</Badge>
              </div>
              <p className={sx(styles.remoteMono)}>
                {i18n.t("settings:settingsDialogRepositoriesSection.fetch")}{remote.fetchUrl ?? "-"}
              </p>
              <p className={sx(styles.remoteMono)}>
                {i18n.t("settings:settingsDialogRepositoriesSection.push")}{remote.pushUrl ?? remote.fetchUrl ?? "-"}
              </p>
            </div>
          ))}
        </div>
      )}
    </AsyncBoundary>
  );
}

/** How many tools the repository's workspace tools file defines, once it was read. */
export function WorkspaceToolCounts(args: {
  state: AsyncState<ResolvedWorkspaceScriptsConfig | null>;
  onRetry: () => void;
}) {
  const { t } = useTranslation(I18N_NAMESPACES);
  return (
    <AsyncBoundary
      state={args.state}
      onRetry={args.onRetry}
      pending={<p className={sx(styles.mutedBody)}>{t("common:status.loading")}</p>}
    >
      {(config) => (
        <div className={sx(styles.rowWrapGap2)}>
          {(
            [
              [t("ui:command.commands"), config?.actions.length ?? 0],
              [t("settings:settingsDialogRepositoriesSection.processes"), config?.services.length ?? 0],
              [t("settings:settingsDialogRepositoriesSection.triggers"), Object.keys(config?.hooks ?? {}).length],
              [t("settings:settingsDialogRepositoriesSection.environments"), Object.keys(config?.targets ?? {}).length],
            ] as const
          ).map(([label, count]) => (
            <Badge key={label} variant="secondary" className={sx(styles.toolsBadge)}>
              {count} {label}
            </Badge>
          ))}
        </div>
      )}
    </AsyncBoundary>
  );
}
