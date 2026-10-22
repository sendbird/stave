import { Database } from "bun:sqlite";
import { describe, expect, test } from "bun:test";
import { AgentRunStore } from "../electron/persistence/agent-run-store";
import { collectStageFacts } from "../electron/host-service/supervision/stage-facts";
import type { ScmCommandRunner } from "../electron/host-service/scm-runtime";
import { AGENT_RUN_LIMITS, EMPTY_STAGE_FACTS, StageFactsSchema } from "../src/lib/agent-runs/domain";
import { AGENT_RUN_NOW, agentRunFixture } from "./fixtures/agent-run-fixtures";

const SHA = "a".repeat(40);

/** A git runner that answers the diff and untracked reads with fixed paths. */
function runner(tracked: string[], untracked: string[], ok = true): ScmCommandRunner {
  return (async (args: { commandArgs: string[] }) => {
    const [command, ...rest] = args.commandArgs;
    const stdout = command === "diff" && rest.includes("--name-only") ? tracked.map((path) => `${path}\0`).join("")
      : command === "ls-files" ? untracked.map((path) => `${path}\0`).join("")
      : command === "diff" ? " 2 files changed, 3 insertions(+)\n" : "";
    return { ok, code: ok ? 0 : 1, stdout, stderr: ok ? "" : "fatal: bad revision" };
  }) as unknown as ScmCommandRunner;
}

const collect = (run: ScmCommandRunner) => collectStageFacts({ cwd: "/tmp/repo", startHeadSha: SHA, turnIds: new Set(), messages: [], run });

describe("stage changed paths", () => {
  test("a stage's report records the paths it changed: tracked changes and untracked files, sorted once each", async () => {
    const facts = await collect(runner(["src/b.ts", "src/a.ts"], ["src/new.ts", "src/a.ts"]));
    expect(facts.changedPaths).toEqual(["src/a.ts", "src/b.ts", "src/new.ts"]);
    expect(facts.changedPathsTruncated).toBeUndefined();
  });

  test("past the cap the list stops and says so; when git cannot answer nothing is recorded", async () => {
    const many = Array.from({ length: AGENT_RUN_LIMITS.facts.changedPaths + 5 }, (_, index) => `f${String(index).padStart(4, "0")}.ts`);
    const capped = await collect(runner(many, []));
    expect(capped.changedPaths).toHaveLength(AGENT_RUN_LIMITS.facts.changedPaths);
    expect(capped.changedPathsTruncated).toBe(true);
    expect(StageFactsSchema.safeParse(capped).success).toBe(true);
    const failed = await collect(runner(["src/a.ts"], [], false));
    expect(failed.changedPaths).toBeUndefined();
    expect(StageFactsSchema.safeParse({ ...EMPTY_STAGE_FACTS, changedPaths: many }).success).toBe(false);
  });

  test("stage rows from before the field still load, and new rows keep their paths", () => {
    const database = new Database(":memory:");
    const store = new AgentRunStore(database);
    const old = agentRunFixture({ id: "agent-run-old", leadTaskId: "task-old" });
    old.stages[0] = { ...old.stages[0]!, facts: { ...EMPTY_STAGE_FACTS } };
    expect(store.create({ agentRun: old.agentRun, upserts: old.stages, events: [] }, AGENT_RUN_NOW)).toEqual({ ok: true });
    const stored = database.prepare("SELECT facts_json AS json FROM agent_run_stages WHERE agent_run_id = ?").get("agent-run-old") as { json: string };
    expect(stored.json).not.toContain("changedPaths");
    expect(new AgentRunStore(database).getAggregate("agent-run-old")?.stages[0]?.facts?.changedPaths).toBeUndefined();

    const fresh = agentRunFixture({ id: "agent-run-new", leadTaskId: "task-new" });
    fresh.stages[0] = { ...fresh.stages[0]!, facts: { ...EMPTY_STAGE_FACTS, changedPaths: ["src/a.ts"], changedPathsTruncated: true } };
    store.create({ agentRun: fresh.agentRun, upserts: fresh.stages, events: [] }, AGENT_RUN_NOW);
    expect(store.getAggregate("agent-run-new")?.stages[0]?.facts).toMatchObject({ changedPaths: ["src/a.ts"], changedPathsTruncated: true });
    database.close();
  });
});
