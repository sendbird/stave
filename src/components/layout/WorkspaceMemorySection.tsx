import { Button as AuiButton } from "@/components/aui/components/Button";
import { Tooltip } from "@/components/aui/components/Tooltip";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Brain, Inbox, Pencil, Pin, Sparkles, Trash2 } from "lucide-react";
import {
  Badge,
  Button,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  Textarea,
  toast,
} from "@/components/ui";
import { hostSurface } from "@/components/ui/host-surface.styles";
import { RelativeTime } from "@/components/system/RelativeTime";
import { SearchHighlight } from "@/components/system/SearchHighlight";
import { i18n, Trans, useTranslation, type I18nKey } from "@/i18n";
import { sx } from "@/components/aui/utils/stylex";
import {
  REPOSITORY_MEMORY_KINDS,
  REPOSITORY_MEMORY_RECALL_MODES,
  REPOSITORY_MEMORY_CONTENT_MAX_CHARS,
  type RepositoryMemory,
  type RepositoryMemorySourceTask,
  type RepositoryMemoryUpdateArgs,
} from "@/lib/repository-memory";
import { useAppStore } from "@/store/app.store";
import {
  RepositoryMemoryControls,
  REPOSITORY_MEMORY_CHANGED_EVENT,
} from "./RepositoryMemoryControls";
import { informationRow } from "./information-row.styles";
import { workspaceMemorySectionStyles as styles } from "./workspace-memory-section.styles";
import { MemoryCollectionInvitation } from "./MemoryCollectionInvitation";
import { failureMessage } from "./workspace-information/failure-message";
import { forgetMemoryWithUndo } from "./workspace-memory-forget";
import { MemoryListFilters, MemoryListFilterStatus } from "./workspace-memory-filters";
import {
  selectMemoryListView,
  shouldOfferMemoryFilters,
  type MemoryKindFilter,
} from "./workspace-memory-list-state";

type RecallMode = (typeof REPOSITORY_MEMORY_RECALL_MODES)[number];
type MemoryKind = (typeof REPOSITORY_MEMORY_KINDS)[number];

const RECALL_LABEL_KEYS = {
  candidate: "workspace:memory.recall.candidate",
  contextual: "workspace:memory.recall.contextual",
  core: "workspace:memory.recall.core",
} as const satisfies Record<RecallMode, I18nKey>;

/**
 * The row's own metadata says the mode plainly; the long select labels stay in
 * the editor, where a reader is choosing between them and needs the
 * explanation. "Candidate · not used yet" beside a candidate glyph is the
 * explanation twice.
 */
const RECALL_META_LABEL_KEYS = {
  candidate: "workspace:memory.recallMeta.candidate",
  contextual: "workspace:memory.recallMeta.contextual",
  core: "workspace:memory.recallMeta.core",
} as const satisfies Record<RecallMode, I18nKey>;

/** Kinds are stored as protocol values; the label is what a reader sees. */
const KIND_LABEL_KEYS = {
  decision: "workspace:memory.kinds.decision",
  convention: "workspace:memory.kinds.convention",
  gotcha: "workspace:memory.kinds.gotcha",
  fact: "workspace:memory.kinds.fact",
} as const satisfies Record<MemoryKind, I18nKey>;

/**
 * The recall mode is the one thing a reader scans this list for — will the
 * agent actually use this? — and it used to be a word buried in a metadata
 * line that read the same for all three modes. It is the row's leading mark
 * now, so the answer is legible before a word is read: pinned for the explicit
 * core, a brain for the contextual set, an inbox for the candidate queue the
 * `project-memory` contract keeps out of conversations until reviewed.
 */
const RECALL_GLYPH = {
  candidate: Inbox,
  contextual: Brain,
  core: Pin,
} as const;

const NO_SOURCE_TASKS: readonly RepositoryMemorySourceTask[] = [];

function notifyMemoryChanged() {
  window.dispatchEvent(new Event(REPOSITORY_MEMORY_CHANGED_EVENT));
}

/** The task a memory came from, in its own workspace: the same way Fleet and a delegated child open one. */
function openSourceTask(task: RepositoryMemorySourceTask, repositoryPath: string) {
  void useAppStore.getState().focusTaskAttention({
    taskId: task.taskId,
    workspaceId: task.workspaceId,
    repositoryPath,
  });
}

