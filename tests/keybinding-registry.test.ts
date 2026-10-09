import { describe, expect, test } from "bun:test";
import { DEFAULT_APP_SHORTCUT_KEYS } from "@/lib/app-shortcuts";
import {
  formatKeySequenceForDocs,
  formatKeySequenceParts,
  keySequencesOverlap,
  matchesKeyStep,
  parseKeySequence,
  parseKeyStep,
  resolveKeybindingPlatform,
} from "@/lib/keybindings/key-chord";
import {
  findKeybindingConflicts,
  keybindingsCanCoexist,
} from "@/lib/keybindings/keybinding-conflicts";
import {
  getDefaultKeybindingKeys,
  getKeybinding,
  KEYBINDING_REGISTRY,
  matchesKeybinding,
  type KeybindingEntry,
} from "@/lib/keybindings/keybinding-registry";
import { scopesOverlap } from "@/lib/keybindings/keybinding-scopes";
import { resolveKeybindingKeys } from "@/lib/keybindings/keybinding-settings";

const ENTRIES = KEYBINDING_REGISTRY as readonly KeybindingEntry[];

function entry(overrides: Partial<KeybindingEntry> & { id: string }): KeybindingEntry {
  return {
    keys: [],
    scope: "global",
    editable: "allow",
    titleKey: "shell:keybindings.entries.undo.title",
    descriptionKey: "shell:keybindings.entries.undo.description",
    section: "editing",
    handledBy: [],
    ...overrides,
  };
}

describe("keybinding registry", () => {
  test("ids are unique and every key string parses", () => {
    const ids = ENTRIES.map((item) => item.id);
    expect(new Set(ids).size).toBe(ids.length);
    for (const item of ENTRIES) {
      for (const platform of ["mac", "windows", "linux"] as const) {
        for (const value of getDefaultKeybindingKeys(item, platform)) {
          expect(() => parseKeySequence(value)).not.toThrow();
        }
      }
    }
  });

  test("looks entries up by id", () => {
    expect(getKeybinding("tabs.reopen-closed").keys).toEqual(["mod+shift+t"]);
    expect(getKeybinding("navigation.back").editable).toBe("block");
    expect(getKeybinding("missing.id")).toBeNull();
  });

  test("keeps every Cmd/Ctrl+K chord on its existing default key", () => {
    for (const [id, key] of Object.entries(DEFAULT_APP_SHORTCUT_KEYS)) {
      expect(getKeybinding(id)?.keys).toEqual([`mod+k mod?+${key}`]);
    }
  });

  test("has no conflicting keys in scopes that are live together", () => {
    expect(findKeybindingConflicts({ entries: ENTRIES })).toEqual([]);
  });

  test("per-platform keys replace the defaults", () => {
    const quit = getKeybinding("app.quit");
    expect(getDefaultKeybindingKeys(quit, "mac")).toEqual(["meta+q"]);
    expect(getDefaultKeybindingKeys(quit, "windows")).toEqual([]);
    expect(getDefaultKeybindingKeys(getKeybinding("task.new"), "linux")).toEqual([
      "mod+shift?+alt?+n",
    ]);
  });

  test("applies the Settings choice for customized shortcuts", () => {
    const explorer = getKeybinding("view.show-explorer");
    expect(
      resolveKeybindingKeys(explorer, {
        platform: "mac",
        settings: { appShortcutKeys: { "view.show-explorer": "x" } },
      }),
    ).toEqual(["mod+k mod?+x"]);
    expect(
      resolveKeybindingKeys(explorer, {
        platform: "mac",
        settings: { appShortcutKeys: { "view.show-explorer": "" } },
      }),
    ).toEqual([]);
    expect(
      resolveKeybindingKeys(getKeybinding("composer.stage-comment"), {
        platform: "mac",
        settings: { promptCommentShortcut: "shift-enter" },
      }),
    ).toEqual(["shift+enter"]);
    expect(
      resolveKeybindingKeys(getKeybinding("lens.visual-comment"), {
        platform: "mac",
        settings: { visualCommentShortcut: "disabled" },
      }),
    ).toEqual([]);
  });
});

describe("key matching", () => {
  test("mod is Cmd or Ctrl and other modifiers must match", () => {
    const step = parseKeyStep("mod+shift+t");
    expect(matchesKeyStep(step, { key: "T", metaKey: true, shiftKey: true })).toBe(true);
    expect(matchesKeyStep(step, { key: "T", ctrlKey: true, shiftKey: true })).toBe(true);
    expect(matchesKeyStep(step, { key: "t", metaKey: true })).toBe(false);
    expect(
      matchesKeyStep(step, { key: "T", metaKey: true, shiftKey: true, altKey: true }),
    ).toBe(false);
  });

  test("optional modifiers may be up or down", () => {
    const step = parseKeyStep("mod+shift?+n");
    expect(matchesKeyStep(step, { key: "n", ctrlKey: true })).toBe(true);
    expect(matchesKeyStep(step, { key: "N", ctrlKey: true, shiftKey: true })).toBe(true);
  });

  test("ctrl means the Control key itself", () => {
    const step = parseKeyStep("ctrl+1-9");
    expect(matchesKeyStep(step, { key: "3", code: "Digit3", ctrlKey: true })).toBe(true);
    expect(matchesKeyStep(step, { key: "3", code: "Digit3", metaKey: true })).toBe(false);
    expect(matchesKeyStep(step, { key: "0", code: "Digit0", ctrlKey: true })).toBe(false);
  });

  test("punctuation matches by key or physical code", () => {
    expect(
      matchesKeyStep(parseKeyStep("mod+shift+\\"), {
        key: "|",
        code: "Backslash",
        ctrlKey: true,
        shiftKey: true,
      }),
    ).toBe(true);
    expect(
      matchesKeyStep(parseKeyStep("mod+/"), { key: "/", code: "Slash", metaKey: true }),
    ).toBe(true);
    expect(
      matchesKeyStep(parseKeyStep("mod+["), { key: "[", code: "BracketLeft", metaKey: true }),
    ).toBe(true);
  });

  test("matchesKeybinding uses the registry keys", () => {
    expect(matchesKeybinding("work-queue.undo", { key: "z", metaKey: true })).toBe(true);
    expect(
      matchesKeybinding("work-queue.undo", { key: "z", metaKey: true, shiftKey: true }),
    ).toBe(false);
    expect(matchesKeybinding("navigation.home", { key: "k", metaKey: true })).toBe(false);
  });

  test("rejects unknown modifiers and keys", () => {
    expect(() => parseKeyStep("hyper+x")).toThrow();
    expect(() => parseKeyStep("mod+nope")).toThrow();
  });
});

