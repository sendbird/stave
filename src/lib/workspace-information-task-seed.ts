const DEFAULT_TASK_SEED_TITLE = "Review linked workspace item";
const MAX_TASK_SEED_TITLE_LENGTH = 80;

function normalizeWhitespace(value: string) {
  return value.trim().replace(/\s+/g, " ");
}

export function resolveWorkspaceInfoTaskSeedTitle(args: {
  title?: string;
  referenceLabel?: string;
  fallback?: string;
}) {
  const normalizedTitle = normalizeWhitespace(args.title ?? "");
  const normalizedReference = normalizeWhitespace(args.referenceLabel ?? "");
  const normalizedFallback = normalizeWhitespace(args.fallback ?? "");
  const title =
    normalizedTitle ||
    normalizedReference ||
    normalizedFallback ||
    DEFAULT_TASK_SEED_TITLE;

  return title.slice(0, MAX_TASK_SEED_TITLE_LENGTH);
}

export function formatWorkspaceInfoTaskSeedPrompt(args: {
  title: string;
  sourceLabel: string;
  url: string;
  referenceLabel?: string;
  note?: string;
}) {
  const title = resolveWorkspaceInfoTaskSeedTitle({
    title: args.title,
    referenceLabel: args.referenceLabel,
  });
  const sourceLabel = normalizeWhitespace(args.sourceLabel);
  const referenceLabel = normalizeWhitespace(args.referenceLabel ?? "");
  const url = args.url.trim();
  const note = args.note?.trim();
  const lines = [
    title,
    "",
    `Create a Stave task from this ${sourceLabel || "workspace item"}.`,
    "",
  ];

  if (referenceLabel) {
    lines.push(`Reference: ${referenceLabel}`);
  }
  if (url) {
    lines.push(`URL: ${url}`);
  }
  if (note) {
    lines.push("", "Context note:", note);
  }

  lines.push(
    "",
    "Use the linked item as the source of truth, inspect the referenced context if available, and propose or implement the next concrete step.",
  );

  return lines.join("\n");
}
