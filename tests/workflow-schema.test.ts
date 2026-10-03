import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import path from "node:path";
import {
  normalizePersistedWorkflows,
  parseWorkflow,
  restorePersistedWorkflows,
} from "../src/lib/workflows/normalize";
import {
  MAX_WORKFLOWS,
  MAX_WORKFLOW_STAGES,
  MAX_WORKFLOW_TEXT_LENGTH,
  WORKFLOW_LIMITS,
  workflowTextLength,
  type Workflow,
  type WorkflowStage,
} from "../src/lib/workflows/schema";
import {
  createWorkflowFromStarter,
  findWorkflowStarter,
  WORKFLOW_STARTERS,
} from "../src/dev/fixtures/legacy-workflow-starters";
import { STAGE_TEMPLATES } from "../src/lib/workflows/stage-templates";

const NOW = new Date("2026-09-26T09:00:00.000Z");

function aiStage(id: string, extra: Partial<WorkflowStage> = {}): WorkflowStage {
  return {
    id,
    title: `Stage ${id}`,
    kind: "ai",
    instruction: `Do ${id}.`,
    doneWhen: `${id} is done.`,
    ...extra,
  } as WorkflowStage;
}

function action(id: string, type: "open-draft-pr" | "mark-pr-ready"): WorkflowStage {
  return { id, title: id, kind: "action", action: { type } };
}

const watchChecks: WorkflowStage = {
  id: "watch",
  title: "Watch checks",
  kind: "action",
  action: { type: "watch-checks", repairAttempts: 2, timeoutMinutes: 30 },
};

function workflow(overrides: Partial<Workflow> = {}): Workflow {
  return {
    version: 1,
    id: "workflow_test",
    name: "Test",
    purpose: "Exercise the schema.",
    checkIns: "plan-and-publishing",
    team: "solo",
    stages: [aiStage("build")],
    createdAt: NOW.toISOString(),
    updatedAt: NOW.toISOString(),
    ...overrides,
  };
}

function issuesOf(value: unknown): string[] {
  const result = parseWorkflow(value);
  return result.ok ? [] : result.issues;
}

describe("workflow schema", () => {
  test("accepts a minimal workflow and trims authored text", () => {
    const result = parseWorkflow(workflow({ name: "  Test  " }));
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.workflow.name).toBe("Test");
  });

  test("rejects unknown keys at every level", () => {
    expect(issuesOf({ ...workflow(), recipe: {} })).not.toEqual([]);
    expect(
      issuesOf(workflow({ stages: [{ ...aiStage("a"), evidence: "x" } as WorkflowStage] })),
    ).not.toEqual([]);
    expect(
      issuesOf(
        workflow({
          stages: [
            {
              ...watchChecks,
              action: { ...watchChecks.action, merge: true },
            } as WorkflowStage,
          ],
        }),
      ),
    ).not.toEqual([]);
  });

  test("bounds strings, stage count and ids", () => {
    expect(issuesOf(workflow({ name: "" }))).not.toEqual([]);
    expect(
      issuesOf(workflow({ name: "x".repeat(WORKFLOW_LIMITS.name + 1) })),
    ).not.toEqual([]);
    expect(issuesOf(workflow({ stages: [] }))).toEqual([
      "stages: Add at least one stage.",
    ]);
    const tooMany = Array.from({ length: MAX_WORKFLOW_STAGES + 1 }, (_, index) =>
      aiStage(`s${index}`),
    );
    expect(issuesOf(workflow({ stages: tooMany }))).not.toEqual([]);
    expect(issuesOf(workflow({ stages: [aiStage("has:colon")] }))).not.toEqual([]);
    expect(issuesOf(workflow({ id: "has space" }))).not.toEqual([]);
    expect(issuesOf(workflow({ shortcut: "Bad Shortcut" }))).not.toEqual([]);
    expect(issuesOf(workflow({ version: 2 as 1 }))).not.toEqual([]);
  });

  test("requires unique stage ids", () => {
    expect(issuesOf(workflow({ stages: [aiStage("a"), aiStage("a")] }))).toEqual([
      'stages.1.id: Stage id "a" is used more than once.',
    ]);
  });

  test("enforces the combined instruction budget", () => {
    const stages = Array.from({ length: 12 }, (_, index) =>
      aiStage(`s${index}`, {
        instruction: "x".repeat(WORKFLOW_LIMITS.instruction),
        doneWhen: "y".repeat(WORKFLOW_LIMITS.doneWhen),
      }),
    );
    const oversized = workflow({ stages });
    expect(workflowTextLength(oversized)).toBeGreaterThan(MAX_WORKFLOW_TEXT_LENGTH);
    expect(issuesOf(oversized).join("\n")).toContain(
      "Keep the combined instructions under 14,000 characters",
    );
  });

  test("opens a draft PR at most once, before checks and ready for review", () => {
    expect(
      issuesOf(workflow({ stages: [action("a", "open-draft-pr"), action("b", "open-draft-pr")] })),
    ).toEqual(["stages.1: Open a draft PR only once."]);
    expect(
      issuesOf(workflow({ stages: [watchChecks, action("open", "open-draft-pr")] })),
    ).toEqual(['stages.0: "Watch checks" must come after "Open draft PR".']);
    expect(
      issuesOf(
        workflow({ stages: [action("ready", "mark-pr-ready"), action("open", "open-draft-pr")] }),
      ),
    ).toEqual(['stages.0: "Ready for review" must come after "Open draft PR".']);
    expect(
      issuesOf(
        workflow({
          stages: [aiStage("build"), action("open", "open-draft-pr"), watchChecks, action("ready", "mark-pr-ready")],
        }),
      ),
    ).toEqual([]);
  });

  test("lets checks act on an existing pull request when no stage opens one", () => {
    const fixChecks = workflow({ stages: [aiStage("fix"), watchChecks] });
    expect(issuesOf(fixChecks)).toEqual([]);
  });

  test("validates the watch-checks bounds and the runtime", () => {
    const withWatch = (attempts: number, minutes: number) =>
      workflow({
        stages: [
          {
            ...watchChecks,
            action: { type: "watch-checks", repairAttempts: attempts, timeoutMinutes: minutes },
          } as WorkflowStage,
        ],
      });
    expect(issuesOf(withWatch(3, 5))).toEqual([]);
    expect(issuesOf(withWatch(4, 30))).not.toEqual([]);
    expect(issuesOf(withWatch(2, 1))).not.toEqual([]);
    expect(
      issuesOf(workflow({ runtime: { providerId: "codex", effort: "high", permissionMode: "guided" } })),
    ).toEqual([]);
    expect(
      issuesOf(workflow({ runtime: { providerId: "codex", effort: "loud" as "high" } })),
    ).not.toEqual([]);
    expect(
      issuesOf(workflow({ runtime: { providerId: "other" as "codex" } })),
    ).not.toEqual([]);
  });
});

