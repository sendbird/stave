import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import path from "node:path";
import {
  DelegatedTaskActionResponseSchema,
  DelegatedTaskDetachArgsSchema,
  DelegatedTaskFollowUpArgsSchema,
  DelegatedTaskLinkArgsSchema,
  DelegatedTaskListArgsSchema,
  DelegatedTaskRejectionReasonSchema,
  DelegatedTaskRequestContextSchema,
  DelegatedTaskRetryArgsSchema,
  DelegatedTaskStopArgsSchema,
  describeDelegatedTaskRejection,
} from "../src/lib/runs/delegated-task";
import { ReviewRevisionArgsSchema, ReviewRevisionStateSchema } from "../src/lib/reviews/review-revision";

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
  "electron/main/runs/delegated-task-coordinator-instance.ts",
);

/**
 * The delegated-task controls only exist as a chain: a renderer method, a preload
 * binding, and a main handler that re-validates. If one link names a channel
 * the others do not, the control fails at runtime in a way typecheck cannot
 * see — so the channel names are compared as sets rather than trusted.
 */
const DELEGATED_TASK_CHANNELS = [
  "delegations:create",
  "delegations:detach",
  "delegations:follow-up",
  "delegations:get-link",
  "delegations:list",
  "delegations:retry",
  "delegations:review-revision",
  "delegations:stop",
  "delegations:sync-permission-settings",
] as const;

