import { afterEach, expect, test } from "bun:test";
import { Database } from "bun:sqlite";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { ProjectStore } from "../electron/persistence/project-store";
import { MissionStore } from "../electron/persistence/mission-store";
import { createProjectRuntime, invokeProjectRuntime, invokeProjectAction } from "../electron/host-service/supervision/project-runtime";
import type { ProjectTaskSnapshot } from "../electron/host-service/supervision/project-task-integration";
import type { WorkspaceRevision } from "../electron/host-service/supervision/workspace-revision";

const directories: string[] = [];
afterEach(() => { for (const directory of directories.splice(0)) rmSync(directory, { recursive: true, force: true }); });
function harness(readWorkspaceRevision?: (workspaceId: string) => Promise<WorkspaceRevision>) {
  const directory = mkdtempSync(join(tmpdir(), "stave-project-integration-")); directories.push(directory);
  const filename = join(directory, "state.sqlite");
  const db = new Database(filename); const store = new ProjectStore(db); const missions = new MissionStore(db);
  const tasks = new Map<string, ProjectTaskSnapshot>(["api", "ui", "integration"].map(taskId => [taskId, {
    exists: true, archived: false, running: false, title: taskId, revision: "r1", latestTurnId: `${taskId}-turn`, outcome: "completed",
  }]));
  let starts = 0;
  const runtime = createProjectRuntime({
    store, missions, readWorkspaceRevision, readProjectTask: async ({ taskId }) => tasks.get(taskId) ?? { exists: false, archived: false, running: false, title: taskId, revision: "missing", latestTurnId: null, outcome: null },
    listProjectTaskCandidates: async () => [...tasks].map(([taskId, task]) => ({ taskId, title: task.title, workspaceId: "workspace" })),
    getTaskSnapshot: async () => ({ exists: true, archived: false, providerId: "codex", model: "gpt-6.1-sol", activeTurnId: null }),
    runSupervisedTurn: async () => { starts++; return { turnId: "coordinator-turn" }; },
    resolveRepositoryPath: async workspaceId => workspaceId === "foreign" ? "/tmp/other" : "/tmp/project",
    createMissionWorkspace: async () => { throw new Error("Linking must not allocate workspaces"); },
    createIdleTask: async () => { throw new Error("Linking must not create tasks"); },
    startMission: async () => { throw new Error("Linking must not start missions"); },
    getMissionReport: async () => null, resolveProjectGrant: () => null, setCoordinatorTasks: () => {},
    now: () => new Date("2026-10-01T00:00:00.000Z"),
  });
  const create = async () => (await runtime.create({ name: "Combined work", goal: "API and UI work together", coordinator: { workspaceId: "workspace", taskId: "coordinator" } })).project.id;
  const link = (projectId: string, taskId: string, dependsOn: string[] = []) => runtime.linkTask({ projectId, taskId, workspaceId: "workspace", dependsOn });
  const report = async (projectId: string, accept = true) => {
    const detail = await runtime.get({ projectId });
    return { projectId, expectedSnapshot: detail.integrationSnapshot!, ownerTaskId: "integration", summary: "Combined behavior reviewed",
      criteria: [{ text: "API and UI use the same contract", status: "met" as const }],
      evidence: [{ label: "Combined UI walkthrough", ref: "review-42", source: "user" as const }], unresolved: [], accept, reviewed: true };
  };
  return { db, filename, store, tasks, runtime, create, link, report, starts: () => starts };
}

test("linking is idempotent, repository scoped, acyclic and never starts work", async () => {
  const h = harness(); const id = await h.create(); const starts = h.starts();
  await h.link(id, "api"); await h.link(id, "api"); await h.link(id, "ui", ["api"]); await h.link(id, "integration", ["ui"]);
  expect(h.store.getProject(id)?.taskLinks).toHaveLength(3);
  expect(h.store.listEventsOfKind(id, "task-linked")).toHaveLength(3);
  expect(h.starts()).toBe(starts);
  expect(h.runtime.agentsForTask("api")).toBeNull();
  expect(await invokeProjectRuntime(() => h.runtime.linkTask({ projectId: id, taskId: "api", workspaceId: "foreign" }))).toMatchObject({ ok: false, code: "refused" });
  await expect(h.link(id, "api", ["integration"])).rejects.toThrow("cycle");
  await expect(h.link(id, "api", ["unlinked"])).rejects.toThrow("linked to this project");
  await expect(h.runtime.unlinkTask({ projectId: id, taskId: "api" })).rejects.toThrow("dependants");
  await h.link(id, "ui", []); await h.runtime.unlinkTask({ projectId: id, taskId: "api" });
  expect(h.store.getProject(id)?.taskLinks?.map(task => task.taskId)).toEqual(["ui", "integration"]);
  h.db.close();
});

