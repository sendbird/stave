import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import path from "node:path";
import { i18n, type I18nKey } from "@/i18n/runtime";
import {
  expandDigitRange,
  formatKeySequenceForDocs,
  matchesKeyStep,
  parseKeySequence,
  type KeyEventLike,
} from "@/lib/keybindings/key-chord";
import {
  getDefaultKeybindingKeys,
  KEYBINDING_REGISTRY,
  type KeybindingEntry,
} from "@/lib/keybindings/keybinding-registry";

const ROOT = path.resolve(import.meta.dir, "..");
const DOCS = ["docs/features/command-palette.md", "docs/features/keyboard-shortcuts.md"];
const ENTRIES = KEYBINDING_REGISTRY as readonly KeybindingEntry[];
const MODIFIER_START = /^(Cmd\/Ctrl|Cmd|Ctrl|Alt|Shift)\+/;

const KEY_EVENTS: Record<string, Array<Pick<KeyEventLike, "key" | "code">>> = {
  ",": [{ key: ",", code: "Comma" }],
  ".": [{ key: ".", code: "Period" }],
  "/": [{ key: "/", code: "Slash" }],
  "\\": [{ key: "\\", code: "Backslash" }],
  "`": [{ key: "`", code: "Backquote" }],
  "[": [{ key: "[", code: "BracketLeft" }],
  "]": [{ key: "]", code: "BracketRight" }],
  "-": [{ key: "-", code: "Minus" }],
  Plus: [{ key: "+", code: "Equal" }],
  Enter: [{ key: "Enter", code: "Enter" }],
  Esc: [{ key: "Escape", code: "Escape" }],
  Tab: [{ key: "Tab", code: "Tab" }],
  ArrowUp: [{ key: "ArrowUp", code: "ArrowUp" }],
  ArrowDown: [{ key: "ArrowDown", code: "ArrowDown" }],
  F12: [{ key: "F12", code: "F12" }],
};

/** Every physical key press a documented step such as `Alt+1..0` stands for. */
function docStepEvents(step: string): KeyEventLike[] {
  const parts = step.split("+");
  const keyToken = parts.pop()!;
  const modifiers: KeyEventLike = { key: "" };
  for (const part of parts) {
    if (part === "Cmd/Ctrl" || part === "Cmd") modifiers.metaKey = true;
    else if (part === "Ctrl") modifiers.ctrlKey = true;
    else if (part === "Alt") modifiers.altKey = true;
    else if (part === "Shift") modifiers.shiftKey = true;
    else throw new Error(`Unknown modifier "${part}" in documented shortcut ${step}`);
  }
  const digits = expandDigitRange(keyToken.replace("..", "-"));
  const keys = digits
    ? digits.map((digit) => ({ key: digit, code: `Digit${digit}` }))
    : /^[A-Z0-9]$/.test(keyToken)
      ? [
          {
            key: keyToken.toLowerCase(),
            code: /\d/.test(keyToken) ? `Digit${keyToken}` : `Key${keyToken}`,
          },
        ]
      : KEY_EVENTS[keyToken];
  if (!keys) {
    throw new Error(`Unknown key "${keyToken}" in documented shortcut ${step}`);
  }
  return keys.map((key) => ({ ...modifiers, ...key }));
}

/** Documented shortcuts in a Markdown file: single steps and "`A` then `B`" chords. */
function documentedShortcuts(markdown: string): string[][] {
  const found: string[][] = [];
  for (const line of markdown.split("\n")) {
    const spans = [...line.matchAll(/``\s?(.+?)\s?``|`([^`]+)`/g)].map((match) => ({
      text: (match[1] ?? match[2] ?? "").trim(),
      start: match.index!,
      end: match.index! + match[0].length,
    }));
    for (let index = 0; index < spans.length; index += 1) {
      const span = spans[index]!;
      if (!MODIFIER_START.test(span.text) && !/^F\d+$/.test(span.text)) {
        continue;
      }
      const next = spans[index + 1];
      if (next && line.slice(span.end, next.start) === " then ") {
        found.push([span.text, next.text]);
        index += 1;
      } else {
        found.push([span.text]);
      }
    }
  }
  return found;
}

function isRegistered(steps: string[]) {
  const events = steps.map(docStepEvents);
  return ENTRIES.some((entry) =>
    (["mac", "windows", "linux"] as const).some((platform) =>
      getDefaultKeybindingKeys(entry, platform).some((value) => {
        const sequence = parseKeySequence(value);
        if (sequence.length < steps.length) return false;
        return events.every((stepEvents, index) =>
          stepEvents.every((event) => matchesKeyStep(sequence[index]!, event)),
        );
      }),
    ),
  );
}

function englishTitle(entry: KeybindingEntry) {
  const t = i18n.t as unknown as (key: I18nKey, options: object) => string;
  return t(entry.titleKey, { lng: "en", ...(entry.titleValues?.() ?? {}) });
}

describe("keyboard shortcut docs", () => {
  for (const doc of DOCS) {
    test(`every shortcut in ${doc} exists in the registry`, () => {
      const shortcuts = documentedShortcuts(readFileSync(path.join(ROOT, doc), "utf8"));
      expect(shortcuts.length).toBeGreaterThan(0);
      const missing = shortcuts.filter((steps) => !isRegistered(steps));
      expect(missing).toEqual([]);
    });
  }

  test("the shortcut doc lists every registry entry with its default keys", () => {
    const rows = readFileSync(path.join(ROOT, "docs/features/keyboard-shortcuts.md"), "utf8")
      .split("\n")
      .filter((line) => line.startsWith("| "));
    const problems: string[] = [];
    for (const entry of ENTRIES) {
      const title = englishTitle(entry);
      const row = rows.find((line) => line.startsWith(`| ${title} |`));
      if (!row) {
        problems.push(`${entry.id}: no row titled "${title}"`);
        continue;
      }
      const keys = [...entry.keys, ...(entry.platformKeys?.mac ?? [])];
      for (const value of keys) {
        const notation = formatKeySequenceForDocs(parseKeySequence(value));
        if (!row.includes(notation)) {
          problems.push(`${entry.id}: row is missing ${notation}`);
        }
      }
    }
    expect(problems).toEqual([]);
  });
});