describe("starter workflows", () => {
  test("every starter and stage template is valid", () => {
    for (const starter of WORKFLOW_STARTERS) {
      const created = createWorkflowFromStarter(starter, { now: NOW, id: `starter_${starter.id.replaceAll("-", "_")}` });
      expect({ id: starter.id, issues: issuesOf(created) }).toEqual({ id: starter.id, issues: [] });
    }
    for (const template of STAGE_TEMPLATES) {
      const stage = structuredClone(template.stage);
      expect({ id: template.id, issues: issuesOf(workflow({ stages: [stage] })) }).toEqual({
        id: template.id,
        issues: [],
      });
    }
  });

  test("Slack request → PR runs the originally requested flow", () => {
    const starter = findWorkflowStarter("slack-request-to-pr");
    expect(
      starter?.template.stages.map((stage) =>
        stage.kind === "ai" ? `${stage.title}${stage.role ? ` (${stage.role})` : ""}` : `${stage.title} ⚙`,
      ),
    ).toEqual([
      "Understand (plan)",
      "Create issue (publish)",
      "Build",
      "Verify",
      "Open draft PR ⚙",
      "Watch checks ⚙",
      "Ready for review ⚙",
      "Report back to the thread (publish)",
    ]);
  });

  test("creating from a starter copies it with fresh identity", () => {
    const starter = findWorkflowStarter("request-to-pr")!;
    const created = createWorkflowFromStarter(starter, { now: NOW });
    expect(created.id).toMatch(/^workflow_[a-z0-9]+$/);
    expect(created.createdAt).toBe(NOW.toISOString());
    created.stages[0]!.title = "Changed";
    expect(starter.template.stages[0]!.title).toBe("Understand");
  });

  test("every Stave tool a starter names is a registered tool", () => {
    const registry = [
      "electron/main/stave-mcp-server.ts",
      "electron/main/browser/browser-tools.ts",
      // Mission tools are registered by these names, for a mission's own turns.
      "src/lib/missions/briefing.ts",
    ]
      .map((file) => readFileSync(path.join(import.meta.dir, "..", file), "utf8"))
      .join("\n");
    const authored = JSON.stringify([WORKFLOW_STARTERS, STAGE_TEMPLATES]);
    const named = new Set(authored.match(/stave_[a-z_]+/g) ?? []);
    expect(named.size).toBeGreaterThan(0);
    for (const tool of named) {
      expect({ tool, registered: registry.includes(`"${tool}"`) }).toEqual({ tool, registered: true });
    }
  });
});

