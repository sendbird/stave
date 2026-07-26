import { describe, expect, it } from "bun:test";
import {
  DEFAULT_TERMINAL_FONT_WEIGHT,
  DEFAULT_TERMINAL_FONT_WEIGHT_BOLD,
} from "@/lib/terminal/defaults";
import { Osc133Parser, parseOsc133Events } from "@/lib/terminal/osc133";
import { appendAbsoluteCursorPosition } from "@/lib/terminal/snapshot";
import { TerminalTranscriptBuffer } from "@/lib/terminal/transcript-buffer";

describe("terminal helpers", () => {
  it("parses OSC 133 prompt lifecycle markers", () => {
    expect(
      parseOsc133Events(
        "\x1b]133;A\x07$ \x1b]133;B\x07echo ok\x1b]133;C\x07\x1b]133;D;0\x07",
      ),
    ).toEqual([
      { status: "prompt-start" },
      { status: "prompt-end" },
      { status: "command-start" },
      { status: "command-finished", exitCode: 0 },
    ]);
  });

  it("does not invent an exit code for a bare command-finished marker", () => {
    expect(parseOsc133Events("\x1b]133;D\x07")).toEqual([
      { status: "command-finished" },
    ]);
  });

  it("parses OSC 133 markers split across PTY chunks", () => {
    const parser = new Osc133Parser();
    expect(parser.push("before\x1b]13")).toEqual([]);
    expect(parser.push("3;D;17")).toEqual([]);
    expect(parser.push("\x07after")).toEqual([
      { status: "command-finished", exitCode: 17 },
    ]);
  });

  it("appends an absolute cursor position to snapshots", () => {
    expect(appendAbsoluteCursorPosition("hello", 4, 1)).toBe("hello\x1b[2;5H");
  });

  it("keeps only the newest transcript characters", () => {
    const buffer = new TerminalTranscriptBuffer(5);
    buffer.append("abc");
    buffer.append("def");
    expect(buffer.toString()).toBe("bcdef");
  });
});

describe("terminal font weight defaults", () => {
  /*
   * Regression guard for hairline CJK glyphs.
   *
   * The Latin monospace families in DEFAULT_TERMINAL_FONT_FAMILY ship a single
   * upright weight, so a sub-400 `fontWeight` is a silent no-op for them. CJK
   * text has no family in that stack and falls back to a system face (macOS
   * uses Apple SD Gothic Neo) that *does* ship a real Light cut. At weight 300
   * Hangul therefore rendered with roughly half the ink of the surrounding UI
   * and of xterm's IME composition overlay, which only inherits the ambient CSS
   * weight because xterm never applies `fontWeight` to it.
   */
  it("renders regular cells at the font's native weight", () => {
    expect(DEFAULT_TERMINAL_FONT_WEIGHT).toBeGreaterThanOrEqual(400);
  });

  /*
   * Regression guard for invisible bold.
   *
   * `> DEFAULT_TERMINAL_FONT_WEIGHT` alone is not enough: the Latin families in
   * the stack ship only 400 and 700, and CSS font matching resolves a request of
   * 400-500 down to the 400 face, so a value like 500 is heavier on paper yet
   * renders pixel-identical to a regular cell. 600 reaches Latin Bold but leaves
   * CJK fallbacks on SemiBold, lighter than the Latin bold beside it. Only 700
   * puts both scripts on their family's Bold cut.
   */
  it("keeps bold cells on the font's real bold cut", () => {
    expect(DEFAULT_TERMINAL_FONT_WEIGHT_BOLD).toBeGreaterThanOrEqual(700);
    expect(DEFAULT_TERMINAL_FONT_WEIGHT_BOLD).toBeGreaterThan(
      DEFAULT_TERMINAL_FONT_WEIGHT,
    );
  });
});
