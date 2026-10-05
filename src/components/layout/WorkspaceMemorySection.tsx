import { Button as AdsButton } from "@/components/ads/components/Button";
import { useCallback, useEffect, useRef, useState } from "react";
import { Brain, Inbox, Pencil, Pin, Sparkles, Trash2 } from "lucide-react";
import { ConfirmDialog } from "@/components/layout/ConfirmDialog";
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
import { i18n, useTranslation, type I18nKey } from "@/i18n";
import { sx } from "@/components/ads/utils/stylex";
import {
  REPOSITORY_MEMORY_KINDS,
  REPOSITORY_MEMORY_RECALL_MODES,
  REPOSITORY_MEMORY_CONTENT_MAX_CHARS,
  type RepositoryMemory,
  type RepositoryMemoryUpdateArgs,
} from "@/lib/repository-memory";
import {
  RepositoryMemoryControls,
  REPOSITORY_MEMORY_CHANGED_EVENT,
} from "./RepositoryMemoryControls";
import { informationRow } from "./information-row.styles";
import { workspaceMemorySectionStyles as styles } from "./workspace-memory-section.styles";
import { MemoryCollectionInvitation } from "./MemoryCollectionInvitation";
import { failureMessage } from "./workspace-information/failure-message";

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


export function WorkspaceMemorySection(props: {
  repositoryPath: string | null;
  refreshKey: string;
  onEntriesChange?: (args: { count: number; loading: boolean }) => void;
}) {
  const { repositoryPath, refreshKey, onEntriesChange } = props;
  const { t } = useTranslation(["workspace", "common"]);
  const [items, setItems] = useState<RepositoryMemory[]>([]);
  const [loading, setLoading] = useState(Boolean(repositoryPath));
  const [error, setError] = useState("");
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
      window.dispatchEvent(new Event(REPOSITORY_MEMORY_CHANGED_EVENT));
      return true;
    } catch (err) {
      if (request === generation.current)
        toast.error(failureMessage(t("memory.section.saveFailed"), err));
      return false;
    }
  };
  const remove = async (id: string) => {
    const request = generation.current;
    try {
      const result = await window.api?.repositoryMemory?.delete?.({ id });
      if (request !== generation.current) return;
      if (!result?.ok)
        throw new Error(result?.message ?? "");
      window.dispatchEvent(new Event(REPOSITORY_MEMORY_CHANGED_EVENT));
    } catch (err) {
      if (request === generation.current)
        toast.error(failureMessage(t("memory.section.forgetFailed"), err));
    }
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
          <AdsButton
            layout="host"
            type="submit"
            xstyle={styles.retry}
            onClick={() => void reload()}
          >
            {t("common:actions.retry")}
          </AdsButton>
        </p>
      )}
      {!loading && !error && !items.length && (
        <p className={sx(styles.empty)}>
          {t("memory.section.empty")}
        </p>
      )}
      {items.length > 0 ? (
        <div className={sx(informationRow.list)}>
          {items.map((memory) => (
            <MemoryRow
              key={memory.id}
              memory={memory}
              onSave={update}
              onRemove={() => remove(memory.id)}
            />
          ))}
        </div>
      ) : null}
    </div>
  );
}

export function MemoryRow(props: {
  memory: RepositoryMemory;
  onSave: (patch: RepositoryMemoryUpdateArgs) => Promise<boolean>;
  onRemove: () => Promise<void>;
}) {
  const { memory } = props;
  const { t } = useTranslation(["workspace", "common"]);
  const [editing, setEditing] = useState(false);
  const [confirmingForget, setConfirmingForget] = useState(false);
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
    <>
      <article
        className={sx(informationRow.root)}
      >
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
          <p className={sx(styles.content)}>{memory.content}</p>
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
        </div>
        <div className={sx(informationRow.trail)}>
          {memory.recallMode === "candidate" ? (
            <AdsButton
              layout="host"
              type="button"
              disabled={busy}
              onClick={() => void promote()}
              xstyle={styles.rowAction}
              title={t("memory.row.promoteTitle")}
              aria-label={t("memory.row.promoteAriaLabel", { content: memory.content })}
            >
              <Sparkles className={sx(styles.rowActionIcon)} aria-hidden />
            </AdsButton>
          ) : null}
          <AdsButton
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
            title={t("memory.row.editTitle")}
            aria-label={t("memory.row.editAriaLabel", { content: memory.content })}
          >
            <Pencil className={sx(styles.rowActionIcon)} aria-hidden />
          </AdsButton>
          <AdsButton
            layout="host"
            type="button"
            disabled={busy}
            onClick={() => setConfirmingForget(true)}
            xstyle={[styles.rowAction, styles.rowActionDanger]}
            title={t("memory.row.forgetTitle")}
            aria-label={t("memory.row.forgetAriaLabel", { content: memory.content })}
          >
            <Trash2 className={sx(styles.rowActionIcon)} aria-hidden />
          </AdsButton>
        </div>
      </article>
      {/* Forgetting is not undoable and the row it removes is one line of text,
          so the old always-visible "Forget" button was one mis-click from
          silent data loss. The saved-plan list next to it already gates its
          delete this way. */}
      <ConfirmDialog
        open={confirmingForget}
        title={t("memory.forgetDialog.title")}
        description={t("memory.forgetDialog.description", { content: memory.content })}
        confirmLabel={t("memory.forgetDialog.confirm")}
        loading={busy}
        onConfirm={async () => {
          setBusy(true);
          try {
            await props.onRemove();
            setConfirmingForget(false);
          } finally {
            setBusy(false);
          }
        }}
        onCancel={() => setConfirmingForget(false)}
      />
    </>
  );
}