describe("delegated task IPC chain", () => {
  test("every control is handled in main and bridged through preload", () => {
    const handled = collect(
      mainSource,
      /ipcMain\.handle\(\s*"(delegations:[a-z-]+)"/g,
    );
    const bridged = collect(
      preloadSource,
      /ipcRenderer\.invoke\(\s*"(delegations:[a-z-]+)"/g,
    );

    expect(handled).toEqual([...DELEGATED_TASK_CHANNELS]);
    expect(bridged).toEqual([...DELEGATED_TASK_CHANNELS]);
  });

  test("every bridged control is declared on the renderer contract", () => {
    for (const method of [
      "delegateTask",
      "listDelegatedTasks",
      "getReviewRevision",
      "followUpDelegatedTask",
      "retryDelegatedTask",
      "stopDelegatedTask",
      "detachDelegatedTask",
      "getDelegatedTaskLink",
      "onDelegatedTasksChanged",
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
      'contents.send("delegations:changed"',
    );
    expect(coordinatorInstanceSource).toContain("contents.isDestroyed()");
    expect(preloadSource).toContain('"delegations:changed"');
    expect(mainSource).not.toContain("delegations:changed");
  });
});

describe("delegated task IPC schemas", () => {
  const expected = {
    delegatedTaskId: "child-1",
    delegatedWorkspaceId: "workspace-child-1",
    attempt: 1,
  };

  test("review revision requests require a child identity and return bounded provenance", () => {
    const args = { parentTaskId: "parent-1", delegationKey: "stave-review-check", expected };
    expect(ReviewRevisionArgsSchema.safeParse(args).success).toBe(true);
    expect(ReviewRevisionArgsSchema.safeParse({ ...args, expected: undefined }).success).toBe(false);
    expect(ReviewRevisionArgsSchema.safeParse({ ...args, workspacePath: "/tmp/other" }).success).toBe(false);
    const revision = { status: "known", revision: "bounded-hash" };
    expect(ReviewRevisionStateSchema.safeParse({ source: revision, completed: revision,
      current: { status: "unknown", reason: "changing" } }).success).toBe(true);
    expect(ReviewRevisionStateSchema.safeParse({ source: revision, completed: revision,
      current: { ...revision, contents: "private" } }).success).toBe(false);
  });

  test("accept the requests the parent surface actually sends", () => {
    expect(
      DelegatedTaskListArgsSchema.parse({ parentTaskId: "parent-1" }),
    ).toEqual({ parentTaskId: "parent-1", includeFinished: true });
    expect(
      DelegatedTaskFollowUpArgsSchema.safeParse({
        parentTaskId: "parent-1",
        delegationKey: "review.pass-1",
        prompt: "One more pass, please.",
        expected,
      }).success,
    ).toBe(true);
    expect(
      DelegatedTaskStopArgsSchema.safeParse({
        parentTaskId: "parent-1",
        delegationKey: "review.pass-1",
        reason: "No longer needed.",
        expected,
      }).success,
    ).toBe(true);
    expect(
      DelegatedTaskDetachArgsSchema.safeParse({
        parentTaskId: "parent-1",
        delegationKey: "review.pass-1",
        expected,
      }).success,
    ).toBe(true);
    expect(
      DelegatedTaskRetryArgsSchema.safeParse({
        repositoryPath: "/tmp/project",
        parentWorkspaceId: "workspace-parent-1",
        parentTaskId: "parent-1",
        delegationKey: "review.pass-1",
        prompt: "Try again.",
        expected,
      }).success,
    ).toBe(true);
    expect(
      DelegatedTaskLinkArgsSchema.safeParse({ delegatedTaskId: "child-1" }).success,
    ).toBe(true);
  });

  test("a follow-up leaves its permission policy to the recorded delegation", () => {
    const parsed = DelegatedTaskFollowUpArgsSchema.parse({
      parentTaskId: "parent-1",
      delegationKey: "review.pass-1",
      prompt: "One more pass, please.",
      expected,
    });
    expect(parsed.permissionProfile).toBeUndefined();
  });

  test("mutating controls cannot be sent without an expected identity", () => {
    expect(
      DelegatedTaskFollowUpArgsSchema.safeParse({
        parentTaskId: "parent-1",
        delegationKey: "review.pass-1",
        prompt: "One more pass, please.",
      }).success,
    ).toBe(false);
    expect(
      DelegatedTaskDetachArgsSchema.safeParse({
        parentTaskId: "parent-1",
        delegationKey: "review.pass-1",
      }).success,
    ).toBe(false);
    expect(
      DelegatedTaskRetryArgsSchema.safeParse({
        repositoryPath: "/tmp/project",
        parentWorkspaceId: "workspace-parent-1",
        parentTaskId: "parent-1",
        delegationKey: "review.pass-1",
        prompt: "Try again.",
      }).success,
    ).toBe(false);
  });

  test("reject renderer-only extras instead of forwarding them", () => {
    expect(
      DelegatedTaskStopArgsSchema.safeParse({
        parentTaskId: "parent-1",
        delegationKey: "review.pass-1",
        expected,
        force: true,
      }).success,
    ).toBe(false);
    expect(
      DelegatedTaskListArgsSchema.safeParse({
        parentTaskId: "parent-1",
        limit: 10,
      }).success,
    ).toBe(false);
  });

  test("reject a delegation key that could collide with ledger key syntax", () => {
    expect(
      DelegatedTaskStopArgsSchema.safeParse({
        parentTaskId: "parent-1",
        delegationKey: "review pass/1",
        expected,
      }).success,
    ).toBe(false);
  });

  test("a refusal always carries a sentence the surface can show as-is", () => {
    for (const reason of DelegatedTaskRejectionReasonSchema.options) {
      const message = describeDelegatedTaskRejection(reason);
      expect(message, `missing message for ${reason}`).toBeTruthy();
      expect(message.length).toBeLessThanOrEqual(500);
      const response = DelegatedTaskActionResponseSchema.parse({
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
    const parsed = DelegatedTaskActionResponseSchema.parse({
      accepted: true,
      duplicate: false,
      reason: null,
      child: null,
    });
    expect(parsed.message).toBeNull();
  });
});

describe("delegated task request context", () => {
  test("carries only account ids the account registry can name", () => {
    const accounts = { claudeAccountProfileId: "6f1d2c3b-4a5e-4f60-8a7b-9c0d1e2f3a4b", codexAccountProfileId: "system-default" };
    expect(DelegatedTaskRequestContextSchema.parse({ accounts })).toEqual({ accounts });
    expect(DelegatedTaskRequestContextSchema.parse({})).toEqual({});
    expect(DelegatedTaskRequestContextSchema.safeParse({ accounts: { claudeAccountProfileId: "../other-home" } }).success).toBe(false);
    // Nothing else rides along: no permissions, no unknown provider keys.
    expect(DelegatedTaskRequestContextSchema.safeParse({ accounts, permissionProfile: "auto" }).success).toBe(false);
    expect(DelegatedTaskRequestContextSchema.safeParse({ accounts: { ...accounts, cursorAccountProfileId: "system-default" } }).success).toBe(false);
  });

  test("the controls a user starts pass the context as a second argument", () => {
    for (const channel of ["delegations:create", "delegations:follow-up", "delegations:retry"]) {
      expect(mainSource).toMatch(new RegExp(`ipcMain\\.handle\\(\\s*"${channel}",\\s*async \\(_event, rawArgs: unknown, rawContext\\?: unknown\\)`));
      expect(preloadSource).toContain(`ipcRenderer.invoke("${channel}", args, context)`);
    }
  });
});
