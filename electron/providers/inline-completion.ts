import type { Query, SDKAssistantMessage, SDKAuthStatusMessage, SDKResultMessage } from "@anthropic-ai/claude-agent-sdk";
import { buildClaudeEnv, resolveClaudeExecutablePath, prewarmClaudeSdk } from "./claude-sdk-runtime";

interface InlineCompletionRequest {
  prefix: string;
  suffix: string;
  filePath: string;
  language: string;
  maxTokens?: number;
  systemPromptOverride?: string;
}

interface InlineCompletionResult {
  ok: boolean;
  text: string;
  error?: string;
}

// ---------------------------------------------------------------------------
// Shared constants
// ---------------------------------------------------------------------------

const SDK_MODEL = "claude-haiku-4-5";
const MAX_PREFIX_CHARS = 8000;
const MAX_SUFFIX_CHARS = 4000;
const MAX_PREFIX_LINES = 150;
const MAX_SUFFIX_LINES = 100;
const SDK_EARLY_SETTLE_MS = 20;

// ---------------------------------------------------------------------------
// Prompt builder
// ---------------------------------------------------------------------------

function trimContextLines(args: {
  value: string;
  maxChars: number;
  maxLines: number;
  take: "start" | "end";
}) {
  const normalized = args.value.replaceAll("\r\n", "\n");
  const lines = normalized.split("\n");
  const selectedLines = args.take === "end"
    ? lines.slice(-args.maxLines)
    : lines.slice(0, args.maxLines);
  const joined = selectedLines.join("\n");

  if (joined.length <= args.maxChars) {
    return joined;
  }
  return args.take === "end"
    ? joined.slice(-args.maxChars)
    : joined.slice(0, args.maxChars);
}

function buildCompletionPrompt(args: InlineCompletionRequest) {
  const prefix = trimContextLines({
    value: args.prefix,
    maxChars: MAX_PREFIX_CHARS,
    maxLines: MAX_PREFIX_LINES,
    take: "end",
  });
  const suffix = trimContextLines({
    value: args.suffix,
    maxChars: MAX_SUFFIX_CHARS,
    maxLines: MAX_SUFFIX_LINES,
    take: "start",
  });

  const lang = args.language || "plaintext";
  const fileName = args.filePath.split("/").pop() ?? "file";
  const imports = extractImportContext(args.prefix);

  // FIM-style prompt: show code with a hole, ask model to fill it.
  // This structure makes the model continue code rather than explain.
  const importsSection = imports ? `\nImports:\n${imports}\n` : "";
  const user = [
    `Fill in [HOLE] in this ${lang} file (${fileName}):`,
    importsSection,
    `${prefix}[HOLE]${suffix}`,
    "",
    "Reply with ONLY the code that replaces [HOLE]. No markdown, no backticks, no explanation.",
  ].join("\n");

  const systemPrompt = args.systemPromptOverride?.trim() || [
    "You are a code completion engine embedded in an IDE.",
    "You receive a file snippet with a [HOLE] marker where the cursor is.",
    "",
    "Use ALL provided context to produce the best completion:",
    "- Language & filename: match the file's idioms, naming conventions, and style.",
    "- Imports: use only symbols that are already imported or available in scope. Do not invent new imports.",
    "- Prefix (code before [HOLE]): continue the pattern, indentation, and logic established above the cursor.",
    "- Suffix (code after [HOLE]): ensure the completion connects seamlessly to the code that follows. Do not repeat the suffix.",
    "",
    "Output ONLY the raw code that replaces [HOLE]. No markdown. No backticks. No explanation. No prose.",
  ].join("\n");

  return {
    system: systemPrompt,
    user,
  };
}

