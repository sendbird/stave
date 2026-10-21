import { describe, expect, test } from "bun:test";
import { resolveFleetQueueStatus } from "@/lib/fleet/fleet-queue-status";

const settled = { tracked: true, loaded: true, error: "" };

describe("resolveFleetQueueStatus", () => {
  test("is clear only when every tracked source answered with nothing", () => {
    expect(
      resolveFleetQueueStatus({ blockingCount: 0, itemCount: 0, resultReviews: settled }),
    ).toBe("clear");
  });

  test("does not claim clear when result reviews failed to load", () => {
    expect(
      resolveFleetQueueStatus({
        blockingCount: 0,
        itemCount: 0,
        resultReviews: { tracked: true, loaded: false, error: "Could not load" },
      }),
    ).toBe("incomplete");
    expect(
      resolveFleetQueueStatus({
        blockingCount: 0,
        itemCount: 0,
        resultReviews: { tracked: true, loaded: true, error: "Could not refresh" },
      }),
    ).toBe("incomplete");
  });

  test("is checking until result reviews load for the first time", () => {
    expect(
      resolveFleetQueueStatus({
        blockingCount: 0,
        itemCount: 0,
        resultReviews: { tracked: true, loaded: false, error: "" },
      }),
    ).toBe("checking");
  });

  test("ignores result reviews when no durable store feeds the queue", () => {
    expect(
      resolveFleetQueueStatus({
        blockingCount: 0,
        itemCount: 0,
        resultReviews: { tracked: false, loaded: false, error: "unavailable" },
      }),
    ).toBe("clear");
  });

  test("existing items win over the load state", () => {
    expect(
      resolveFleetQueueStatus({
        blockingCount: 1,
        itemCount: 3,
        resultReviews: { tracked: true, loaded: false, error: "x" },
      }),
    ).toBe("next");
    expect(
      resolveFleetQueueStatus({
        blockingCount: 0,
        itemCount: 2,
        resultReviews: { tracked: true, loaded: false, error: "x" },
      }),
    ).toBe("review");
  });
});
