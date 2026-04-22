const PLAN_OPEN_TAG = "<proposed_plan>";
const PLAN_CLOSE_TAG = "</proposed_plan>";
const STRUCTURED_PLAN_LINE_PATTERN = /^(#{1,6}\s|[-*+]\s(?:\[[ xX]\]\s)?|\d+\.\s)/u;
const COMMENTARY_LINE_PATTERN = /^(let me know\b|if you(?:'d)? like\b|if you want\b|i can(?: also)?\b|happy to\b|once approved\b|after approval\b|원하시면\b|원한다면\b|필요하면\b|필요하시면\b|추가로\b)/iu;
const MEANINGFUL_PLAN_CHARACTER_PATTERN = /[\p{L}\p{N}]/u;

function extractTaggedPlanText(text: string) {
  const openIndex = text.indexOf(PLAN_OPEN_TAG);
  if (openIndex === -1) {
    return null;
  }

  const contentStart = openIndex + PLAN_OPEN_TAG.length;
  const closeIndex = text.indexOf(PLAN_CLOSE_TAG, contentStart);
  if (closeIndex === -1) {
    return null;
  }

  return text.slice(contentStart, closeIndex).trim();
}

function stripTrailingCommentaryParagraphs(text: string) {
  const paragraphs = text
    .split(/\n\s*\n/u)
    .map((paragraph) => paragraph.trim())
    .filter(Boolean);

  while (paragraphs.length > 0) {
    const lastParagraph = paragraphs.at(-1);
    if (!lastParagraph) {
      break;
    }

    const lines = lastParagraph
      .split(/\r?\n/u)
      .map((line) => line.trim())
      .filter(Boolean);

    if (
      lines.length === 0
      || lines.some((line) => STRUCTURED_PLAN_LINE_PATTERN.test(line))
      || !lines.every((line) => COMMENTARY_LINE_PATTERN.test(line))
    ) {
      break;
    }

    paragraphs.pop();
  }

  return paragraphs.join("\n\n").trim();
}

export function normalizePlanText(planText: string) {
  const taggedPlan = extractTaggedPlanText(planText);
  const trimmed = (taggedPlan ?? planText).trim();
  if (!trimmed) {
    return "";
  }

  const lines = trimmed.split(/\r?\n/u);
  const firstStructuredLineIndex = lines.findIndex((line) => STRUCTURED_PLAN_LINE_PATTERN.test(line.trimStart()));
  const normalizedFromStructure = firstStructuredLineIndex === -1
    ? trimmed
    : lines.slice(firstStructuredLineIndex).join("\n").trim();

  return stripTrailingCommentaryParagraphs(normalizedFromStructure) || normalizedFromStructure;
}

export function hasMeaningfulPlanText(planText?: string | null) {
  const normalized = normalizePlanText(planText ?? "");
  if (!normalized) {
    return false;
  }

  return MEANINGFUL_PLAN_CHARACTER_PATTERN.test(normalized);
}
