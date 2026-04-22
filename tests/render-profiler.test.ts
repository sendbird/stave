import { describe, expect, test } from "bun:test";
import { resolveRenderProfilingEnabled } from "@/lib/render-profiler";

describe("resolveRenderProfilingEnabled", () => {
  test("enables profiling from query param", () => {
    expect(resolveRenderProfilingEnabled({ search: "?staveProfileRenders=1", localStorageValue: null })).toBe(true);
    expect(resolveRenderProfilingEnabled({ search: "?staveProfileRenders=true", localStorageValue: "0" })).toBe(true);
  });

  test("disables profiling from explicit false query param", () => {
    expect(resolveRenderProfilingEnabled({ search: "?staveProfileRenders=0", localStorageValue: "1" })).toBe(false);
  });

  test("falls back to localStorage when query param is absent", () => {
    expect(resolveRenderProfilingEnabled({ search: "", localStorageValue: "true" })).toBe(true);
    expect(resolveRenderProfilingEnabled({ search: "", localStorageValue: null })).toBe(false);
  });
});
