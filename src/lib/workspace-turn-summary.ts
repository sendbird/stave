import type { WorkspaceTurnSummary } from "@/lib/workspace-information";

const MAX_CONTEXT_CHARS = 4_000;
const MAX_SUMMARY_CHARS = 180;

export interface WorkspaceTurnSummaryDraft {
  requestSummary: string;
  workSummary: string;
}

function normalizeInlineText(value: string) {
  return value.replaceAll("\r\n", "\n").trim();
}

function truncateForContext(value: string, maxChars = MAX_CONTEXT_CHARS) {
  const normalized = normalizeInlineText(value);
  if (normalized.length <= maxChars) {
    return normalized;
  }
  return `${normalized.slice(0, Math.max(0, maxChars - 1))}…`;
}

function truncateSummaryField(value: string, maxChars = MAX_SUMMARY_CHARS) {
  const normalized = value.trim().replace(/\s+/g, " ");
  if (normalized.length <= maxChars) {
    return normalized;
  }
  return `${normalized.slice(0, Math.max(0, maxChars - 1))}…`;
}

function stripMarkdownFence(value: string) {
  const trimmed = value.trim();
  const fenceMatch = trimmed.match(/^```(?:json)?\s*([\s\S]*?)\s*```$/i);
  return fenceMatch?.[1]?.trim() ?? trimmed;
}

function extractJsonObject(value: string) {
  const stripped = stripMarkdownFence(value);
  const start = stripped.indexOf("{");
  const end = stripped.lastIndexOf("}");
  if (start < 0 || end <= start) {
    return null;
  }
  return stripped.slice(start, end + 1);
}

function parseLabeledLine(value: string) {
  const match = value.match(/^(?:[-*]\s*)?(?:request|user|asked|work|ai|assistant)\s*:\s*(.+)$/i);
  return match?.[1]?.trim() ?? value.trim();
}

function coerceSummaryDraft(value: {
  requestSummary?: unknown;
  request?: unknown;
  user?: unknown;
  workSummary?: unknown;
  work?: unknown;
  ai?: unknown;
  assistant?: unknown;
}): WorkspaceTurnSummaryDraft | null {
  const requestSummary =
    typeof value.requestSummary === "string"
      ? value.requestSummary
      : typeof value.request === "string"
        ? value.request
        : typeof value.user === "string"
          ? value.user
          : "";
  const workSummary =
    typeof value.workSummary === "string"
      ? value.workSummary
      : typeof value.work === "string"
        ? value.work
        : typeof value.ai === "string"
          ? value.ai
          : typeof value.assistant === "string"
            ? value.assistant
            : "";

  const nextDraft = {
    requestSummary: truncateSummaryField(requestSummary),
    workSummary: truncateSummaryField(workSummary),
  };

  return nextDraft.requestSummary && nextDraft.workSummary ? nextDraft : null;
}

export function buildWorkspaceTurnSummaryPrompt(args: {
  instructionPrompt: string;
  taskTitle?: string | null;
  userRequest: string;
  assistantResponse: string;
}) {
  return [
    args.instructionPrompt.trim(),
    "",
    "Context:",
    `Task title: ${args.taskTitle?.trim() || "Untitled Task"}`,
    "",
    "Latest user request:",
    truncateForContext(args.userRequest),
    "",
    "Latest assistant response:",
    truncateForContext(args.assistantResponse),
  ].join("\n");
}

export function parseWorkspaceTurnSummaryResponse(value: string) {
  const jsonObject = extractJsonObject(value);
  if (jsonObject) {
    try {
      const parsed = JSON.parse(jsonObject) as {
        requestSummary?: unknown;
        request?: unknown;
        user?: unknown;
        workSummary?: unknown;
        work?: unknown;
        ai?: unknown;
        assistant?: unknown;
      };
      const draft = coerceSummaryDraft(parsed);
      if (draft) {
        return draft;
      }
    } catch {
      // Fall through to the looser line-based parser.
    }
  }

  const lines = stripMarkdownFence(value)
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean);
  if (lines.length < 2) {
    return null;
  }

  return coerceSummaryDraft({
    requestSummary: parseLabeledLine(lines[0] ?? ""),
    workSummary: parseLabeledLine(lines[1] ?? ""),
  });
}

export function createWorkspaceTurnSummary(args: {
  turnId: string;
  taskId: string;
  taskTitle: string;
  model: string;
  generatedAt: string;
  draft: WorkspaceTurnSummaryDraft;
}): WorkspaceTurnSummary {
  return {
    turnId: args.turnId,
    taskId: args.taskId,
    taskTitle: args.taskTitle,
    model: args.model,
    generatedAt: args.generatedAt,
    requestSummary: truncateSummaryField(args.draft.requestSummary),
    workSummary: truncateSummaryField(args.draft.workSummary),
  };
}
