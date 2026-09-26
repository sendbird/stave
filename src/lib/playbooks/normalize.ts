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
 * Restores saved playbooks. A playbook that fails validation is dropped and
 * reported, never repaired into a different shape or into a macro. A duplicate
 * id gets a fresh one and a duplicate shortcut is cleared, keeping the rest.
 */
export function normalizePersistedPlaybooks(input: unknown): {
  playbooks: Playbook[];
  diagnostics: PlaybookDiagnostic[];
} {
  if (input === undefined || input === null) {
    return { playbooks: [], diagnostics: [] };
  }
  if (!Array.isArray(input)) {
    return {
      playbooks: [],
      diagnostics: [
        {
          index: -1,
          outcome: "dropped",
          issues: ["Saved playbooks are not a list."],
        },
      ],
    };
  }

  const playbooks: Playbook[] = [];
  const diagnostics: PlaybookDiagnostic[] = [];
  const seenIds = new Set<string>();
  const seenShortcuts = new Set<string>();

  input.forEach((candidate, index) => {
    const label = { index, id: readLabel(candidate, "id"), name: readLabel(candidate, "name") };
    if (playbooks.length >= MAX_PLAYBOOKS) {
      diagnostics.push({
        ...label,
        outcome: "dropped",
        issues: [`Only ${MAX_PLAYBOOKS} playbooks are kept.`],
      });
      return;
    }
    const parsed = parsePlaybook(candidate);
    if (!parsed.ok) {
      diagnostics.push({
        ...label,
        outcome: "dropped",
        issues: parsed.issues.slice(0, MAX_DIAGNOSTIC_ISSUES),
      });
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

  return { playbooks, diagnostics };
}

export function warnPlaybookDiagnostics(diagnostics: PlaybookDiagnostic[]) {
  if (diagnostics.length > 0) {
    console.warn("[playbooks] adjusted saved playbooks", diagnostics);
  }
}