test("successful child work and an agent report cannot accept the combined result", async () => {
  const h = harness(); const id = await h.create(); await h.link(id, "api"); await h.link(id, "integration", ["api"]);
  expect((await h.runtime.get({ projectId: id })).integrationStatus).toBe("not-recorded");
  await expect(h.runtime.end({ projectId: id, outcome: "completed" })).rejects.toThrow("combined result");
  const input = await h.report(id);
  await expect(h.runtime.recordIntegration({ ...input, reviewed: false, evidence: input.evidence.map(item => ({ ...item, source: "agent" })) })).rejects.toThrow("agent reports alone");
  await expect(h.runtime.recordIntegration({ ...input, criteria: [{ text: "Contract matches", status: "unverified" }] })).rejects.toThrow("Every integration criterion");
  await expect(h.runtime.recordIntegration({ ...input, unresolved: ["API error state untested"] })).rejects.toThrow("remaining integration");
  const pending = await h.runtime.recordIntegration({ ...input, accept: false });
  expect(pending.integrationStatus).toBe("pending");
  expect(h.store.getProject(id)?.state).toBe("active");
  h.db.close();
});

test("explicit current review accepts integration and survives a real persistence restart", async () => {
  const h = harness(); const id = await h.create(); await h.link(id, "api"); await h.link(id, "integration", ["api"]);
  const accepted = await h.runtime.recordIntegration(await h.report(id)); expect(accepted.integrationStatus).toBe("accepted");
  await h.runtime.recordIntegration(await h.report(id)); expect(h.store.listEventsOfKind(id, "integration-recorded")).toHaveLength(1);
  const ended = await h.runtime.end({ projectId: id, outcome: "completed" });
  expect(ended.project.state).toBe("completed");
  const saved = h.store.getProject(id)!; h.db.close();
  const reopened = new Database(h.filename); const restored = new ProjectStore(reopened).getProject(id)!;
  expect(restored.taskLinks).toEqual(saved.taskLinks); expect(restored.integration).toEqual(saved.integration);
  reopened.close();
});

test("host dispatch validates the new coordination actions and refuses ended projects", async () => {
  const h = harness(); const id = await h.create();
  expect(await invokeProjectAction(h.runtime, "link-task", { projectId: id, workspaceId: "workspace", taskId: "api", unexpected: "execution" })).toMatchObject({ ok: false, code: "invalid-args" });
  expect(await invokeProjectAction(h.runtime, "link-task", { projectId: id, workspaceId: "workspace", taskId: "api" })).toMatchObject({ ok: true });
  expect(await invokeProjectAction(h.runtime, "unlink-task", { projectId: id, taskId: "api" })).toMatchObject({ ok: true });
  await h.link(id, "integration");
  expect(await invokeProjectAction(h.runtime, "record-integration", await h.report(id, false))).toMatchObject({ ok: true });
  await h.runtime.end({ projectId: id, outcome: "cancelled" });
  expect(await invokeProjectAction(h.runtime, "link-task", { projectId: id, workspaceId: "workspace", taskId: "api" })).toMatchObject({ ok: false, code: "stale" });
  expect(await invokeProjectAction(h.runtime, "record-integration", await h.report(id))).toMatchObject({ ok: false, code: "stale" });
  h.db.close();
});

test("user review preserves agent evidence provenance and edits require another explicit review", async () => {
  const h = harness(); const id = await h.create(); await h.link(id, "integration");
  const input = await h.report(id); const evidence = [{ label: "Agent test report", ref: "test-output", source: "agent" as const }];
  const accepted = await h.runtime.recordIntegration({ ...input, evidence });
  expect(accepted.integrationStatus).toBe("accepted"); expect(accepted.project.integration?.evidence).toEqual(evidence);
  expect(accepted.project.integration?.userReview).toMatchObject({ snapshot: input.expectedSnapshot, reviewedAt: "2026-10-01T00:00:00.000Z" });
  await expect(h.runtime.recordIntegration({ ...input, evidence: [{ ...evidence[0]!, ref: "new-output" }], reviewed: false })).rejects.toThrow("agent reports alone");
  await expect(h.runtime.recordIntegration({ ...input, criteria: [{ text: "Changed criterion", status: "met" }], reviewed: false })).rejects.toThrow("agent reports alone");
  const pending = await h.runtime.recordIntegration({ ...input, evidence, reviewed: false, accept: false });
  expect(pending.integrationStatus).toBe("pending"); expect(pending.project.integration?.userReview).toBeNull();
  h.db.close();
});

