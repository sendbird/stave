import { afterEach, describe, expect, test } from "bun:test";
import { appendFileSync, mkdirSync, mkdtempSync, rmSync, truncateSync, utimesSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { codexDayDirs, ExternalSessionsWatcher } from "../electron/main/external-sessions/external-sessions-watcher";
import { nodeExternalSessionsFs, type ExternalSessionsFs } from "../electron/main/external-sessions/fs-port";
import { readEndLines, TranscriptTail } from "../electron/main/external-sessions/transcript-tail";
import type { ExternalSessionsSnapshot } from "../src/lib/external-sessions/external-sessions";

const roots: string[] = [];
afterEach(() => {
  for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true });
});

function tempRoot() {
  const root = mkdtempSync(path.join(tmpdir(), "stave-external-sessions-"));
  roots.push(root);
  return root;
}

const line = (value: unknown) => `${JSON.stringify(value)}\n`;
const iso = (ms: number) => new Date(ms).toISOString();

/** Counts every file access, to prove the off path reads nothing. */
function countingFs() {
  const calls: string[] = [];
  const fs: ExternalSessionsFs = {
    list: (dir) => (calls.push(`list ${dir}`), nodeExternalSessionsFs.list(dir)),
    stat: (file) => (calls.push(`stat ${file}`), nodeExternalSessionsFs.stat(file)),
    readRange: (file, start, length) => (calls.push(`read ${file}`), nodeExternalSessionsFs.readRange(file, start, length)),
    watch: (dir, onChange) => (calls.push(`watch ${dir}`), nodeExternalSessionsFs.watch(dir, onChange)),
  };
  return { fs, calls };
}

describe("TranscriptTail", () => {
  test("first reads only the end, then only new whole lines", async () => {
    const file = path.join(tempRoot(), "t.jsonl");
    writeFileSync(file, "first line that is long\nsecond\nthird\n");
    const tail = new TranscriptTail(file, nodeExternalSessionsFs, { firstBytes: 10, maxBytes: 64 });
    // The last 10 bytes start mid-"second": that partial line is dropped.
    expect(await tail.read()).toEqual(["third"]);
    // A cut exactly at a line start keeps that line.
    expect(await new TranscriptTail(file, nodeExternalSessionsFs, { firstBytes: 13 }).read()).toEqual(["second", "third"]);
    appendFileSync(file, "fourth\nfif");
    expect(await tail.read()).toEqual(["fourth"]);
    // An unfinished line waits.
    expect(await tail.read()).toEqual([]);
    appendFileSync(file, "th\n");
    expect(await tail.read()).toEqual(["fifth"]);
    expect(await tail.read()).toEqual([]);
  });

  test("a jump past the per-pass limit skips to the newest part", async () => {
    const file = path.join(tempRoot(), "t.jsonl");
    writeFileSync(file, "a\n");
    const tail = new TranscriptTail(file, nodeExternalSessionsFs, { firstBytes: 64, maxBytes: 10 });
    expect(await tail.read()).toEqual(["a"]);
    appendFileSync(file, "0123456789\nlate\n");
    expect(await tail.read()).toEqual(["late"]);
  });

  test("a truncated or replaced file is read again from its end", async () => {
    const file = path.join(tempRoot(), "t.jsonl");
    writeFileSync(file, "one\ntwo\n");
    const tail = new TranscriptTail(file, nodeExternalSessionsFs);
    expect(await tail.read()).toEqual(["one", "two"]);
    truncateSync(file, 0);
    writeFileSync(file, "new\n");
    expect(await tail.read()).toEqual(["new"]);
    rmSync(file);
    expect(await tail.read()).toEqual([]);
  });

  test("readEndLines drops the partial first line", async () => {
    const file = path.join(tempRoot(), "t.jsonl");
    writeFileSync(file, "aaaa\nbbbb\ncccc\n");
    expect(await readEndLines(nodeExternalSessionsFs, file, 15, 8)).toEqual(["cccc"]);
  });
});

const CLAUDE_ID = "11111111-2222-3333-4444-555555555555";
const OWNED_ID = "99999999-2222-3333-4444-555555555555";
const OLD_ID = "77777777-2222-3333-4444-555555555555";

