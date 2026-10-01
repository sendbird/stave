import { afterEach, describe, expect, test } from "bun:test";
import {
  callerKeyForTask,
  clearCallerGrantsForTest,
  registerCallerGrant,
  resolveCallerGrant,
  setCallerGrantSecretSource,
} from "../electron/providers/caller-grants";
import { readTurnGrantHeaders, turnGrantHeaders } from "../electron/providers/stave-turn-grants";
import { callerTaskId } from "../electron/main/stave-mcp-caller";

afterEach(() => clearCallerGrantsForTest());

const grant = { taskId: "task-a", turnId: "turn-1", workspaceId: "ws-1", providerId: "codex" as const, autonomy: "ask" as const };

describe("caller grants", () => {
  test("a key resolves to its task only while the turn is live", () => {
    const handle = registerCallerGrant(grant);
    expect(resolveCallerGrant(handle.key)).toMatchObject({ taskId: "task-a", turnId: "turn-1", autonomy: "ask" });
    expect(resolveCallerGrant("forged")).toBeNull();
    handle.revoke();
    expect(resolveCallerGrant(handle.key)).toBeNull();
  });

  test("the key is stable per task across restarts that keep the secret, and differs per task", () => {
    setCallerGrantSecretSource(() => "s".repeat(64));
    const first = callerKeyForTask("task-a");
    setCallerGrantSecretSource(() => "s".repeat(64));
    expect(callerKeyForTask("task-a")).toBe(first);
    expect(callerKeyForTask("task-b")).not.toBe(first);
  });

  test("a later turn's grant is not revoked by an earlier turn ending", () => {
    const earlier = registerCallerGrant(grant);
    const later = registerCallerGrant({ ...grant, turnId: "turn-2" });
    earlier.revoke();
    expect(resolveCallerGrant(later.key)?.turnId).toBe("turn-2");
  });

  test("the key travels as a header and reads back", () => {
    expect(readTurnGrantHeaders(turnGrantHeaders({ callerKey: "k" })).callerKey).toBe("k");
  });

  test("a turn acts only for its own task; an external client names its task", () => {
    const caller = { kind: "turn" as const, grant };
    expect(callerTaskId(caller)).toBe("task-a");
    expect(callerTaskId(caller, "task-a")).toBe("task-a");
    expect(() => callerTaskId(caller, "task-b")).toThrow("calling task");
    expect(callerTaskId({ kind: "external" }, "task-b")).toBe("task-b");
    expect(() => callerTaskId({ kind: "external" })).toThrow();
  });
});
