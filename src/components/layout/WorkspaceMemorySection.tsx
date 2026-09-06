import { useCallback, useEffect, useRef, useState } from "react";
import { Copy, X } from "lucide-react";
import {
  Input,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  toast,
} from "@/components/ui";
import {
  PROJECT_MEMORY_KINDS,
  PROJECT_MEMORY_RECALL_MODES,
  isProjectMemoryStale,
  type ProjectMemory,
  type ProjectMemoryKind,
  type ProjectMemoryRecallMode,
} from "@/lib/project-memory";
import { cn } from "@/lib/utils";

interface WorkspaceMemorySectionProps {
  projectPath: string | null;
  /** Change to re-read the list (a turn completed, the user hit refresh). */
  refreshKey: string;
  onEntriesChange?: (args: { count: number; loading: boolean }) => void;
}

const KIND_LABELS: Record<ProjectMemoryKind, string> = {
  decision: "decision",
  convention: "convention",
  gotcha: "gotcha",
  fact: "fact",
};

const RECALL_LABELS: Record<ProjectMemoryRecallMode, string> = {
  candidate: "Candidate",
  contextual: "When relevant",
  core: "Always include",
};

function EmptyHint(props: { children: string }) {
  return (
    <p className="px-2 py-1.5 text-[13px] text-muted-foreground/50">
      {props.children}
    </p>
  );
}

/**
 * Project-level curation surface: candidates, contextual memories and core
 * essentials remain editable in place. Candidate text edits do not promote it.
 */
export function WorkspaceMemorySection(props: WorkspaceMemorySectionProps) {
  const { projectPath, refreshKey, onEntriesChange } = props;
  const [items, setItems] = useState<ProjectMemory[]>([]);
  const [loading, setLoading] = useState(Boolean(projectPath));
  const generation = useRef(0);

  const reload = useCallback(async () => {
    const request = ++generation.current;
    const list = window.api?.projectMemory?.list;
    if (!projectPath || !list) {
      setItems([]);
      setLoading(false);
      return;
    }
    setLoading(true);
    try {
      const result = await list({ projectPath });
      if (request === generation.current) setItems(result.ok ? result.items : []);
    } catch {
      if (request === generation.current) setItems([]);
    } finally {
      if (request === generation.current) setLoading(false);
    }
  }, [projectPath]);

  useEffect(() => {
    setItems([]);
    void reload();
    return () => { generation.current += 1; };
  }, [reload, refreshKey]);

  useEffect(() => {
    onEntriesChange?.({ count: items.length, loading });
  }, [items.length, loading, onEntriesChange]);

  const applyUpdate = async (
    id: string,
    patch: { kind?: ProjectMemoryKind; content?: string; recallMode?: ProjectMemoryRecallMode },
  ) => {
    const update = window.api?.projectMemory?.update;
    if (!update || !projectPath) {
      return;
    }
    const request = generation.current;
    const result = await update({ id, projectPath, ...patch }).catch(() => ({ ok: false, memory: null, message: "Could not save memory. Try again." }));
    if (request !== generation.current) return;
    if (!result.ok || !result.memory) {
      toast.error(result.message ?? "Could not update project memory");
      await reload();
      return;
    }
    const memory = result.memory;
    setItems((current) =>
      current.map((item) => (item.id === id ? memory : item)),
    );
  };

  const remove = async (id: string) => {
    const remove = window.api?.projectMemory?.delete;
    if (!remove) {
      return;
    }
    const request = generation.current;
    const result = await remove({ id }).catch(() => ({ ok: false, message: "Could not forget memory. Try again." }));
    if (request !== generation.current) return;
    if (!result.ok) {
      toast.error(result.message ?? "Could not forget project memory");
      return;
    }
    setItems((current) => current.filter((item) => item.id !== id));
  };

  if (!projectPath) {
    return <EmptyHint>Open a project to see its memory</EmptyHint>;
  }

  const now = Date.now();

  return (
    <div className="-mx-2 space-y-0.5">
      <p className="px-2 py-1.5 text-xs text-muted-foreground">
        Candidates stay out of conversations until reviewed. Include up to three
        essentials always; other memories are used only for related requests.
        Each turn receives at most six memories within 1,200 characters.
      </p>
      {items.length === 0 && !loading ? (
        <EmptyHint>
          No memories yet. Ask the agent to remember a lasting project decision.
        </EmptyHint>
      ) : null}
      {items.map((memory) => (
        <MemoryRow
          key={memory.id}
          memory={memory}
          stale={isProjectMemoryStale({ memory, now })}
          onKindChange={(kind) => void applyUpdate(memory.id, { kind })}
          onRecallModeChange={(recallMode) => void applyUpdate(memory.id, { recallMode })}
          onContentCommit={(content) =>
            void applyUpdate(memory.id, { content })
          }
          onRemove={() => void remove(memory.id)}
        />
      ))}
    </div>
  );
}

