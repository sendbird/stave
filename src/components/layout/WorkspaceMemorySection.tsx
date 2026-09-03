import { useCallback, useEffect, useState } from "react";
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
  isProjectMemoryStale,
  type ProjectMemory,
  type ProjectMemoryKind,
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

function EmptyHint(props: { children: string }) {
  return (
    <p className="px-2 py-1.5 text-[13px] text-muted-foreground/50">
      {props.children}
    </p>
  );
}

/**
 * Project-level memory list for the Information panel: what every turn in this
 * project is told, editable in place. Rows are the store's own ordering
 * (confidence, then recency); stale rows — no longer injected — are dimmed.
 */
export function WorkspaceMemorySection(props: WorkspaceMemorySectionProps) {
  const { projectPath, refreshKey, onEntriesChange } = props;
  const [items, setItems] = useState<ProjectMemory[]>([]);
  const [loading, setLoading] = useState(Boolean(projectPath));

  const reload = useCallback(async () => {
    const list = window.api?.projectMemory?.list;
    if (!projectPath || !list) {
      setItems([]);
      setLoading(false);
      return;
    }
    setLoading(true);
    try {
      const result = await list({ projectPath });
      setItems(result.ok ? result.items : []);
    } catch {
      setItems([]);
    } finally {
      setLoading(false);
    }
  }, [projectPath]);

  useEffect(() => {
    void reload();
  }, [reload, refreshKey]);

  useEffect(() => {
    onEntriesChange?.({ count: items.length, loading });
  }, [items.length, loading, onEntriesChange]);

  const applyUpdate = async (
    id: string,
    patch: { kind?: ProjectMemoryKind; content?: string },
  ) => {
    const update = window.api?.projectMemory?.update;
    if (!update) {
      return;
    }
    const result = await update({ id, ...patch });
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
    const result = await remove({ id });
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
      {items.length === 0 && !loading ? (
        <EmptyHint>
          No project memory yet — agents add facts with stave_remember
        </EmptyHint>
      ) : null}
      {items.map((memory) => (
        <MemoryRow
          key={memory.id}
          memory={memory}
          stale={isProjectMemoryStale({ memory, now })}
          onKindChange={(kind) => void applyUpdate(memory.id, { kind })}
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
  onContentCommit: (content: string) => void;
  onRemove: () => void;
}) {
  const { memory, stale } = props;
  const [draft, setDraft] = useState(memory.content);

  useEffect(() => {
    setDraft(memory.content);
  }, [memory.content]);

  const commit = () => {
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
        "group/memory flex items-center gap-1.5 rounded-md px-2 py-1 transition-colors hover:bg-muted/50",
        stale && "opacity-60",
      )}
      title={[
        stale
          ? "Stale: unconfirmed for 60+ days at low confidence, no longer injected"
          : `confidence ${memory.confidence.toFixed(2)}`,
        memory.sourceTaskId ? `from task ${memory.sourceTaskId}` : null,
        `id ${memory.id}`,
      ]
        .filter(Boolean)
        .join(" · ")}
    >
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
        value={draft}
        maxLength={280}
        onChange={(event) => setDraft(event.target.value)}
        onBlur={commit}
        onKeyDown={(event) => {
          if (event.key === "Enter") {
            event.currentTarget.blur();
          } else if (event.key === "Escape") {
            setDraft(memory.content);
            event.currentTarget.blur();
          }
        }}
        placeholder="One short sentence"
        className="h-8 flex-1 border-0 bg-transparent px-1 text-sm shadow-none focus-visible:ring-0"
      />
      <button
        type="button"
        className="flex size-6 shrink-0 items-center justify-center rounded-sm text-muted-foreground/40 opacity-0 transition-opacity hover:text-foreground group-hover/memory:opacity-100"
        onClick={() => {
          void navigator.clipboard
            ?.writeText(memory.id)
            .then(() => toast.success("Memory id copied"))
            .catch(() => toast.error("Could not copy memory id"));
        }}
        aria-label="Copy memory id"
        title="Copy memory id (for stave_forget)"
      >
        <Copy className="size-3.5" />
      </button>
      <button
        type="button"
        className="flex size-6 shrink-0 items-center justify-center rounded-sm text-muted-foreground/40 opacity-0 transition-opacity hover:text-destructive group-hover/memory:opacity-100"
        onClick={props.onRemove}
        aria-label="Forget memory"
      >
        <X className="size-3.5" />
      </button>
    </div>
  );
}
