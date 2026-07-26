import { describe, expect, test } from "bun:test";
import {
  canTakeOverTask,
  isExternallyManagedTask,
  isTaskManaged,
} from "../src/lib/tasks";

describe("task control ownership", () => {
  test("keeps public externally managed tasks monitor-only", () => {
    const task = {
      controlMode: "managed" as const,
      controlOwner: "external" as const,
    };

    expect(isTaskManaged(task)).toBe(true);
    expect(isExternallyManagedTask(task)).toBe(true);
    expect(canTakeOverTask({ task, activeTurnId: null })).toBe(true);
    expect(canTakeOverTask({ task, activeTurnId: "turn-1" })).toBe(
      false,
    );
  });

  test("allows inactive locally managed tasks to fall back to manual takeover", () => {
    const task = {
      controlMode: "managed" as const,
      controlOwner: "stave" as const,
    };

    expect(isTaskManaged(task)).toBe(true);
    expect(isExternallyManagedTask(task)).toBe(false);
    expect(canTakeOverTask({ task, activeTurnId: null })).toBe(true);
    expect(canTakeOverTask({ task, activeTurnId: "turn-1" })).toBe(
      false,
    );
  });

  test("preserves legacy interactive defaults", () => {
    expect(isTaskManaged(undefined)).toBe(false);
    expect(isExternallyManagedTask(undefined)).toBe(false);
  });
});
