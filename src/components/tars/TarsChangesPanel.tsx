import { useEffect, useMemo, useRef, useState } from "react";
import { MessageSquareQuote, RefreshCw } from "lucide-react";
import { useTranslation } from "@/i18n";
import { Button } from "@/components/aui/components/Button";
import { DiffViewer } from "@/components/aui/components/DiffViewer";
import { FileChangeSummary, type FileChangeKind } from "@/components/aui/components/FileChangeSummary";
import { sx } from "@/components/aui/utils/stylex";
import { AsyncBoundary } from "@/components/system/AsyncBoundary";
import { ReviewFileList } from "@/components/review/ReviewFileList";
import { describeReviewReadError } from "@/components/review/review-errors";
import { useDiffReviewData, useReviewFileContent } from "@/components/review/useReviewData";
import { useDiffLineHighlighter } from "@/components/session/message/diff-highlighter";
import { DIFF_CONTEXT_LINES } from "@/components/session/message/diff-viewer-options";
import type { AgentRunDetail } from "@/lib/agent-runs/api";
import type { ReviewFile, ReviewFileStatus } from "@/lib/review/review-scope";
import { languageFromFilePath } from "@/lib/syntax-highlight";
import { quoteTarsDiffLines, type TarsDiffLine } from "@/lib/tars/diff-quote";
import { tarsSideViewStyles as styles } from "./tars-side-view.styles";

const CHANGE_KIND: Record<ReviewFileStatus, FileChangeKind> = { added: "added", modified: "modified", deleted: "removed", renamed: "renamed", copied: "added" };

/** The commit the run started from: its first stage's first attempt. Everything since is the responsibility's change. */
export function tarsRunBase(detail: AgentRunDetail | undefined) {
  const first = detail?.agentRun.workflow.stages[0];
  if (!detail || !first) return null;
  const attempts = detail.stages.filter((record) => record.stageId === first.id).sort((a, b) => a.attempt - b.attempt);
  const record = attempts.find((candidate) => candidate.startHeadSha) ?? null;
  return record?.startHeadSha ? { stageId: first.id, attempt: record.attempt, startHeadSha: record.startHeadSha } : null;
}

/** One unified diff row as drawn: old number, new number, sign, code. */
function readDiffRow(row: Element): TarsDiffLine | null {
  const numbers = row.querySelectorAll(":scope > [data-aui-slot='line-number']");
  if (numbers.length !== 2) return null;
  const parse = (cell: Element | undefined) => {
    const value = Number(cell?.textContent ?? "");
    return Number.isInteger(value) && value > 0 ? value : null;
  };
  const sign = numbers[1]!.nextElementSibling;
  const code = sign?.nextElementSibling;
  const mark = sign?.textContent === "+" ? "+" : sign?.textContent === "-" ? "-" : " ";
  return { oldLine: parse(numbers[0]), newLine: parse(numbers[1]), sign: mark, text: code?.textContent ?? "" };
}

/** The diff rows the current text selection touches, in order. */
export function selectedTarsDiffLines(root: HTMLElement | null, selection: Selection | null): TarsDiffLine[] {
  if (!root || !selection || selection.isCollapsed || !selection.rangeCount) return [];
  const range = selection.getRangeAt(0);
  if (!root.contains(range.commonAncestorContainer)) return [];
  return Array.from(root.querySelectorAll("div:has(> [data-aui-slot='line-number'])"))
    .filter((row) => range.intersectsNode(row)).flatMap((row) => readDiffRow(row) ?? []);
}

/** The selection state to keep: the same array while it stays empty, so React skips the update. */
export function keepTarsDiffSelection(current: TarsDiffLine[], next: TarsDiffLine[]) {
  return !current.length && !next.length ? current : next;
}

