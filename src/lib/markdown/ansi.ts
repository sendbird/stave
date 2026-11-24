/**
 * Terminal output in a reply: ANSI SGR escapes read as colored text spans.
 *
 * Only Select Graphic Rendition (`ESC [ … m`) changes how text looks. Other
 * control sequences (cursor moves, line erases, OSC titles and hyperlinks)
 * are dropped, and a carriage return keeps what was written last on its line,
 * the way a progress bar ends up on screen.
 */

export const ANSI_COLOR_NAMES = [
  "black",
  "red",
  "green",
  "yellow",
  "blue",
  "magenta",
  "cyan",
  "white",
  "brightBlack",
  "brightRed",
  "brightGreen",
  "brightYellow",
  "brightBlue",
  "brightMagenta",
  "brightCyan",
  "brightWhite",
] as const;

export type AnsiColorName = (typeof ANSI_COLOR_NAMES)[number];

/** A palette color by name, or an explicit 256-color / RGB value as hex. */
export type AnsiColor =
  | { kind: "palette"; name: AnsiColorName }
  | { kind: "rgb"; hex: string };

export interface AnsiStyle {
  foreground?: AnsiColor;
  background?: AnsiColor;
  bold?: boolean;
  dim?: boolean;
  italic?: boolean;
  underline?: boolean;
  strikethrough?: boolean;
  inverse?: boolean;
}

export interface AnsiSpan {
  text: string;
  style: AnsiStyle;
}

export type AnsiLine = AnsiSpan[];

/** Fences that always hold terminal output. */
const TERMINAL_FENCE_LANGUAGES = new Set(["ansi", "console", "terminal", "output"]);

