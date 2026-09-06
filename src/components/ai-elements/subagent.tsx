import { Button as AdsButton } from "@/components/ads/components/Button";
import type { HTMLAttributes } from "react";
import { useMemo, useState } from "react";
import { Bot, ChevronDown } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { LinkifiedText } from "@/components/ui/linkified-text";
import { cx, sx } from "@/components/ads/utils/stylex";
import { transition } from "@/components/ads/recipes/transition";
import { formatWorkerExecutionMetadata, type WorkerExecutionMetadata } from "@/lib/providers/worker-mode";
import { ToolInput, ToolOutput, getStatusBadge } from "./tool";
import { subagentStyles as s } from "./subagent.styles";

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
  workerExecution?: WorkerExecutionMetadata;
}

export function parseSubagentToolInput(args: { input: string }): ParsedSubagentToolInput {
  const raw = args.input;
  try {
    const parsed = JSON.parse(raw) as Record<string, unknown>;
    const subagentTypeValue = parsed.subagent_type ?? parsed.task_name;
    const subagentType = typeof subagentTypeValue === "string" && subagentTypeValue.trim()
      ? subagentTypeValue.trim()
      : null;
    const descriptionValue = parsed.description ?? parsed.task_name;
    const description = typeof descriptionValue === "string" && descriptionValue.trim()
      ? descriptionValue.trim()
      : null;
    const promptValue = parsed.prompt ?? parsed.message;
    const prompt = typeof promptValue === "string" && promptValue.trim()
      ? promptValue.trim()
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

export function SubagentCard({ className, input, output, state, defaultOpen = false, progressMessages, workerExecution, ...props }: SubagentCardProps) {
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
    <section className={cx(sx(s.root), className)} {...props}>
      <AdsButton
        layout="host"
        type="button"
        className={sx(s.header)}
        onClick={() => setOpen((current) => !current)}
      >
        <div className={sx(s.headerBody)}>
          <div className={sx(s.titleRow)}>
            <span className={sx(s.kindLabel)}>
              <Bot className={sx(s.kindIcon)} />
              {workerExecution ? "Worker" : "Subagent"}
            </span>
            {workerExecution ? <Badge variant="outline">{formatWorkerExecutionMetadata(workerExecution)}</Badge> : null}
            {details.subagentType ? <Badge variant="secondary">{details.subagentType}</Badge> : null}
          </div>
          <p className={sx(s.title)}>{title}</p>
          {details.prompt ? (
            <p className={sx(s.promptSummary)}>
              {details.prompt}
            </p>
          ) : null}
        </div>
        <span className={sx(s.headerMeta)}>
          {getStatusBadge(state)}
          <ChevronDown className={sx(s.chevron, transition.transform, open && s.chevronOpen)} />
        </span>
      </AdsButton>

      {visibleProgress.length > 0 ? (
        <div className={sx(s.progressSection)}>
          <ul className={sx(s.progressList)}>
            {visibleProgress.map((msg, idx) => (
              <li key={idx} className={sx(s.progressItem)}>
                <span
                  className={sx(
                    s.progressDot,
                    idx === visibleProgress.length - 1 && (state === "input-streaming" || state === "input-available")
                      ? s.progressDotActive
                      : null,
                  )}
                  aria-hidden="true"
                />
                <LinkifiedText text={msg} className={sx(s.progressText)} />
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      {open ? (
        <div className={sx(s.detail)}>
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
