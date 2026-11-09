import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { flushSync } from "react-dom";
import * as stylex from "@stylexjs/stylex";
import { Button } from "@/components/aui/components/Button";
import { vars } from "@/components/aui/tokens/tokens.stylex";
import { sx } from "@/components/aui/utils/stylex";
import { AssistantMessageBody } from "@/components/session/message/assistant-trace";
import { applyCustomTheme, applyThemeClass } from "@/lib/themes/apply";
import { LONG_STREAMING_REPLY, streamingDeltas } from "./fixture";

const params = new URLSearchParams(window.location.search);

/** Mid-reply, inside the second section's code block: an unclosed fence. */
const DEFAULT_CUT = LONG_STREAMING_REPLY.indexOf(
  "await fsyncFile",
  LONG_STREAMING_REPLY.indexOf("## 2."),
);

function initialCut() {
  const at = params.get("at");
  if (at === null) return DEFAULT_CUT;
  return Math.round(LONG_STREAMING_REPLY.length * Math.min(1, Math.max(0, Number(at))));
}

export interface MarkdownStreamingMeasurement {
  deltas: number;
  totalMs: number;
  p50DeltaMs: number;
  p95DeltaMs: number;
  maxDeltaMs: number;
  completionMs: number;
  finalMatchesFinishedRender: boolean;
}

declare global {
  interface Window {
    __markdownStreamingMeasure?: MarkdownStreamingMeasurement;
  }
}

function percentile(values: number[], fraction: number) {
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.min(sorted.length - 1, Math.floor(sorted.length * fraction))] ?? 0;
}

/** `useId` values differ between two mounts of the same content. */
function comparableHtml(element: Element | null) {
  return (element?.innerHTML ?? "").replace(/_r_[0-9a-z]+_/gi, "_r_id_");
}

function Reply(props: { content: string; streaming: boolean; id: string }) {
  return (
    <AssistantMessageBody
      taskId="markdown-streaming-preview"
      messageId={props.id}
      streamingEnabled
      traceExpansionMode="manual"
      showInterimMessages
      message={{
        role: "assistant",
        content: props.content,
        parts: [{ type: "text", text: props.content }],
        isStreaming: props.streaming,
      }}
    />
  );
}

/**
 * One long reply in the transcript renderer. By default it is frozen part way
 * through, inside an unclosed code fence; `at=<0..1>` moves the cut, `theme=dark`
 * switches theme, Replay streams it in 12-character deltas, and `measure=1`
 * streams it synchronously and records the per-delta render time.
 */
export function MarkdownStreamingPreview() {
  const [dark] = useState(() => params.get("theme") === "dark");
  const [content, setContent] = useState(() => LONG_STREAMING_REPLY.slice(0, initialCut()));
  const [streaming, setStreaming] = useState(() => initialCut() < LONG_STREAMING_REPLY.length);
  const [showReference, setShowReference] = useState(false);
  const [measurement, setMeasurement] = useState<MarkdownStreamingMeasurement | null>(null);
  const streamed = useRef<HTMLDivElement>(null);
  const reference = useRef<HTMLDivElement>(null);
  const timer = useRef<number | null>(null);

  useLayoutEffect(() => {
    applyCustomTheme({ theme: null });
    applyThemeClass({ enabled: dark });
  }, [dark]);

  const replay = () => {
    if (timer.current !== null) window.clearInterval(timer.current);
    const deltas = streamingDeltas(LONG_STREAMING_REPLY);
    let index = 0;
    setStreaming(true);
    setContent("");
    timer.current = window.setInterval(() => {
      index += 1;
      setContent(deltas.slice(0, index).join(""));
      if (index >= deltas.length) {
        window.clearInterval(timer.current!);
        timer.current = null;
        setStreaming(false);
      }
    }, 30);
  };

  useEffect(() => () => {
    if (timer.current !== null) window.clearInterval(timer.current);
  }, []);

  useEffect(() => {
    if (params.get("measure") !== "1") return;
    const handle = window.setTimeout(() => {
      const deltas = streamingDeltas(LONG_STREAMING_REPLY);
      const durations: number[] = [];
      flushSync(() => {
        setStreaming(true);
        setContent("");
      });
      const started = performance.now();
      deltas.forEach((_, index) => {
        const deltaStarted = performance.now();
        flushSync(() => setContent(deltas.slice(0, index + 1).join("")));
        durations.push(performance.now() - deltaStarted);
      });
      const completionStarted = performance.now();
      flushSync(() => setStreaming(false));
      const completionMs = performance.now() - completionStarted;
      const totalMs = performance.now() - started;
      flushSync(() => setShowReference(true));
      const result: MarkdownStreamingMeasurement = {
        deltas: deltas.length,
        totalMs: Number(totalMs.toFixed(1)),
        p50DeltaMs: Number(percentile(durations, 0.5).toFixed(2)),
        p95DeltaMs: Number(percentile(durations, 0.95).toFixed(2)),
        maxDeltaMs: Number(Math.max(...durations).toFixed(2)),
        completionMs: Number(completionMs.toFixed(2)),
        finalMatchesFinishedRender:
          comparableHtml(streamed.current) === comparableHtml(reference.current),
      };
      window.__markdownStreamingMeasure = result;
      setMeasurement(result);
    }, 500);
    return () => window.clearTimeout(handle);
  }, []);

  return (
    <div className={sx(styles.page)}>
      <header className={sx(styles.header)}>
        <h1 className={sx(styles.title)}>Markdown while streaming</h1>
        <Button variant="quiet" onClick={replay}>
          Replay
        </Button>
        <span className={sx(styles.note)} data-preview-state="">
          {streaming ? "Streaming" : "Finished"} · {content.length} / {LONG_STREAMING_REPLY.length}
        </span>
        {measurement ? (
          <pre className={sx(styles.note)} data-preview-measure="">
            {JSON.stringify(measurement, null, 2)}
          </pre>
        ) : null}
      </header>
      <div ref={streamed} className={sx(styles.column)} data-preview-reply="streamed">
        <Reply id="reply" content={content} streaming={streaming} />
      </div>
      {showReference ? (
        <div ref={reference} className={sx(styles.reference)} aria-hidden>
          <Reply id="reply" content={LONG_STREAMING_REPLY} streaming={false} />
        </div>
      ) : null}
    </div>
  );
}

const styles = stylex.create({
  page: {
    backgroundColor: vars["--aui-color-canvas"],
    color: vars["--aui-color-text"],
    minHeight: "100vh",
    padding: vars["--aui-space-24"],
  },
  header: {
    display: "flex",
    alignItems: "center",
    flexWrap: "wrap",
    gap: vars["--aui-space-12"],
    marginInline: "auto",
    maxWidth: "48rem",
    marginBottom: vars["--aui-space-24"],
  },
  title: { fontSize: vars["--aui-font-size-lead"], fontWeight: vars["--aui-font-weight-semibold"] },
  note: { fontSize: vars["--aui-font-size-caption"], color: vars["--aui-color-text-muted"] },
  column: { maxWidth: "48rem", marginInline: "auto", minWidth: 0 },
  reference: { position: "absolute", visibility: "hidden", insetInlineStart: 0, insetBlockStart: 0, width: "48rem" },
});
