import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import path from "node:path";
import {
  normalizePersistedPlaybooks,
  parsePlaybook,
} from "../src/lib/playbooks/normalize";
import {
  MAX_PLAYBOOKS,
  MAX_PLAYBOOK_STAGES,
  MAX_PLAYBOOK_TEXT_LENGTH,
  PLAYBOOK_LIMITS,
  playbookNeedsExistingPullRequest,
  playbookTextLength,
  type Playbook,
  type PlaybookStage,
} from "../src/lib/playbooks/schema";
import {
  createPlaybookFromStarter,
  createStageFromTemplate,
  findPlaybookStarter,
  PLAYBOOK_STARTERS,
  STAGE_TEMPLATES,
} from "../src/lib/playbooks/starters";

const NOW = new Date("2026-09-26T09:00:00.000Z");

function aiStage(id: string, extra: Partial<PlaybookStage> = {}): PlaybookStage {
  return {
    id,
    title: `Stage ${id}`,
    kind: "ai",
    instruction: `Do ${id}.`,
    doneWhen: `${id} is done.`,
    ...extra,
  } as PlaybookStage;
}

function action(id: string, type: "open-draft-pr" | "mark-pr-ready"): PlaybookStage {
  return { id, title: id, kind: "action", action: { type } };
}

const watchChecks: PlaybookStage = {
  id: "watch",
  title: "Watch checks",
  kind: "action",
  action: { type: "watch-checks", repairAttempts: 2, timeoutMinutes: 30 },
};

