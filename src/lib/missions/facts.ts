/**
 * Stage facts: what Stave itself observed in a stage's turns, as opposed to
 * what the agent reported. Read from the task's persisted messages, whose tool
 * parts outlive the turn-event compaction that runs when a turn completes.
 *
 * Pure. The host reads the messages and the diff
 * (`electron/host-service/supervision/stage-facts.ts`).
 */
import { MISSION_LIMITS, type StageFacts } from "./domain";

/** The part of a persisted message this reads; everything else is ignored. */
export interface FactSourceMessage {
  turnId?: string;
  parts?: readonly unknown[];
}

interface ToolPart {
  toolUseId: string;
  toolName: string;
  input: string;
  state: "output-available" | "output-error";
  exitCode: number | null;
}

/** Command tools as the adapters name them: Claude's `Bash`, Codex's `bash`. */
const COMMAND_TOOL_NAMES = new Set(["bash", "shell"]);

function readToolPart(part: unknown): ToolPart | null {
  if (!part || typeof part !== "object") return null;
  const candidate = part as Record<string, unknown>;
  if (candidate.type !== "tool_use") return null;
  if (typeof candidate.toolUseId !== "string" || !candidate.toolUseId.trim()) return null;
  if (typeof candidate.toolName !== "string" || !candidate.toolName.trim()) return null;
  // A call still streaming or waiting on its result proves nothing yet.
  if (candidate.state !== "output-available" && candidate.state !== "output-error") return null;
  return {
    toolUseId: candidate.toolUseId.slice(0, MISSION_LIMITS.maxIdChars),
    toolName: candidate.toolName.slice(0, 200),
    input: typeof candidate.input === "string" ? candidate.input : "",
    state: candidate.state,
    exitCode: typeof candidate.exitCode === "number" && Number.isInteger(candidate.exitCode) ? candidate.exitCode : null,
  };
}

/**
 * The command a command tool ran. Claude sends a JSON object with a `command`
 * field; Codex sends the command line itself.
 */
function readCommand(part: ToolPart): string | null {
  if (!COMMAND_TOOL_NAMES.has(part.toolName.toLowerCase())) return null;
  const input = part.input.trim();
  if (!input) return null;
  if (input.startsWith("{")) {
    try {
      const parsed = JSON.parse(input) as { command?: unknown };
      return typeof parsed.command === "string" && parsed.command.trim()
        ? parsed.command.trim()
        : null;
    } catch {
      return null;
    }
  }
  return input;
}

/**
 * Tool transport success is separate from process success. Only an explicit
 * structured exit code establishes process status; missing status is unknown.
 */
export function extractStageFacts(args: {
  messages: readonly FactSourceMessage[];
  turnIds: ReadonlySet<string>;
  diff: StageFacts["diff"];
  currentTurnId?: string;
}): StageFacts {
  const toolCalls: StageFacts["toolCalls"] = [];
  const commands: StageFacts["commands"] = [];
  const seen = new Set<string>();
  for (const message of args.messages) {
    if (!message.turnId || !args.turnIds.has(message.turnId)) continue;
    for (const raw of message.parts ?? []) {
      const part = readToolPart(raw);
      const identity = `${message.turnId}:${part?.toolUseId}`;
      if (!part || seen.has(identity)) continue;
      seen.add(identity);
      const ok = part.state === "output-available";
      toolCalls.push({ toolCallId: part.toolUseId, name: part.toolName, ok, turnId: message.turnId });
      const command = readCommand(part);
      if (command) {
        commands.push({
          command: command.slice(0, MISSION_LIMITS.report.command),
          exitCode: part.exitCode,
          toolCallId: part.toolUseId,
          turnId: message.turnId,
          outcome: !ok || (part.exitCode !== null && part.exitCode !== 0) ? "failed" : part.exitCode === 0 ? "succeeded" : "unknown",
          ...(part.exitCode !== null ? { provenance: "provider-structured" as const } : {}),
        });
      }
    }
  }
  return {
    diff: args.diff,
    commands: commands.slice(-MISSION_LIMITS.facts.commands),
    toolCalls: toolCalls.slice(-MISSION_LIMITS.facts.toolCalls),
    action: null,
    ...(args.currentTurnId ? { currentTurnId: args.currentTurnId } : {}),
  };
}

/** `git diff --shortstat` output, or null when it has no counts. */
export function parseDiffShortStat(output: string): StageFacts["diff"] {
  const text = output.trim();
  if (!text) return { filesChanged: 0, insertions: 0, deletions: 0 };
  const count = (pattern: RegExp) => Number(pattern.exec(text)?.[1] ?? 0);
  const filesChanged = count(/(\d+) files? changed/);
  if (!filesChanged) return null;
  return {
    filesChanged,
    insertions: count(/(\d+) insertions?\(\+\)/),
    deletions: count(/(\d+) deletions?\(-\)/),
  };
}
