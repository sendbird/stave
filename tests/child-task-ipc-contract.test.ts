import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import path from "node:path";
import {
  ChildTaskActionResponseSchema,
  ChildTaskDetachArgsSchema,
  ChildTaskFollowUpArgsSchema,
  ChildTaskLinkArgsSchema,
  ChildTaskListArgsSchema,
  ChildTaskRejectionReasonSchema,
  ChildTaskRetryArgsSchema,
  ChildTaskStopArgsSchema,
  describeChildTaskRejection,
} from "../src/lib/runs/child-task";

const root = path.resolve(import.meta.dir, "..");

function read(relativePath: string) {
  return readFileSync(path.join(root, relativePath), "utf8");
}

function sorted(values: Iterable<string>) {
  return [...values].sort((left, right) => left.localeCompare(right));
}

function collect(source: string, pattern: RegExp) {
  return sorted(
    new Set(
      [...source.matchAll(pattern)].flatMap((match) =>
        match[1] ? [match[1]] : [],
      ),
    ),
  );
}

const mainSource = read("electron/main/ipc/runs.ts");
const preloadSource = read("electron/preload.ts");
const windowApiSource = read("src/types/window-api.d.ts");
const coordinatorInstanceSource = read(
  "electron/main/runs/child-task-coordinator-instance.ts",
);

/**
 * The child-task controls only exist as a chain: a renderer method, a preload
 * binding, and a main handler that re-validates. If one link names a channel
 * the others do not, the control fails at runtime in a way typecheck cannot
 * see — so the channel names are compared as sets rather than trusted.
 */
const CHILD_TASK_CHANNELS = [
  "runs:delegate-child-task",
  "runs:detach-child-task",
  "runs:follow-up-child-task",
  "runs:get-child-task-link",
  "runs:list-child-tasks",
  "runs:retry-child-task",
  "runs:stop-child-task",
] as const;

