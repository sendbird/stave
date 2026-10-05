import { i18n, type I18nKey } from "@/i18n/runtime";
/**
 * The Agent run bar's Now line: what the agent is doing, in plain language.
 *
 * It never shows a raw tool name, and it changes at most once every
 * `NOW_LINE_MIN_INTERVAL_MS` so a burst of tool calls reads as steady work
 * rather than flicker.
 *
 * Pure. Used by `src/components/agent-runs/AgentRunBar.tsx`.
 */
import {
  isTodoToolName,
  resolveToolNameLeaf,
} from "@/lib/providers/tool-activity";

export const NOW_LINE_MIN_INTERVAL_MS = 1_500;

const COMMAND_PHRASES: ReadonlyArray<[RegExp, Extract<I18nKey, `${string}:${string}`>]> = [
  [/\b(git\s+push)\b/i, "agentRuns:nowLine.extraCopy251"],
  [/\b(git\s+commit)\b/i, "agentRuns:nowLine.extraCopy252"],
  [/\bgh\s+pr\b/i, "agentRuns:nowLine.extraCopy253"],
  [/\bgh\s+run\b/i, "agentRuns:nowLine.extraCopy254"],
  [/\b(typecheck|tsc)\b/i, "agentRuns:nowLine.typecheck"],
  [/\b(lint|eslint|biome|ruff)\b/i, "agentRuns:nowLine.extraCopy255"],
  [/\b(test|tests|vitest|jest|pytest|playwright)\b/i, "agentRuns:nowLine.extraCopy256"],
  [/\b(build)\b/i, "agentRuns:nowLine.extraCopy257"],
  [/\b(bun|npm|pnpm|yarn)\s+(install|add|i)\b/i, "agentRuns:nowLine.extraCopy258"],
  [/\bgit\s+(diff|status|log|show)\b/i, "agentRuns:nowLine.extraCopy259"],
];

const LEAF_PHRASES: Record<string, string> = {
  get read() { return i18n.t("agentRuns:nowLine.extraCopy263"); },
  get readfile() { return i18n.t("agentRuns:nowLine.extraCopy263"); },
  get view() { return i18n.t("agentRuns:nowLine.extraCopy263"); },
  get viewfile() { return i18n.t("agentRuns:nowLine.extraCopy263"); },
  get glob() { return i18n.t("agentRuns:nowLine.extraCopy265"); },
  get filesearch() { return i18n.t("agentRuns:nowLine.extraCopy265"); },
  get grep() { return i18n.t("agentRuns:nowLine.extraCopy268"); },
  get ripgrep() { return i18n.t("agentRuns:nowLine.extraCopy268"); },
  get codebasesearch() { return i18n.t("agentRuns:nowLine.extraCopy268"); },
  get search() { return i18n.t("agentRuns:nowLine.extraCopy269"); },
  get edit() { return i18n.t("agentRuns:nowLine.extraCopy280"); },
  get multiedit() { return i18n.t("agentRuns:nowLine.extraCopy280"); },
  get editfile() { return i18n.t("agentRuns:nowLine.extraCopy280"); },
  get strreplace() { return i18n.t("agentRuns:nowLine.extraCopy280"); },
  get strreplaceeditor() { return i18n.t("agentRuns:nowLine.extraCopy280"); },
  get filechange() { return i18n.t("agentRuns:nowLine.extraCopy280"); },
  get write() { return i18n.t("agentRuns:nowLine.extraCopy278"); },
  get writefile() { return i18n.t("agentRuns:nowLine.extraCopy278"); },
  get createfile() { return i18n.t("agentRuns:nowLine.extraCopy278"); },
  get applypatch() { return i18n.t("agentRuns:nowLine.extraCopy280"); },
  get patch() { return i18n.t("agentRuns:nowLine.extraCopy280"); },
  get notebookedit() { return i18n.t("agentRuns:nowLine.extraCopy281"); },
  get websearch() { return i18n.t("agentRuns:nowLine.extraCopy282"); },
  get webfetch() { return i18n.t("agentRuns:nowLine.extraCopy284"); },
  get fetch() { return i18n.t("agentRuns:nowLine.extraCopy284"); },
  get task() { return i18n.t("agentRuns:nowLine.extraCopy286"); },
  get agent() { return i18n.t("agentRuns:nowLine.extraCopy286"); },
  get stavereportstage() { return i18n.t("agentRuns:nowLine.extraCopy287"); },
  get staveblockstage() { return i18n.t("agentRuns:nowLine.extraCopy288"); },
  get stavegetmission() { return i18n.t("agentRuns:nowLine.extraCopy289"); },
  get staverunworker() { return i18n.t("agentRuns:nowLine.extraCopy290"); },
  get staveconsultadvisor() { return i18n.t("agentRuns:nowLine.extraCopy291"); },
};

const COMMAND_LEAVES = new Set([
  "bash",
  "sh",
  "shell",
  "localshell",
  "terminal",
  "runcommand",
  "runterminalcommand",
  "executecommand",
  "commandexecution",
]);

/**
 * A plain phrase for one tool call. `detail` is the row's input summary, such
 * as the command a shell call ran.
 */
export function describeToolActivity(args: { toolName: string; detail?: string }): string {
  const leaf = resolveToolNameLeaf(args.toolName);
  if (isTodoToolName(args.toolName)) return i18n.t("agentRuns:nowLine.describeToolActivity");
  if (COMMAND_LEAVES.has(leaf)) {
    const command = args.detail ?? "";
    for (const [pattern, phrase] of COMMAND_PHRASES) {
      if (pattern.test(command)) return i18n.t(phrase);
    }
    return i18n.t("agentRuns:nowLine.describeToolActivity2");
  }
  const known = LEAF_PHRASES[leaf];
  if (known) return known;
  // Third-party MCP tools: name the server, which is usually a product noun
  // the user recognizes, rather than the tool token.
  const server = /^mcp__([^_]+(?:_[^_]+)*)__/.exec(args.toolName.trim())?.[1];
  if (server) return i18n.t("agentRuns:nowLine.describeToolActivity3", { value1: server.replaceAll("_", " ") });
  return i18n.t("agentRuns:nowLine.describeToolActivity4");
}

export interface NowLineState {
  text: string;
  shownAt: number;
}

/**
 * The line to show now. A new phrase replaces the shown one only after the
 * minimum interval; until then the shown phrase stays.
 */
export function nextNowLine(
  previous: NowLineState | null,
  candidate: string,
  now: number,
  minIntervalMs = NOW_LINE_MIN_INTERVAL_MS,
): NowLineState {
  if (!previous) return { text: candidate, shownAt: now };
  if (previous.text === candidate) return previous;
  if (now - previous.shownAt < minIntervalMs) return previous;
  return { text: candidate, shownAt: now };
}
