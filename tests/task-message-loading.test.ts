import { describe, expect, test } from "bun:test";
import { resolveInitialLatestTaskMessagesPageSize } from "@/store/task-message-loading";

describe("resolveInitialLatestTaskMessagesPageSize", () => {
  test("clamps to a smaller page on short viewports", () => {
    expect(
      resolveInitialLatestTaskMessagesPageSize({ viewportHeightPx: 720 }),
    ).toBe(24);
  });

  test("scales with a typical desktop viewport", () => {
    expect(
      resolveInitialLatestTaskMessagesPageSize({ viewportHeightPx: 900 }),
    ).toBe(27);
    expect(
      resolveInitialLatestTaskMessagesPageSize({ viewportHeightPx: 1080 }),
    ).toBe(36);
  });

  test("caps large displays instead of eagerly loading huge histories", () => {
    expect(
      resolveInitialLatestTaskMessagesPageSize({ viewportHeightPx: 1600 }),
    ).toBe(48);
  });
});
