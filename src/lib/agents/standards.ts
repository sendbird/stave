/**
 * "My standards": personal instructions the user adds to every agent they
 * run — coding style, review bar, how to report. They are the user's, not the
 * agent's: kept in settings, never in an agent file, never exported, and not
 * part of an agent's version. Each run records the text it started with, so
 * editing them later does not change work already running.
 */

export const MY_STANDARDS_MAX_CHARS = 4_000;

export interface MyStandards {
  enabled: boolean;
  text: string;
}

export const DEFAULT_MY_STANDARDS: MyStandards = { enabled: false, text: "" };

export function normalizeMyStandards(value: unknown): MyStandards {
  if (!value || typeof value !== "object") return DEFAULT_MY_STANDARDS;
  const candidate = value as Record<string, unknown>;
  const text = typeof candidate.text === "string" ? candidate.text.slice(0, MY_STANDARDS_MAX_CHARS) : "";
  return { enabled: candidate.enabled === true, text };
}

/** The standards a run should get now, or undefined when off or empty. */
export function activeStandards(value: MyStandards | null | undefined): string | undefined {
  const text = value?.enabled ? value.text.trim() : "";
  return text ? text : undefined;
}
