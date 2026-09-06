import { useCallback, useEffect, useRef, useState } from "react";
import {
  Button,
  Textarea,
  Switch,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui";
import { PROJECT_MEMORY_KINDS } from "@/lib/project-memory";
import {
  DEFAULT_PROJECT_MEMORY_SETTINGS,
  type ProjectMemorySettings,
} from "@/lib/project-memory-settings";
import { ConfirmDialog } from "./ConfirmDialog";

export const PROJECT_MEMORY_CHANGED_EVENT = "stave:project-memory-changed";
const KIND_DESCRIPTIONS = {
  decision: "Decisions and their rationale",
  convention: "Conventions and preferences",
  gotcha: "Pitfalls and lessons",
  fact: "Stable project facts",
};

export function ProjectMemoryControls({
  projectPath,
}: {
  projectPath: string;
}) {
  const [saved, setSaved] = useState<ProjectMemorySettings | null>(null);
  const [draft, setDraft] = useState<ProjectMemorySettings | null>(null);
  const [counts, setCounts] = useState({ all: 0, candidates: 0 });
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [clearing, setClearing] = useState<"candidates" | "all" | null>(null);
  const version = useRef(0);
  const hasUnsavedChanges = useRef(false);
  hasUnsavedChanges.current = Boolean(
    draft && JSON.stringify(draft) !== JSON.stringify(saved),
  );
  const reload = useCallback(async () => {
    const request = ++version.current;
    const api = window.api?.projectMemory;
    if (!api?.getSettings || !api.list) {
      setError("Memory controls require the updated desktop application.");
      return;
    }
    try {
      const [settings, list] = await Promise.all([
        api.getSettings({ projectPath }),
        api.list({ projectPath }),
      ]);
      if (request !== version.current) return;
      if (!settings.ok || !settings.settings || !list.ok)
        throw new Error(
          settings.message ?? list.message ?? "Could not load memory settings.",
        );
      // A memory card changing elsewhere must not erase a template being edited.
      // Keep its original revision so a later save still detects settings conflicts.
      if (!hasUnsavedChanges.current) {
        setSaved(settings.settings);
        setDraft(settings.settings);
      }
      setCounts({
        all: list.items.length,
        candidates: list.items.filter((m) => m.recallMode === "candidate")
          .length,
      });
      setError("");
    } catch (err) {
      if (request === version.current)
        setError(
          err instanceof Error
            ? err.message
            : "Could not load memory settings.",
        );
    }
  }, [projectPath]);
  useEffect(() => {
    setSaved(null);
    setDraft(null);
    void reload();
    const changed = () => {
      void reload();
    };
    window.addEventListener(PROJECT_MEMORY_CHANGED_EVENT, changed);
    return () => {
      version.current += 1;
      window.removeEventListener(PROJECT_MEMORY_CHANGED_EVENT, changed);
    };
  }, [reload]);

  const save = async () => {
    const api = window.api?.projectMemory;
    if (!api?.saveSettings || !draft || !saved) return;
    const request = version.current;
    setBusy(true);
    try {
      const {
        revision: _revision,
        resetBefore: _resetBefore,
        ...patch
      } = draft;
      const result = await api.saveSettings({
        projectPath,
        patch,
        expectedRevision: saved.revision,
      });
      if (request !== version.current) return;
      if (!result.ok || !result.settings)
        throw new Error(result.message ?? "Could not save settings.");
      setSaved(result.settings);
      setDraft(result.settings);
      window.dispatchEvent(new Event(PROJECT_MEMORY_CHANGED_EVENT));
    } catch (err) {
      if (request === version.current)
        setError(
          err instanceof Error ? err.message : "Could not save settings.",
        );
    } finally {
      setBusy(false);
    }
  };
  const clear = async () => {
    const api = window.api?.projectMemory;
    if (!api?.clear || !clearing) return;
    const request = version.current;
    setBusy(true);
    try {
      const result = await api.clear({ projectPath, scope: clearing });
      if (request !== version.current) return;
      if (!result.ok)
        throw new Error(result.message ?? "Could not clear memories.");
      setClearing(null);
      window.dispatchEvent(new Event(PROJECT_MEMORY_CHANGED_EVENT));
    } catch (err) {
      if (request === version.current)
        setError(
          err instanceof Error ? err.message : "Could not clear memories.",
        );
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="space-y-4">
      {error && (
        <div role="alert" className="space-y-2 text-sm text-destructive">
          <p>{error}</p>
          <Button
            variant="outline"
            size="sm"
            disabled={busy}
            onClick={() => {
              hasUnsavedChanges.current = false;
              void reload();
            }}
          >
            Reload
          </Button>
        </div>
      )}
      {!draft ? (
        <p className="text-sm text-muted-foreground">
          {error
            ? "Memory settings are unavailable."
            : "Loading memory settings…"}
        </p>
      ) : (
        <>
          <fieldset disabled={busy} className="space-y-4">
            <label className="flex items-start justify-between gap-4 text-sm">
              <span>
                Use project memory
                <span className="mt-1 block text-xs text-muted-foreground">
                  Include relevant saved knowledge in new turns. Turning this
                  off keeps stored memories.
                </span>
              </span>
              <Switch
                checked={draft.useMemory}
                onCheckedChange={(value) =>
                  setDraft({ ...draft, useMemory: value })
                }
              />
            </label>
            <label className="flex items-start justify-between gap-4 text-sm">
              <span>
                Collect memory candidates
                <span className="mt-1 block text-xs text-muted-foreground">
                  Use completed-turn summaries to suggest memories. Requires
                  Background AI → Turn summary. Explicit agent saves remain
                  available.
                </span>
              </span>
              <Switch
                checked={draft.collectAutomatically}
                onCheckedChange={(value) =>
                  setDraft({ ...draft, collectAutomatically: value })
                }
              />
            </label>
            <fieldset className="space-y-2">
              <legend className="mb-2 text-sm font-medium">
                What to collect
              </legend>
              {PROJECT_MEMORY_KINDS.map((kind) => (
                <label key={kind} className="flex items-center gap-2 text-sm">
                  <input
                    type="checkbox"
                    checked={draft.kinds.includes(kind)}
                    onChange={(event) =>
                      setDraft({
                        ...draft,
                        kinds: event.target.checked
                          ? [...draft.kinds, kind]
                          : draft.kinds.filter((entry) => entry !== kind),
                      })
                    }
                  />
                  {KIND_DESCRIPTIONS[kind]}
                </label>
              ))}
            </fieldset>
            <label className="block space-y-2 text-sm">
              <span className="font-medium">Collection template</span>
              <span className="block text-xs text-muted-foreground">
                Describe what is worth remembering and what to exclude. Each
                summary can propose one candidate; review and recall limits
                still apply.
              </span>
              <Textarea
                className="min-h-48 resize-y text-sm"
                value={draft.collectionTemplate}
                maxLength={4000}
                onChange={(event) =>
                  setDraft({ ...draft, collectionTemplate: event.target.value })
                }
              />
            </label>
            <div className="flex flex-wrap items-center gap-2">
              <Button
                size="sm"
                onClick={() => void save()}
                disabled={
                  !draft.collectionTemplate.trim() ||
                  JSON.stringify(draft) === JSON.stringify(saved)
                }
              >
                Save settings
              </Button>
              <Button
                size="sm"
                variant="outline"
                onClick={() =>
                  setDraft({
                    ...draft,
                    collectionTemplate:
                      DEFAULT_PROJECT_MEMORY_SETTINGS.collectionTemplate,
                    kinds: [...DEFAULT_PROJECT_MEMORY_SETTINGS.kinds],
                  })
                }
              >
                Restore collection defaults
              </Button>
            </div>
          </fieldset>
          <div className="space-y-2 border-t pt-4">
            <p className="text-sm text-muted-foreground">
              {counts.all} memories · {counts.candidates} candidates in this
              project
            </p>
            <div className="flex flex-wrap gap-2">
              <Button
                variant="outline"
                size="sm"
                disabled={busy || !counts.candidates}
                onClick={() => {
                  setError("");
                  setClearing("candidates");
                }}
              >
                Clear candidates
              </Button>
              <Button
                variant="destructive"
                size="sm"
                disabled={busy}
                onClick={() => {
                  setError("");
                  setClearing("all");
                }}
              >
                Reset project memory
              </Button>
            </div>
          </div>
        </>
      )}
      <ConfirmDialog
        open={clearing !== null}
        loading={busy}
        title={
          clearing === "candidates"
            ? `Clear ${counts.candidates} candidates?`
            : `Reset ${counts.all} project memories?`
        }
        description="This applies only to this project and cannot be undone here. Older turns and pending automatic collection will not refill cleared memories. Content already sent to an ongoing conversation remains there. Collection settings are kept."
        confirmLabel={
          clearing === "candidates"
            ? "Clear candidates"
            : "Reset project memory"
        }
        onConfirm={() => void clear()}
        onCancel={() => {
          if (!busy) setClearing(null);
        }}
      >
        {error && (
          <p role="alert" className="text-sm text-destructive">
            {error}
          </p>
        )}
      </ConfirmDialog>
    </div>
  );
}

export function ProjectMemorySettingsSection(props: {
  projects: Array<{ projectPath: string; projectName: string }>;
  initialProjectPath?: string | null;
}) {
  const [selected, setSelected] = useState(props.initialProjectPath ?? "");
  const projectPath = props.projects.some((p) => p.projectPath === selected)
    ? selected
    : (props.projects[0]?.projectPath ?? "");
  return (
    <section className="max-w-3xl space-y-5">
      <div>
        <h2 className="text-lg font-semibold">Project memory</h2>
        <p className="mt-1 text-sm text-muted-foreground">
          Choose how this project collects and recalls knowledge across its
          workspaces.
        </p>
      </div>
      {projectPath ? (
        <>
          <Select value={projectPath} onValueChange={setSelected}>
            <SelectTrigger aria-label="Memory project">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {props.projects.map((project) => (
                <SelectItem
                  key={project.projectPath}
                  value={project.projectPath}
                >
                  {project.projectName}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <ProjectMemoryControls key={projectPath} projectPath={projectPath} />
        </>
      ) : (
        <p className="text-sm text-muted-foreground">
          Open a project to configure memory.
        </p>
      )}
    </section>
  );
}