function normalizeInlineCompletionText(text: string) {
  let result = text.trim();

  // Full fence: ```lang\n...\n```
  const fencedBlockMatch = result.match(/^```[^\r\n`]*\r?\n([\s\S]*?)(\r?\n```\s*)?$/);
  if (fencedBlockMatch?.[1] !== undefined) {
    result = fencedBlockMatch[1];
  }

  // Strip leftover opening fence (model started with ```lang but no closing)
  result = result.replace(/^```[^\r\n`]*\r?\n/, "");
  // Strip leftover closing fence
  result = result.replace(/\r?\n```\s*$/, "");
  // Strip inline backtick wrapping: `code`
  if (result.startsWith("`") && result.endsWith("`") && !result.includes("\n")) {
    result = result.slice(1, -1);
  }

  // Strip bare language identifier on the first line (e.g. "typescript\ncode...")
  const LANG_IDS = /^(typescript|javascript|tsx|jsx|python|rust|go|java|c|cpp|csharp|ruby|php|swift|kotlin|html|css|scss|json|yaml|toml|sql|bash|sh|zsh|shell|markdown|md|plaintext)\s*\r?\n/i;
  result = result.replace(LANG_IDS, "");

  return result;
}

function getInlineCompletionControlError(text: string): string | null {
  const normalized = text.trim().toLowerCase();
  if (!normalized) {
    return null;
  }
  if (
    normalized.includes("not logged in")
    || normalized.includes("please run /login")
    || normalized.includes("claude auth login")
    || normalized.includes("authentication failed")
  ) {
    return "Claude authentication failed. Run `claude auth login` and retry.";
  }
  if (normalized.includes("billing") || normalized.includes("subscription")) {
    return "Claude billing/subscription issue detected. Check plan/payment status and retry.";
  }
  if (normalized.includes("rate limit") || normalized.includes("hit your limit")) {
    return "Claude rate limit reached. Retry in a moment.";
  }
  return null;
}

/**
 * Remove trailing lines of completion that duplicate leading lines of suffix.
 * Keeps at least one line of completion to avoid removing the entire result.
 */
function removeSuffixOverlap(completionText: string, suffix: string): string {
  if (!completionText || !suffix) {
    return completionText;
  }

  const completionLines = completionText.split("\n");
  const suffixLines = suffix.split("\n");
  const maxCheck = Math.min(completionLines.length - 1, suffixLines.length);

  for (let n = maxCheck; n >= 1; n--) {
    const completionTail = completionLines.slice(-n);
    const suffixHead = suffixLines.slice(0, n);
    if (completionTail.every((line, i) => line.trimEnd() === suffixHead[i].trimEnd())) {
      return completionLines.slice(0, -n).join("\n");
    }
  }

  return completionText;
}

/**
 * Extract import/require/include lines from the full prefix so the model
 * knows which symbols are available even after the prefix is trimmed.
 */
function extractImportContext(fullPrefix: string): string {
  const lines = fullPrefix.split("\n");
  const importLines: string[] = [];
  for (const line of lines) {
    const trimmed = line.trim();
    if (/^(import\b|from\b|require\s*\(|const\s+\w+\s*=\s*require|#include\b|using\b|use\b|package\b)/.test(trimmed)) {
      importLines.push(trimmed);
    }
  }
  return importLines.slice(0, 15).join("\n");
}

function mergeInlineCompletionText(previous: string, candidate: string) {
  if (!previous) {
    return candidate;
  }
  if (!candidate) {
    return previous;
  }
  if (candidate.startsWith(previous) || candidate.includes(previous)) {
    return candidate;
  }
  if (previous.startsWith(candidate) || previous.includes(candidate)) {
    return previous;
  }
  return previous + candidate;
}

// ---------------------------------------------------------------------------
// Backend: claude-agent-sdk (CLI-backed). Honors ANTHROPIC_API_KEY for
// API-key auth and the user's Claude CLI login otherwise — both paths flow
// through the same query() stream, so the migration off @anthropic-ai/sdk
// keeps a single code path.
// ---------------------------------------------------------------------------

let cachedClaudeExecutablePath: string | null | undefined;

interface ActiveSdkRequest {
  stream: Query;
  aborted: boolean;
}

let activeSdkRequest: ActiveSdkRequest | null = null;

function resolveClaudeSdkExecutablePath(): string | null {
  if (cachedClaudeExecutablePath !== undefined) {
    return cachedClaudeExecutablePath;
  }
  try {
    const resolved = resolveClaudeExecutablePath();
    cachedClaudeExecutablePath = resolved || null;
  } catch {
    cachedClaudeExecutablePath = null;
  }
  return cachedClaudeExecutablePath;
}

function abortSdkRequest() {
  if (activeSdkRequest) {
    activeSdkRequest.aborted = true;
    activeSdkRequest.stream.close();
    activeSdkRequest = null;
  }
}

async function requestViaClaudeSdk(
  args: InlineCompletionRequest,
): Promise<InlineCompletionResult> {
  const prompt = buildCompletionPrompt(args);
  const mod = await import("@anthropic-ai/claude-agent-sdk");
  const queryFn = (mod as { query?: typeof import("@anthropic-ai/claude-agent-sdk").query }).query;
  if (!queryFn) {
    return { ok: false, text: "", error: "Claude SDK query() unavailable" };
  }

  const claudeExecutablePath = resolveClaudeSdkExecutablePath() ?? "";
  const sdkEnv = buildClaudeEnv({ executablePath: claudeExecutablePath });
  sdkEnv.CLAUDE_CODE_ENABLE_PROMPT_SUGGESTION = "false";
  const stream = queryFn({
    prompt: prompt.user,
    options: {
      permissionMode: "dontAsk",
      maxTurns: 1,
      persistSession: false,
      includePartialMessages: true,
      promptSuggestions: false,
      settingSources: [],
      plugins: [],
      cwd: process.cwd(),
      model: SDK_MODEL,
      systemPrompt: prompt.system,
      thinking: {
        type: "disabled",
      },
      effort: "max",
      tools: [],
      allowedTools: [],
      extraArgs: {
        "disable-slash-commands": null,
      },
      settings: {
        fastMode: true,
      },
      env: sdkEnv,
      ...(claudeExecutablePath ? { pathToClaudeCodeExecutable: claudeExecutablePath } : {}),
    },
  }) as Query;

  const requestState: ActiveSdkRequest = {
    stream,
    aborted: false,
  };
  activeSdkRequest = requestState;
  let assistantText = "";
  let earlySettleTimer: ReturnType<typeof setTimeout> | null = null;
  let settled = false;
  let terminalError: string | null = null;
  const clearEarlySettleTimer = () => {
    if (earlySettleTimer) {
      clearTimeout(earlySettleTimer);
      earlySettleTimer = null;
    }
  };
  const finish = (result: InlineCompletionResult, options?: { closeStream?: boolean }) => {
    if (settled) {
      return result;
    }
    settled = true;
    clearEarlySettleTimer();
      if (activeSdkRequest === requestState) {
        activeSdkRequest = null;
      }
      if (options?.closeStream) {
        try {
        stream.close();
      } catch {
        // Ignore close errors while finishing the SDK stream early.
        }
      }
      return result;
    };

  try {
    for await (const message of stream) {
      if (settled) {
        break;
      }
      if (message.type === "auth_status") {
        const authStatus = message as SDKAuthStatusMessage;
        const output = Array.isArray(authStatus.output) ? authStatus.output.join("\n") : "";
        terminalError = getInlineCompletionControlError(output)
          ?? authStatus.error
          ?? "Claude authentication failed. Run `claude auth login` and retry.";
        return finish({ ok: false, text: "", error: terminalError }, { closeStream: true });
      }
      if (message.type === "result") {
        const resultMsg = message as SDKResultMessage;
        if (resultMsg.is_error) {
          const resultError = "errors" in resultMsg && Array.isArray(resultMsg.errors)
            ? resultMsg.errors.find((value) => typeof value === "string" && value.trim())
            : null;
          terminalError = resultError ?? `Claude SDK finished with ${resultMsg.subtype}`;
          return finish({ ok: false, text: "", error: terminalError }, { closeStream: true });
        }
      }
      if (message.type === "stream_event") {
        const streamMsg = message as {
          type: "stream_event";
          event?: {
            type?: string;
            delta?: {
              type?: string;
              text?: string;
            };
          };
        };
        const streamEvent = streamMsg.event;
        if (streamEvent?.type === "content_block_delta" && streamEvent.delta?.type === "text_delta" && streamEvent.delta.text) {
          assistantText = mergeInlineCompletionText(assistantText, streamEvent.delta.text);
          clearEarlySettleTimer();
          earlySettleTimer = setTimeout(() => {
            const normalized = normalizeInlineCompletionText(assistantText);
            if (!normalized.trim()) {
              return;
            }
            finish({ ok: true, text: normalized }, { closeStream: true });
          }, SDK_EARLY_SETTLE_MS);
        }
        continue;
      }
      if (message.type !== "assistant") {
        continue;
      }
      const assistantMsg = message as SDKAssistantMessage;
      if (assistantMsg.error) {
        if (assistantMsg.error === "authentication_failed") {
          terminalError = "Claude authentication failed. Run `claude auth login` and retry.";
        } else if (assistantMsg.error === "billing_error") {
          terminalError = "Claude billing/subscription issue detected. Check plan/payment status and retry.";
        } else if (assistantMsg.error === "rate_limit") {
          terminalError = "Claude rate limit reached. Retry in a moment.";
        } else {
          terminalError = `Claude SDK assistant error: ${assistantMsg.error}`;
        }
        return finish({ ok: false, text: "", error: terminalError }, { closeStream: true });
      }
      const contentBlocks = assistantMsg.message?.content;
      if (!Array.isArray(contentBlocks)) {
        continue;
      }
      for (const block of contentBlocks) {
        const candidate = block as { type?: string; text?: string };
        if (candidate.type === "text" && candidate.text) {
          assistantText = mergeInlineCompletionText(assistantText, candidate.text);
          const controlError = getInlineCompletionControlError(assistantText);
          if (controlError) {
            terminalError = controlError;
            return finish({ ok: false, text: "", error: terminalError }, { closeStream: true });
          }
        }
      }
      clearEarlySettleTimer();
      earlySettleTimer = setTimeout(() => {
        const normalized = normalizeInlineCompletionText(assistantText);
        if (!normalized.trim()) {
          return;
        }
        finish({ ok: true, text: normalized }, { closeStream: true });
      }, SDK_EARLY_SETTLE_MS);
    }

    const normalized = normalizeInlineCompletionText(assistantText);
    const controlError = getInlineCompletionControlError(normalized);
    if (controlError) {
      terminalError = controlError;
      return finish({ ok: false, text: "", error: terminalError });
    }
    return finish({ ok: true, text: normalized });
  } catch (error) {
    if (requestState.aborted) {
      return { ok: false, text: "", error: "aborted" };
    }
    if (terminalError) {
      return { ok: false, text: "", error: terminalError };
    }
    if (settled && normalizeInlineCompletionText(assistantText).trim()) {
      const normalized = normalizeInlineCompletionText(assistantText);
      const controlError = getInlineCompletionControlError(normalized);
      if (controlError) {
        return { ok: false, text: "", error: controlError };
      }
      return { ok: true, text: normalized };
    }
    const message = error instanceof Error ? error.message : String(error);
    return { ok: false, text: "", error: message };
  } finally {
    cachedClaudeExecutablePath = claudeExecutablePath || cachedClaudeExecutablePath;
    if (activeSdkRequest === requestState) {
      activeSdkRequest = null;
    }
    try {
      stream.close();
    } catch {
      // Ignore close errors while tearing down the stream.
    }
  }
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

export function abortActiveInlineCompletion() {
  abortSdkRequest();
}

export async function requestInlineCompletion(
  args: InlineCompletionRequest,
): Promise<InlineCompletionResult> {
  const sdkResult = await requestViaClaudeSdk(args);
  if (sdkResult.ok) {
    return { ...sdkResult, text: removeSuffixOverlap(sdkResult.text, args.suffix) };
  }
  return sdkResult;
}

export function isInlineCompletionAvailable(): boolean {
  return Boolean(resolveClaudeSdkExecutablePath());
}
