import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { ArrowDown, Check, Copy, Maximize2, Minimize2, Trash2 } from "lucide-react";
import { Button, toast } from "@/components/ui";
import { copyTextToClipboard } from "@/lib/clipboard";
import { cx, sx } from "../ads/utils/stylex";
import { logMarker, logStyles } from "./script-log.stylex";
import {
  formatScriptDuration,
  stripAnsiControlSequences,
} from "@/lib/workspace-scripts";

const BOTTOM_THRESHOLD_PX = 24;

export interface ScriptLogViewProps {
  log: string;
  running: boolean;
  error?: string;
  exitCode?: number;
  startedAt?: number;
  endedAt?: number;
  onClear?: () => void;
  /** Allow expanding the log to a taller viewport. Defaults to true. */
  expandable?: boolean;
  className?: string;
}

/**
 * Read-only terminal-styled log viewer shared by the scripts panel and manager.
 * Strips ANSI control sequences (no color rendering), sticks to the bottom
 * while new output streams, and exposes copy/clear/expand affordances.
 */
export function ScriptLogView(props: ScriptLogViewProps) {
  const { log, running, error, exitCode, startedAt, endedAt, onClear } = props;
  const expandable = props.expandable ?? true;

  const scrollRef = useRef<HTMLPreElement>(null);
  const atBottomRef = useRef(true);
  const [expanded, setExpanded] = useState(false);
  const [showJump, setShowJump] = useState(false);
  const [copied, setCopied] = useState(false);

  const displayLog = useMemo(() => stripAnsiControlSequences(log), [log]);

  const scrollToBottom = useCallback(() => {
    const el = scrollRef.current;
    if (el) {
      el.scrollTop = el.scrollHeight;
      atBottomRef.current = true;
      setShowJump(false);
    }
  }, []);

  const handleScroll = useCallback(() => {
    const el = scrollRef.current;
    if (!el) {
      return;
    }
    const distance = el.scrollHeight - el.scrollTop - el.clientHeight;
    const atBottom = distance <= BOTTOM_THRESHOLD_PX;
    atBottomRef.current = atBottom;
    setShowJump(!atBottom);
  }, []);

  // Stick to the bottom while streaming, unless the user scrolled up.
  useLayoutEffect(() => {
    if (atBottomRef.current) {
      scrollToBottom();
    }
  }, [displayLog, expanded, scrollToBottom]);

  useEffect(() => {
    if (!copied) {
      return;
    }
    const timeout = setTimeout(() => setCopied(false), 1_500);
    return () => clearTimeout(timeout);
  }, [copied]);

  const handleCopy = useCallback(async () => {
    try {
      await copyTextToClipboard(displayLog);
      setCopied(true);
    } catch {
      toast.error("Copy failed");
    }
  }, [displayLog]);

  const durationLabel = useMemo(() => {
    if (startedAt === undefined) {
      return "";
    }
    if (endedAt === undefined) {
      return "";
    }
    return formatScriptDuration(endedAt - startedAt);
  }, [startedAt, endedAt]);

  const hasLog = displayLog.length > 0;
  const showFooter =
    !running && (exitCode !== undefined || durationLabel.length > 0 || Boolean(error));

  if (!hasLog && !error) {
    return null;
  }

  return (
    <div className={cx(sx(logStyles.root), props.className)}>
      <div className={sx(logMarker, logStyles.viewport)}>
        {hasLog ? (
          <>
            <div className={sx(logStyles.actions)}>
              <Button
                type="button"
                size="icon"
                variant="ghost"
                xstyle={logStyles.action}
                onClick={() => void handleCopy()}
                title="Copy log"
                aria-label="Copy log"
              >
                {copied ? <Check className={sx(logStyles.icon, logStyles.success)} /> : <Copy className={sx(logStyles.icon)} />}
              </Button>
              {onClear ? (
                <Button
                  type="button"
                  size="icon"
                  variant="ghost"
                  xstyle={logStyles.action}
                  onClick={onClear}
                  title="Clear log"
                  aria-label="Clear log"
                >
                  <Trash2 className={sx(logStyles.icon)} />
                </Button>
              ) : null}
              {expandable ? (
                <Button
                  type="button"
                  size="icon"
                  variant="ghost"
                  xstyle={logStyles.action}
                  onClick={() => setExpanded((value) => !value)}
                  title={expanded ? "Collapse log" : "Expand log"}
                  aria-label={expanded ? "Collapse log" : "Expand log"}
                >
                  {expanded ? <Minimize2 className={sx(logStyles.icon)} /> : <Maximize2 className={sx(logStyles.icon)} />}
                </Button>
              ) : null}
            </div>
            <pre
              ref={scrollRef}
              onScroll={handleScroll}
              className={sx(logStyles.output, expanded && logStyles.expanded)}
            >
              {displayLog}
            </pre>
            {showJump ? (
              <Button
                type="button"
                size="sm"
                variant="secondary"
                xstyle={logStyles.jump}
                onClick={scrollToBottom}
              >
                <ArrowDown className={sx(logStyles.smallIcon)} />
                Jump to bottom
              </Button>
            ) : null}
          </>
        ) : null}
        {error ? (
          <div className={sx(logStyles.error)}>
            {error}
          </div>
        ) : null}
      </div>
      {showFooter ? (
        <div className={sx(logStyles.footer)}>
          {exitCode !== undefined ? (
            <span className={sx(logStyles.exit, exitCode === 0 ? logStyles.success : logStyles.failed)}>
              Exit {exitCode}
            </span>
          ) : null}
          {durationLabel ? <span>· {durationLabel}</span> : null}
        </div>
      ) : null}
    </div>
  );
}
