import { i18n, type I18nKey } from "@/i18n/runtime";
import { toStaveToolDisplayName } from "@/lib/tool-display-name";
import {
  clipPathTail,
  describeToolCall,
  type ToolAction,
  type ToolActionVerb,
} from "./tool-action";

/**
 * A tool call as a sentence, in two tenses: "Reading src/x.ts" while it runs,
 * "Read src/x.ts" once it settled. No tool name or JSON reaches the reader;
 * an MCP tool reads as its own name in words, without its server prefix.
 */
export type ToolSentenceTense = "doing" | "done";

const DOING = {
  read: ["session:agentProgress.doing.read", "session:agentProgress.doing.readAny"],
  edit: ["session:agentProgress.doing.edit", "session:agentProgress.doing.editAny"],
  write: ["session:agentProgress.doing.write", "session:agentProgress.doing.writeAny"],
  run: ["session:agentProgress.doing.run", "session:agentProgress.doing.runAny"],
  search: ["session:agentProgress.doing.search", "session:agentProgress.doing.searchAny"],
  find: ["session:agentProgress.doing.find", "session:agentProgress.doing.findAny"],
  list: ["session:agentProgress.doing.list", "session:agentProgress.doing.listAny"],
  fetch: ["session:agentProgress.doing.fetch", "session:agentProgress.doing.fetchAny"],
  webSearch: ["session:agentProgress.doing.webSearch", "session:agentProgress.doing.webSearchAny"],
  agent: ["session:agentProgress.doing.agent", "session:agentProgress.doing.agentAny"],
  plan: ["session:agentProgress.doing.plan", "session:agentProgress.doing.planAny"],
  skill: ["session:agentProgress.doing.skill", "session:agentProgress.doing.skillAny"],
  message: ["session:agentProgress.doing.message", "session:agentProgress.doing.messageAny"],
  tool: ["session:agentProgress.doing.tool", "session:agentProgress.doing.toolAny"],
} as const satisfies Record<ToolActionVerb, readonly [I18nKey, I18nKey]>;

const DONE = {
  read: ["session:agentProgress.done.read", "session:agentProgress.done.readAny"],
  edit: ["session:agentProgress.done.edit", "session:agentProgress.done.editAny"],
  write: ["session:agentProgress.done.write", "session:agentProgress.done.writeAny"],
  run: ["session:agentProgress.done.run", "session:agentProgress.done.runAny"],
  search: ["session:agentProgress.done.search", "session:agentProgress.done.searchAny"],
  find: ["session:agentProgress.done.find", "session:agentProgress.done.findAny"],
  list: ["session:agentProgress.done.list", "session:agentProgress.done.listAny"],
  fetch: ["session:agentProgress.done.fetch", "session:agentProgress.done.fetchAny"],
  webSearch: ["session:agentProgress.done.webSearch", "session:agentProgress.done.webSearchAny"],
  agent: ["session:agentProgress.done.agent", "session:agentProgress.done.agentAny"],
  plan: ["session:agentProgress.done.plan", "session:agentProgress.done.planAny"],
  skill: ["session:agentProgress.done.skill", "session:agentProgress.done.skillAny"],
  message: ["session:agentProgress.done.message", "session:agentProgress.done.messageAny"],
  tool: ["session:agentProgress.done.tool", "session:agentProgress.done.toolAny"],
} as const satisfies Record<ToolActionVerb, readonly [I18nKey, I18nKey]>;

/** Verbs whose object is a path, clipped to its end so the file name shows. */
const PATH_VERBS: ReadonlySet<ToolActionVerb> = new Set(["read", "edit", "write", "list"]);

/** An action in words, in the display language. */
export function phraseToolAction(action: ToolAction, tense: ToolSentenceTense): string {
  const [withTarget, withoutTarget] = (tense === "doing" ? DOING : DONE)[action.verb];
  const values = { target: action.target ?? "", tool: action.tool ?? "" };
  return action.target ? i18n.t(withTarget, values) : i18n.t(withoutTarget, values);
}

export interface ToolSentence {
  action: ToolAction;
  doing: string;
  done: string;
}

/**
 * Both tenses of one call. Paths are relative to `cwd` when they lie inside
 * it and keep their end when long; Stave's own tools keep their product name.
 */
export function describeToolSentence(
  toolName: string,
  input: unknown,
  options: { cwd?: string; pathMax?: number } = {},
): ToolSentence {
  const action = describeToolCall(toolName, input, options.cwd);
  if ("stave" in action) {
    const label = toStaveToolDisplayName(toolName);
    return { action: { verb: "tool", tool: label }, doing: label, done: label };
  }
  const shown: ToolAction = action.target && PATH_VERBS.has(action.verb)
    ? { ...action, target: clipPathTail(action.target.replace(/^…/, ""), options.pathMax) }
    : action;
  return { action: shown, doing: phraseToolAction(shown, "doing"), done: phraseToolAction(shown, "done") };
}
