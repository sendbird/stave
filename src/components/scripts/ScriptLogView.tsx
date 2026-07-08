import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { ArrowDown, Check, Copy, Maximize2, Minimize2, Trash2 } from "lucide-react";
import { Button, toast } from "@/components/ui";
import { copyTextToClipboard } from "@/lib/clipboard";
import { cn } from "@/lib/utils";
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
    <div className={cn("mt-2.5 space-y-1", props.className)}>
      <div className="group relative overflow-hidden rounded-md border border-border/50">
        {hasLog ? (
          <>
            <div className="pointer-events-none absolute right-1.5 top-1.5 z-10 flex items-center gap-1 opacity-0 transition-opacity group-hover:opacity-100 group-focus-within:opacity-100">
              <Button
                type="button"
                size="icon"
                variant="ghost"
                className="pointer-events-auto size-6 rounded-md bg-background text-muted-foreground hover:text-foreground"
                onClick={() => void handleCopy()}
                title="Copy log"
                aria-label="Copy log"
              >
                {copied ? <Check className="size-3.5 text-success" /> : <Copy className="size-3.5" />}
              </Button>
              {onClear ? (
                <Button
                  type="button"
                  size="icon"
                  variant="ghost"
                  className="pointer-events-auto size-6 rounded-md bg-background text-muted-foreground hover:text-foreground"
                  onClick={onClear}
                  title="Clear log"
                  aria-label="Clear log"
                >
                  <Trash2 className="size-3.5" />
                </Button>
              ) : null}
              {expandable ? (
                <Button
                  type="button"
                  size="icon"
                  variant="ghost"
                  className="pointer-events-auto size-6 rounded-md bg-background text-muted-foreground hover:text-foreground"
                  onClick={() => setExpanded((value) => !value)}
                  title={expanded ? "Collapse log" : "Expand log"}
                  aria-label={expanded ? "Collapse log" : "Expand log"}
                >
                  {expanded ? <Minimize2 className="size-3.5" /> : <Maximize2 className="size-3.5" />}
                </Button>
              ) : null}
            </div>
            <pre
              ref={scrollRef}
              onScroll={handleScroll}
              className={cn(
                "overflow-auto whitespace-pre-wrap bg-terminal px-3 py-2 font-mono text-[11px] leading-[1.6] text-terminal-foreground",
                expanded ? "max-h-[28rem]" : "max-h-44",
              )}
            >
              {displayLog}
            </pre>
            {showJump ? (
              <Button
                type="button"
                size="sm"
                variant="secondary"
                className="absolute bottom-1.5 left-1/2 h-6 -translate-x-1/2 gap-1 rounded-full px-2.5 text-[10px] shadow"
                onClick={scrollToBottom}
              >
                <ArrowDown className="size-3" />
                Jump to bottom
              </Button>
            ) : null}
          </>
        ) : null}
        {error ? (
          <div className="border-t border-destructive/20 bg-destructive/8 px-2.5 py-2 text-xs text-destructive">
            {error}
          </div>
        ) : null}
      </div>
      {showFooter ? (
        <div className="flex items-center gap-2 px-0.5 text-[10px] text-muted-foreground">
          {exitCode !== undefined ? (
            <span className={cn("font-medium", exitCode === 0 ? "text-success" : "text-destructive")}>
              Exit {exitCode}
            </span>
          ) : null}
          {durationLabel ? <span>· {durationLabel}</span> : null}
        </div>
      ) : null}
    </div>
  );
}
