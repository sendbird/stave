import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import { useTranslation } from "@/i18n";
import { formatFileSize } from "@/lib/fs/file-preview-limits";
import { FilePreviewReadError, type FilePreviewReader } from "@/lib/fs/file-preview-reader";
import {
  findInLog, locateLogLine, LOG_SEARCH_MAX_LENGTH, readLogPage, readLogTail,
  type LogLocation,
} from "@/lib/fs/log-preview";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { sx } from "@/components/aui/utils/stylex";
import { fileViewerStyles as styles } from "./read-only-file.styles";

const TAIL_POLL_MS = 1000;
type Message =
  | "fileViewer.changed"
  | "fileViewer.binary"
  | "fileViewer.unavailable"
  | "fileViewer.noMatch";
function logReadMessage(error: unknown): Message {
  if (error instanceof FilePreviewReadError) {
    if (error.reason === "changed") return "fileViewer.changed";
    if (error.reason === "binary") return "fileViewer.binary";
  }
  return "fileViewer.unavailable";
}

export function LogFileViewer({
  reader, lineTarget, onLineTargetHandled,
}: {
  reader: FilePreviewReader;
  lineTarget: { line: number } | null;
  onLineTargetHandled: (target: { line: number }) => void;
}) {
  const { t } = useTranslation("panes");
  const [location, setLocation] = useState<LogLocation | null>(null);
  const [message, setMessage] = useState<Message | null>(null);
  const [following, setFollowing] = useState(false);
  const [busy, setBusy] = useState(true);
  const [query, setQuery] = useState("");
  const request = useRef<AbortController | null>(null);
  const previousMatch = useRef<{ query: string; location: LogLocation } | null>(null);
  const viewport = useRef<HTMLDivElement>(null);
  const marker = useRef<HTMLElement>(null);
  const lastScrolledLocation = useRef<LogLocation | null>(null);

  const run = useCallback(async (
    operation: (signal: AbortSignal) => Promise<LogLocation | null>,
    noResult?: Message,
  ) => {
    request.current?.abort();
    const controller = new AbortController();
    request.current = controller;
    setBusy(true);
    setMessage(null);
    try {
      const result = await operation(controller.signal);
      controller.signal.throwIfAborted();
      if (result) {
        setLocation(result);
      } else if (noResult) {
        setMessage(noResult);
      }
      return true;
    } catch (error) {
      if (!controller.signal.aborted) {
        setMessage(logReadMessage(error));
        return true;
      }
      return false;
    } finally {
      if (!controller.signal.aborted) setBusy(false);
    }
  }, []);

  const openStart = useCallback(() => {
    previousMatch.current = null;
    setFollowing(false);
    void run(async (signal) => ({ page: await readLogPage(reader, 0, signal) }));
  }, [run, reader]);

  useEffect(() => {
    openStart();
    return () => request.current?.abort();
  }, [openStart]);

  useEffect(() => {
    if (!lineTarget) return;
    setFollowing(false);
    previousMatch.current = null;
    void run((signal) => locateLogLine(reader, lineTarget.line, signal)).then((finished) => {
      if (finished) onLineTargetHandled(lineTarget);
    });
  }, [lineTarget, onLineTargetHandled, reader, run]);

  useEffect(() => {
    if (!following) return;
    const controller = new AbortController();
    let timer: ReturnType<typeof setTimeout>;
    let revision: string | undefined;
    const poll = async () => {
      try {
        const page = await readLogTail(reader, revision, controller.signal);
        if (!controller.signal.aborted && page) {
          revision = page.revision;
          setLocation({ page });
          setMessage(null);
        }
      } catch (error) {
        if (!controller.signal.aborted) {
          // Writers can append during the read. Retry the whole snapshot.
          revision = undefined;
          setMessage(logReadMessage(error));
        }
      }
      if (!controller.signal.aborted) {
        setBusy(false);
        timer = setTimeout(() => void poll(), TAIL_POLL_MS);
      }
    };
    void poll();
    return () => {
      controller.abort();
      clearTimeout(timer);
    };
  }, [following, reader]);

  useLayoutEffect(() => {
    const panel = viewport.current;
    if (!panel || !location || (!following && lastScrolledLocation.current === location)) return;
    lastScrolledLocation.current = location;
    if (following) {
      panel.scrollTop = panel.scrollHeight;
    } else if (marker.current) {
      panel.scrollTop += marker.current.getBoundingClientRect().top - panel.getBoundingClientRect().top - panel.clientHeight / 2;
    } else {
      panel.scrollTop = 0;
    }
  }, [following, location]);

  function toggleTail() {
    if (following) {
      setFollowing(false);
      setBusy(false);
      return;
    }
    request.current?.abort();
    previousMatch.current = null;
    setMessage(null);
    setFollowing(true);
    setBusy(true);
  }

  function search() {
    const text = query;
    const previous = previousMatch.current?.query === text ? previousMatch.current.location : undefined;
    setFollowing(false);
    void run(async (signal) => {
      const next = await findInLog(reader, text, signal, previous, location?.page);
      signal.throwIfAborted();
      previousMatch.current = next ? { query: text, location: next } : null;
      return next;
    }, "fileViewer.noMatch");
  }

  function turnPage(delta: number) {
    if (!location) return;
    previousMatch.current = null;
    void run(async (signal) => ({
      page: await readLogPage(reader, delta < 0 ? location.page.previousIndex : location.page.index + 1, signal, location.page),
    }));
  }

  const page = location?.page;
  const text = (location?.prefix ?? "") + (page?.text ?? "");
  const highlight = location?.highlight;
  const notice = message ? t(message) : busy ? t("fileViewer.loading") : null;

  return (
    <div className={sx(styles.root)} data-testid="log-file-viewer">
      <div className={sx(styles.toolbar)} data-testid="file-viewer-toolbar">
        <div className={sx(styles.controls)}>
          <Button size="sm" variant="outline" disabled={following || busy || !page || page.previousIndex < 0} onClick={() => turnPage(-1)}>
            {t("fileViewer.previousChunk")}
          </Button>
          <Button size="sm" variant="outline" disabled={following || busy || !page || page.eof} onClick={() => turnPage(1)}>
            {t("fileViewer.nextChunk")}
          </Button>
          <Button size="sm" variant={following ? "secondary" : "outline"} aria-pressed={following} onClick={toggleTail}>
            {t("fileViewer.followTail")}
          </Button>
          <Button size="sm" variant="ghost" onClick={openStart}>{t("fileViewer.reload")}</Button>
        </div>
        <form className={sx(styles.controls)} onSubmit={(event) => { event.preventDefault(); search(); }}>
          <Input type="search" xstyle={styles.search} value={query} maxLength={LOG_SEARCH_MAX_LENGTH}
            aria-label={t("fileViewer.findInFile")} placeholder={t("fileViewer.findInFile")}
            onChange={(event) => setQuery(event.currentTarget.value)}
          />
          <Button size="sm" type="submit" disabled={!query || busy}>{t("fileViewer.findNext")}</Button>
        </form>
        {page ? <span className={sx(styles.caption)}>{t("fileViewer.logSize", { size: formatFileSize(page.size) })}</span> : null}
      </div>
      <div role="status" className={sx(styles.caption, notice ? styles.status : null)}>{notice}</div>
      <div ref={viewport} className={sx(styles.viewport)} tabIndex={0} role="region" aria-label={t("fileViewer.logContent")}>
        {page ? <pre className={sx(styles.log)}>
          {highlight ? <>
            {text.slice(0, highlight[0])}
            <mark ref={marker} className={sx(styles.highlight)}>{text.slice(...highlight) || "\u200b"}</mark>
            {text.slice(highlight[1])}
          </> : text}
        </pre> : null}
      </div>
    </div>
  );
}
