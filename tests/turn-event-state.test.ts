import { describe, expect, test } from "bun:test";

import {
  extractOutputUrls,
  toAgentRunState,
  toDiffRunState,
  toFileChangeRunState,
  toMeasuredDurationMs,
  toUrlSource,
} from "@/components/session/message/turn-event-state";

describe("toAgentRunState", () => {
  test("maps both input phases onto one running state", () => {
    // The difference between "arguments still arriving" and "call is out" is
    // not something a reader can act on, and ADS `running` already carries the
    // live clock and the open payload both need.
    expect(toAgentRunState("input-streaming")).toBe("running");
    expect(toAgentRunState("input-available")).toBe("running");
  });

  test("maps terminal states onto the shared vocabulary", () => {
    expect(toAgentRunState("output-available")).toBe("done");
    expect(toAgentRunState("output-error")).toBe("failed");
    expect(toAgentRunState(undefined)).toBe("pending");
  });
});

describe("toDiffRunState", () => {
  test("keeps accept, reject, and pending as distinct words", () => {
    expect(toDiffRunState("accepted")).toBe("done");
    expect(toDiffRunState("rejected")).toBe("denied");
    expect(toDiffRunState("pending")).toBe("pending");
  });
});

describe("toFileChangeRunState", () => {
  test("maps the shared provider payload without calling a skip a cancel", () => {
    expect(toFileChangeRunState("applied")).toBe("done");
    expect(toFileChangeRunState("skipped")).toBe("skipped");
    expect(toFileChangeRunState("failed")).toBe("failed");
  });
});

describe("toMeasuredDurationMs", () => {
  test("returns nothing when nothing was measured", () => {
    // §6: given no measurement the component must render no duration, so the
    // absent value has to survive the whole way down rather than becoming 0.
    expect(toMeasuredDurationMs(undefined)).toBeUndefined();
    expect(toMeasuredDurationMs(Number.NaN)).toBeUndefined();
    expect(toMeasuredDurationMs(-1)).toBeUndefined();
  });

  test("keeps sub-second measurements instead of rounding them up", () => {
    expect(toMeasuredDurationMs(0.4)).toBe(400);
    expect(toMeasuredDurationMs(12)).toBe(12_000);
    expect(toMeasuredDurationMs(0)).toBe(0);
  });
});

describe("extractOutputUrls", () => {
  test("de-duplicates in first-seen order and drops sentence punctuation", () => {
    expect(
      extractOutputUrls(
        "See https://stave.dev/install. Also https://example.com/a, and https://stave.dev/install again.",
      ),
    ).toEqual(["https://stave.dev/install", "https://example.com/a"]);
  });

  test("ignores output with no links", () => {
    expect(extractOutputUrls("no links here")).toEqual([]);
    expect(extractOutputUrls(undefined)).toEqual([]);
  });

  test("does not swallow a trailing bracket or quote", () => {
    expect(extractOutputUrls('("https://stave.dev/a")')).toEqual([
      "https://stave.dev/a",
    ]);
  });
});

describe("toUrlSource", () => {
  test("reduces a URL to the host that grounded the claim", () => {
    expect(toUrlSource("https://stave.dev/install#packaged")).toBe("stave.dev");
  });

  test("falls back to the raw value rather than throwing", () => {
    expect(toUrlSource("not a url")).toBe("not a url");
  });
});
