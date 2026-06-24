import { describe, expect, test } from "bun:test";
import {
  appendProviderOutputTruncationNotice,
  buildProviderOutputTruncationNotice,
  detectTruncationNotice,
  hasTruncationMarker,
  PROVIDER_MAX_TOKENS_TRUNCATION_NOTICE,
  PROVIDER_OUTPUT_OVERFLOW_TRUNCATION_NOTICE,
} from "@/lib/truncation-visibility";

describe("truncation visibility", () => {
  test("maps provider truncation stop reasons to user-facing notices", () => {
    expect(buildProviderOutputTruncationNotice("max_tokens")).toBe(
      PROVIDER_MAX_TOKENS_TRUNCATION_NOTICE,
    );
    expect(buildProviderOutputTruncationNotice("output_overflow")).toBe(
      PROVIDER_OUTPUT_OVERFLOW_TRUNCATION_NOTICE,
    );
    expect(buildProviderOutputTruncationNotice("end_turn")).toBeNull();
  });

  test("detects known truncation markers from transport and sanitization", () => {
    expect(hasTruncationMarker("before\n…<history truncated>…\nafter")).toBe(
      true,
    );
    expect(
      hasTruncationMarker(
        "[tool output truncated: original length 1000 exceeds the limit]",
      ),
    ).toBe(true);
    expect(hasTruncationMarker("ok\n…[truncated 5000 chars]…\nsummary")).toBe(
      true,
    );
    expect(hasTruncationMarker("normal output")).toBe(false);
  });

  test("returns source-specific warning copy", () => {
    expect(
      detectTruncationNotice({
        text: "[tool output truncated: original length 1000 exceeds the limit]",
        source: "tool_output",
      }),
    ).toEqual({
      title: "Output truncated",
      description:
        "The tool output was shortened before display or model reuse. The visible output may be incomplete.",
    });
  });

  test("appends provider notice once and reuses existing runtime notices", () => {
    expect(
      appendProviderOutputTruncationNotice({
        parts: [],
        stopReason: "output_overflow",
      }),
    ).toEqual([
      {
        type: "system_event",
        content: PROVIDER_OUTPUT_OVERFLOW_TRUNCATION_NOTICE,
      },
    ]);

    const existing = [
      {
        type: "system_event" as const,
        content:
          "Claude turn output was truncated in non-stream replay because the retained snapshot limit was exceeded.",
      },
    ];
    expect(
      appendProviderOutputTruncationNotice({
        parts: existing,
        stopReason: "output_overflow",
      }),
    ).toBe(existing);
  });
});
