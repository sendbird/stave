import { afterEach, describe, expect, test } from "bun:test";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { CodexRolloutState, parseCodexSubagent } from "../electron/main/external-sessions/codex-rollout";
import { codexDayDirs, ExternalSessionsWatcher } from "../electron/main/external-sessions/external-sessions-watcher";

const roots: string[] = [];
afterEach(() => {
  for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true });
});

const line = (value: unknown) => `${JSON.stringify(value)}\n`;
const iso = (ms: number) => new Date(ms).toISOString();

interface RolloutSpec {
  id: string;
  originator?: string;
  source?: unknown;
  parent_thread_id?: string;
  events?: unknown[];
}

function setup(rollouts: RolloutSpec[], owned: string[] = []) {
  const root = mkdtempSync(path.join(tmpdir(), "stave-codex-subagents-"));
  roots.push(root);
  const now = Date.now();
  const codexHome = path.join(root, "codex");
  const dayDir = codexDayDirs(codexHome, now)[0]!;
  mkdirSync(dayDir, { recursive: true });
  for (const spec of rollouts) {
    const payload = {
      id: spec.id,
      originator: spec.originator ?? "codex-tui",
      cwd: "/tmp/fixture",
      ...(spec.source === undefined ? {} : { source: spec.source }),
      ...(spec.parent_thread_id ? { parent_thread_id: spec.parent_thread_id } : {}),
    };
    writeFileSync(path.join(dayDir, `rollout-${spec.id}.jsonl`),
      line({ timestamp: iso(now - 60_000), type: "session_meta", payload })
      + (spec.events ?? []).map(line).join(""));
  }
  const watcher = new ExternalSessionsWatcher({
    claudeConfigDirs: () => [path.join(root, "claude")],
    codexHomes: () => [codexHome],
    ownedSessionIds: (candidates) => new Set(candidates.map((candidate) => candidate.id).filter((id) => owned.includes(id))),
    onChange: () => {},
    timers: false,
  });
  return { watcher };
}

async function sessionsOf(watcher: ExternalSessionsWatcher) {
  watcher.setMode("live");
  await watcher.scan();
  watcher.publishNow();
  const snapshot = watcher.snapshot();
  watcher.dispose();
  return snapshot;
}

const spawn = (parent: string, extra: Record<string, unknown> = {}) => ({
  subagent: { thread_spawn: { parent_thread_id: parent, depth: 1, agent_nickname: "Euler", agent_role: "explorer", agent_path: null, ...extra } },
});

describe("Codex sub-agent rollouts", () => {
  test("a thread_spawn child nests under its parent as an agent card", async () => {
    const { watcher } = setup([
      { id: "parent", events: [{ timestamp: iso(Date.now()), type: "event_msg", payload: { type: "user_message", message: "Fix it" } }] },
      {
        id: "child", parent_thread_id: "parent", source: spawn("parent"),
        events: [
          { timestamp: iso(Date.now()), type: "event_msg", payload: { type: "task_started" } },
          { timestamp: iso(Date.now()), type: "response_item", payload: { type: "function_call", name: "shell", arguments: JSON.stringify({ command: ["bash", "-lc", "ls"] }) } },
          { timestamp: iso(Date.now()), type: "event_msg", payload: { type: "token_count", info: { last_token_usage: { total_tokens: 1234 } } } },
        ],
      },
      { id: "child-done", parent_thread_id: "parent", source: spawn("parent", { agent_nickname: "Noether", agent_role: null }), events: [{ timestamp: iso(Date.now()), type: "event_msg", payload: { type: "task_complete" } }] },
    ]);
    const snapshot = await sessionsOf(watcher);
    expect(snapshot.sessions.map((session) => session.id)).toEqual(["parent"]);
    const agents = snapshot.sessions[0]!.agents;
    expect(agents.map((agent) => [agent.id, agent.agentType, agent.description, agent.status]).sort()).toEqual([
      ["child", "explorer", "Euler", "running"],
      ["child-done", "Agent", "Noether", "finished"],
    ]);
    const running = agents.find((agent) => agent.id === "child")!;
    expect(running.steps).toBe(1);
    expect(running.contextTokens).toBe(1234);
    expect(running.action).toBeDefined();
    expect(snapshot.sessions[0]!.subagent).toBeUndefined();
  });

  test("guardian reviews are neither sessions nor agents", async () => {
    const { watcher } = setup([
      { id: "parent" },
      { id: "guard", parent_thread_id: "parent", source: { subagent: { other: "guardian" } } },
    ]);
    const snapshot = await sessionsOf(watcher);
    expect(snapshot.sessions.map((session) => session.id)).toEqual(["parent"]);
    expect(snapshot.sessions[0]!.agents).toEqual([]);
  });

  test("a child whose parent is not listed stands alone, labelled as a sub-agent", async () => {
    const { watcher } = setup([{ id: "orphan", parent_thread_id: "missing", source: spawn("missing") }]);
    const snapshot = await sessionsOf(watcher);
    expect(snapshot.sessions).toHaveLength(1);
    expect(snapshot.sessions[0]).toMatchObject({ id: "orphan", source: "codex", subagent: true, title: "Euler", agents: [] });
  });

  test("a child of a Stave-started parent is excluded, by originator or stored id", async () => {
    const byOriginator = setup([
      { id: "stave-parent", originator: "stave" },
      { id: "kid", originator: "codex-tui", parent_thread_id: "stave-parent", source: spawn("stave-parent") },
    ]);
    expect((await sessionsOf(byOriginator.watcher)).sessions).toEqual([]);

    const byStoredId = setup([{ id: "kid", parent_thread_id: "old-stave-parent", source: spawn("old-stave-parent") }], ["old-stave-parent"]);
    expect((await sessionsOf(byStoredId.watcher)).sessions).toEqual([]);

    const ownChild = setup([{ id: "kid", parent_thread_id: "p", source: spawn("p") }], ["kid"]);
    expect((await sessionsOf(ownChild.watcher)).sessions).toEqual([]);
  });

  test("agent cards respect the per-session cap", async () => {
    const children = Array.from({ length: 15 }, (_, index): RolloutSpec => ({ id: `c${index}`, parent_thread_id: "parent", source: spawn("parent") }));
    const { watcher } = setup([{ id: "parent" }, ...children]);
    const snapshot = await sessionsOf(watcher);
    expect(snapshot.sessions).toHaveLength(1);
    expect(snapshot.sessions[0]!.agents).toHaveLength(12);
  });

  test("unknown or malformed source shapes are ignored", async () => {
    for (const source of ["cli", 7, [], { subagent: 3 }, { subagent: [] }, { subagent: { thread_spawn: 3 } }, { subagent: { thread_spawn: {} } }, { subagent: { mystery: true } }, null]) {
      expect(parseCodexSubagent({ source })).toBeUndefined();
    }
    expect(parseCodexSubagent({ source: { subagent: { other: "guardian" } } })).toEqual({ kind: "internal" });
    expect(parseCodexSubagent({ source: { subagent: "review" } })).toEqual({ kind: "internal" });
    const state = new CodexRolloutState();
    state.feed([JSON.stringify({ type: "session_meta", payload: { id: "x", source: { subagent: { thread_spawn: 3 } }, parent_thread_id: "p" } })]);
    expect(state.subagent).toBeUndefined();

    const { watcher } = setup([{ id: "odd", parent_thread_id: "p", source: { subagent: { mystery: true } } }]);
    expect((await sessionsOf(watcher)).sessions.map((session) => [session.id, session.subagent])).toEqual([["odd", undefined]]);
  });
});

