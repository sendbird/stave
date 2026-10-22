import { afterEach, describe, expect, test } from "bun:test";
import {
  EMPTY_FLEET_ATTENTION,
  publishFleetAttention,
  useFleetAttentionStore,
} from "@/store/fleet-attention-store";

afterEach(() => {
  useFleetAttentionStore.setState({ snapshot: EMPTY_FLEET_ATTENTION });
});

describe("Fleet attention store", () => {
  test("claims nothing before the producer has published", () => {
    const { snapshot } = useFleetAttentionStore.getState();
    expect(snapshot.queueStatus).toBe("checking");
    expect(snapshot.count).toBe(0);
  });

  test("every reader sees the one published snapshot", () => {
    const published = {
      ...EMPTY_FLEET_ATTENTION,
      count: 2,
      queueStatus: "next" as const,
    };
    publishFleetAttention(published);
    expect(useFleetAttentionStore.getState().snapshot).toBe(published);
    // Publishing the same snapshot again does not notify subscribers.
    let notified = 0;
    const unsubscribe = useFleetAttentionStore.subscribe(() => {
      notified += 1;
    });
    publishFleetAttention(published);
    unsubscribe();
    expect(notified).toBe(0);
  });
});
