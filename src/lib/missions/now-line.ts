/**
 * The Mission bar's Now line: what the agent is doing, in plain language.
 *
 * It never shows a raw tool name, and it changes at most once every
 * `NOW_LINE_MIN_INTERVAL_MS` so a burst of tool calls reads as steady work
 * rather than flicker.
 *
 * Pure. Used by `src/components/missions/MissionBar.tsx`.
 */
import {
  isTodoToolName,
  resolveToolNameLeaf,
} from "@/lib/providers/tool-activity";

export const NOW_LINE_MIN_INTERVAL_MS = 1_500;

const COMMAND_PHRASES: ReadonlyArray<[RegExp, string]> = [
  [/\b(git\s+push)\b/i, "Pushing the branch"],
  [/\b(git\s+commit)\b/i, "Committing the change"],
  [/\bgh\s+pr\b/i, "Working on the pull request"],
  [/\bgh\s+run\b/i, "Reading the check logs"],
  [/\b(typecheck|tsc)\b/i, "Type-checking"],
  [/\b(lint|eslint|biome|ruff)\b/i, "Linting"],
  [/\b(test|tests|vitest|jest|pytest|playwright)\b/i, "Running the tests"],
  [/\b(build)\b/i, "Building"],
  [/\b(bun|npm|pnpm|yarn)\s+(install|add|i)\b/i, "Installing dependencies"],
  [/\bgit\s+(diff|status|log|show)\b/i, "Reviewing the changes"],
];

const LEAF_PHRASES: Record<string, string> = {
  read: "Reading the code",
  readfile: "Reading the code",
  view: "Reading the code",
  viewfile: "Reading the code",
  glob: "Looking through the files",
  filesearch: "Looking through the files",
  grep: "Searching the code",
  ripgrep: "Searching the code",
  codebasesearch: "Searching the code",
  search: "Searching",
  edit: "Editing files",
  multiedit: "Editing files",
  editfile: "Editing files",
  strreplace: "Editing files",
  strreplaceeditor: "Editing files",
  filechange: "Editing files",
  write: "Writing files",
  writefile: "Writing files",
  createfile: "Writing files",
  applypatch: "Editing files",
  patch: "Editing files",
  notebookedit: "Editing a notebook",
  websearch: "Researching on the web",
  webfetch: "Reading a web page",
  fetch: "Reading a web page",
  task: "Working with a subagent",
  agent: "Working with a subagent",
  stavereportstage: "Reporting the stage",
  staveblockstage: "Reporting what is missing",
  stavegetmission: "Reading the mission",
  staverunworker: "Handing part of the stage to a worker",
  staveconsultadvisor: "Asking the Advisor",
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
  if (isTodoToolName(args.toolName)) return "Updating the plan";
  if (COMMAND_LEAVES.has(leaf)) {
    const command = args.detail ?? "";
    for (const [pattern, phrase] of COMMAND_PHRASES) {
      if (pattern.test(command)) return phrase;
    }
    return "Running a command";
  }
  const known = LEAF_PHRASES[leaf];
  if (known) return known;
  // Third-party MCP tools: name the server, which is usually a product noun
  // the user recognizes, rather than the tool token.
  const server = /^mcp__([^_]+(?:_[^_]+)*)__/.exec(args.toolName.trim())?.[1];
  if (server) return `Using ${server.replaceAll("_", " ")}`;
  return "Working";
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
