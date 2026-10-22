/**
 * What a subagent tool call asked for, read from its JSON input: the agent
 * type the runtime reported, the task's short description and the prompt.
 * Claude names them `subagent_type` / `description` / `prompt`; Codex names
 * the task `task_name` and the prompt `message`. Unparseable input keeps only
 * the raw text.
 */
export interface ParsedSubagentToolInput {
  subagentType: string | null;
  description: string | null;
  prompt: string | null;
  raw: string;
}

function readTrimmed(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

export function parseSubagentToolInput(args: {
  input: string;
}): ParsedSubagentToolInput {
  const raw = args.input;
  try {
    const parsed = JSON.parse(raw) as Record<string, unknown>;
    return {
      subagentType: readTrimmed(parsed.subagent_type ?? parsed.task_name),
      description: readTrimmed(parsed.description ?? parsed.task_name),
      prompt: readTrimmed(parsed.prompt ?? parsed.message),
      raw,
    };
  } catch {
    return { subagentType: null, description: null, prompt: null, raw };
  }
}
