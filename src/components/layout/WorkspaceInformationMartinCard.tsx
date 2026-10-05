import { i18n, useTranslation } from "@/i18n";
import { Button as AdsButton } from "@/components/ads/components/Button";
import { useEffect, useRef, useState, type FormEvent } from "react";
import {
  Bird,
  ExternalLink,
  RefreshCw,
  Search,
  TriangleAlert,
  Unlink,
} from "lucide-react";
import { Badge, Button, Input, Loader, toast } from "@/components/ui";
import { sx } from "@/components/ads/utils/stylex";
import type { MartinProjectSummary } from "@/lib/martin-sync/contract";
import {
  isMartinConnectorPaired,
  isMartinInformationCardAvailable,
} from "@/lib/martin-sync/visibility";
import { formatTaskUpdatedAt } from "@/lib/tasks";
import { useAppStore } from "@/store/app.store";
import { workspaceInformationMartinCardStyles as styles } from "./workspace-information-martin-card.styles";

export function useMartinInformationCardAvailable() {
  const martinProject = useAppStore(
    (state) => state.workspaceInformation.martinProject ?? null,
  );
  const martinSyncEnabled = useAppStore(
    (state) => state.settings.martinSync.enabled,
  );
  const [martinConnectorPaired, setMartinConnectorPaired] = useState(false);

  useEffect(() => {
    let cancelled = false;

    const refreshPairing = () => {
      void window.api?.atelierConnector
        ?.getStatus?.()
        .then((result) => {
          if (cancelled || !result) return;
          setMartinConnectorPaired(isMartinConnectorPaired(result.status));
        })
        .catch(() => undefined);
    };

    refreshPairing();
    const unsubscribe =
      window.api?.martinSync?.subscribeStatus?.(refreshPairing);
    return () => {
      cancelled = true;
      unsubscribe?.();
    };
  }, []);

  return isMartinInformationCardAvailable({
    martinSyncEnabled,
    martinConnectorPaired,
    martinProject,
  });
}

