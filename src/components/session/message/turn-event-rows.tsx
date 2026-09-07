import type { ReactNode } from "react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import { Button } from "@/components/ads/components/Button";
import { Citation } from "@/components/ads/components/Citation";
import type { CitationSource } from "@/components/ads/components/Citation.parts";
import { Thinking } from "@/components/ads/components/Thinking";
import { StreamingThoughtViewport } from "@/components/ai-elements/chain-of-thought";
import { MESSAGE_BODY_LINE_HEIGHT } from "@/components/ai-elements/message-styles";
import { LinkifiedText } from "@/components/ui/linkified-text";
import { cx, sx } from "@/components/ads/utils/stylex";

import { extractOutputUrls, toUrlSource } from "./turn-event-state";
import { turnEventRowStyles as styles } from "./turn-event-rows.styles";

/** How long the copy action stays acknowledged before returning to rest. */
const COPIED_MS = 1600;

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
}) {
  const { linkify = true, prose = false, text } = args;
  const [copied, setCopied] = useState(false);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(
    () => () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    },
    [],
  );

  const copy = useCallback(() => {
    void navigator.clipboard?.writeText(text).then(() => {
      setCopied(true);
      if (timerRef.current) clearTimeout(timerRef.current);
      timerRef.current = setTimeout(() => setCopied(false), COPIED_MS);
    });
  }, [text]);

  const textClass = sx(styles.outputText, prose && styles.outputProse);

  return (
    <div className={sx(styles.output)}>
      {linkify ? (
        <LinkifiedText as="pre" className={textClass} text={text} />
      ) : (
        <pre className={textClass}>{text}</pre>
      )}
      <Button
        onClick={copy}
        size="xs"
        type="button"
        variant="quiet"
        xstyle={styles.copy}
      >
        {copied ? "Copied" : "Copy"}
      </Button>
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
  const sources = useMemo<CitationSource[]>(
    () =>
      extractOutputUrls(args.output).map((url, position) => ({
        href: url,
        id: url,
        index: position + 1,
        source: toUrlSource(url),
        title: url,
      })),
    [args.output],
  );

  if (sources.length === 0) return null;

  return <Citation.List detail="compact" sources={sources} />;
}

/**
 * The turn's reasoning, rendered through ADS `Thinking`.
 *
 * Three behaviours move out of the host and into the component, which is the
 * whole point of the adoption: the phase label shimmers through the shared
 * `text-shimmer` recipe instead of a fourth local copy of that sweep, the
 * trace collapses to its measured one-line record when the model settles, and
 * a reader who opens the trace mid-run keeps it open.
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
  text: string;
}) {
  const { durationMs, isStreaming, text } = args;
  const body = text.trim();

  return (
    <Thinking
      durationMs={durationMs}
      label="Reasoning trace"
      phase={isStreaming ? "Thinking" : "Reasoning"}
      status={isStreaming ? "thinking" : "settled"}
    >
      {body.length === 0 ? null : isStreaming ? (
        /*
         * Cap the *thought*, not the trace: the `Thinking` trigger above stays
         * pinned, so the phase label and its clock never fade out, and only
         * the prose glides under the top mask once it outgrows the cap.
         */
        <StreamingThoughtViewport>
          <p
            className={cx(sx(styles.reasoningBody))}
            style={{ lineHeight: MESSAGE_BODY_LINE_HEIGHT }}
          >
            {body}
          </p>
        </StreamingThoughtViewport>
      ) : (
        <LinkifiedText
          as="p"
          className={sx(styles.reasoningBody)}
          style={{ lineHeight: MESSAGE_BODY_LINE_HEIGHT }}
          text={body}
        />
      )}
    </Thinking>
  );
}

/** A running subagent's streamed progress lines, for `ToolRun`'s payload. */
export function SubagentProgress(args: { messages: string[] }): ReactNode {
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
