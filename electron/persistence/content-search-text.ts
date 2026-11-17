import type Database from "better-sqlite3";

/** Search only display prose. Structured requests, outputs and attachment data never enter the index. */
export function extractContentSearchText(content: string, messageJson: string | null, role: string): string {
  if (role !== "user" && role !== "assistant") return "";
  let parts: unknown;
  try { parts = messageJson ? (JSON.parse(messageJson) as { parts?: unknown }).parts : undefined; } catch { /* Old rows may have only content. */ }
  const prose = Array.isArray(parts) ? parts.flatMap((part: unknown) => {
    if (!part || typeof part !== "object") return [];
    const value = part as Record<string, unknown>;
    if (value.type === "text" && typeof value.text === "string") return [value.text];
    // Tool names are readable summaries; their input/output can contain credentials or binary data.
    if (value.type === "tool_use" && typeof value.toolName === "string") return [value.toolName];
    return [];
  }).join("\n") : "";
  return (Array.isArray(parts) && parts.length > 0 ? prose : content)
    .replace(/-----BEGIN [^-]*PRIVATE KEY-----[\s\S]*?-----END [^-]*PRIVATE KEY-----/g, "[redacted]")
    .replace(/\b(?:sk-[a-zA-Z0-9_-]{16,}|gh[pousr]_[a-zA-Z0-9]{16,})\b/g, "[redacted]")
    .replace(/\b(?:authorization\s*:\s*(?:bearer|basic)\s+|(?:api[_-]?key|secret|password|token)\s*[:=]\s*)[^\s,;]+/gi, "[redacted]");
}

/** Register before opening migrations: existing derived triggers can run during bootstrap writes. */
export function registerContentSearchTextFunction(db: Database.Database) {
  db.function("content_search_schedule", {deterministic:false}, () => 1);
  db.function("content_search_text", {deterministic:true}, (content, json, role) =>
    extractContentSearchText(String(content ?? ""), typeof json === "string" ? json : null, String(role)));
}
