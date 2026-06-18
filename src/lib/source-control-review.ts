export type PrePrReviewFindingSeverity =
  | "critical"
  | "high"
  | "medium"
  | "low";

export type PrePrReviewFindingKind = "bug" | "race" | "security" | "other";

export interface PrePrReviewFinding {
  severity: PrePrReviewFindingSeverity;
  file: string;
  line?: number;
  kind: PrePrReviewFindingKind;
  message: string;
}

const MAX_FINDINGS = 20;
const MAX_FILE_CHARS = 300;
const MAX_MESSAGE_CHARS = 500;

function stripCodeFences(text: string) {
  const trimmed = text.trim();
  const match = trimmed.match(/^```(?:json)?\s*\n([\s\S]*?)\n```$/i);
  return match?.[1]?.trim() ?? trimmed;
}

function extractJsonCandidate(text: string) {
  const cleaned = stripCodeFences(text);
  if (!cleaned) {
    return "";
  }
  if (cleaned.startsWith("{") || cleaned.startsWith("[")) {
    return cleaned;
  }

  const fencedMatch = cleaned.match(/```(?:json)?\s*\n([\s\S]*?)\n```/i);
  if (fencedMatch?.[1]) {
    return fencedMatch[1].trim();
  }

  const objectStart = cleaned.indexOf("{");
  const objectEnd = cleaned.lastIndexOf("}");
  if (objectStart >= 0 && objectEnd > objectStart) {
    return cleaned.slice(objectStart, objectEnd + 1).trim();
  }

  const arrayStart = cleaned.indexOf("[");
  const arrayEnd = cleaned.lastIndexOf("]");
  if (arrayStart >= 0 && arrayEnd > arrayStart) {
    return cleaned.slice(arrayStart, arrayEnd + 1).trim();
  }

  return "";
}

function normalizeSeverity(value: unknown): PrePrReviewFindingSeverity {
  const normalized = String(value ?? "").trim().toLowerCase();
  if (
    normalized === "critical" ||
    normalized === "blocker" ||
    normalized === "severe"
  ) {
    return "critical";
  }
  if (normalized === "high" || normalized === "major") {
    return "high";
  }
  if (normalized === "low" || normalized === "minor" || normalized === "nit") {
    return "low";
  }
  return "medium";
}

function normalizeKind(value: unknown): PrePrReviewFindingKind {
  const normalized = String(value ?? "").trim().toLowerCase();
  if (normalized === "bug" || normalized === "logic") {
    return "bug";
  }
  if (normalized === "race" || normalized === "concurrency") {
    return "race";
  }
  if (normalized === "security" || normalized === "sec") {
    return "security";
  }
  return "other";
}

function normalizeLine(value: unknown) {
  if (typeof value === "number" && Number.isInteger(value) && value > 0) {
    return value;
  }
  if (typeof value === "string") {
    const parsed = Number.parseInt(value, 10);
    if (Number.isInteger(parsed) && parsed > 0) {
      return parsed;
    }
  }
  return undefined;
}

function normalizeFinding(value: unknown): PrePrReviewFinding | null {
  if (!value || typeof value !== "object") {
    return null;
  }
  const record = value as Record<string, unknown>;
  const message = String(record.message ?? record.description ?? "")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, MAX_MESSAGE_CHARS);
  if (!message) {
    return null;
  }

  const file = String(record.file ?? record.path ?? "unknown")
    .trim()
    .slice(0, MAX_FILE_CHARS);

  return {
    severity: normalizeSeverity(record.severity),
    file: file || "unknown",
    line: normalizeLine(record.line),
    kind: normalizeKind(record.kind),
    message,
  };
}

export function parseReviewFindings(text: string): PrePrReviewFinding[] {
  const candidate = extractJsonCandidate(text);
  if (!candidate) {
    return [];
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(candidate);
  } catch {
    return [];
  }

  const rawFindings = Array.isArray(parsed)
    ? parsed
    : Array.isArray((parsed as { findings?: unknown }).findings)
      ? (parsed as { findings: unknown[] }).findings
      : [];

  return rawFindings
    .map((item) => normalizeFinding(item))
    .filter((item): item is PrePrReviewFinding => Boolean(item))
    .slice(0, MAX_FINDINGS);
}
