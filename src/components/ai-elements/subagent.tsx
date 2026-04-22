import type { HTMLAttributes } from "react";
import { useMemo, useState } from "react";
import { Bot, ChevronDown } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { LinkifiedText } from "@/components/ui/linkified-text";
import { cn } from "@/lib/utils";
import { ToolInput, ToolOutput, getStatusBadge } from "./tool";

type ToolState = "input-streaming" | "input-available" | "output-available" | "output-error";

interface ParsedSubagentToolInput {
  subagentType: string | null;
  description: string | null;
  prompt: string | null;
  raw: string;
}

interface SubagentCardProps extends HTMLAttributes<HTMLDivElement> {
  input: string;
  output?: string;
  state?: ToolState;
  defaultOpen?: boolean;
  /** Live progress messages streamed from the running subagent. */
  progressMessages?: string[];
}

export function parseSubagentToolInput(args: { input: string }): ParsedSubagentToolInput {
  const raw = args.input;
  try {
    const parsed = JSON.parse(raw) as Record<string, unknown>;
    const subagentType = typeof parsed.subagent_type === "string" && parsed.subagent_type.trim()
      ? parsed.subagent_type.trim()
      : null;
    const description = typeof parsed.description === "string" && parsed.description.trim()
      ? parsed.description.trim()
      : null;
    const prompt = typeof parsed.prompt === "string" && parsed.prompt.trim()
      ? parsed.prompt.trim()
      : null;
    return { subagentType, description, prompt, raw };
  } catch {
    return {
      subagentType: null,
      description: null,
      prompt: null,
      raw,
    };
  }
}

/**
 * Strip the "Subagent progress:" prefix that the legacy system event pipeline
 * prepends. Inside the SubagentCard the prefix is redundant.
 */
function stripProgressPrefix(text: string): string {
  const trimmed = text.trimStart();
  const prefix = "Subagent progress:";
  return trimmed.startsWith(prefix) ? trimmed.slice(prefix.length).trimStart() : trimmed;
}

/**
 * Extract only the first line of a progress message. The SDK occasionally
 * leaks full subagent responses into the summary field; showing just the
 * first line keeps the card compact.
 */
function firstLine(text: string): string {
  const idx = text.indexOf("\n");
  return idx === -1 ? text : text.slice(0, idx);
}

export function SubagentCard({ className, input, output, state, defaultOpen = false, progressMessages, ...props }: SubagentCardProps) {
  const [open, setOpen] = useState(defaultOpen);
  const details = useMemo(() => parseSubagentToolInput({ input }), [input]);
  const title = details.description ?? details.subagentType ?? "Subagent activity";
  const promptText = details.prompt ?? details.raw;

  const visibleProgress = useMemo(() => {
    if (!progressMessages || progressMessages.length === 0) {
      return [];
    }
    return progressMessages.map((msg) => firstLine(stripProgressPrefix(msg)));
  }, [progressMessages]);

  return (
    <section
      className={cn("overflow-hidden rounded-md border border-primary/25 bg-primary/5", className)}
      {...props}
    >
      <button
        type="button"
        className="flex w-full items-start justify-between gap-3 px-3 py-3 text-left"
        onClick={() => setOpen((current) => !current)}
      >
        <div className="min-w-0 space-y-1">
          <div className="flex flex-wrap items-center gap-2">
            <span className="inline-flex items-center gap-1.5 text-[0.875em] font-semibold text-foreground">
              <Bot className="size-3.5 text-primary" />
              Subagent
            </span>
            {details.subagentType ? <Badge variant="secondary">{details.subagentType}</Badge> : null}
          </div>
          <p className="text-[0.875em] font-medium text-foreground">{title}</p>
          {details.prompt ? (
            <p className="line-clamp-2 text-[0.75em] leading-[1.6] text-muted-foreground">
              {details.prompt}
            </p>
          ) : null}
        </div>
        <span className="inline-flex shrink-0 items-center gap-2">
          {getStatusBadge(state)}
          <ChevronDown className={cn("size-3.5 transition-transform", open ? "rotate-180" : "rotate-0")} />
        </span>
      </button>

      {visibleProgress.length > 0 ? (
        <div className="border-t border-primary/15 px-3 py-2">
          <ul className="space-y-0.5">
            {visibleProgress.map((msg, idx) => (
              <li key={idx} className="flex items-start gap-1.5 text-[0.75em] text-muted-foreground">
                <span
                  className={cn(
                    "mt-1.5 size-1.5 shrink-0 rounded-full",
                    idx === visibleProgress.length - 1 && (state === "input-streaming" || state === "input-available")
                      ? "bg-primary animate-pulse"
                      : "bg-primary/40",
                  )}
                  aria-hidden="true"
                />
                <LinkifiedText text={msg} className="min-w-0 break-words" />
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      {open ? (
        <div className="space-y-2 border-t border-primary/15 bg-background/70 px-3 py-2">
          <ToolInput input={promptText} />
          {state !== "input-streaming" ? (
            <ToolOutput
              outputText={output}
              errorText={state === "output-error" ? (output ?? "Subagent failed.") : undefined}
            />
          ) : null}
        </div>
      ) : null}
    </section>
  );
}
