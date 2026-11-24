import { describe, expect, test } from "bun:test";
import {
  ansiPlainText,
  applySgr,
  hasAnsiSgr,
  isTerminalFence,
  normalizeTerminalText,
  parseAnsi,
} from "@/lib/markdown/ansi";

const ESC = "\u001b";

describe("parseAnsi", () => {
  test("splits colored text into styled spans and carries style across lines", () => {
    const lines = parseAnsi(`${ESC}[31mred ${ESC}[1mbold\nstill red${ESC}[0m plain`);
    expect(lines).toEqual([
      [
        { text: "red ", style: { foreground: { kind: "palette", name: "red" } } },
        { text: "bold", style: { foreground: { kind: "palette", name: "red" }, bold: true } },
      ],
      [
        { text: "still red", style: { foreground: { kind: "palette", name: "red" }, bold: true } },
        { text: " plain", style: {} },
      ],
    ]);
  });

  test("reads bright, 256-color and RGB colors, and backgrounds", () => {
    expect(applySgr({}, "92").foreground).toEqual({ kind: "palette", name: "brightGreen" });
    expect(applySgr({}, "38;5;196").foreground).toEqual({ kind: "rgb", hex: "#ff0000" });
    expect(applySgr({}, "38;5;244").foreground).toEqual({ kind: "rgb", hex: "#808080" });
    expect(applySgr({}, "48;2;10;20;30").background).toEqual({ kind: "rgb", hex: "#0a141e" });
    expect(applySgr({}, "44").background).toEqual({ kind: "palette", name: "blue" });
    expect(applySgr({ bold: true, dim: true }, "22")).toEqual({});
    expect(applySgr({ foreground: { kind: "palette", name: "red" } }, "")).toEqual({});
  });

  test("drops other control sequences and keeps the last write of a carriage-return line", () => {
    const lines = parseAnsi(`${ESC}]0;title\u0007${ESC}[2Kprogress 10%\rprogress 100%\r\n${ESC}[?25hdone`);
    expect(ansiPlainText(lines)).toBe("progress 100%\ndone");
  });

  test("the plain text has no escapes left", () => {
    expect(ansiPlainText(parseAnsi(`${ESC}[1;32m✓${ESC}[0m passed`))).toBe("✓ passed");
  });
});

describe("terminal fences", () => {
  test("named fences and fences with real escapes are terminal output", () => {
    expect(isTerminalFence("ansi", "plain")).toBe(true);
    expect(isTerminalFence("console", "$ ls")).toBe(true);
    expect(isTerminalFence("terminal", "x")).toBe(true);
    expect(isTerminalFence("output", "x")).toBe(true);
    expect(isTerminalFence(undefined, `${ESC}[31mfail${ESC}[0m`)).toBe(true);
    expect(isTerminalFence("text", `${ESC}[32mok`)).toBe(true);
  });

  test("source code that only mentions an escape stays code", () => {
    expect(isTerminalFence("python", 'print("\\x1b[31mred\\x1b[0m")')).toBe(false);
    expect(isTerminalFence(undefined, "no escapes here")).toBe(false);
    expect(isTerminalFence("json", `{"a": "${ESC}[31m"}`)).toBe(false);
    expect(hasAnsiSgr("\\033[31m")).toBe(false);
  });

  test("a terminal fence reads written-out escapes; other fences keep them as text", () => {
    expect(normalizeTerminalText("ansi", "\\x1b[31mred\\033[0m \\e[1mbold")).toBe(
      `${ESC}[31mred${ESC}[0m ${ESC}[1mbold`,
    );
    expect(normalizeTerminalText("python", "\\x1b[31m")).toBe("\\x1b[31m");
  });
});
