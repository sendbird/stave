import { i18n } from "@/i18n/runtime";
import { MAX_WORKFLOWS, WorkflowSchema, type Workflow } from "./schema";

const MAX_DIAGNOSTIC_ISSUES = 5;

export interface WorkflowDiagnostic {
  /** Position in the persisted list. */
  index: number;
  id?: string;
  name?: string;
  outcome: "dropped" | "renamed-id" | "cleared-shortcut";
  issues: string[];
}

export type WorkflowParseResult =
  | { ok: true; workflow: Workflow }
  | { ok: false; issues: string[] };

export function generateWorkflowId(): string {
  if (
    typeof crypto !== "undefined" &&
    typeof crypto.randomUUID === "function"
  ) {
    return `workflow_${crypto.randomUUID().replaceAll("-", "").slice(0, 12)}`;
  }
  return `workflow_${Math.random().toString(36).slice(2, 10)}${Date.now().toString(36)}`;
}

function readLabel(value: unknown, key: "id" | "name"): string | undefined {
  if (!value || typeof value !== "object") return undefined;
  const candidate = (value as Record<string, unknown>)[key];
  return typeof candidate === "string" ? candidate.slice(0, 80) : undefined;
}

/** Validates one workflow; issues are "path: message" sentences for the UI. */
export function parseWorkflow(value: unknown): WorkflowParseResult {
  const parsed = WorkflowSchema.safeParse(value);
  if (parsed.success) return { ok: true, workflow: parsed.data };
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
 * A saved workflow this version could not read (another version's shape, or
 * one past the limit), kept exactly as it was saved. It is never rewritten
 * away: every load tries it again, so it comes back once it can be read.
 */
export interface UnreadableWorkflow {
  /** The saved entry, unchanged. */
  value: unknown;
  /** Why it could not be read. */
  issues: string[];
}

/**
 * Restores saved workflows. A workflow that fails validation is dropped from
 * the list and reported in `rejected` as it was saved, never repaired into a
 * different shape or into a macro. A duplicate id gets a fresh one and a
 * duplicate shortcut is cleared, keeping the rest.
 */
export function normalizePersistedWorkflows(input: unknown): {
  workflows: Workflow[];
  diagnostics: WorkflowDiagnostic[];
  rejected: UnreadableWorkflow[];
} {
  if (input === undefined || input === null) {
    return { workflows: [], diagnostics: [], rejected: [] };
  }
  if (!Array.isArray(input)) {
    const issues = [i18n.t("agentRuns:normalize.extraCopy416")];
    return {
      workflows: [],
      diagnostics: [{ index: -1, outcome: "dropped", issues }],
      rejected: [{ value: input, issues }],
    };
  }

  const workflows: Workflow[] = [];
  const diagnostics: WorkflowDiagnostic[] = [];
  const rejected: UnreadableWorkflow[] = [];
  const seenIds = new Set<string>();
  const seenShortcuts = new Set<string>();

  input.forEach((candidate, index) => {
    const label = { index, id: readLabel(candidate, "id"), name: readLabel(candidate, "name") };
    const drop = (issues: string[]) => {
      diagnostics.push({ ...label, outcome: "dropped", issues });
      rejected.push({ value: candidate, issues });
    };
    if (workflows.length >= MAX_WORKFLOWS) {
      drop([i18n.t("agentRuns:normalize.extraCopy413", { value1: MAX_WORKFLOWS })]);
      return;
    }
    const parsed = parseWorkflow(candidate);
    if (!parsed.ok) {
      drop(parsed.issues.slice(0, MAX_DIAGNOSTIC_ISSUES));
      return;
    }
    const workflow = parsed.workflow;
    if (seenIds.has(workflow.id)) {
      const previousId = workflow.id;
      workflow.id = generateWorkflowId();
      diagnostics.push({
        ...label,
        outcome: "renamed-id",
        issues: [i18n.t("agentRuns:normalize.extraCopy414", { value1: previousId, value2: workflow.id })],
      });
    }
    if (workflow.shortcut !== undefined && seenShortcuts.has(workflow.shortcut)) {
      diagnostics.push({
        ...label,
        outcome: "cleared-shortcut",
        issues: [i18n.t("agentRuns:normalize.extraCopy415", { value1: workflow.shortcut })],
      });
      delete workflow.shortcut;
    }
    seenIds.add(workflow.id);
    if (workflow.shortcut !== undefined) seenShortcuts.add(workflow.shortcut);
    workflows.push(workflow);
  });

  return { workflows, diagnostics, rejected };
}

/** The saved values of the kept-aside entries; an entry of another shape is kept as it is. */
function readKeptAsideValues(input: unknown): unknown[] {
  if (!Array.isArray(input)) return [];
  return input.map((entry: unknown) =>
    entry && typeof entry === "object" && "value" in entry ? (entry as { value: unknown }).value : entry,
  );
}

/**
 * Restores the saved workflows together with the ones kept aside earlier.
 * Kept-aside entries are read again after the saved ones, so one saved by a
 * newer version comes back once this version can read it (and there is room),
 * and one that still cannot be read stays kept aside, unchanged. Nothing is
 * lost when the list is written back.
 */
export function restorePersistedWorkflows(input: { workflows: unknown; unreadable: unknown }): {
  workflows: Workflow[];
  unreadable: UnreadableWorkflow[];
  diagnostics: WorkflowDiagnostic[];
} {
  const saved = input.workflows ?? [];
  const notAList: UnreadableWorkflow[] = Array.isArray(saved)
    ? []
    : [{ value: saved, issues: [i18n.t("agentRuns:normalize.extraCopy416")] }];
  const result = normalizePersistedWorkflows([
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
  return { workflows: result.workflows, unreadable, diagnostics: result.diagnostics };
}

export function warnWorkflowDiagnostics(diagnostics: WorkflowDiagnostic[]) {
  if (diagnostics.length > 0) {
    console.warn("[workflows] adjusted saved workflows", diagnostics);
  }
}
