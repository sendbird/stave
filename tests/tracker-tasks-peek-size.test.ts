import { describe, expect, it } from "bun:test";

import {
  ADS_PEEK_SPLIT_DEFAULT_PX,
  clampTrackerTasksPeekWidth,
  parseTrackerTasksPeekWidth,
  TRACKER_TASKS_PEEK_DEFAULT_PX,
  TRACKER_TASKS_PEEK_MAX_PX,
  TRACKER_TASKS_PEEK_MIN_PX,
} from "@/lib/tracker-tasks/peek-size";

describe("tracker tasks peek size", () => {
  it("opens wider than the ADS split default", () => {
    expect(TRACKER_TASKS_PEEK_DEFAULT_PX).toBeGreaterThan(
      ADS_PEEK_SPLIT_DEFAULT_PX,
    );
  });

  it("clamps to the persisted bounds", () => {
    expect(clampTrackerTasksPeekWidth(12)).toBe(TRACKER_TASKS_PEEK_MIN_PX);
    expect(clampTrackerTasksPeekWidth(9_000)).toBe(TRACKER_TASKS_PEEK_MAX_PX);
    expect(clampTrackerTasksPeekWidth(512.4)).toBe(512);
  });

  it("salvages stored values instead of throwing", () => {
    expect(parseTrackerTasksPeekWidth("560")).toBe(560);
    expect(parseTrackerTasksPeekWidth("wide")).toBe(
      TRACKER_TASKS_PEEK_DEFAULT_PX,
    );
    expect(parseTrackerTasksPeekWidth(null)).toBe(
      TRACKER_TASKS_PEEK_DEFAULT_PX,
    );
  });
});
