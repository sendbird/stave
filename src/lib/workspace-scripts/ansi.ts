// ---------------------------------------------------------------------------
// Workspace Scripts – ANSI Handling
// ---------------------------------------------------------------------------
//
// Service scripts run under node-pty, so their logs carry ANSI escape
// sequences (colors, cursor movement) and carriage-return progress rewrites.
// The log view strips control sequences instead of rendering them — the
// bounded 12KB tail buffer is not worth a terminal emulator.

// CSI sequences: ESC [ ... final-byte (covers colors, cursor movement, erase).
const CSI_PATTERN = /\x1b\[[0-9;?:]*[ -/]*[@-~]/g;
// OSC sequences: ESC ] ... terminated by BEL or ST (covers titles, hyperlinks).
const OSC_PATTERN = /\x1b\][^\x07\x1b]*(?:\x07|\x1b\\)?/g;
// Remaining two-byte escape sequences (ESC + single final byte).
const SIMPLE_ESC_PATTERN = /\x1b[@-Z\\-_]/g;
// Control characters that carry no visible content in a static log view.
const CONTROL_CHAR_PATTERN = /[\x00-\x08\x0b\x0c\x0e-\x1f\x7f]/g;

/** Resolve `\r`-based progress rewrites within one line to their final visible text. */
function collapseCarriageReturns(line: string): string {
  if (!line.includes("\r")) {
    return line;
  }
  const segments = line.split("\r");
  for (let index = segments.length - 1; index >= 0; index -= 1) {
    const segment = segments[index];
    if (segment && segment.length > 0) {
      return segment;
    }
  }
  return "";
}

export function stripAnsiControlSequences(text: string): string {
  if (!text) {
    return text;
  }
  return text
    .replace(OSC_PATTERN, "")
    .replace(CSI_PATTERN, "")
    .replace(SIMPLE_ESC_PATTERN, "")
    .replace(/\r\n/g, "\n")
    .split("\n")
    .map((line) => collapseCarriageReturns(line).replace(CONTROL_CHAR_PATTERN, ""))
    .join("\n");
}
