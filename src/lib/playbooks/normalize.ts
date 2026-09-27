import { MAX_PLAYBOOKS, PlaybookSchema, type Playbook } from "./schema";

const MAX_DIAGNOSTIC_ISSUES = 5;

export interface PlaybookDiagnostic {
  /** Position in the persisted list. */
  index: number;
  id?: string;
  name?: string;
  outcome: "dropped" | "renamed-id" | "cleared-shortcut";
  issues: string[];
}

export type PlaybookParseResult =
  | { ok: true; playbook: Playbook }
  | { ok: false; issues: string[] };

export function generatePlaybookId(): string {
  if (
    typeof crypto !== "undefined" &&
    typeof crypto.randomUUID === "function"
  ) {
    return `playbook_${crypto.randomUUID().replaceAll("-", "").slice(0, 12)}`;
  }
  return `playbook_${Math.random().toString(36).slice(2, 10)}${Date.now().toString(36)}`;
}

function readLabel(value: unknown, key: "id" | "name"): string | undefined {
  if (!value || typeof value !== "object") return undefined;
  const candidate = (value as Record<string, unknown>)[key];
  return typeof candidate === "string" ? candidate.slice(0, 80) : undefined;
}

/** Validates one playbook; issues are "path: message" sentences for the UI. */
export function parsePlaybook(value: unknown): PlaybookParseResult {
  const parsed = PlaybookSchema.safeParse(value);
  if (parsed.success) return { ok: true, playbook: parsed.data };
  return {
    ok: false,
    issues: parsed.error.issues.map((issue) =>
      issue.path.length
        ? `${issue.path.join(".")}: ${issue.message}`
        : issue.message,
    ),
  };
}

/**
 * A saved playbook this version could not read (another version's shape, or
 * one past the limit), kept exactly as it was saved. It is never rewritten
 * away: every load tries it again, so it comes back once it can be read.
 */
export interface UnreadablePlaybook {
  /** The saved entry, unchanged. */
  value: unknown;
  /** Why it could not be read. */
  issues: string[];
}

/**
 * Restores saved playbooks. A playbook that fails validation is dropped from
 * the list and reported in `rejected` as it was saved, never repaired into a
 * different shape or into a macro. A duplicate id gets a fresh one and a
 * duplicate shortcut is cleared, keeping the rest.
 */
export function normalizePersistedPlaybooks(input: unknown): {
  playbooks: Playbook[];
  diagnostics: PlaybookDiagnostic[];
  rejected: UnreadablePlaybook[];
} {
  if (input === undefined || input === null) {
    return { playbooks: [], diagnostics: [], rejected: [] };
  }
  if (!Array.isArray(input)) {
    const issues = ["Saved playbooks are not a list."];
    return {
      playbooks: [],
      diagnostics: [{ index: -1, outcome: "dropped", issues }],
      rejected: [{ value: input, issues }],
    };
  }

  const playbooks: Playbook[] = [];
  const diagnostics: PlaybookDiagnostic[] = [];
  const rejected: UnreadablePlaybook[] = [];
  const seenIds = new Set<string>();
  const seenShortcuts = new Set<string>();

  input.forEach((candidate, index) => {
    const label = { index, id: readLabel(candidate, "id"), name: readLabel(candidate, "name") };
    const drop = (issues: string[]) => {
      diagnostics.push({ ...label, outcome: "dropped", issues });
      rejected.push({ value: candidate, issues });
    };
    if (playbooks.length >= MAX_PLAYBOOKS) {
      drop([`Only ${MAX_PLAYBOOKS} playbooks are kept.`]);
      return;
    }
    const parsed = parsePlaybook(candidate);
    if (!parsed.ok) {
      drop(parsed.issues.slice(0, MAX_DIAGNOSTIC_ISSUES));
      return;
    }
    const playbook = parsed.playbook;
    if (seenIds.has(playbook.id)) {
      const previousId = playbook.id;
      playbook.id = generatePlaybookId();
      diagnostics.push({
        ...label,
        outcome: "renamed-id",
        issues: [`Id "${previousId}" was already used; saved as "${playbook.id}".`],
      });
    }
    if (playbook.shortcut !== undefined && seenShortcuts.has(playbook.shortcut)) {
      diagnostics.push({
        ...label,
        outcome: "cleared-shortcut",
        issues: [`Shortcut "${playbook.shortcut}" was already used.`],
      });
      delete playbook.shortcut;
    }
    seenIds.add(playbook.id);
    if (playbook.shortcut !== undefined) seenShortcuts.add(playbook.shortcut);
    playbooks.push(playbook);
  });

  return { playbooks, diagnostics, rejected };
}

/** The saved values of the kept-aside entries; an entry of another shape is kept as it is. */
function readKeptAsideValues(input: unknown): unknown[] {
  if (!Array.isArray(input)) return [];
  return input.map((entry: unknown) =>
    entry && typeof entry === "object" && "value" in entry ? (entry as { value: unknown }).value : entry,
  );
}

/**
 * Restores the saved playbooks together with the ones kept aside earlier.
 * Kept-aside entries are read again after the saved ones, so one saved by a
 * newer version comes back once this version can read it (and there is room),
 * and one that still cannot be read stays kept aside, unchanged. Nothing is
 * lost when the list is written back.
 */
export function restorePersistedPlaybooks(input: { playbooks: unknown; unreadable: unknown }): {
  playbooks: Playbook[];
  unreadable: UnreadablePlaybook[];
  diagnostics: PlaybookDiagnostic[];
} {
  const saved = input.playbooks ?? [];
  const notAList: UnreadablePlaybook[] = Array.isArray(saved)
    ? []
    : [{ value: saved, issues: ["Saved playbooks are not a list."] }];
  const result = normalizePersistedPlaybooks([
    ...(Array.isArray(saved) ? saved : []),
    ...readKeptAsideValues(input.unreadable),
  ]);
  const seen = new Set<string>();
  const unreadable = [...notAList, ...result.rejected].filter((entry) => {
    const key = JSON.stringify(entry.value) ?? String(entry.value);
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
  return { playbooks: result.playbooks, unreadable, diagnostics: result.diagnostics };
}

/** "Request → PR", or null when a kept-aside entry has no readable name. */
export function describeUnreadablePlaybook(entry: UnreadablePlaybook): string | null {
  const name = readLabel(entry.value, "name")?.trim();
  return name ? name : null;
}

export function warnPlaybookDiagnostics(diagnostics: PlaybookDiagnostic[]) {
  if (diagnostics.length > 0) {
    console.warn("[playbooks] adjusted saved playbooks", diagnostics);
  }
}
