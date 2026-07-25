import { describe, expect, test } from "bun:test";
import {
  consumeComparePreparationRequest,
  requestComparePreparation,
  subscribeComparePreparationRequest,
} from "@/components/compare/compare-prepare-request";

describe("compare preparation requests", () => {
  test("keeps an unmounted task request until its composer consumes it", () => {
    const taskId = `unmounted-${crypto.randomUUID()}`;

    expect(requestComparePreparation(taskId)).toBe(true);
    expect(consumeComparePreparationRequest(taskId)).toMatchObject({ taskId });
    expect(consumeComparePreparationRequest(taskId)).toBeNull();
  });

  test("notifies mounted composers without leaking the request to siblings", () => {
    const taskId = `mounted-${crypto.randomUUID()}`;
    const siblingTaskId = `sibling-${crypto.randomUUID()}`;
    let notifications = 0;
    const unsubscribe = subscribeComparePreparationRequest(() => {
      notifications += 1;
    });

    expect(requestComparePreparation(taskId)).toBe(true);
    expect(notifications).toBe(1);
    expect(consumeComparePreparationRequest(siblingTaskId)).toBeNull();
    expect(consumeComparePreparationRequest(taskId)).toMatchObject({ taskId });

    unsubscribe();
  });

  test("rejects empty task targets", () => {
    expect(requestComparePreparation("   ")).toBe(false);
  });
});