export function WorkspaceMemorySection(props: {
  repositoryPath: string | null;
  refreshKey: string;
  onEntriesChange?: (args: { count: number; loading: boolean }) => void;
}) {
  const { repositoryPath, refreshKey, onEntriesChange } = props;
  const { t } = useTranslation(["workspace", "common"]);
  const [items, setItems] = useState<RepositoryMemory[]>([]);
  const [sourceTasks, setSourceTasks] = useState(NO_SOURCE_TASKS);
  const [loading, setLoading] = useState(Boolean(repositoryPath));
  const [error, setError] = useState("");
  const [query, setQuery] = useState("");
  const [kind, setKind] = useState<MemoryKindFilter>("all");
  const [searchFocused, setSearchFocused] = useState(false);
  const searchInputRef = useRef<HTMLInputElement>(null);
  // Another repository's memory starts unfiltered.
  const [filterScope, setFilterScope] = useState(repositoryPath);
  if (filterScope !== repositoryPath) {
    setFilterScope(repositoryPath);
    setQuery("");
    setKind("all");
  }
  const generation = useRef(0);
  const reload = useCallback(async () => {
    const request = ++generation.current;
    if (!repositoryPath || !window.api?.repositoryMemory?.list) {
      setLoading(false);
      return;
    }
    setLoading(true);
    try {
      const result = await window.api.repositoryMemory.list({ repositoryPath });
      if (request !== generation.current) return;
      if (!result.ok)
        throw new Error(result.message ?? "");
      setItems(result.items);
      setSourceTasks(result.sourceTasks ?? NO_SOURCE_TASKS);
      setError("");
    } catch (err) {
      if (request === generation.current)
        setError(
          failureMessage(i18n.t("workspace:memory.section.loadFailed"), err),
        );
    } finally {
      if (request === generation.current) setLoading(false);
    }
  }, [repositoryPath]);
  useEffect(() => {
    setItems([]);
    setSourceTasks(NO_SOURCE_TASKS);
    void reload();
    const listener = () => {
      void reload();
    };
    window.addEventListener(REPOSITORY_MEMORY_CHANGED_EVENT, listener);
    return () => {
      generation.current += 1;
      window.removeEventListener(REPOSITORY_MEMORY_CHANGED_EVENT, listener);
    };
  }, [reload, refreshKey]);
  useEffect(() => {
    onEntriesChange?.({ count: items.length, loading });
  }, [items.length, loading, onEntriesChange]);
  const update = async (patch: RepositoryMemoryUpdateArgs) => {
    const request = generation.current;
    try {
      const result = await window.api?.repositoryMemory?.update?.(patch);
      if (request !== generation.current) return false;
      if (!result?.ok || !result.memory)
        throw new Error(result?.message ?? "");
      setItems((current) =>
        current.map((item) => (item.id === patch.id ? result.memory! : item)),
      );
      notifyMemoryChanged();
      return true;
    } catch (err) {
      if (request === generation.current)
        toast.error(failureMessage(t("memory.section.saveFailed"), err));
      return false;
    }
  };
  // No confirmation: the row goes at once and the toast offers Undo.
  const remove = async (memory: RepositoryMemory) => {
    const forgotten = await forgetMemoryWithUndo(memory, {
      api: window.api?.repositoryMemory,
      onChanged: notifyMemoryChanged,
    });
    if (forgotten)
      setItems((current) => current.filter((item) => item.id !== memory.id));
    return forgotten;
  };
  const view = useMemo(
    () => selectMemoryListView({ items, query, kind }),
    [items, query, kind],
  );
  const sourceTaskById = useMemo(
    () => new Map(sourceTasks.map((task) => [task.taskId, task])),
    [sourceTasks],
  );
  const offerFilters = shouldOfferMemoryFilters({
    total: items.length,
    query,
    kind,
    focused: searchFocused,
  });
  const clearFilters = () => {
    setQuery("");
    setKind("all");
    searchInputRef.current?.focus();
  };
  if (!repositoryPath)
    return (
      <p className={sx(styles.empty)}>
        {t("memory.section.noRepository")}
      </p>
    );
  return (
    <div className={sx(styles.root)}>
      <MemoryCollectionInvitation key={repositoryPath} repositoryPath={repositoryPath} />
      <details className={sx(styles.controls)}>
        <summary className={sx(styles.controlsSummary)}>
          {t("memory.section.settingsSummary")}
        </summary>
        <div className={sx(styles.controlsBody)}>
          <RepositoryMemoryControls key={repositoryPath} repositoryPath={repositoryPath} />
        </div>
      </details>
      <p className={sx(styles.hint)}>
        {t("memory.section.hint")}
      </p>
      {error && (
        <p role="alert" className={sx(styles.error)}>
          {error}{" "}
          <AuiButton
            layout="host"
            type="submit"
            xstyle={styles.retry}
            onClick={() => void reload()}
          >
            {t("common:actions.retry")}
          </AuiButton>
        </p>
      )}
      {!loading && !error && !items.length && (
        <p className={sx(styles.empty)}>
          {t("memory.section.empty")}
        </p>
      )}
      {offerFilters ? (
        <MemoryListFilters
          view={view}
          query={query}
          onQueryChange={setQuery}
          onSearchFocusChange={setSearchFocused}
          searchInputRef={searchInputRef}
          kind={kind}
          onKindChange={setKind}
        />
      ) : null}
      {offerFilters && view.filtering ? (
        <MemoryListFilterStatus
          matched={view.rows.length}
          total={view.total}
          onClear={clearFilters}
        />
      ) : null}
      {view.rows.length > 0 ? (
        <div className={sx(informationRow.list)}>
          {view.rows.map((memory) => (
            <MemoryRow
              key={memory.id}
              memory={memory}
              query={query}
              sourceTask={
                memory.sourceTaskId
                  ? sourceTaskById.get(memory.sourceTaskId)
                  : undefined
              }
              onOpenSourceTask={(task) => openSourceTask(task, repositoryPath)}
              onSave={update}
              onRemove={() => remove(memory)}
            />
          ))}
        </div>
      ) : null}
    </div>
  );
}

