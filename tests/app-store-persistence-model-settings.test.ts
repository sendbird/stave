import { describe, expect, test } from "bun:test";
import { normalizeAutoDefaultProviderModel } from "@/store/app-store-persistence";

describe("normalizeAutoDefaultProviderModel", () => {
  test("settles a provider auto id on the auto row", () => {
    expect(
      normalizeAutoDefaultProviderModel({
        value: "auto-smart[optimize_for=balanced]",
        fallback: "auto",
      }),
    ).toBe("auto");
  });

  test("leaves a pinned model alone", () => {
    expect(
      normalizeAutoDefaultProviderModel({
        value: " grok-4.6[effort=high,fast=true] ",
        fallback: "auto",
      }),
    ).toBe("grok-4.6[effort=high,fast=true]");
  });

  test("falls back when nothing was stored", () => {
    expect(
      normalizeAutoDefaultProviderModel({ value: "  ", fallback: "auto" }),
    ).toBe("auto");
    expect(
      normalizeAutoDefaultProviderModel({ value: undefined, fallback: "auto" }),
    ).toBe("auto");
  });
});