describe("persisted workflows", () => {
  test("drops malformed entries with a diagnostic and never coerces them", () => {
    const valid = workflow();
    const macroShaped = { id: "macro_1", label: "Old", slug: "old", body: "Do it", insertMode: "replace" };
    const { workflows, diagnostics } = normalizePersistedWorkflows([
      valid,
      macroShaped,
      workflow({ id: "p2", stages: [] }),
    ]);
    expect(workflows.map((entry) => entry.id)).toEqual(["workflow_test"]);
    expect(diagnostics.map(({ index, id, outcome }) => ({ index, id, outcome }))).toEqual([
      { index: 1, id: "macro_1", outcome: "dropped" },
      { index: 2, id: "p2", outcome: "dropped" },
    ]);
    expect(diagnostics[1]?.issues).toEqual(["stages: Add at least one stage."]);
  });

  test("renames a duplicate id and clears a duplicate shortcut", () => {
    const { workflows, diagnostics } = normalizePersistedWorkflows([
      workflow({ shortcut: "ship" }),
      workflow({ name: "Second", shortcut: "ship" }),
    ]);
    expect(workflows).toHaveLength(2);
    expect(workflows[1]?.id).not.toBe("workflow_test");
    expect(workflows[1]?.shortcut).toBeUndefined();
    expect(diagnostics.map((entry) => entry.outcome)).toEqual([
      "renamed-id",
      "cleared-shortcut",
    ]);
  });

  test("keeps at most the workflow limit", () => {
    const many = Array.from({ length: MAX_WORKFLOWS + 2 }, (_, index) =>
      workflow({ id: `p${index}` }),
    );
    const { workflows, diagnostics } = normalizePersistedWorkflows(many);
    expect(workflows).toHaveLength(MAX_WORKFLOWS);
    expect(diagnostics.map((entry) => entry.index)).toEqual([MAX_WORKFLOWS, MAX_WORKFLOWS + 1]);
  });

  test("treats a missing value as no workflows and a non-list as a diagnostic", () => {
    expect(normalizePersistedWorkflows(undefined)).toEqual({ workflows: [], diagnostics: [], rejected: [] });
    const result = normalizePersistedWorkflows({ workflows: [] });
    expect(result.workflows).toEqual([]);
    expect(result.diagnostics[0]?.outcome).toBe("dropped");
    expect(result.rejected).toEqual([{ value: { workflows: [] }, issues: ["Saved workflows are not a list."] }]);
  });
});

describe("unreadable workflows are kept aside, never lost", () => {
  // A workflow saved by another version: a field this version does not know.
  const fromNewerVersion = { ...workflow({ id: "newer", name: "From a newer Stave" }), reviewers: ["team"] };

  test("an entry that cannot be read is kept as saved, and the rest restore", () => {
    const restored = restorePersistedWorkflows({ workflows: [workflow(), fromNewerVersion], unreadable: undefined });
    expect(restored.workflows.map((entry) => entry.id)).toEqual(["workflow_test"]);
    expect(restored.unreadable).toHaveLength(1);
    expect(restored.unreadable[0]!.value).toEqual(fromNewerVersion);
    expect(restored.unreadable[0]!.issues.length).toBeGreaterThan(0);
  });

  test("a kept-aside entry survives every later load and comes back once it reads", () => {
    const first = restorePersistedWorkflows({ workflows: [workflow(), fromNewerVersion], unreadable: [] });
    // The list is written back without it; the kept-aside list goes with it.
    const second = restorePersistedWorkflows({ workflows: first.workflows, unreadable: first.unreadable });
    expect(second.unreadable.map((entry) => entry.value)).toEqual([fromNewerVersion]);
    expect(second.workflows).toHaveLength(1);
    // A version that reads it: here, the same entry without the unknown field.
    const { reviewers: _reviewers, ...readable } = fromNewerVersion;
    const upgraded = restorePersistedWorkflows({
      workflows: second.workflows,
      unreadable: [{ value: readable, issues: ["old reason"] }],
    });
    expect(upgraded.workflows.map((entry) => entry.id)).toEqual(["workflow_test", "newer"]);
    expect(upgraded.unreadable).toEqual([]);
  });

  test("workflows past the limit wait aside until there is room", () => {
    const many = Array.from({ length: MAX_WORKFLOWS + 1 }, (_, index) => workflow({ id: `p${index}` }));
    const full = restorePersistedWorkflows({ workflows: many, unreadable: [] });
    expect(full.workflows).toHaveLength(MAX_WORKFLOWS);
    expect(full.unreadable.map((entry) => (entry.value as Workflow).id)).toEqual([`p${MAX_WORKFLOWS}`]);
    const afterDelete = restorePersistedWorkflows({ workflows: full.workflows.slice(1), unreadable: full.unreadable });
    expect(afterDelete.workflows).toHaveLength(MAX_WORKFLOWS);
    expect(afterDelete.workflows.at(-1)?.id).toBe(`p${MAX_WORKFLOWS}`);
    expect(afterDelete.unreadable).toEqual([]);
  });

  test("a saved list that is not a list is kept aside too", () => {
    const restored = restorePersistedWorkflows({ workflows: { broken: true }, unreadable: undefined });
    expect(restored.workflows).toEqual([]);
    expect(restored.unreadable).toEqual([{ value: { broken: true }, issues: ["Saved workflows are not a list."] }]);
  });
});