function playbook(overrides: Partial<Playbook> = {}): Playbook {
  return {
    version: 1,
    id: "playbook_test",
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
  const result = parsePlaybook(value);
  return result.ok ? [] : result.issues;
}

describe("playbook schema", () => {
  test("accepts a minimal playbook and trims authored text", () => {
    const result = parsePlaybook(playbook({ name: "  Test  " }));
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.playbook.name).toBe("Test");
  });

  test("rejects unknown keys at every level", () => {
    expect(issuesOf({ ...playbook(), recipe: {} })).not.toEqual([]);
    expect(
      issuesOf(playbook({ stages: [{ ...aiStage("a"), evidence: "x" } as PlaybookStage] })),
    ).not.toEqual([]);
    expect(
      issuesOf(
        playbook({
          stages: [
            {
              ...watchChecks,
              action: { ...watchChecks.action, merge: true },
            } as PlaybookStage,
          ],
        }),
      ),
    ).not.toEqual([]);
  });

  test("bounds strings, stage count and ids", () => {
    expect(issuesOf(playbook({ name: "" }))).not.toEqual([]);
    expect(
      issuesOf(playbook({ name: "x".repeat(PLAYBOOK_LIMITS.name + 1) })),
    ).not.toEqual([]);
    expect(issuesOf(playbook({ stages: [] }))).toEqual([
      "stages: Add at least one stage.",
    ]);
    const tooMany = Array.from({ length: MAX_PLAYBOOK_STAGES + 1 }, (_, index) =>
      aiStage(`s${index}`),
    );
    expect(issuesOf(playbook({ stages: tooMany }))).not.toEqual([]);
    expect(issuesOf(playbook({ stages: [aiStage("has:colon")] }))).not.toEqual([]);
    expect(issuesOf(playbook({ id: "has space" }))).not.toEqual([]);
    expect(issuesOf(playbook({ shortcut: "Bad Shortcut" }))).not.toEqual([]);
    expect(issuesOf(playbook({ version: 2 as 1 }))).not.toEqual([]);
  });

  test("requires unique stage ids", () => {
    expect(issuesOf(playbook({ stages: [aiStage("a"), aiStage("a")] }))).toEqual([
      'stages.1.id: Stage id "a" is used more than once.',
    ]);
  });

  test("enforces the combined instruction budget", () => {
    const stages = Array.from({ length: 12 }, (_, index) =>
      aiStage(`s${index}`, {
        instruction: "x".repeat(PLAYBOOK_LIMITS.instruction),
        doneWhen: "y".repeat(PLAYBOOK_LIMITS.doneWhen),
      }),
    );
    const oversized = playbook({ stages });
    expect(playbookTextLength(oversized)).toBeGreaterThan(MAX_PLAYBOOK_TEXT_LENGTH);
    expect(issuesOf(oversized).join("\n")).toContain(
      "Keep the combined instructions under 14,000 characters",
    );
  });

  test("opens a draft PR at most once, before checks and ready for review", () => {
    expect(
      issuesOf(playbook({ stages: [action("a", "open-draft-pr"), action("b", "open-draft-pr")] })),
    ).toEqual(["stages.1: A playbook can open a draft PR only once."]);
    expect(
      issuesOf(playbook({ stages: [watchChecks, action("open", "open-draft-pr")] })),
    ).toEqual(['stages.0: "Watch checks" must come after "Open draft PR".']);
    expect(
      issuesOf(
        playbook({ stages: [action("ready", "mark-pr-ready"), action("open", "open-draft-pr")] }),
      ),
    ).toEqual(['stages.0: "Ready for review" must come after "Open draft PR".']);
    expect(
      issuesOf(
        playbook({
          stages: [aiStage("build"), action("open", "open-draft-pr"), watchChecks, action("ready", "mark-pr-ready")],
        }),
      ),
    ).toEqual([]);
  });

  test("lets checks act on an existing pull request when no stage opens one", () => {
    const fixChecks = playbook({ stages: [aiStage("fix"), watchChecks] });
    expect(issuesOf(fixChecks)).toEqual([]);
    expect(playbookNeedsExistingPullRequest(fixChecks)).toBe(true);
    expect(
      playbookNeedsExistingPullRequest(
        playbook({ stages: [action("open", "open-draft-pr"), watchChecks] }),
      ),
    ).toBe(false);
    expect(playbookNeedsExistingPullRequest(playbook())).toBe(false);
  });

  test("validates the watch-checks bounds and the runtime", () => {
    const withWatch = (attempts: number, minutes: number) =>
      playbook({
        stages: [
          {
            ...watchChecks,
            action: { type: "watch-checks", repairAttempts: attempts, timeoutMinutes: minutes },
          } as PlaybookStage,
        ],
      });
    expect(issuesOf(withWatch(3, 5))).toEqual([]);
    expect(issuesOf(withWatch(4, 30))).not.toEqual([]);
    expect(issuesOf(withWatch(2, 1))).not.toEqual([]);
    expect(
      issuesOf(playbook({ runtime: { providerId: "codex", effort: "high", permissionMode: "guided" } })),
    ).toEqual([]);
    expect(
      issuesOf(playbook({ runtime: { providerId: "codex", effort: "loud" as "high" } })),
    ).not.toEqual([]);
    expect(
      issuesOf(playbook({ runtime: { providerId: "other" as "codex" } })),
    ).not.toEqual([]);
  });
});

