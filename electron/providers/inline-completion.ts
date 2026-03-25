import Anthropic from "@anthropic-ai/sdk";

interface InlineCompletionRequest {
  prefix: string;
  suffix: string;
  filePath: string;
  language: string;
  maxTokens?: number;
}

interface InlineCompletionResult {
  ok: boolean;
  text: string;
  error?: string;
}

let clientInstance: Anthropic | null = null;
let lastApiKeyCheck = 0;
let cachedApiKey = "";

const COMPLETION_MODEL = "claude-haiku-4-5-20251001";
const DEFAULT_MAX_TOKENS = 256;
const MAX_PREFIX_CHARS = 8000;
const MAX_SUFFIX_CHARS = 2000;
const API_KEY_CHECK_INTERVAL_MS = 30_000;

function resolveApiKey(): string {
  const now = Date.now();
  if (cachedApiKey && now - lastApiKeyCheck < API_KEY_CHECK_INTERVAL_MS) {
    return cachedApiKey;
  }
  lastApiKeyCheck = now;
  cachedApiKey = (process.env.ANTHROPIC_API_KEY ?? "").trim();
  return cachedApiKey;
}

function getClient(): Anthropic | null {
  const apiKey = resolveApiKey();
  if (!apiKey) {
    clientInstance = null;
    return null;
  }
  if (!clientInstance) {
    clientInstance = new Anthropic({ apiKey });
  }
  return clientInstance;
}

function buildCompletionPrompt(args: InlineCompletionRequest) {
  const prefix = args.prefix.length > MAX_PREFIX_CHARS
    ? args.prefix.slice(-MAX_PREFIX_CHARS)
    : args.prefix;
  const suffix = args.suffix.length > MAX_SUFFIX_CHARS
    ? args.suffix.slice(0, MAX_SUFFIX_CHARS)
    : args.suffix;

  const lang = args.language || "plaintext";
  const fileName = args.filePath.split("/").pop() ?? "file";

  return {
    system: [
      "You are an inline code completion engine.",
      "Given a code file with a cursor position, output ONLY the code that should be inserted at the cursor.",
      "Rules:",
      "- Output raw code only. No markdown fences, no explanations, no comments about what you're doing.",
      "- Continue naturally from the prefix. Match the existing style, indentation, and conventions.",
      "- Generate a short, focused completion — typically one logical statement or block.",
      "- Stop before generating something the user didn't ask for.",
      "- If you're unsure, output nothing (empty string).",
      "- Never repeat code that already exists in the prefix or suffix.",
    ].join("\n"),
    user: [
      `File: ${fileName} (${lang})`,
      "",
      `<prefix>${prefix}</prefix>`,
      `<suffix>${suffix}</suffix>`,
      "",
      "Complete the code at the cursor position between <prefix> and <suffix>. Output only the inserted code:",
    ].join("\n"),
  };
}

// Abort controller for in-flight requests
let activeAbortController: AbortController | null = null;

export function abortActiveInlineCompletion() {
  activeAbortController?.abort();
  activeAbortController = null;
}

export async function requestInlineCompletion(
  args: InlineCompletionRequest,
): Promise<InlineCompletionResult> {
  // Cancel any in-flight request
  abortActiveInlineCompletion();

  const client = getClient();
  if (!client) {
    return { ok: false, text: "", error: "ANTHROPIC_API_KEY not set" };
  }

  const prompt = buildCompletionPrompt(args);
  const abortController = new AbortController();
  activeAbortController = abortController;

  try {
    const response = await client.messages.create(
      {
        model: COMPLETION_MODEL,
        max_tokens: args.maxTokens ?? DEFAULT_MAX_TOKENS,
        system: prompt.system,
        messages: [{ role: "user", content: prompt.user }],
      },
      { signal: abortController.signal },
    );

    if (abortController.signal.aborted) {
      return { ok: false, text: "", error: "aborted" };
    }

    const text = response.content
      .filter((block): block is Anthropic.TextBlock => block.type === "text")
      .map((block) => block.text)
      .join("");

    return { ok: true, text };
  } catch (error) {
    if (abortController.signal.aborted || (error instanceof Error && error.name === "AbortError")) {
      return { ok: false, text: "", error: "aborted" };
    }
    const message = error instanceof Error ? error.message : String(error);
    console.warn("[inline-completion] request failed:", message);
    return { ok: false, text: "", error: message };
  } finally {
    if (activeAbortController === abortController) {
      activeAbortController = null;
    }
  }
}

export function isInlineCompletionAvailable(): boolean {
  return Boolean(resolveApiKey());
}