function FileDiff({ cwd, data, file, onQuote }: {
  cwd: string; data: Parameters<typeof useReviewFileContent>[0]["data"]; file: ReviewFile; onQuote: (text: string) => void;
}) {
  const { t } = useTranslation(["shell", "review"]);
  const content = useReviewFileContent({ cwd, data, file });
  const language = languageFromFilePath(file.path);
  const highlighter = useDiffLineHighlighter(language);
  const rootRef = useRef<HTMLDivElement>(null);
  const [lines, setLines] = useState<TarsDiffLine[]>([]);
  useEffect(() => {
    // Typing elsewhere fires selectionchange constantly; an empty selection that stays empty keeps the same state, so nothing re-renders.
    const update = () => {
      const next = selectedTarsDiffLines(rootRef.current, document.getSelection());
      setLines((current) => keepTarsDiffSelection(current, next));
    };
    document.addEventListener("selectionchange", update);
    return () => document.removeEventListener("selectionchange", update);
  }, []);
  const ask = () => {
    const quote = quoteTarsDiffLines({ lines, header: (range) => t(range.side === "new" ? "shell:tars.side.changes.quoteHeader" : "shell:tars.side.changes.quoteHeaderRemoved",
      { path: file.path, range: range.start === range.end ? String(range.start) : `${range.start}–${range.end}` }) });
    if (quote) onQuote(quote);
  };
  return <section className={sx(styles.diff)} aria-label={file.path} data-tars-diff={file.path}>
    <div className={sx(styles.diffHeader)}>
      <FileChangeSummary path={file.path} kind={CHANGE_KIND[file.status]} directoryDepth={Infinity}
        {...(file.additions !== null ? { added: file.additions } : {})} {...(file.deletions !== null ? { removed: file.deletions } : {})} />
      {/* Pressing keeps the selection: the quote reads it at click time. */}
      <Button size="2xs" variant="outlined" disabled={!lines.length} onMouseDown={(event) => event.preventDefault()} onClick={ask}
        title={t("shell:tars.side.changes.askHint")} data-tars-ask-lines={lines.length}>
        <MessageSquareQuote aria-hidden />{lines.length ? t("shell:tars.side.changes.askCount", { count: lines.length }) : t("shell:tars.side.changes.ask")}
      </Button>
    </div>
    <p className={sx(styles.meta)}>{t("shell:tars.side.changes.selectHint")}</p>
    <AsyncBoundary state={content.state} onRetry={content.refresh} describeError={describeReviewReadError}>
      {(diff) => diff.binary ? <p className={sx(styles.meta)}>{t("review:diff.binary")}</p>
        : diff.oldContent === diff.newContent ? <p className={sx(styles.meta)}>{t("review:diff.noTextChange")}</p>
          // Unified at any width: the side view is narrow, and a quote reads both line numbers from one row.
          : <div ref={rootRef} className={sx(styles.diffBody)}><DiffViewer aria-label={t("review:diff.ariaLabel", { path: file.path })} before={diff.oldContent} after={diff.newContent}
            mode="unified" granularity="word" context={DIFF_CONTEXT_LINES} highlighter={highlighter} language={language} /></div>}
    </AsyncBoundary>
  </section>;
}

/**
 * The execution workspace's changes since the run started: the changed files
 * and the selected file's diff, read from the host as Review reads them.
 * Selected lines can be quoted into the Tars composer; quoting sends nothing.
 */
export function TarsChangesPanel({ detail, cwd, onQuote }: { detail: AgentRunDetail | undefined; cwd: string | null; onQuote: (text: string) => void }) {
  const { t } = useTranslation(["shell"]);
  const base = tarsRunBase(detail);
  const { state, refresh } = useDiffReviewData({
    scope: { kind: "stage", agentRunId: detail?.agentRun.id ?? "", stageId: base?.stageId ?? "", attempt: base?.attempt ?? 1 },
    cwd, stage: { startHeadSha: base?.startHeadSha ?? null, facts: null },
  });
  const [selected, setSelected] = useState<string | null>(null);
  const [read, setRead] = useState<string[]>([]);
  const [reads, setReads] = useState(0);
  if (!detail) return <p className={sx(styles.meta)} role="status" data-tars-changes="none">{t("shell:tars.side.changes.noRun")}</p>;
  // The live note, the file list and the selected file's diff are separate parts on the section rhythm.
  return <div className={sx(styles.stack)} data-tars-changes={detail.agentRun.id}>
    {/* Unlike the report, this is the workspace as it is now; it can move after the run ended. */}
    <div className={sx(styles.diffHeader)}>
      <p className={sx(styles.meta)} data-tars-changes-live="">{t("shell:tars.side.changes.live")}</p>
      <Button size="2xs" variant="outlined" onClick={() => { refresh(); setReads((value) => value + 1); }} data-tars-changes-refresh="">
        <RefreshCw aria-hidden />{t("shell:tars.side.changes.refresh")}</Button>
    </div>
    <AsyncBoundary state={state} onRetry={refresh} describeError={describeReviewReadError}>
      {(data) => <ChangesBody key={reads} data={data} cwd={cwd!} selected={selected} read={read} onQuote={onQuote}
        onSelect={(file) => { setSelected(file.path); setRead((paths) => paths.includes(file.path) ? paths : [...paths, file.path]); }} />}
    </AsyncBoundary>
  </div>;
}

function ChangesBody({ data, cwd, selected, read, onSelect, onQuote }: {
  data: Parameters<typeof useReviewFileContent>[0]["data"]; cwd: string; selected: string | null; read: readonly string[];
  onSelect: (file: ReviewFile) => void; onQuote: (text: string) => void;
}) {
  // A run's whole change is one scope here, so files are not grouped by stage.
  const files = useMemo(() => data.files.map(({ origin: _origin, ...file }) => file), [data.files]);
  const file = files.find((candidate) => candidate.path === selected) ?? files[0] ?? null;
  return <>
    <ReviewFileList files={files} selected={file?.path ?? null} read={file && !read.includes(file.path) ? [...read, file.path] : read} onSelect={onSelect} />
    {file ? <FileDiff key={file.path} cwd={cwd} data={data} file={file} onQuote={onQuote} /> : null}
  </>;
}
