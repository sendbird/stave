import { Button as AdsButton } from "@/components/ads/components/Button";
import { useCallback, useEffect, useRef, useState } from "react";
import {
  Button,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  Textarea,
  toast,
} from "@/components/ui";
import { sx } from "@/components/ads/utils/stylex";
import {
  PROJECT_MEMORY_KINDS,
  PROJECT_MEMORY_RECALL_MODES,
  PROJECT_MEMORY_CONTENT_MAX_CHARS,
  type ProjectMemory,
  type ProjectMemoryUpdateArgs,
} from "@/lib/project-memory";
import {
  ProjectMemoryControls,
  PROJECT_MEMORY_CHANGED_EVENT,
} from "./ProjectMemoryControls";
import { workspaceMemorySectionStyles as styles } from "./workspace-memory-section.styles";

const RECALL_LABELS = {
  candidate: "Candidate · not used yet",
  contextual: "When relevant",
  core: "Always included",
};

export function WorkspaceMemorySection(props: {
  projectPath: string | null;
  refreshKey: string;
  onEntriesChange?: (args: { count: number; loading: boolean }) => void;
}) {
  const { projectPath, refreshKey, onEntriesChange } = props;
  const [items, setItems] = useState<ProjectMemory[]>([]);
  const [loading, setLoading] = useState(Boolean(projectPath));
  const [error, setError] = useState("");
  const generation = useRef(0);
  const reload = useCallback(async () => {
    const request = ++generation.current;
    if (!projectPath || !window.api?.projectMemory?.list) {
      setLoading(false);
      return;
    }
    setLoading(true);
    try {
      const result = await window.api.projectMemory.list({ projectPath });
      if (request !== generation.current) return;
      if (!result.ok)
        throw new Error(result.message ?? "Could not load project memory.");
      setItems(result.items);
      setError("");
    } catch (err) {
      if (request === generation.current)
        setError(
          err instanceof Error ? err.message : "Could not load project memory.",
        );
    } finally {
      if (request === generation.current) setLoading(false);
    }
  }, [projectPath]);
  useEffect(() => {
    setItems([]);
    void reload();
    const listener = () => {
      void reload();
    };
    window.addEventListener(PROJECT_MEMORY_CHANGED_EVENT, listener);
    return () => {
      generation.current += 1;
      window.removeEventListener(PROJECT_MEMORY_CHANGED_EVENT, listener);
    };
  }, [reload, refreshKey]);
  useEffect(() => {
    onEntriesChange?.({ count: items.length, loading });
  }, [items.length, loading, onEntriesChange]);
  const update = async (patch: ProjectMemoryUpdateArgs) => {
    const request = generation.current;
    try {
      const result = await window.api?.projectMemory?.update?.(patch);
      if (request !== generation.current) return false;
      if (!result?.ok || !result.memory)
        throw new Error(result?.message ?? "Could not save memory.");
      setItems((current) =>
        current.map((item) => (item.id === patch.id ? result.memory! : item)),
      );
      window.dispatchEvent(new Event(PROJECT_MEMORY_CHANGED_EVENT));
      return true;
    } catch (err) {
      if (request === generation.current)
        toast.error(
          err instanceof Error ? err.message : "Could not save memory.",
        );
      return false;
    }
  };
  const remove = async (id: string) => {
    const request = generation.current;
    try {
      const result = await window.api?.projectMemory?.delete?.({ id });
      if (request !== generation.current) return;
      if (!result?.ok)
        throw new Error(result?.message ?? "Could not forget memory.");
      window.dispatchEvent(new Event(PROJECT_MEMORY_CHANGED_EVENT));
    } catch (err) {
      if (request === generation.current)
        toast.error(
          err instanceof Error ? err.message : "Could not forget memory.",
        );
    }
  };
  if (!projectPath)
    return (
      <p className={sx(styles.empty)}>
        Open a project to see its memory.
      </p>
    );
  return (
    <div className={sx(styles.root)}>
      <details className={sx(styles.controls)}>
        <summary className={sx(styles.controlsSummary)}>
          Memory settings and actions
        </summary>
        <div className={sx(styles.controlsBody)}>
          <ProjectMemoryControls key={projectPath} projectPath={projectPath} />
        </div>
      </details>
      <p className={sx(styles.hint)}>
        Read the full memory below. Candidates stay out of conversations until
        reviewed. Edit to change the text or how it is used.
      </p>
      {error && (
        <p role="alert" className={sx(styles.error)}>
          {error}{" "}
          <AdsButton
            layout="host"
            type="submit"
            xstyle={styles.retry}
            onClick={() => void reload()}
          >
            Retry
          </AdsButton>
        </p>
      )}
      {!loading && !error && !items.length && (
        <p className={sx(styles.empty)}>
          No memories yet. Ask the agent to remember a lasting project decision.
        </p>
      )}
      {items.map((memory) => (
        <MemoryRow
          key={memory.id}
          memory={memory}
          onSave={update}
          onRemove={() => remove(memory.id)}
        />
      ))}
    </div>
  );
}