function MemoryRow(props: {
  memory: ProjectMemory;
  stale: boolean;
  onKindChange: (kind: ProjectMemoryKind) => void;
  onRecallModeChange: (recallMode: ProjectMemoryRecallMode) => void;
  onContentCommit: (content: string) => void;
  onRemove: () => void;
}) {
  const { memory, stale } = props;
  const [draft, setDraft] = useState(memory.content);
  const cancelCommit = useRef(false);

  useEffect(() => {
    setDraft(memory.content);
  }, [memory.content]);

  const commit = () => {
    if (cancelCommit.current) {
      cancelCommit.current = false;
      return;
    }
    const next = draft.trim();
    if (!next) {
      setDraft(memory.content);
      return;
    }
    if (next !== memory.content) {
      props.onContentCommit(next);
    }
  };

  return (
    <div
      className={cn(
        "group/memory flex flex-wrap items-center gap-1.5 rounded-md px-2 py-1 transition-colors hover:bg-muted/50",
        (stale || memory.recallMode === "candidate") && "opacity-60",
      )}
      title={[
        stale
          ? "Stale: unconfirmed for 60+ days at low confidence, no longer injected"
          : RECALL_LABELS[memory.recallMode],
        memory.sourceTaskId ? `from task ${memory.sourceTaskId}` : null,
        `id ${memory.id}`,
      ]
        .filter(Boolean)
        .join(" · ")}
    >
      <Select value={memory.recallMode} onValueChange={(value) => props.onRecallModeChange(value as ProjectMemoryRecallMode)}>
        <SelectTrigger className="h-7 w-[140px] shrink-0 text-xs" aria-label="Memory usage">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {PROJECT_MEMORY_RECALL_MODES.map((mode) => (
            <SelectItem key={mode} value={mode}>{RECALL_LABELS[mode]}</SelectItem>
          ))}
        </SelectContent>
      </Select>
      <Select
        value={memory.kind}
        onValueChange={(value) => props.onKindChange(value as ProjectMemoryKind)}
      >
        <SelectTrigger
          className="h-7 w-[104px] shrink-0 border-0 bg-transparent px-1.5 text-[11px] text-muted-foreground shadow-none focus:ring-0"
          aria-label="Memory kind"
        >
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {PROJECT_MEMORY_KINDS.map((kind) => (
            <SelectItem key={kind} value={kind} className="text-xs">
              {KIND_LABELS[kind]}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
      <Input
        aria-label="Memory content"
        value={draft}
        maxLength={280}
        onChange={(event) => setDraft(event.target.value)}
        onBlur={commit}
        onKeyDown={(event) => {
          if (event.key === "Enter") {
            event.currentTarget.blur();
          } else if (event.key === "Escape") {
            cancelCommit.current = true;
            setDraft(memory.content);
            event.currentTarget.blur();
          }
        }}
        placeholder="One short sentence"
        className="h-8 min-w-40 flex-1 border-0 bg-transparent px-1 text-sm shadow-none"
      />
      <button
        type="button"
        className="flex size-6 shrink-0 items-center justify-center rounded-sm text-muted-foreground transition-opacity hover:text-foreground"
        onClick={() => {
          void navigator.clipboard
            ?.writeText(memory.id)
            .then(() => toast.success("Memory id copied"))
            .catch(() => toast.error("Could not copy memory id"));
        }}
        aria-label="Copy memory id"
        title="Copy memory id"
      >
        <Copy className="size-3.5" />
      </button>
      <button
        type="button"
        className="flex size-6 shrink-0 items-center justify-center rounded-sm text-muted-foreground transition-opacity hover:text-destructive"
        onClick={props.onRemove}
        aria-label="Forget memory"
      >
        <X className="size-3.5" />
      </button>
    </div>
  );
}