function writeFixtures(root: string, now: number) {
  const claudeDir = path.join(root, "claude");
  const projectDir = path.join(claudeDir, "projects", "-tmp-project");
  mkdirSync(path.join(projectDir, CLAUDE_ID, "subagents"), { recursive: true });
  const cwd = "/tmp/project";
  writeFileSync(path.join(projectDir, `${CLAUDE_ID}.jsonl`),
    line({ type: "user", timestamp: iso(now - 60_000), cwd, gitBranch: "feat/a", message: { content: "Refactor the store" } })
    + line({ type: "assistant", timestamp: iso(now - 50_000), cwd, message: { content: [{ type: "tool_use", id: "launch-1", name: "Agent", input: { description: "Map the IPC layer", subagent_type: "Explore" } }], stop_reason: "tool_use" } })
    + "{broken line\n"
    + line({ type: "assistant", timestamp: iso(now - 40_000), cwd, message: { content: [{ type: "tool_use", id: "x", name: "Read", input: { file_path: `${cwd}/src/store.ts` } }], stop_reason: "tool_use", usage: { input_tokens: 5, output_tokens: 5 } } }));
  writeFileSync(path.join(projectDir, CLAUDE_ID, "subagents", "agent-a1.jsonl"),
    line({ type: "assistant", timestamp: iso(now - 30_000), cwd, message: { content: [{ type: "tool_use", id: "g", name: "Grep", input: { pattern: "ipcMain" } }], stop_reason: "tool_use" } }));
  writeFileSync(path.join(projectDir, CLAUDE_ID, "subagents", "agent-a1.meta.json"), JSON.stringify({ agentType: "Explore", description: "Map the IPC layer", toolUseId: "launch-1" }));
  // Finished sub-agent: its final answer ends it.
  writeFileSync(path.join(projectDir, CLAUDE_ID, "subagents", "agent-a2.jsonl"),
    line({ type: "assistant", timestamp: iso(now - 20_000), cwd, message: { content: [{ type: "text", text: "Done" }], stop_reason: "end_turn" } }));
  // A session Stave started (its id is stored) and one untouched for 7 hours.
  writeFileSync(path.join(projectDir, `${OWNED_ID}.jsonl`), line({ type: "user", timestamp: iso(now), message: { content: "Stave's own" } }));
  const oldFile = path.join(projectDir, `${OLD_ID}.jsonl`);
  writeFileSync(oldFile, line({ type: "user", timestamp: iso(now), message: { content: "Old" } }));
  const sevenHoursAgo = (now - 7 * 60 * 60_000) / 1000;
  utimesSync(oldFile, sevenHoursAgo, sevenHoursAgo);

  const codexHome = path.join(root, "codex");
  const dayDir = codexDayDirs(codexHome, now)[0]!;
  mkdirSync(dayDir, { recursive: true });
  writeFileSync(path.join(dayDir, "rollout-terminal.jsonl"),
    line({ timestamp: iso(now - 10_000), type: "session_meta", payload: { id: "codex-terminal", originator: "codex-tui", cwd: "/tmp/elsewhere" } })
    + line({ timestamp: iso(now - 9_000), type: "event_msg", payload: { type: "user_message", message: "Check the build" } })
    + line({ timestamp: iso(now - 8_000), type: "event_msg", payload: { type: "task_complete" } }));
  writeFileSync(path.join(dayDir, "rollout-stave.jsonl"),
    line({ timestamp: iso(now - 10_000), type: "session_meta", payload: { id: "codex-stave", originator: "stave", cwd: "/tmp/project" } }));
  return { claudeDir, codexHome, projectDir };
}

function createWatcher(root: string, fs?: ExternalSessionsFs) {
  const now = Date.now();
  const dirs = writeFixtures(root, now);
  const published: ExternalSessionsSnapshot[] = [];
  const asked: string[][] = [];
  const watcher = new ExternalSessionsWatcher({
    ...(fs ? { fs } : {}),
    claudeConfigDirs: () => [dirs.claudeDir],
    codexHomes: () => [dirs.codexHome],
    ownedSessionIds: (candidates) => {
      asked.push(candidates.map((candidate) => candidate.id));
      return new Set(candidates.map((candidate) => candidate.id).filter((id) => id === OWNED_ID));
    },
    onChange: (snapshot) => published.push(snapshot),
    timers: false,
  });
  return { watcher, published, asked, dirs };
}