describe("starter playbooks", () => {
  test("every starter and stage template is valid", () => {
    for (const starter of PLAYBOOK_STARTERS) {
      const created = createPlaybookFromStarter(starter, { now: NOW, id: `starter_${starter.id.replaceAll("-", "_")}` });
      expect({ id: starter.id, issues: issuesOf(created) }).toEqual({ id: starter.id, issues: [] });
    }
    for (const template of STAGE_TEMPLATES) {
      const stage = createStageFromTemplate(template, []);
      expect({ id: template.id, issues: issuesOf(playbook({ stages: [stage] })) }).toEqual({
        id: template.id,
        issues: [],
      });
    }
  });

  test("Slack request → PR runs the originally requested flow", () => {
    const starter = findPlaybookStarter("slack-request-to-pr");
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

  test("the checks and review starters work on an existing pull request", () => {
    const needsPr = PLAYBOOK_STARTERS.filter((starter) =>
      playbookNeedsExistingPullRequest(starter.template),
    ).map((starter) => starter.id);
    expect(needsPr).toEqual(["fix-failing-checks", "address-review"]);
  });

  test("creating from a starter copies it with fresh identity", () => {
    const starter = findPlaybookStarter("request-to-pr")!;
    const created = createPlaybookFromStarter(starter, { now: NOW });
    expect(created.id).toMatch(/^playbook_[a-z0-9]+$/);
    expect(created.createdAt).toBe(NOW.toISOString());
    created.stages[0]!.title = "Changed";
    expect(starter.template.stages[0]!.title).toBe("Understand");
  });

  test("a stage template gets an id no existing stage uses", () => {
    const template = STAGE_TEMPLATES.find((candidate) => candidate.id === "visual-check")!;
    expect(createStageFromTemplate(template, ["build"]).id).toBe("visual-check");
    expect(
      createStageFromTemplate(template, ["visual-check", "visual-check-2"]).id,
    ).toBe("visual-check-3");
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
    const authored = JSON.stringify([PLAYBOOK_STARTERS, STAGE_TEMPLATES]);
    const named = new Set(authored.match(/stave_[a-z_]+/g) ?? []);
    expect(named.size).toBeGreaterThan(0);
    for (const tool of named) {
      expect({ tool, registered: registry.includes(`"${tool}"`) }).toEqual({ tool, registered: true });
    }
  });
});

describe("persisted playbooks", () => {
  test("drops malformed entries with a diagnostic and never coerces them", () => {
    const valid = playbook();
    const macroShaped = { id: "macro_1", label: "Old", slug: "old", body: "Do it", insertMode: "replace" };
    const { playbooks, diagnostics } = normalizePersistedPlaybooks([
      valid,
      macroShaped,
      playbook({ id: "p2", stages: [] }),
    ]);
    expect(playbooks.map((entry) => entry.id)).toEqual(["playbook_test"]);
    expect(diagnostics.map(({ index, id, outcome }) => ({ index, id, outcome }))).toEqual([
      { index: 1, id: "macro_1", outcome: "dropped" },
      { index: 2, id: "p2", outcome: "dropped" },
    ]);
    expect(diagnostics[1]?.issues).toEqual(["stages: Add at least one stage."]);
  });

  test("renames a duplicate id and clears a duplicate shortcut", () => {
    const { playbooks, diagnostics } = normalizePersistedPlaybooks([
      playbook({ shortcut: "ship" }),
      playbook({ name: "Second", shortcut: "ship" }),
    ]);
    expect(playbooks).toHaveLength(2);
    expect(playbooks[1]?.id).not.toBe("playbook_test");
    expect(playbooks[1]?.shortcut).toBeUndefined();
    expect(diagnostics.map((entry) => entry.outcome)).toEqual([
      "renamed-id",
      "cleared-shortcut",
    ]);
  });

  test("keeps at most the playbook limit", () => {
    const many = Array.from({ length: MAX_PLAYBOOKS + 2 }, (_, index) =>
      playbook({ id: `p${index}` }),
    );
    const { playbooks, diagnostics } = normalizePersistedPlaybooks(many);
    expect(playbooks).toHaveLength(MAX_PLAYBOOKS);
    expect(diagnostics.map((entry) => entry.index)).toEqual([MAX_PLAYBOOKS, MAX_PLAYBOOKS + 1]);
  });

  test("treats a missing value as no playbooks and a non-list as a diagnostic", () => {
    expect(normalizePersistedPlaybooks(undefined)).toEqual({ playbooks: [], diagnostics: [] });
    const result = normalizePersistedPlaybooks({ playbooks: [] });
    expect(result.playbooks).toEqual([]);
    expect(result.diagnostics[0]?.outcome).toBe("dropped");
  });
});