export function MemoryRow(props: {
  memory: ProjectMemory;
  onSave: (patch: ProjectMemoryUpdateArgs) => Promise<boolean>;
  onRemove: () => Promise<void>;
}) {
  const { memory } = props;
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(memory.content);
  const [kind, setKind] = useState(memory.kind);
  const [mode, setMode] = useState(memory.recallMode);
  const [busy, setBusy] = useState(false);
  const editButton = useRef<HTMLButtonElement>(null);
  const finish = () => {
    setEditing(false);
    requestAnimationFrame(() => editButton.current?.focus());
  };
  const save = async () => {
    setBusy(true);
    try {
      if (
        await props.onSave({
          id: memory.id,
          projectPath: memory.projectPath,
          content: draft.trim(),
          kind,
          recallMode: mode,
        })
      )
        finish();
    } finally {
      setBusy(false);
    }
  };
  return (
    <article className={sx(styles.row)}>
      {editing ? (
        <form
          className={sx(styles.form)}
          onSubmit={(event) => {
            event.preventDefault();
            void save();
          }}
          onKeyDown={(event) => {
            if (event.key === "Escape" && !busy) {
              event.preventDefault();
              event.stopPropagation();
              finish();
            }
          }}
        >
          <label className={sx(styles.fieldLabel)}>
            Memory text
            <Textarea
              autoFocus
              value={draft}
              onChange={(event) => setDraft(event.target.value)}
              disabled={busy}
              maxLength={PROJECT_MEMORY_CONTENT_MAX_CHARS}
              rows={5}
              xstyle={styles.fieldTextarea}
            />
          </label>
          <p className={sx(styles.counter)}>
            {draft.length} / {PROJECT_MEMORY_CONTENT_MAX_CHARS} characters
          </p>
          <div className={sx(styles.controlRow)}>
            <Select value={kind} onValueChange={setKind} disabled={busy}>
              <SelectTrigger aria-label="Memory kind" className={sx(styles.kindTrigger)}>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {PROJECT_MEMORY_KINDS.map((value) => (
                  <SelectItem key={value} value={value}>
                    {value}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Select value={mode} onValueChange={setMode} disabled={busy}>
              <SelectTrigger
                aria-label="Memory usage"
                className={sx(styles.modeTrigger)}
              >
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {PROJECT_MEMORY_RECALL_MODES.map((value) => (
                  <SelectItem key={value} value={value}>
                    {RECALL_LABELS[value]}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className={sx(styles.actionRow)}>
            <Button type="submit" size="sm" disabled={busy || !draft.trim()}>
              Save memory
            </Button>
            <Button
              type="button"
              size="sm"
              variant="outline"
              disabled={busy}
              onClick={finish}
            >
              Cancel
            </Button>
          </div>
        </form>
      ) : (
        <>
          <div className={sx(styles.meta)}>
            <span>{RECALL_LABELS[memory.recallMode]}</span>
            <span>{memory.kind}</span>
          </div>
          <p className={sx(styles.content)}>
            {memory.content}
          </p>
          <div className={sx(styles.controlRow)}>
            <Button
              ref={editButton}
              size="sm"
              variant="outline"
              disabled={busy}
              onClick={() => {
                setDraft(memory.content);
                setKind(memory.kind);
                setMode(memory.recallMode);
                setEditing(true);
              }}
            >
              Edit memory
            </Button>
            <Button
              size="sm"
              variant="ghost"
              disabled={busy}
              onClick={async () => {
                setBusy(true);
                try {
                  await props.onRemove();
                } finally {
                  setBusy(false);
                }
              }}
            >
              Forget
            </Button>
          </div>
        </>
      )}
    </article>
  );
}
