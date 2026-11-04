import { i18n, useTranslation } from "@/i18n";
import type { ReactNode } from "react";
import { Check, Copy } from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";

import { Button } from "@/components/ads/components/Button";
import { CappedViewport } from "@/components/ads/components/CappedViewport";
import { Citation } from "@/components/ads/components/Citation";
import type { CitationSource } from "@/components/ads/components/Citation.parts";
import { Thinking } from "@/components/ads/components/Thinking";
import { StreamingThoughtViewport } from "@/components/ai-elements/chain-of-thought";
import { MessageResponse } from "@/components/ai-elements/message";
import { LinkifiedText } from "@/components/ui/linkified-text";
import { sx } from "@/components/ads/utils/stylex";

import { extractOutputUrls, toUrlSource } from "./turn-event-state";
import { turnEventRowStyles as styles } from "./turn-event-rows.styles";
import { ClipboardCopyAnnouncement } from "@/components/system/ClipboardCopyAnnouncement";
import { useClipboardCopy } from "@/hooks/use-clipboard-copy";

/** How long the copy action stays acknowledged before returning to rest. */
const COPIED_MS = 1600;

/** Lines as written: a trailing newline does not add an empty last line. */
export function countLines(text: string) {
  if (text.length === 0) return 0;
  return text.replace(/\n$/, "").split("\n").length;
}

/**
 * Whether a capped box is cutting its content off right now. Measured, not
 * guessed from the line count: wrapping decides how tall a line is.
 */
function useOverflowing(enabled: boolean) {
  const [element, setElement] = useState<HTMLDivElement | null>(null);
  const [overflowing, setOverflowing] = useState(false);
  useEffect(() => {
    if (!enabled || !element) return;
    const measure = () => {
      setOverflowing(element.scrollHeight > element.clientHeight + 1);
    };
    measure();
    if (typeof ResizeObserver === "undefined") return;
    const observer = new ResizeObserver(measure);
    observer.observe(element);
    for (const child of element.children) observer.observe(child);
    return () => observer.disconnect();
  }, [element, enabled]);
  return { ref: setElement, overflowing: enabled && overflowing };
}

/**
 * Tool output for one of `ToolRun`'s labelled sections.
 *
 * ADS puts plain values in `input`/`output` and reserves `children` for a
 * primitive that draws its own recessed surface, so this is deliberately not a
 * surface: it is the value, in the machine register, plus the one secondary
 * affordance §9 names for it. `ToolRun` has no copy slot of its own — the copy
 * control therefore lives here rather than being invented onto the row.
 */
export function TraceOutput(args: {
  /** Render URLs in the text as links. Off while output is still arriving. */
  linkify?: boolean;
  /** Prose rather than machine output — a subagent's report, not stdout. */
  prose?: boolean;
  text: string;
  /**
   * Hold the value to the shared 220px cap (ADS `CappedViewport`): a long
   * result scrolls inside its section, with a fade at the cut and a line count
   * under it, instead of pushing the conversation down.
   */
  capped?: boolean;
  /** Names the capped region, e.g. "Arguments" or "Output". */
  label?: string;
}) {
  useTranslation();
  const { capped = false, label, linkify = true, prose = false, text } = args;
  const { status, copied, copy: copyText } = useClipboardCopy(COPIED_MS);
  const copy = useCallback(() => {
    void copyText(text);
  }, [copyText, text]);
  const { ref: viewportRef, overflowing } = useOverflowing(capped);
  const lineCount = useMemo(() => (capped ? countLines(text) : 0), [capped, text]);

  const textClass = sx(styles.outputText, prose && styles.outputProse);
  const body = linkify ? (
    <LinkifiedText as="pre" className={textClass} text={text} />
  ) : (
    <pre className={textClass}>{text}</pre>
  );

  return (
    <div className={sx(styles.output)} data-trace-output="">
      {capped ? (
        <CappedViewport
          ref={viewportRef}
          label={label}
          data-trace-output-capped="true"
          xstyle={styles.capped}
        >
          {body}
        </CappedViewport>
      ) : (
        body
      )}
      {capped && overflowing ? (
        <p className={sx(styles.lineNote)} data-testid="trace-output-line-note">
          {i18n.t("session:turnEventRows.lineNote", { count: lineCount })}
        </p>
      ) : null}
      <Button
        iconOnly
        aria-label={
          copied
            ? i18n.t("session:turnEventRows.traceOutput")
            : i18n.t("session:turnEventRows.traceOutput2")
        }
        title={
          copied
            ? i18n.t("session:turnEventRows.traceOutput")
            : i18n.t("session:turnEventRows.traceOutput2")
        }
        onClick={copy}
        size="xs"
        type="button"
        variant="quiet"
        xstyle={styles.copy}
      >
        {copied ? <Check aria-hidden /> : <Copy aria-hidden />}
      </Button>
      <ClipboardCopyAnnouncement status={status} />
    </div>
  );
}

