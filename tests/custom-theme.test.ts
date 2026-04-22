import { describe, expect, it } from "bun:test";
import {
  BUILTIN_CUSTOM_THEMES,
  BUILTIN_THEME_TOKEN_NAMES,
  buildCustomThemeCss,
  exportCustomThemeJson,
  findCustomThemeById,
  listAllCustomThemes,
  parseCustomThemeFile,
  validateCustomThemeJson,
} from "@/lib/themes";

// ---------------------------------------------------------------------------
// validateCustomThemeJson
// ---------------------------------------------------------------------------

describe("validateCustomThemeJson", () => {
  const validTheme = {
    id: "my-cool-theme",
    name: "My Cool Theme",
    description: "A test theme",
    baseMode: "dark",
    version: "1.0.0",
    author: "Tester",
    tokens: {
      background: "#000000",
      foreground: "#FFFFFF",
    },
  };

  it("accepts a valid theme definition", () => {
    const result = validateCustomThemeJson({ data: validTheme });
    expect(result.ok).toBe(true);
    expect(result.theme).toBeDefined();
    expect(result.theme!.id).toBe("my-cool-theme");
  });

  it("rejects missing id", () => {
    const data = { ...validTheme, id: "" };
    const result = validateCustomThemeJson({ data });
    expect(result.ok).toBe(false);
    expect(result.errors?.some((e) => e.includes("id"))).toBe(true);
  });

  it("rejects invalid id format", () => {
    const data = { ...validTheme, id: "My Theme!" };
    const result = validateCustomThemeJson({ data });
    expect(result.ok).toBe(false);
    expect(result.errors?.some((e) => e.includes("id"))).toBe(true);
  });

  it("rejects invalid baseMode", () => {
    const data = { ...validTheme, baseMode: "blue" };
    const result = validateCustomThemeJson({ data });
    expect(result.ok).toBe(false);
  });

  it("rejects theme with no tokens", () => {
    const data = { ...validTheme, tokens: {} };
    const result = validateCustomThemeJson({ data });
    expect(result.ok).toBe(false);
    expect(result.errors?.some((e) => e.includes("token"))).toBe(true);
  });

  it("rejects collision with built-in theme id", () => {
    const data = { ...validTheme, id: "dark-high-contrast" };
    const result = validateCustomThemeJson({ data });
    expect(result.ok).toBe(false);
    expect(result.errors?.some((e) => e.includes("built-in"))).toBe(true);
  });

  it("rejects collision with existing user theme id", () => {
    const result = validateCustomThemeJson({
      data: validTheme,
      existingIds: ["my-cool-theme"],
    });
    expect(result.ok).toBe(false);
    expect(result.errors?.some((e) => e.includes("already installed"))).toBe(true);
  });

  it("rejects completely invalid data", () => {
    const result = validateCustomThemeJson({ data: "not an object" });
    expect(result.ok).toBe(false);
    expect(result.errors!.length).toBeGreaterThan(0);
  });

  it("rejects tokens with dangerous CSS characters", () => {
    const data = { ...validTheme, tokens: { background: "red; } body { color: evil" } };
    const result = validateCustomThemeJson({ data });
    expect(result.ok).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// parseCustomThemeFile
// ---------------------------------------------------------------------------

describe("parseCustomThemeFile", () => {
  it("parses valid JSON text", () => {
    const text = JSON.stringify({
      id: "file-theme",
      name: "File Theme",
      description: "From file",
      baseMode: "light",
      tokens: { primary: "#FF0000" },
    });
    const result = parseCustomThemeFile({ text });
    expect(result.ok).toBe(true);
    expect(result.theme!.id).toBe("file-theme");
  });

  it("rejects invalid JSON text", () => {
    const result = parseCustomThemeFile({ text: "{bad json" });
    expect(result.ok).toBe(false);
    expect(result.errors?.some((e) => e.includes("JSON"))).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// exportCustomThemeJson
// ---------------------------------------------------------------------------

describe("exportCustomThemeJson", () => {
  it("produces valid JSON that round-trips", () => {
    const theme = BUILTIN_CUSTOM_THEMES[0]!;
    const json = exportCustomThemeJson({ theme });
    const parsed = JSON.parse(json);
    expect(parsed.id).toBe(theme.id);
    expect(parsed.name).toBe(theme.name);
    expect(parsed.tokens).toEqual(theme.tokens);
  });
});

// ---------------------------------------------------------------------------
// buildCustomThemeCss
// ---------------------------------------------------------------------------

describe("buildCustomThemeCss", () => {
  it("generates .dark selector for dark baseMode", () => {
    const css = buildCustomThemeCss({
      theme: { id: "t", name: "t", description: "", baseMode: "dark", tokens: { background: "#000" } },
    });
    expect(css).toContain(".dark{");
    expect(css).toContain("--background: #000;");
  });

  it("generates :root selector for light baseMode", () => {
    const css = buildCustomThemeCss({
      theme: { id: "t", name: "t", description: "", baseMode: "light", tokens: { foreground: "#FFF" } },
    });
    expect(css).toContain(":root{");
    expect(css).toContain("--foreground: #FFF;");
  });

  it("returns empty string when tokens are empty", () => {
    const css = buildCustomThemeCss({
      theme: { id: "t", name: "t", description: "", baseMode: "dark", tokens: {} },
    });
    expect(css).toBe("");
  });
});

// ---------------------------------------------------------------------------
// findCustomThemeById / listAllCustomThemes
// ---------------------------------------------------------------------------

describe("findCustomThemeById", () => {
  it("finds a built-in theme", () => {
    const theme = findCustomThemeById({ themeId: "dark-high-contrast" });
    expect(theme).toBeDefined();
    expect(theme!.name).toBe("Dark High Contrast");
  });

  it("finds a user theme when provided", () => {
    const userTheme = { id: "user-1", name: "User 1", description: "", baseMode: "dark" as const, tokens: {} };
    const theme = findCustomThemeById({ themeId: "user-1", userThemes: [userTheme] });
    expect(theme).toBeDefined();
    expect(theme!.id).toBe("user-1");
  });

  it("returns null for unknown id", () => {
    expect(findCustomThemeById({ themeId: "nonexistent" })).toBeNull();
  });
});

describe("listAllCustomThemes", () => {
  it("returns built-in themes when no user themes", () => {
    const themes = listAllCustomThemes({});
    expect(themes.length).toBe(BUILTIN_CUSTOM_THEMES.length);
  });

  it("merges user themes after built-in themes", () => {
    const userTheme = { id: "user-1", name: "User 1", description: "", baseMode: "dark" as const, tokens: {} };
    const themes = listAllCustomThemes({ userThemes: [userTheme] });
    expect(themes.length).toBe(BUILTIN_CUSTOM_THEMES.length + 1);
    expect(themes[themes.length - 1]!.id).toBe("user-1");
  });
});

// ---------------------------------------------------------------------------
// BUILTIN_CUSTOM_THEMES integrity
// ---------------------------------------------------------------------------

describe("BUILTIN_CUSTOM_THEMES", () => {
  it("tracks PromptInput role tokens in the built-in token registry", () => {
    expect(BUILTIN_THEME_TOKEN_NAMES).toEqual(
      expect.arrayContaining([
        "prompt-role-plan",
        "prompt-role-thinking",
        "prompt-role-effort",
        "prompt-role-fast",
        "prompt-mode-manual",
        "prompt-mode-guided",
        "prompt-mode-auto",
        "prompt-mode-custom",
      ]),
    );
  });

  it("includes Dark High Contrast", () => {
    const theme = BUILTIN_CUSTOM_THEMES.find((t) => t.id === "dark-high-contrast");
    expect(theme).toBeDefined();
    expect(theme!.baseMode).toBe("dark");
    expect(theme!.tokens.background).toBe("#000000");
    expect(theme!.tokens.foreground).toBe("#FFFFFF");
  });

  it("includes the new VS Code-inspired presets", () => {
    const ids = BUILTIN_CUSTOM_THEMES.map((theme) => theme.id);
    expect(ids).toEqual(
      expect.arrayContaining([
        "github-light-default",
        "github-dark-default",
        "one-light",
        "one-dark-pro",
        "dracula",
        "ayu-light",
        "ayu-mirage",
        "night-owl-light",
        "night-owl",
        "tokyo-night-light",
        "tokyo-night",
        "solarized-light",
        "light-modern",
      ]),
    );
  });

  it("keeps light and dark preset counts balanced", () => {
    const counts = BUILTIN_CUSTOM_THEMES.reduce(
      (acc, theme) => {
        acc[theme.baseMode] += 1;
        return acc;
      },
      { light: 0, dark: 0 },
    );

    expect(counts.light).toBe(counts.dark);
  });

  it("all built-in themes have unique ids", () => {
    const ids = BUILTIN_CUSTOM_THEMES.map((t) => t.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("all built-in themes define every required token", () => {
    for (const theme of BUILTIN_CUSTOM_THEMES) {
      const missingTokens = BUILTIN_THEME_TOKEN_NAMES.filter((token) => !(token in theme.tokens));
      expect(missingTokens).toEqual([]);
    }
  });
});
