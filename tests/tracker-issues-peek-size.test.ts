import { describe, expect, it } from "bun:test";

import {
  ADS_PEEK_SPLIT_DEFAULT_PX,
  clampTrackerIssuesPeekWidth,
  parseTrackerIssuesPeekWidth,
  TRACKER_ISSUES_PEEK_DEFAULT_PX,
  TRACKER_ISSUES_PEEK_MAX_PX,
  TRACKER_ISSUES_PEEK_MIN_PX,
} from "@/lib/tracker-issues/peek-size";

describe("tracker issues peek size", () => {
  it("opens wider than the ADS split default", () => {
    expect(TRACKER_ISSUES_PEEK_DEFAULT_PX).toBeGreaterThan(
      ADS_PEEK_SPLIT_DEFAULT_PX,
    );
  });

  it("clamps to the persisted bounds", () => {
    expect(clampTrackerIssuesPeekWidth(12)).toBe(TRACKER_ISSUES_PEEK_MIN_PX);
    expect(clampTrackerIssuesPeekWidth(9_000)).toBe(TRACKER_ISSUES_PEEK_MAX_PX);
    expect(clampTrackerIssuesPeekWidth(512.4)).toBe(512);
  });

  it("salvages stored values instead of throwing", () => {
    expect(parseTrackerIssuesPeekWidth("560")).toBe(560);
    expect(parseTrackerIssuesPeekWidth("wide")).toBe(
      TRACKER_ISSUES_PEEK_DEFAULT_PX,
    );
    expect(parseTrackerIssuesPeekWidth(null)).toBe(
      TRACKER_ISSUES_PEEK_DEFAULT_PX,
    );
  });
});