export function WorkspaceInformationMartinCard() {
  const { t: tI18n } = useTranslation(["workspace"]);
  const project = useAppStore(
    (state) => state.workspaceInformation.martinProject ?? null,
  );
  const activeWorkspaceId = useAppStore((state) => state.activeWorkspaceId);
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<MartinProjectSummary[]>([]);
  const [searched, setSearched] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const searchGenerationRef = useRef(0);

  useEffect(() => {
    searchGenerationRef.current += 1;
    setQuery("");
    setResults([]);
    setSearched(false);
    setError(null);
    setBusy(null);
  }, [activeWorkspaceId]);

  const searchProjects = async (event?: FormEvent) => {
    event?.preventDefault();
    const listProjects = window.api?.martinSync?.listProjects;
    if (!listProjects) {
      setError(i18n.t("workspace:additionalCopy.message11"));
      return;
    }

    const generation = searchGenerationRef.current + 1;
    searchGenerationRef.current = generation;
    setBusy("search");
    setError(null);
    try {
      const result = await listProjects({
        query: query.trim() || undefined,
        limit: 20,
      });
      if (searchGenerationRef.current !== generation) return;
      setSearched(true);
      setResults(result.projects);
      if (!result.ok) {
        setError(result.message ?? i18n.t("workspace:additionalCopy.message12"));
      }
    } catch {
      if (searchGenerationRef.current === generation) {
        setSearched(true);
        setError(i18n.t("workspace:additionalCopy.message13"));
      }
    } finally {
      if (searchGenerationRef.current === generation) setBusy(null);
    }
  };

  const linkProject = async (projectRef: string) => {
    const link = window.api?.martinSync?.linkProject;
    const workspaceId = activeWorkspaceId;
    if (!link || !workspaceId) return;

    setBusy(`link:${projectRef}`);
    try {
      const result = await link({ workspaceId, projectRef });
      if (!result.ok) {
        toast.error(tI18n("workspace:workspaceInformationMartinCard.couldNotLinkTheMartinProject"), {
          description: result.message,
        });
        return;
      }
      toast.success(tI18n("workspace:workspaceInformationMartinCard.martinProjectLinked"));
    } catch {
      toast.error(tI18n("workspace:workspaceInformationMartinCard.couldNotLinkTheMartinProject2"));
    } finally {
      setBusy(null);
    }
  };

  const refreshContext = async () => {
    const refresh = window.api?.martinSync?.refreshContext;
    const workspaceId = activeWorkspaceId;
    if (!refresh || !workspaceId) return;

    setBusy("refresh");
    try {
      const result = await refresh({ workspaceId });
      if (!result.ok) {
        toast.error(tI18n("workspace:workspaceInformationMartinCard.couldNotRefreshMartinContext"), {
          description: result.message,
        });
        return;
      }
      toast.success(tI18n("workspace:workspaceInformationMartinCard.martinContextRefreshed"));
    } catch {
      toast.error(tI18n("workspace:workspaceInformationMartinCard.couldNotRefreshMartinContext2"));
    } finally {
      setBusy(null);
    }
  };

  const unlinkProject = async () => {
    const unlinkProjectFromWorkspace = window.api?.martinSync?.unlinkProject;
    const workspaceId = activeWorkspaceId;
    if (!unlinkProjectFromWorkspace || !workspaceId) return;

    setBusy("unlink");
    try {
      const result = await unlinkProjectFromWorkspace({ workspaceId });
      if (!result.ok) {
        toast.error(tI18n("workspace:workspaceInformationMartinCard.couldNotUnlinkTheMartinProject"), {
          description: result.message,
        });
        return;
      }
      toast.success(tI18n("workspace:workspaceInformationMartinCard.martinProjectUnlinked"));
    } catch {
      toast.error(tI18n("workspace:workspaceInformationMartinCard.couldNotUnlinkTheMartinProject2"));
    } finally {
      setBusy(null);
    }
  };

  const openProject = () => {
    if (!project) return;
    const openExternal = window.api?.shell?.openExternal;
    if (!openExternal) return;
    void openExternal({ url: project.url }).catch(() => {
      toast.error(tI18n("workspace:workspaceInformationMartinCard.couldNotOpenTheMartinProject"));
    });
  };

  return (
    <section
      aria-label={tI18n("workspace:workspaceInformationMartinCard.martinProject")}
      className={sx(styles.root)}
    >
      <div className={sx(styles.head)}>
        <span className={sx(styles.iconBox)}>
          <Bird className={sx(styles.icon)} />
        </span>
        <div className={sx(styles.headBody)}>
          <div className={sx(styles.titleRow)}>
            <h3 className={sx(styles.title)}>
              {tI18n("workspace:workspaceInformationMartinCard.martinProject")}</h3>
            {project?.stale ? (
              <Badge variant="warning">
                <TriangleAlert className={sx(styles.staleIcon)} />
                {tI18n("workspace:workspaceInformationMartinCard.stale")}</Badge>
            ) : null}
          </div>
          <p className={sx(styles.headNote)}>
            {project
              ? tI18n("workspace:workspaceInformationMartinCard.projectContextIsAvailableToTasksIn")
              : tI18n("workspace:workspaceInformationMartinCard.linkThisWorkspaceToShareEventsAnd")}
          </p>
        </div>
      </div>

      {project ? (
        <div className={sx(styles.linkedBody)}>
          <AdsButton
            layout="host"
            type="button"
            xstyle={styles.openProject}
            onClick={openProject}
          >
            <span className={sx(styles.openProjectName)}>{project.name}</span>
            <ExternalLink className={sx(styles.openProjectIcon)} />
          </AdsButton>
          <p className={sx(styles.meta)}>
            {project.lastPulledAt
              ? tI18n("workspace:workspaceInformationMartinCard.lastPulledValue", { value1: formatTaskUpdatedAt({ value: project.lastPulledAt }) })
              : tI18n("workspace:workspaceInformationMartinCard.contextHasNotBeenPulledYet")}
          </p>
          {project.stale ? (
            <p className={sx(styles.staleNotice)}>
              {tI18n("workspace:workspaceInformationMartinCard.theLinkedProjectIsMissingOrArchived")}</p>
          ) : null}
          <div className={sx(styles.actionRow)}>
            <Button
              type="button"
              size="xs"
              variant="outline"
              disabled={busy !== null}
              onClick={() => void refreshContext()}
            >
              {busy === "refresh" ? (
                <Loader aria-hidden size="xs" variant="sync" />
              ) : (
                <RefreshCw className={sx(styles.actionIcon)} />
              )}
              {tI18n("workspace:workspaceInformationMartinCard.refresh")}</Button>
            <Button
              type="button"
              size="xs"
              variant="ghost"
              disabled={busy !== null}
              onClick={() => void unlinkProject()}
            >
              {busy === "unlink" ? (
                <Loader aria-hidden size="xs" variant="sync" />
              ) : (
                <Unlink className={sx(styles.actionIcon)} />
              )}
              {tI18n("workspace:workspaceInformationMartinCard.unlink")}</Button>
          </div>
        </div>
      ) : (
        <div className={sx(styles.searchBody)}>
          <form className={sx(styles.searchForm)} onSubmit={searchProjects}>
            <Input
              value={query}
              disabled={busy !== null || !activeWorkspaceId}
              onChange={(event) => setQuery(event.target.value)}
              placeholder={tI18n("workspace:workspaceInformationMartinCard.searchProjects")}
              aria-label={tI18n("workspace:workspaceInformationMartinCard.searchMartinProjects")}
              xstyle={styles.searchInput}
            />
            <Button
              type="submit"
              size="xs"
              variant="outline"
              disabled={busy !== null || !activeWorkspaceId}
            >
              {busy === "search" ? (
                <Loader aria-hidden size="xs" variant="sync" />
              ) : (
                <Search className={sx(styles.actionIcon)} />
              )}
              {tI18n("workspace:workspaceInformationMartinCard.search")}</Button>
          </form>

          {error ? (
            <p className={sx(styles.error)}>{error}</p>
          ) : null}
          {searched && results.length === 0 && !error ? (
            <p className={sx(styles.emptyResults)}>
              {tI18n("workspace:workspaceInformationMartinCard.noMatchingProjects")}</p>
          ) : null}
          {results.length > 0 ? (
            <div className={sx(styles.results)}>
              {results.map((result) => (
                <div
                  key={result.ref}
                  className={sx(styles.resultRow)}
                >
                  <div className={sx(styles.resultBody)}>
                    <div className={sx(styles.resultTitleRow)}>
                      <p className={sx(styles.resultName)}>
                        {result.name}
                      </p>
                      {result.status === "archived" ? (
                        <Badge variant="outline" className={sx(styles.resultBadge)}>
                          {tI18n("workspace:workspaceInformationMartinCard.archived")}</Badge>
                      ) : null}
                    </div>
                    {result.summary ? (
                      <p className={sx(styles.resultSummary)}>
                        {result.summary}
                      </p>
                    ) : null}
                  </div>
                  <Button
                    type="button"
                    size="xs"
                    disabled={busy !== null || result.status === "archived"}
                    onClick={() => void linkProject(result.ref)}
                  >
                    {busy === `link:${result.ref}` ? (
                      <Loader aria-hidden size="xs" variant="sync" />
                    ) : null}
                    {tI18n("workspace:workspaceInformationMartinCard.link")}</Button>
                </div>
              ))}
            </div>
          ) : null}
        </div>
      )}
    </section>
  );
}