/** A real SGR escape: ESC [ params m. */
const REAL_SGR = /\u001b\[[0-9;:]*m/;

/** An escape written out as text: \x1b[, \u001b[, \033[, \e[. */
const WRITTEN_ESCAPE = /\\(?:x1[bB]|u001[bB]|033|e)(?=\[)/g;

const CONTROL_SEQUENCE = /\u001b\[([0-9;:?<=>]*)[ -/]*([@-~])/g;
const OSC_SEQUENCE = /\u001b\][^\u0007\u001b]*(?:\u0007|\u001b\\)?/g;
const STRAY_ESCAPE = /\u001b[@-_]?/g;

/** At most this many lines are read; the rest of a huge log stays out. */
export const ANSI_MAX_LINES = 5_000;

/** Whether the text holds a real ANSI SGR escape. */
export function hasAnsiSgr(text: string): boolean {
  return text.includes("\u001b") && REAL_SGR.test(text);
}

/**
 * Whether a fenced block is terminal output: a fence named `ansi`, `console`,
 * `terminal` or `output`, or any fence whose body holds a real SGR escape.
 * JSON, math and diagrams keep their own renderers.
 */
export function isTerminalFence(language: string | undefined, code: string): boolean {
  const normalized = language?.trim().toLowerCase() ?? "";
  if (TERMINAL_FENCE_LANGUAGES.has(normalized)) return true;
  if (normalized === "mermaid" || normalized === "math" || normalized === "json") {
    return false;
  }
  return hasAnsiSgr(code);
}

/**
 * The text a terminal fence shows. In a fence named as terminal output an
 * escape written out as text (`\x1b[31m`, `\033[0m`) counts as the escape;
 * in any other fence it is source code and stays as written.
 */
export function normalizeTerminalText(language: string | undefined, code: string): string {
  const normalized = language?.trim().toLowerCase() ?? "";
  if (!TERMINAL_FENCE_LANGUAGES.has(normalized)) return code;
  return code.replace(WRITTEN_ESCAPE, "\u001b");
}

function hexChannel(value: number) {
  return Math.max(0, Math.min(255, value)).toString(16).padStart(2, "0");
}

function rgbColor(red: number, green: number, blue: number): AnsiColor {
  return { kind: "rgb", hex: `#${hexChannel(red)}${hexChannel(green)}${hexChannel(blue)}` };
}

function paletteColor(index: number): AnsiColor {
  return { kind: "palette", name: ANSI_COLOR_NAMES[index] ?? "white" };
}

/** The xterm 256-color table: 16 named colors, a 6×6×6 cube, 24 grays. */
function color256(index: number): AnsiColor {
  if (index < 16) return paletteColor(index);
  if (index >= 232) {
    const gray = 8 + (index - 232) * 10;
    return rgbColor(gray, gray, gray);
  }
  const cube = index - 16;
  const level = (step: number) => (step === 0 ? 0 : 55 + step * 40);
  return rgbColor(
    level(Math.floor(cube / 36)),
    level(Math.floor(cube / 6) % 6),
    level(cube % 6),
  );
}

/** The style after one SGR sequence's parameters. */
export function applySgr(style: AnsiStyle, parameters: string): AnsiStyle {
  const codes =
    parameters === ""
      ? [0]
      : parameters.split(/[;:]/).map((part) => (part === "" ? 0 : Number(part)));
  let next: AnsiStyle = { ...style };
  for (let index = 0; index < codes.length; index += 1) {
    const code = codes[index] ?? 0;
    if (code === 0) next = {};
    else if (code === 1) next.bold = true;
    else if (code === 2) next.dim = true;
    else if (code === 3) next.italic = true;
    else if (code === 4) next.underline = true;
    else if (code === 7) next.inverse = true;
    else if (code === 9) next.strikethrough = true;
    else if (code === 22) {
      delete next.bold;
      delete next.dim;
    } else if (code === 23) delete next.italic;
    else if (code === 24) delete next.underline;
    else if (code === 27) delete next.inverse;
    else if (code === 29) delete next.strikethrough;
    else if (code >= 30 && code <= 37) next.foreground = paletteColor(code - 30);
    else if (code === 39) delete next.foreground;
    else if (code >= 40 && code <= 47) next.background = paletteColor(code - 40);
    else if (code === 49) delete next.background;
    else if (code >= 90 && code <= 97) next.foreground = paletteColor(code - 90 + 8);
    else if (code >= 100 && code <= 107) next.background = paletteColor(code - 100 + 8);
    else if (code === 38 || code === 48) {
      const target = code === 38 ? "foreground" : "background";
      const mode = codes[index + 1];
      if (mode === 5 && codes[index + 2] !== undefined) {
        next[target] = color256(codes[index + 2] ?? 0);
        index += 2;
      } else if (mode === 2 && codes[index + 4] !== undefined) {
        next[target] = rgbColor(codes[index + 2] ?? 0, codes[index + 3] ?? 0, codes[index + 4] ?? 0);
        index += 4;
      } else {
        // An extended color without its arguments ends the sequence.
        break;
      }
    }
  }
  return next;
}

function sameStyle(a: AnsiStyle, b: AnsiStyle) {
  return JSON.stringify(a) === JSON.stringify(b);
}

/**
 * Lines of styled spans. Style carries over line ends, as in a terminal;
 * adjacent text in the same style joins into one span.
 */
export function parseAnsi(text: string): AnsiLine[] {
  const source = text.replace(OSC_SEQUENCE, "").replace(/\r\n/g, "\n");
  const lines: AnsiLine[] = [];
  let style: AnsiStyle = {};
  for (const rawLine of source.split("\n").slice(0, ANSI_MAX_LINES)) {
    // A carriage return rewinds the line: the last non-empty write shows.
    const writes = rawLine.split("\r");
    const line = writes.filter((part, index) => part || index === writes.length - 1).at(-1) ?? "";
    const spans: AnsiSpan[] = [];
    const push = (value: string) => {
      const clean = value.replace(STRAY_ESCAPE, "");
      if (!clean) return;
      const last = spans.at(-1);
      if (last && sameStyle(last.style, style)) last.text += clean;
      else spans.push({ text: clean, style });
    };
    let at = 0;
    CONTROL_SEQUENCE.lastIndex = 0;
    for (let match = CONTROL_SEQUENCE.exec(line); match; match = CONTROL_SEQUENCE.exec(line)) {
      push(line.slice(at, match.index));
      if (match[2] === "m") style = applySgr(style, match[1] ?? "");
      at = match.index + match[0].length;
    }
    push(line.slice(at));
    lines.push(spans);
  }
  return lines;
}

/** The text without escapes, as the block shows it (what Copy copies). */
export function ansiPlainText(lines: readonly AnsiLine[]): string {
  return lines.map((line) => line.map((span) => span.text).join("")).join("\n");
}