/**
 * The sources a web search or fetch grounded the turn in.
 *
 * `Citation.List` is the ADS surface for provenance, and it reads the same
 * `CitationSource` shape as the inline mark, so a source row and a mark cannot
 * disagree about what `[2]` means. The host's only job is to turn provider
 * output into that shape: the URL is the destination, its host is the
 * machine-register provenance line, and `index` is the number as written —
 * here, first-seen order in the output.
 */
export function TraceCitations(args: { output?: string }) {
  useTranslation();
  const sources = useMemo(() => toCitationSources(extractOutputUrls(args.output)), [args.output]);

  if (sources.length === 0) return null;

  // i18n-ignore: component presentation enum, not visible text
  return <Citation.List detail="compact" sources={sources} />;
}

function toCitationSources(urls: readonly string[]): CitationSource[] {
  return urls.map((url, position) => ({
    href: url,
    id: url,
    index: position + 1,
    source: toUrlSource(url),
    title: url,
  }));
}

/**
 * The turn's web sources under its answer: one "Sources N" line that opens to
 * the URLs every web search and fetch in the turn returned (see
 * `collectTurnWebSources`). The trace keeps each call's own list; this one is
 * for the reader who never opens the trace. No marks go into the answer text:
 * nothing reports which sentence came from which page.
 */
export function TurnSources(args: { urls: readonly string[] }) {
  useTranslation();
  const sources = useMemo(() => toCitationSources(args.urls), [args.urls]);
  if (sources.length === 0) return null;
  return (
    <Citation.List
      data-turn-sources=""
      // i18n-ignore: component presentation enum, not visible text
      detail="compact"
      sources={sources}
      xstyle={styles.turnSources}
    />
  );
}

/**
 * The turn's reasoning, rendered through ADS `Thinking`.
 *
 * Three behaviours move out of the host and into the component, which is the
 * whole point of the adoption: the phase label shimmers through the shared
 * `text-shimmer` recipe instead of a fourth local copy of that sweep, the
 * trace stays closed unless the reader opens it, and the settled header
 * keeps the measured duration.
 *
 * `durationMs` is passed only when the provider actually timed the pass. §6:
 * given no measurement `Thinking` says "Finished thinking" rather than a
 * plausible number, and that is the correct output — not a gap to fill.
 *
 * A reasoning pass with no text renders as one quiet line rather than an empty
 * disclosure, because `Thinking` treats an absent trace as an absent trace.
 */
export function ReasoningRow(args: {
  durationMs?: number;
  isStreaming: boolean;
  /**
   * When the pass started, epoch ms. Used only while it streams, so the live
   * header ticks; a settled pass keeps reporting only the measured duration.
   */
  startedAt?: number;
  text: string;
}) {
  useTranslation();
  const { durationMs, isStreaming, startedAt, text } = args;
  const body = text.trim();

  return (
    <Thinking
      durationMs={durationMs}
      startedAt={
        isStreaming && startedAt !== undefined && Number.isFinite(startedAt) ? startedAt : undefined
      }
      label={i18n.t("session:turnEventRows.label")}
      loaderVariant="think"
      phase={
        isStreaming ? i18n.t("ui:thinking.thinking") : i18n.t("session:turnEventRows.extraCopy197")
      }
      status={isStreaming ? "thinking" : "settled"}
    >
      {body.length === 0 ? null : isStreaming ? (
        /*
         * Cap the *thought*, not the trace: the `Thinking` trigger above stays
         * pinned, so the phase label and its clock never fade out, and only
         * the prose glides under the top mask once it outgrows the cap.
         */
        <StreamingThoughtViewport>
          <MessageResponse isStreaming className={sx(styles.reasoningBody)}>
            {body}
          </MessageResponse>
        </StreamingThoughtViewport>
      ) : (
        <MessageResponse className={sx(styles.reasoningBody)}>{body}</MessageResponse>
      )}
    </Thinking>
  );
}

/** A running subagent's streamed progress lines, for `ToolRun`'s payload. */
export function SubagentProgress(args: { messages: string[] }): ReactNode {
  useTranslation();
  if (args.messages.length === 0) return null;
  return (
    <ul className={sx(styles.progressList)}>
      {args.messages.map((message, index) => (
        <li className={sx(styles.progressItem)} key={`${message}-${index}`}>
          <LinkifiedText text={message} />
        </li>
      ))}
    </ul>
  );
}