export function MemoryRow(props: {
  memory: RepositoryMemory;
  /** The list's search, marked in the memory text. */
  query?: string;
  /** The open task the memory came from, when it still exists. */
  sourceTask?: RepositoryMemorySourceTask;
  onOpenSourceTask?: (task: RepositoryMemorySourceTask) => void;
  onSave: (patch: RepositoryMemoryUpdateArgs) => Promise<boolean>;
  /** Resolves true once the memory is forgotten. */
  onRemove: () => Promise<boolean>;
  /** The relative time's reference; tests pin it. */
  now?: Date;
}) {
  const { memory, sourceTask } = props;
  const { t } = useTranslation(["workspace", "common"]);
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(memory.content);
  const [kind, setKind] = useState(memory.kind);
  const [mode, setMode] = useState(memory.recallMode);
  const [busy, setBusy] = useState(false);
  const editButton = useRef<HTMLButtonElement>(null);
  const rowRef = useRef<HTMLElement>(null);
  /*
   * The row leaves as soon as the memory is forgotten. A keyboard reader who
   * pressed Forget lands on the neighbouring row's first action instead of the
   * page body, so forgetting several in turn stays in the list.
   */
  const forget = async () => {
    const row = rowRef.current;
    const hadFocus = Boolean(row?.contains(document.activeElement));
    const neighbour = row?.nextElementSibling ?? row?.previousElementSibling ?? null;
    setBusy(true);
    try {
      if ((await props.onRemove()) && hadFocus)
        neighbour?.querySelector<HTMLElement>("[data-memory-row-actions] button")?.focus();
    } finally {
      setBusy(false);
    }
  };
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
          repositoryPath: memory.repositoryPath,
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
  /*
   * Promoting a candidate is the one action this list exists to make easy: a
   * candidate is knowledge the agent has already written down and is being kept
   * out of conversations until a human agrees with it. It used to cost four
   * interactions — open the editor, find the usage select, pick "When
   * relevant", save — for a decision that is one bit. It is one click, and
   * only on the rows where it means anything.
   */
  const promote = async () => {
    setBusy(true);
    try {
      await props.onSave({
        id: memory.id,
        repositoryPath: memory.repositoryPath,
        content: memory.content,
        kind: memory.kind,
        recallMode: "contextual",
      });
    } finally {
      setBusy(false);
    }
  };

  const RecallGlyph = RECALL_GLYPH[memory.recallMode];

  if (editing) {
    return (
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
          {t("memory.row.textLabel")}
          <Textarea
            autoFocus
            value={draft}
            onChange={(event) => setDraft(event.target.value)}
            disabled={busy}
            maxLength={REPOSITORY_MEMORY_CONTENT_MAX_CHARS}
            rows={5}
            xstyle={styles.fieldTextarea}
          />
        </label>
        <p className={sx(styles.counter)}>
          {t("memory.row.counter", {
            length: draft.length,
            max: REPOSITORY_MEMORY_CONTENT_MAX_CHARS,
          })}
        </p>
        <div className={sx(styles.controlRow)}>
          <Select value={kind} onValueChange={setKind} disabled={busy}>
            <SelectTrigger
              aria-label={t("memory.row.kindAriaLabel")}
              className={sx(styles.kindTrigger)}
            >
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {REPOSITORY_MEMORY_KINDS.map((value) => (
                <SelectItem key={value} value={value}>
                  {t(KIND_LABEL_KEYS[value])}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Select value={mode} onValueChange={setMode} disabled={busy}>
            <SelectTrigger
              aria-label={t("memory.row.usageAriaLabel")}
              className={sx(styles.modeTrigger)}
            >
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {REPOSITORY_MEMORY_RECALL_MODES.map((value) => (
                <SelectItem key={value} value={value}>
                  {t(RECALL_LABEL_KEYS[value])}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className={sx(styles.actionRow)}>
          <Button type="submit" size="sm" disabled={busy || !draft.trim()}>
            {t("memory.row.save")}
          </Button>
          <Button
            type="button"
            size="sm"
            variant="outline"
            disabled={busy}
            onClick={finish}
          >
            {t("common:actions.cancel")}
          </Button>
        </div>
      </form>
    );
  }

  return (
    <article ref={rowRef} className={sx(informationRow.root)}>
      <RecallGlyph
        aria-hidden="true"
        className={sx(
          informationRow.mark,
          memory.recallMode === "core"
            ? styles.markCore
            : memory.recallMode === "candidate"
              ? styles.markCandidate
              : styles.markContextual,
        )}
      />
      <div className={sx(informationRow.body)}>
        {/* The memory itself is the row's title — it is a sentence, so it
            wraps to two lines rather than ellipsizing at the first word
            boundary, and the full text stays available in the editor. */}
        <p className={sx(styles.content)}>
          <SearchHighlight text={memory.content} query={props.query ?? ""} />
        </p>
        {/* Gap, not a separator glyph: the recall label already contains
            a middot, and a wrapping meta row orphans a lone separator at the
            end of the first line. The pull-request row above spaces its own
            meta the same way. */}
        <div className={sx(informationRow.meta)}>
          {/* Kind is a category, so it takes the chip; recall mode is a
              sentence about behaviour, so it stays text. Two bare words at a
              6px gap read as one phrase — this is the same number/status/repo
              rhythm the pull-request row uses. */}
          <Badge variant="outline">{t(KIND_LABEL_KEYS[memory.kind])}</Badge>
          <span className={sx(informationRow.metaText)}>
            {t(RECALL_META_LABEL_KEYS[memory.recallMode])}
          </span>
        </div>
        {/* When it was last confirmed (saved, re-found or edited) and where
            it came from: a second meta line, so a narrow rail never wraps
            the kind chip away from its recall label. */}
        <div className={sx(informationRow.meta)} data-memory-meta-provenance="">
          <span className={sx(styles.metaTime)}>
            <Trans
              t={t}
              i18nKey="workspace:memory.row.confirmedAt"
              components={{
                time: <RelativeTime date={memory.lastConfirmedAt} now={props.now} past />,
              }}
            />
          </span>
          {sourceTask && props.onOpenSourceTask ? (
            <Tooltip content={sourceTask.title}>
              <AuiButton
                layout="host"
                type="button"
                onClick={() => props.onOpenSourceTask?.(sourceTask)}
                xstyle={[hostSurface.inertChrome, styles.sourceLink]}
                aria-label={t("memory.row.sourceTaskAriaLabel", { title: sourceTask.title })}
                data-memory-source-task=""
              >
                {t("memory.row.sourceTask")}
              </AuiButton>
            </Tooltip>
          ) : null}
        </div>
      </div>
      <div className={sx(informationRow.trail)} data-memory-row-actions="">
        {memory.recallMode === "candidate" ? (
          <Tooltip content={t("memory.row.promoteTitle")}>
            <AuiButton
              layout="host"
              type="button"
              disabled={busy}
              onClick={() => void promote()}
              xstyle={styles.rowAction}
              aria-label={t("memory.row.promoteAriaLabel", { content: memory.content })}
            >
              <Sparkles className={sx(styles.rowActionIcon)} aria-hidden />
            </AuiButton>
          </Tooltip>
        ) : null}
        <Tooltip content={t("memory.row.editTitle")}>
          <AuiButton
            ref={editButton}
            layout="host"
            type="button"
            disabled={busy}
            onClick={() => {
              setDraft(memory.content);
              setKind(memory.kind);
              setMode(memory.recallMode);
              setEditing(true);
            }}
            xstyle={styles.rowAction}
            aria-label={t("memory.row.editAriaLabel", { content: memory.content })}
          >
            <Pencil className={sx(styles.rowActionIcon)} aria-hidden />
          </AuiButton>
        </Tooltip>
        <Tooltip content={t("memory.row.forgetTitle")}>
          <AuiButton
            layout="host"
            type="button"
            disabled={busy}
            onClick={() => void forget()}
            xstyle={[styles.rowAction, styles.rowActionDanger]}
            aria-label={t("memory.row.forgetAriaLabel", { content: memory.content })}
          >
            <Trash2 className={sx(styles.rowActionIcon)} aria-hidden />
          </AuiButton>
        </Tooltip>
      </div>
    </article>
  );
}
