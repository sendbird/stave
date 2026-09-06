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
      setError("Martin project controls are unavailable.");
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
        setError(result.message ?? "Could not load Martin projects.");
      }
    } catch {
      if (searchGenerationRef.current === generation) {
        setSearched(true);
        setError("Could not load Martin projects.");
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
        toast.error("Could not link the Martin project", {
          description: result.message,
        });
        return;
      }
      toast.success("Martin project linked.");
    } catch {
      toast.error("Could not link the Martin project.");
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
        toast.error("Could not refresh Martin context", {
          description: result.message,
        });
        return;
      }
      toast.success("Martin context refreshed.");
    } catch {
      toast.error("Could not refresh Martin context.");
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
        toast.error("Could not unlink the Martin project", {
          description: result.message,
        });
        return;
      }
      toast.success("Martin project unlinked.");
    } catch {
      toast.error("Could not unlink the Martin project.");
    } finally {
      setBusy(null);
    }
  };

  const openProject = () => {
    if (!project) return;
    const openExternal = window.api?.shell?.openExternal;
    if (!openExternal) return;
    void openExternal({ url: project.url }).catch(() => {
      toast.error("Could not open the Martin project.");
    });
  };

  return (
    <section
      aria-label="Martin project"
      className={sx(styles.root)}
    >
      <div className={sx(styles.head)}>
        <span className={sx(styles.iconBox)}>
          <Bird className={sx(styles.icon)} />
        </span>
        <div className={sx(styles.headBody)}>
          <div className={sx(styles.titleRow)}>
            <h3 className={sx(styles.title)}>
              Martin project
            </h3>
            {project?.stale ? (
              <Badge variant="warning">
                <TriangleAlert className={sx(styles.staleIcon)} />
                Stale
              </Badge>
            ) : null}
          </div>
          <p className={sx(styles.headNote)}>
            {project
              ? "Project context is available to tasks in this workspace."
              : "Link this workspace to share events and pull project context."}
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
              ? `Last pulled ${formatTaskUpdatedAt({ value: project.lastPulledAt })}`
              : "Context has not been pulled yet."}
          </p>
          {project.stale ? (
            <p className={sx(styles.staleNotice)}>
              The linked project is missing or archived. Refresh to check it
              again, or unlink this workspace.
            </p>
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
              Refresh
            </Button>
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
              Unlink
            </Button>
          </div>
        </div>
      ) : (
        <div className={sx(styles.searchBody)}>
          <form className={sx(styles.searchForm)} onSubmit={searchProjects}>
            <Input
              value={query}
              disabled={busy !== null || !activeWorkspaceId}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Search projects"
              aria-label="Search Martin projects"
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
              Search
            </Button>
          </form>

          {error ? (
            <p className={sx(styles.error)}>{error}</p>
          ) : null}
          {searched && results.length === 0 && !error ? (
            <p className={sx(styles.emptyResults)}>
              No matching projects.
            </p>
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
                          Archived
                        </Badge>
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
                    Link
                  </Button>
                </div>
              ))}
            </div>
          ) : null}
        </div>
      )}
    </section>
  );
}
