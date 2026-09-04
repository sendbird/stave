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
import type { MartinProjectSummary } from "@/lib/martin-sync/contract";
import {
  isMartinConnectorPaired,
  isMartinInformationCardAvailable,
} from "@/lib/martin-sync/visibility";
import { formatTaskUpdatedAt } from "@/lib/tasks";
import { useAppStore } from "@/store/app.store";

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
      className="rounded-lg border border-border/70 bg-card/60 p-3"
    >
      <div className="flex items-start gap-2.5">
        <span className="flex size-8 shrink-0 items-center justify-center rounded-md border border-border/70 bg-muted/50">
          <Bird className="size-4 text-muted-foreground" />
        </span>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <h3 className="text-sm font-medium text-foreground">
              Martin project
            </h3>
            {project?.stale ? (
              <Badge
                variant="outline"
                className="border-warning/35 bg-warning/10 text-warning"
              >
                <TriangleAlert className="size-3" />
                Stale
              </Badge>
            ) : null}
          </div>
          <p className="mt-0.5 text-xs leading-5 text-muted-foreground">
            {project
              ? "Project context is available to tasks in this workspace."
              : "Link this workspace to share events and pull project context."}
          </p>
        </div>
      </div>

      {project ? (
        <div className="mt-3 space-y-3">
          <button
            type="button"
            className="group flex max-w-full items-center gap-1.5 text-left text-sm font-medium text-foreground hover:text-primary"
            onClick={openProject}
          >
            <span className="truncate">{project.name}</span>
            <ExternalLink className="size-3.5 shrink-0 text-muted-foreground group-hover:text-primary" />
          </button>
          <p className="text-xs text-muted-foreground">
            {project.lastPulledAt
              ? `Last pulled ${formatTaskUpdatedAt({ value: project.lastPulledAt })}`
              : "Context has not been pulled yet."}
          </p>
          {project.stale ? (
            <p className="rounded-md border border-warning/35 bg-warning/10 px-2.5 py-2 text-xs leading-5 text-warning">
              The linked project is missing or archived. Refresh to check it
              again, or unlink this workspace.
            </p>
          ) : null}
          <div className="flex flex-wrap gap-2">
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
                <RefreshCw className="size-3.5" />
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
                <Unlink className="size-3.5" />
              )}
              Unlink
            </Button>
          </div>
        </div>
      ) : (
        <div className="mt-3 space-y-2.5">
          <form className="flex gap-2" onSubmit={searchProjects}>
            <Input
              value={query}
              disabled={busy !== null || !activeWorkspaceId}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Search projects"
              aria-label="Search Martin projects"
              className="h-8"
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
                <Search className="size-3.5" />
              )}
              Search
            </Button>
          </form>

          {error ? (
            <p className="text-xs leading-5 text-destructive">{error}</p>
          ) : null}
          {searched && results.length === 0 && !error ? (
            <p className="text-xs text-muted-foreground">
              No matching projects.
            </p>
          ) : null}
          {results.length > 0 ? (
            <div className="max-h-52 space-y-1 overflow-y-auto">
              {results.map((result) => (
                <div
                  key={result.ref}
                  className="flex items-start gap-2 rounded-md border border-border/60 bg-background/45 px-2.5 py-2"
                >
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-1.5">
                      <p className="truncate text-xs font-medium text-foreground">
                        {result.name}
                      </p>
                      {result.status === "archived" ? (
                        <Badge variant="outline" className="h-5 text-[10px]">
                          Archived
                        </Badge>
                      ) : null}
                    </div>
                    {result.summary ? (
                      <p className="mt-1 line-clamp-2 text-[11px] leading-4 text-muted-foreground">
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