describe("formatting", () => {
  test("uses symbols on macOS and words elsewhere", () => {
    const sequence = parseKeySequence("mod+shift+t");
    expect(formatKeySequenceParts(sequence, "mac")).toEqual([["⇧", "⌘", "T"]]);
    expect(formatKeySequenceParts(sequence, "windows")).toEqual([["Ctrl", "Shift", "T"]]);
    expect(formatKeySequenceParts(parseKeySequence("mod+k mod?+b"), "linux")).toEqual([
      ["Ctrl", "K"],
      ["B"],
    ]);
  });

  test("formats the platform-neutral doc notation", () => {
    expect(formatKeySequenceForDocs(parseKeySequence("mod+k mod?+b"))).toBe(
      "`Cmd/Ctrl+K` then `B`",
    );
    expect(formatKeySequenceForDocs(parseKeySequence("alt+1-0"))).toBe("`Alt+1..0`");
    expect(formatKeySequenceForDocs(parseKeySequence("ctrl+1-9"))).toBe("`Ctrl+1..9`");
  });

  test("resolves the platform from Electron, then the browser", () => {
    expect(resolveKeybindingPlatform({ electronPlatform: "darwin" })).toBe("mac");
    expect(resolveKeybindingPlatform({ electronPlatform: "win32" })).toBe("windows");
    expect(
      resolveKeybindingPlatform({ electronPlatform: null, navigatorPlatform: "MacIntel" }),
    ).toBe("mac");
    expect(
      resolveKeybindingPlatform({ electronPlatform: null, navigatorPlatform: "Linux x86_64" }),
    ).toBe("linux");
  });
});

describe("conflict detection", () => {
  test("fails on the same key in overlapping scopes", () => {
    const conflicts = findKeybindingConflicts({
      entries: [
        entry({ id: "a", keys: ["mod+shift+t"] }),
        entry({ id: "b", keys: ["mod+shift+t"], scope: "workspace" }),
      ],
    });
    expect(conflicts.map((conflict) => [conflict.left.id, conflict.right.id])).toEqual([
      ["a", "b"],
      ["a", "b"],
      ["a", "b"],
    ]);
  });

  test("optional modifiers and shared physical keys still collide", () => {
    expect(
      keySequencesOverlap(parseKeySequence("mod+shift?+f"), parseKeySequence("mod+shift+f")),
    ).toBe(true);
    expect(
      keySequencesOverlap(parseKeySequence("mod+shift?+plus"), parseKeySequence("mod+=")),
    ).toBe(true);
    expect(
      keySequencesOverlap(parseKeySequence("ctrl+1-9"), parseKeySequence("mod+shift+1-9")),
    ).toBe(false);
  });

  test("a chord prefix collides with a single key on the same step", () => {
    expect(
      keySequencesOverlap(parseKeySequence("mod+k mod?+b"), parseKeySequence("mod+k")),
    ).toBe(true);
    expect(
      keySequencesOverlap(parseKeySequence("mod+k mod?+b"), parseKeySequence("mod+b")),
    ).toBe(false);
  });

  test("exclusive surfaces may share keys", () => {
    expect(scopesOverlap("fleet", "issues")).toBe(false);
    expect(scopesOverlap("fleet", "composer")).toBe(false);
    expect(scopesOverlap("composer", "git-graph")).toBe(true);
    expect(scopesOverlap("global", "lens")).toBe(true);
    expect(
      findKeybindingConflicts({
        entries: [
          entry({ id: "fleet", keys: ["escape"], scope: "fleet" }),
          entry({ id: "issues", keys: ["escape"], scope: "issues" }),
        ],
      }),
    ).toEqual([]);
  });

  test("typing rules, focus, and yielding listeners keep keys apart", () => {
    const block = entry({ id: "block", keys: ["enter"], editable: "block" });
    const only = entry({ id: "only", keys: ["enter"], editable: "only", scope: "composer", focus: true });
    expect(keybindingsCanCoexist(block, only)).toBe(false);

    const dialog = entry({ id: "dialog", keys: ["enter"], scope: "dialog", focus: true });
    const composer = entry({ id: "composer", keys: ["enter"], scope: "composer", focus: true });
    expect(keybindingsCanCoexist(dialog, composer)).toBe(false);

    const yielding = entry({ id: "window", keys: ["alt+p"], scope: "composer", yieldsToHandled: true });
    const palette = entry({ id: "palette", keys: ["alt+p"], scope: "command-palette", focus: true });
    expect(keybindingsCanCoexist(yielding, palette)).toBe(false);

    const strict = entry({ id: "strict", keys: ["alt+p"] });
    expect(keybindingsCanCoexist(strict, palette)).toBe(true);
  });
});