test("acceptance waits for an asynchronous current workspace read and rejects an older review", async () => {
  let delay = false; let release: ((value: WorkspaceRevision) => void) | undefined;
  const h = harness(async () => delay ? new Promise<WorkspaceRevision>(resolve => { release = resolve; }) : { status: "known", revision: "before" });
  const id = await h.create(); await h.link(id, "integration"); const input = await h.report(id);
  delay = true; const pending = h.runtime.recordIntegration(input);
  await new Promise(resolve => setTimeout(resolve, 0));
  expect(release).toBeDefined(); release!({ status: "known", revision: "changed-during-review" });
  await expect(pending).rejects.toThrow("Linked work changed");
  expect(h.store.getProject(id)?.integration).toBeUndefined(); h.db.close();
});

test("new work, deleted tasks and stale form snapshots invalidate acceptance", async () => {
  const h = harness(); const id = await h.create(); await h.link(id, "api"); await h.link(id, "integration", ["api"]);
  const input = await h.report(id); await h.runtime.recordIntegration(input);
  h.tasks.set("api", { ...h.tasks.get("api")!, revision: "r2", running: true });
  expect((await h.runtime.get({ projectId: id })).integrationStatus).toBe("stale");
  await expect(h.runtime.recordIntegration(input)).rejects.toThrow("changed");
  await expect(h.runtime.recordIntegration(await h.report(id))).rejects.toThrow("Wait for linked task runs");
  h.tasks.delete("api");
  const missing = await h.runtime.get({ projectId: id });
  expect(missing.linkedTasks?.find(task => task.taskId === "api")?.available).toBe(false);
  expect(missing.integrationStatus).toBe("stale");
  await expect(h.runtime.recordIntegration(await h.report(id))).rejects.toThrow("missing or archived");
  await expect(h.runtime.end({ projectId: id, outcome: "completed" })).rejects.toThrow("combined result");
  h.db.close();
});

test("linked terminal changes wake the existing coordinator once within its current budget", async () => {
  const h = harness(); const id = await h.create(); await h.link(id, "api");
  const starts = h.starts(); await h.runtime.requestTick(); expect(h.starts()).toBe(starts + 1);
  await h.runtime.requestTick(); expect(h.starts()).toBe(starts + 1);
  h.db.close();
});

test("workspace changes invalidate integration, coalesce same-workspace reads and stay off coordinator ticks", async () => {
  let reads = 0; let revision: WorkspaceRevision = { status: "known", revision: "head-and-content-1" };
  const h = harness(async () => { reads++; return revision; }); const id = await h.create();
  await h.link(id, "api"); await h.link(id, "ui"); await h.link(id, "integration", ["api", "ui"]);
  reads = 0; await h.runtime.get({ projectId: id }); expect(reads).toBe(1);
  const accepted = await h.runtime.recordIntegration(await h.report(id));
  expect(accepted.project.integration?.verificationScope).toBe("workspace-content");
  const beforeTick = reads; await h.runtime.requestTick(); expect(reads).toBe(beforeTick);
  revision = { status: "known", revision: "head-and-content-2" };
  expect((await h.runtime.get({ projectId: id })).integrationStatus).toBe("stale");
  await expect(h.runtime.end({ projectId: id, outcome: "completed" })).rejects.toThrow("combined result");
  revision = { status: "unknown", reason: "limit" };
  expect((await h.runtime.get({ projectId: id })).linkedTasks?.every(task => task.workspaceFreshness === "unknown")).toBe(true);
  const scoped = await h.runtime.recordIntegration(await h.report(id));
  expect(scoped.integrationStatus).toBe("accepted"); expect(scoped.project.integration?.verificationScope).toBe("task-metadata");
  h.db.close();
});
