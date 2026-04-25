import { describe, expect, test } from "bun:test";
import {
  buildCommandPaletteItems,
  filterCommandPaletteItems,
  getActiveSlashCommandTokenMatch,
  resolveCommandInput,
  type CommandContext,
} from "@/lib/commands";
import type { ProviderCommandCatalogState } from "@/lib/providers/provider-command-catalog";

const claudeCommandCatalog: ProviderCommandCatalogState = {
  providerId: "claude-code",
  status: "ready",
  detail: "Loaded 3 Claude native commands.",
  commands: [
    {
      name: "keybindings-help",
      command: "/keybindings-help",
      description: "Customize keyboard shortcuts and keybindings",
    },
    {
      name: "simplify",
      command: "/simplify",
      description: "Review and improve changed code for quality and efficiency",
    },
    {
      name: "claude-api",
      command: "/claude-api",
      description: "Help build apps with the Claude API or Anthropic SDK",
    },
  ],
};

function createContext(
  overrides: Partial<CommandContext> = {},
): CommandContext {
  return {
    provider: "codex",
    ...overrides,
  };
}

describe("resolveCommandInput", () => {
  test("returns not-command for plain text", () => {
    expect(resolveCommandInput("hello world", createContext())).toEqual({
      kind: "not-command",
    });
  });

  test("passes slash commands through to the provider unchanged", () => {
    expect(resolveCommandInput("/review", createContext())).toEqual({
      kind: "provider-passthrough",
      command: "/review",
      rawArgs: "",
    });
  });

  test("keeps provider-native and plugin-provided slash commands untouched", () => {
    expect(
      resolveCommandInput(
        "/ralph-loop",
        createContext({ provider: "claude-code" }),
      ),
    ).toEqual({
      kind: "provider-passthrough",
      command: "/ralph-loop",
      rawArgs: "",
    });

    expect(
      resolveCommandInput(
        "/claude:review",
        createContext({ provider: "claude-code" }),
      ),
    ).toEqual({
      kind: "provider-passthrough",
      command: "/claude:review",
      rawArgs: "",
    });
  });

  test("no longer intercepts /stave:* locally", () => {
    expect(resolveCommandInput("/stave:status", createContext())).toEqual({
      kind: "provider-passthrough",
      command: "/stave:status",
      rawArgs: "",
    });
  });
});

describe("getActiveSlashCommandTokenMatch", () => {
  test("detects slash commands at the start of the draft", () => {
    expect(
      getActiveSlashCommandTokenMatch({
        value: "/simp",
        caretIndex: 5,
      }),
    ).toEqual({
      start: 0,
      end: 5,
      query: "simp",
      token: "/simp",
    });
  });

  test("detects slash commands anywhere in the current line", () => {
    const value = "Please run /claude-a";
    expect(
      getActiveSlashCommandTokenMatch({
        value,
        caretIndex: value.length,
      }),
    ).toEqual({
      start: 11,
      end: value.length,
      query: "claude-a",
      token: "/claude-a",
    });
  });

  test("ignores slash text inside other words or after arguments", () => {
    expect(
      getActiveSlashCommandTokenMatch({
        value: "abc/review",
        caretIndex: 10,
      }),
    ).toBeNull();

    expect(
      getActiveSlashCommandTokenMatch({
        value: "/review now",
        caretIndex: 11,
      }),
    ).toBeNull();
  });
});

describe("buildCommandPaletteItems", () => {
  test("lists only provider-native commands from the loaded catalog", () => {
    const palette = buildCommandPaletteItems({
      provider: "claude-code",
      providerCommandCatalog: claudeCommandCatalog,
    });

    expect(palette.items.map((item) => item.command)).toEqual([
      "/claude-api",
      "/keybindings-help",
      "/simplify",
    ]);
    expect(palette.providerNote.title).toBe("Claude native commands");
  });

  test("lists the bundled Codex slash commands when the provider catalog is ready", () => {
    const palette = buildCommandPaletteItems({
      provider: "codex",
      providerCommandCatalog: {
        providerId: "codex",
        status: "ready",
        detail: "Loaded bundled Codex slash commands.",
        commands: [
          {
            name: "model",
            command: "/model",
            description: "Choose the active model.",
          },
          {
            name: "review",
            command: "/review",
            description: "Review the current working tree.",
          },
        ],
      },
    });

    expect(palette.items.map((item) => item.command)).toEqual([
      "/model",
      "/review",
    ]);
    expect(palette.providerNote.title).toBe("Codex slash commands");
    expect(palette.providerNote.description).toContain("Codex slash commands");
  });
});

describe("filterCommandPaletteItems", () => {
  test("matches provider-native commands by bare command name", () => {
    const palette = buildCommandPaletteItems({
      provider: "claude-code",
      providerCommandCatalog: claudeCommandCatalog,
    });

    expect(
      filterCommandPaletteItems({
        items: palette.items,
        query: "simp",
      }).map((item) => item.command),
    ).toEqual(["/simplify"]);

    expect(
      filterCommandPaletteItems({
        items: palette.items,
        query: "/claude",
      }).map((item) => item.command),
    ).toEqual(["/claude-api"]);
  });
});
