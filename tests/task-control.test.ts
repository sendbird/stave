import { describe, expect, test } from "bun:test";
import {
  canTakeOverTask,
  isExternallyManagedTask,
  isTaskManaged,
} from "../src/lib/tasks";

describe("task control ownership", () => {
  test("allows public externally managed tasks to be taken over while active", () => {
    const task = {
      controlMode: "managed" as const,
      controlOwner: "external" as const,
    };

    expect(isTaskManaged(task)).toBe(true);
    expect(isExternallyManagedTask(task)).toBe(true);
    expect(canTakeOverTask({ task })).toBe(true);
  });

  test("allows locally managed tasks to fall back to manual takeover", () => {
    const task = {
      controlMode: "managed" as const,
      controlOwner: "stave" as const,
    };

    expect(isTaskManaged(task)).toBe(true);
    expect(isExternallyManagedTask(task)).toBe(false);
    expect(canTakeOverTask({ task })).toBe(true);
  });

  test("preserves legacy interactive defaults", () => {
    expect(isTaskManaged(undefined)).toBe(false);
    expect(isExternallyManagedTask(undefined)).toBe(false);
  });
});
