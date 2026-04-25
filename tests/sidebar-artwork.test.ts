import { describe, expect, it } from "bun:test";
import {
  DEFAULT_SIDEBAR_ARTWORK_MODE,
  SIDEBAR_ARTWORK_OPTIONS,
  normalizeSidebarArtworkMode,
  resolveSidebarArtworkClass,
} from "@/lib/themes";

describe("sidebar artwork settings", () => {
  it("defaults to space haze", () => {
    expect(DEFAULT_SIDEBAR_ARTWORK_MODE).toBe("space-haze");
  });

  it("normalizes invalid persisted values back to the default", () => {
    expect(normalizeSidebarArtworkMode(undefined)).toBe("space-haze");
    expect(normalizeSidebarArtworkMode("unknown-mode")).toBe("space-haze");
  });

  it("keeps all artwork option values unique", () => {
    const values = SIDEBAR_ARTWORK_OPTIONS.map((option) => option.value);
    expect(new Set(values).size).toBe(values.length);
  });

  it("maps each artwork mode to a sidebar class", () => {
    expect(
      resolveSidebarArtworkClass({ mode: "space-haze" }),
    ).toBe("sidebar-liquid-glass--space-haze");
    expect(
      resolveSidebarArtworkClass({ mode: "wave-aurora" }),
    ).toBe("sidebar-liquid-glass--wave-aurora");
    expect(
      resolveSidebarArtworkClass({ mode: "gravity-paint" }),
    ).toBe("sidebar-liquid-glass--gravity-paint");
  });
});
