import { describe, expect, it } from "bun:test";
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