describe("ExternalSessionsWatcher", () => {
  test("live mode lists outside sessions with their sub-agents and leaves Stave's own out", async () => {
    const { watcher, published, asked } = createWatcher(tempRoot());
    watcher.setMode("live");
    await watcher.scan();
    const snapshot = watcher.snapshot();
    expect(snapshot.state).toBe("live");
    const ids = snapshot.sessions.map((session) => session.id).sort();
    expect(ids).toEqual([CLAUDE_ID, "codex-terminal"]);
    // Stave's Codex session is known by its originator and never asked about.
    expect(asked.flat()).not.toContain("codex-stave");
    expect(asked.flat()).toContain(OWNED_ID);
    expect(asked.flat()).not.toContain(OLD_ID);

    const claude = snapshot.sessions.find((session) => session.id === CLAUDE_ID)!;
    expect(claude).toMatchObject({ source: "claude-code", title: "Refactor the store", cwd: "/tmp/project", branch: "feat/a", status: "working", steps: 2, contextTokens: 10 });
    expect(claude.action).toEqual({ verb: "read", target: "src/store.ts" });
    expect(claude.agents.map((agent) => [agent.id, agent.agentType, agent.status, agent.description])).toEqual([
      ["a1", "Explore", "running", "Map the IPC layer"],
      ["a2", "general-purpose", "finished", "a2"],
    ]);
    const codex = snapshot.sessions.find((session) => session.id === "codex-terminal")!;
    expect(codex).toMatchObject({ source: "codex", title: "Check the build", status: "waiting", agents: [] });
    // One session working plus one agent running.
    expect(snapshot.runningCount).toBe(2);
    expect(published.at(-1)).toBe(snapshot);
  });

  test("live mode follows what a transcript appends", async () => {
    const { watcher, dirs } = createWatcher(tempRoot());
    watcher.setMode("live");
    await watcher.scan();
    appendFileSync(path.join(dirs.projectDir, `${CLAUDE_ID}.jsonl`),
      line({ type: "assistant", timestamp: iso(Date.now()), message: { content: [{ type: "text", text: "All done" }], stop_reason: "end_turn" } }));
    await watcher.poll();
    watcher.publishNow();
    const claude = watcher.snapshot().sessions.find((session) => session.id === CLAUDE_ID)!;
    expect(claude.status).toBe("waiting");
    expect(claude.recentProgress?.at(-1)).toMatchObject({ kind: "text", text: "All done" });
  });

  test("count mode keeps only the number, and turning off drops everything", async () => {
    const { watcher, published } = createWatcher(tempRoot());
    watcher.setMode("count");
    await watcher.scan();
    expect(watcher.snapshot()).toMatchObject({ state: "count", runningCount: 2, sessions: [] });
    watcher.setMode(null);
    expect(watcher.snapshot()).toMatchObject({ state: "off", runningCount: 0, sessions: [] });
    expect(published.at(-1)?.state).toBe("off");
  });

  test("while off, nothing is listed, opened or read", async () => {
    const { fs, calls } = countingFs();
    const { watcher } = createWatcher(tempRoot(), fs);
    await watcher.scan();
    await watcher.poll();
    watcher.publishNow();
    expect(calls).toEqual([]);
    expect(watcher.snapshot().state).toBe("off");

    watcher.setMode("count");
    await watcher.scan();
    expect(calls.length).toBeGreaterThan(0);
    watcher.setMode(null);
    const before = calls.length;
    await watcher.scan();
    await watcher.poll();
    expect(calls.length).toBe(before);
  });

  test("reports worktrees of sub-agents that have not finished, and none while off", async () => {
    const { watcher, dirs } = createWatcher(tempRoot());
    const agents = path.join(dirs.projectDir, CLAUDE_ID, "subagents");
    writeFileSync(path.join(agents, "agent-a1.meta.json"), JSON.stringify({ agentType: "Explore", toolUseId: "launch-1", worktreePath: "/tmp/project/.claude/worktrees/agent-a1" }));
    writeFileSync(path.join(agents, "agent-a2.meta.json"), JSON.stringify({ worktreePath: "/tmp/project/.claude/worktrees/agent-a2", finished: true }));
    expect(watcher.runningAgentWorktrees()).toEqual([]);
    watcher.setMode("count");
    await watcher.scan();
    expect(watcher.runningAgentWorktrees()).toEqual(["/tmp/project/.claude/worktrees/agent-a1"]);
    watcher.setMode(null);
    expect(watcher.runningAgentWorktrees()).toEqual([]);
  });

  test("a failing ownership lookup does not throw out of the watcher", async () => {
    const root = tempRoot();
    const dirs = writeFixtures(root, Date.now());
    const watcher = new ExternalSessionsWatcher({
      claudeConfigDirs: () => [dirs.claudeDir, path.join(root, "missing")],
      codexHomes: () => [path.join(root, "missing-codex")],
      ownedSessionIds: () => {
        throw new Error("database closed");
      },
      onChange: () => {},
      timers: false,
    });
    watcher.setMode("live");
    await watcher.scan();
    expect(watcher.snapshot().sessions.map((session) => session.id)).toContain(CLAUDE_ID);
  });
});