describe("child task IPC chain", () => {
  test("every control is handled in main and bridged through preload", () => {
    const handled = collect(
      mainSource,
      /ipcMain\.handle\(\s*"(runs:[a-z-]*child-task[a-z-]*)"/g,
    );
    const bridged = collect(
      preloadSource,
      /ipcRenderer\.invoke\(\s*"(runs:[a-z-]*child-task[a-z-]*)"/g,
    );

    expect(handled).toEqual([...CHILD_TASK_CHANNELS]);
    expect(bridged).toEqual([...CHILD_TASK_CHANNELS]);
  });

  test("every bridged control is declared on the renderer contract", () => {
    for (const method of [
      "delegateChildTask",
      "listChildTasks",
      "followUpChildTask",
      "retryChildTask",
      "stopChildTask",
      "detachChildTask",
      "getChildTaskLink",
      "onChildTasksChanged",
    ]) {
      expect(preloadSource, `preload is missing ${method}`).toContain(
        `${method}:`,
      );
      expect(windowApiSource, `window api is missing ${method}`).toContain(
        `${method}?:`,
      );
    }
  });

  test("the change broadcast is pushed from main and forwarded by preload", () => {
    // A phase change can originate from a child turn the renderer never
    // started, so this one travels as a push rather than an invoke — and it
    // must skip destroyed windows instead of throwing during teardown.
    expect(coordinatorInstanceSource).toContain(
      'contents.send("runs:child-tasks-changed"',
    );
    expect(coordinatorInstanceSource).toContain("contents.isDestroyed()");
    expect(preloadSource).toContain('"runs:child-tasks-changed"');
    expect(mainSource).not.toContain("runs:child-tasks-changed");
  });
});

describe("child task IPC schemas", () => {
  const expected = {
    childTaskId: "child-1",
    childWorkspaceId: "workspace-child-1",
    attempt: 1,
  };

  test("accept the requests the parent surface actually sends", () => {
    expect(
      ChildTaskListArgsSchema.parse({ parentTaskId: "parent-1" }),
    ).toEqual({ parentTaskId: "parent-1", includeFinished: true });
    expect(
      ChildTaskFollowUpArgsSchema.safeParse({
        parentTaskId: "parent-1",
        delegationKey: "review.pass-1",
        prompt: "One more pass, please.",
        expected,
      }).success,
    ).toBe(true);
    expect(
      ChildTaskStopArgsSchema.safeParse({
        parentTaskId: "parent-1",
        delegationKey: "review.pass-1",
        reason: "No longer needed.",
        expected,
      }).success,
    ).toBe(true);
    expect(
      ChildTaskDetachArgsSchema.safeParse({
        parentTaskId: "parent-1",
        delegationKey: "review.pass-1",
        expected,
      }).success,
    ).toBe(true);
    expect(
      ChildTaskRetryArgsSchema.safeParse({
        projectPath: "/tmp/project",
        parentWorkspaceId: "workspace-parent-1",
        parentTaskId: "parent-1",
        delegationKey: "review.pass-1",
        prompt: "Try again.",
        expected,
      }).success,
    ).toBe(true);
    expect(
      ChildTaskLinkArgsSchema.safeParse({ childTaskId: "child-1" }).success,
    ).toBe(true);
  });

  test("a follow-up defaults to guided rather than inheriting permissions", () => {
    const parsed = ChildTaskFollowUpArgsSchema.parse({
      parentTaskId: "parent-1",
      delegationKey: "review.pass-1",
      prompt: "One more pass, please.",
      expected,
    });
    expect(parsed.permissionProfile).toBe("guided");
  });

  test("mutating controls cannot be sent without an expected identity", () => {
    expect(
      ChildTaskFollowUpArgsSchema.safeParse({
        parentTaskId: "parent-1",
        delegationKey: "review.pass-1",
        prompt: "One more pass, please.",
      }).success,
    ).toBe(false);
    expect(
      ChildTaskDetachArgsSchema.safeParse({
        parentTaskId: "parent-1",
        delegationKey: "review.pass-1",
      }).success,
    ).toBe(false);
    expect(
      ChildTaskRetryArgsSchema.safeParse({
        projectPath: "/tmp/project",
        parentWorkspaceId: "workspace-parent-1",
        parentTaskId: "parent-1",
        delegationKey: "review.pass-1",
        prompt: "Try again.",
      }).success,
    ).toBe(false);
  });

  test("reject renderer-only extras instead of forwarding them", () => {
    expect(
      ChildTaskStopArgsSchema.safeParse({
        parentTaskId: "parent-1",
        delegationKey: "review.pass-1",
        expected,
        force: true,
      }).success,
    ).toBe(false);
    expect(
      ChildTaskListArgsSchema.safeParse({
        parentTaskId: "parent-1",
        limit: 10,
      }).success,
    ).toBe(false);
  });

  test("reject a delegation key that could collide with ledger key syntax", () => {
    expect(
      ChildTaskStopArgsSchema.safeParse({
        parentTaskId: "parent-1",
        delegationKey: "review pass/1",
        expected,
      }).success,
    ).toBe(false);
  });

  test("a refusal always carries a sentence the surface can show as-is", () => {
    for (const reason of ChildTaskRejectionReasonSchema.options) {
      const message = describeChildTaskRejection(reason);
      expect(message, `missing message for ${reason}`).toBeTruthy();
      expect(message.length).toBeLessThanOrEqual(500);
      const response = ChildTaskActionResponseSchema.parse({
        accepted: false,
        duplicate: false,
        reason,
        message,
        child: null,
      });
      expect(response.reason).toBe(reason);
    }
  });

  test("an action response defaults its message rather than omitting the field", () => {
    const parsed = ChildTaskActionResponseSchema.parse({
      accepted: true,
      duplicate: false,
      reason: null,
      child: null,
    });
    expect(parsed.message).toBeNull();
  });
});
