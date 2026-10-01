/**
 * The system prompt Stave gives every Claude session: a cacheable static prefix
 * (turn rules, the user's base prompt, response style, browser and Lens policy)
 * and a per-session dynamic suffix (workspace root, the task's Agent, Worker
 * mode brief).
 *
 * Used by: `claude-sdk-runtime.ts`.
 */
import {
  CLAUDE_STAVE_LENS_INSTRUCTIONS,
  CLAUDE_STAVE_NATIVE_BROWSER_INSTRUCTIONS,
} from "./claude-browser-instructions";

/**
 * Cache boundary marker for the claude-agent-sdk systemPrompt string[] API.
 * Matches the SDK's SYSTEM_PROMPT_DYNAMIC_BOUNDARY export — inlined here to
 * avoid a flaky ESM named-value import in bun's parallel test runner.
 */
const SYSTEM_PROMPT_DYNAMIC_BOUNDARY = "__SYSTEM_PROMPT_DYNAMIC_BOUNDARY__";

/**
 * Always-on behavioral guardrail injected into every Claude turn.
 *
 * Stave drives the provider one turn at a time and has no persistent loop that can
 * re-invoke the model after a turn ends, so the CLI's "notify you when the background
 * task finishes" pattern is not available here. Without this directive the model
 * routinely ends a turn promising an unprompted follow-up (which never arrives) or
 * leaves a plain-text question that Stave cannot surface an answer control for,
 * stranding the user in a loading/queue-only state.
 *
 * Kept as a module-level constant so it stays byte-stable in the cacheable static
 * prefix of the system prompt.
 */
export const STAVE_TURN_BEHAVIOR_DIRECTIVE = [
  "Stave runtime constraints (read carefully):",
  '- You run inside Stave, which drives you one turn at a time. After a turn ends you CANNOT send an unprompted follow-up message, and there is no channel to autonomously notify the user later. Never promise things like "I\'ll let you know when this finishes" or "I\'ll continue automatically once the background task completes."',
  "- Do not end a turn while expecting to resume on your own. If work must continue, either keep doing it within the current turn or finish with a concrete recommendation the user can act on.",
  "- Background completion notifications (from background subagents, background shell tasks, or workflows) can only reach you while the current turn is still running. Never end a turn waiting to be notified about background work. Stave forces Agent tool calls to run in the foreground (run_in_background: false), so a subagent's result is always returned directly by its tool call — do not narrate plans like \"I'll proceed once the subagent notifies me\".",
  "- If a foreground subagent returns no output or stops before completing its brief, continue that same agent once when its result provides a continuation handle. If it still cannot finish, complete the remaining verification yourself before ending this turn. Never end merely by announcing that the worker stopped.",
  "- To ask a question that must block on the user's decision, use the AskUserQuestion tool so Stave can render a real answer control. A plain-text question at the end of a turn cannot receive an inline answer and will strand the user in a waiting state.",
].join("\n");

export function buildClaudeSystemPrompt(args: {
  cwd: string;
  baseSystemPrompt?: string;
  responseStylePrompt?: string;
  /**
   * Whether the Stave local MCP is registered for this session. The Lens block
   * is included only then, because its tools do not otherwise exist.
   */
  hasStaveLocalMcp?: boolean;
  /** Instructions of the Agent the task runs as; see `ProviderRuntimeOptions.agentInstructions`. */
  agentInstructions?: string;
}): string[] {
  const workspacePrompt = [
    "Stave workspace context:",
    `Current workspace root: ${args.cwd}`,
    "Resolve every relative filesystem path against the workspace root above.",
    "Do not rewrite a user-provided relative path like ./docs into a sibling directory outside that workspace root.",
    "If the user explicitly asks to access a path outside the workspace root, keep the exact requested path and request approval instead of guessing a nearby absolute path.",
  ].join("\n");

  // Static prefix — eligible for cross-session prompt caching.
  const staticParts: string[] = [STAVE_TURN_BEHAVIOR_DIRECTIVE];
  const baseSystemPrompt = args.baseSystemPrompt?.trim();
  if (baseSystemPrompt) {
    staticParts.push(baseSystemPrompt);
  }
  const responseStyle = args.responseStylePrompt?.trim();
  if (responseStyle) {
    staticParts.push(responseStyle);
  }
  // Browser policy is identical on every turn of every Stave-managed session,
  // so it belongs in the cacheable prefix. It is stated unconditionally rather
  // than only on `@web` turns: the model needs to know *not* to reach for
  // Chrome — and not to substitute Lens or desktop control for it — on the
  // turns where the browser is deliberately off.
  staticParts.push(CLAUDE_STAVE_NATIVE_BROWSER_INSTRUCTIONS);
  if (args.hasStaveLocalMcp) {
    staticParts.push(CLAUDE_STAVE_LENS_INSTRUCTIONS);
  }

  // Dynamic suffix — session-specific, not globally cached. Worker mode belongs
  // here rather than in the cached prefix: it is a per-turn choice, so caching
  // it would leak one turn's execution shape into the next.
  const dynamicParts: string[] = [workspacePrompt];
  // The task's Agent is chosen per task, so it stays out of the shared cached prefix.
  const agentInstructions = args.agentInstructions?.trim();
  if (agentInstructions) {
    dynamicParts.push(agentInstructions);
  }

  return [
    staticParts.join("\n\n"),
    SYSTEM_PROMPT_DYNAMIC_BOUNDARY,
    dynamicParts.join("\n\n"),
  ];
}
