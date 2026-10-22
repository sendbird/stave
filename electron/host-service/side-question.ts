import { buildClaudeReadOnlyPromptOptions, runClaudeReadOnlyPrompt } from "../providers/claude-sdk-runtime";
import { runCodexReadOnlyPrompt } from "../providers/codex-app-server-runtime";
import { buildUtilityCodexRuntimeOptions } from "../providers/utility-inference";
import {
  AskSideQuestionArgsSchema,
  type AskSideQuestionResponse,
  type ParsedAskSideQuestionArgs,
} from "../../src/lib/side-chat/side-chat-ipc";
import type { SideChatProviderId } from "../../src/lib/side-chat/side-chat";

const SIDE_QUESTION_LABEL = "Side question";

type SideQuestionRunner = (args: ParsedAskSideQuestionArgs) => Promise<{
  ok: boolean;
  text?: string;
  detail?: string;
}>;

/** The Claude read-only call for a side question: one turn, no tools, no MCP servers, no prompts. */
export function buildSideQuestionClaudePromptArgs(args: ParsedAskSideQuestionArgs) {
  return {
    cwd: args.cwd,
    prompt: args.prompt,
    model: args.model,
    effort: "low" as const,
    runtimeOptions: args.runtimeOptions,
    label: SIDE_QUESTION_LABEL,
  };
}

/** The options that call runs with, for checking what it may do. */
export function buildSideQuestionClaudePromptOptions(args: ParsedAskSideQuestionArgs) {
  const claude = buildSideQuestionClaudePromptArgs(args);
  return buildClaudeReadOnlyPromptOptions({
    cwd: claude.cwd ?? process.cwd(),
    model: claude.model,
    effort: claude.effort,
    abortController: new AbortController(),
    claudeExecutablePath: "",
  });
}

/** The Codex read-only call for a side question: an isolated, ephemeral thread with every tool off. */
export function buildSideQuestionCodexPromptArgs(args: ParsedAskSideQuestionArgs) {
  return {
    cwd: args.cwd,
    prompt: args.prompt,
    model: args.model,
    isolated: true,
    // Read-only still allows the shell; a side question may run nothing at all.
    toolsDisabled: true,
    label: SIDE_QUESTION_LABEL,
    runtimeOptions: buildUtilityCodexRuntimeOptions({
      model: args.model,
      runtimeOptions: args.runtimeOptions,
    }),
  };
}

/**
 * The providers' read-only prompt paths, as task naming and commit messages
 * use them: one turn, no MCP servers or plugins, a sandbox, and no task-bound
 * secrets (those reach a task's own turns only). The request's account scope
 * picks the task's account.
 */
const DEFAULT_RUNNERS: Record<SideChatProviderId, SideQuestionRunner> = {
  "claude-code": (args) => runClaudeReadOnlyPrompt(buildSideQuestionClaudePromptArgs(args)),
  codex: (args) => runCodexReadOnlyPrompt(buildSideQuestionCodexPromptArgs(args)),
};

/** Answer a side question with the task's provider. Nothing is saved. */
export async function askSideQuestion(
  rawArgs: unknown,
  runners: Record<SideChatProviderId, SideQuestionRunner> = DEFAULT_RUNNERS,
): Promise<AskSideQuestionResponse> {
  const parsed = AskSideQuestionArgsSchema.safeParse(rawArgs);
  if (!parsed.success) {
    return { ok: false, message: "Invalid side question." };
  }
  try {
    const result = await runners[parsed.data.providerId](parsed.data);
    const text = result.text?.trim();
    if (result.ok && text) {
      return { ok: true, text };
    }
    return { ok: false, message: result.detail?.trim() || "The provider returned no answer." };
  } catch (error) {
    return { ok: false, message: error instanceof Error ? error.message : String(error) };
  }
}
