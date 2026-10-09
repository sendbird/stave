/**
 * Splits a shell command line into kinds a reader scans for before approving
 * or re-running it: which program runs, which flags it gets, what is quoted,
 * where one command ends and the next begins, and which parts can destroy
 * work. It is a highlighter, not a parser: every character of the input lands
 * in exactly one token, so joining the tokens always gives the line back.
 *
 * used by: `src/components/session/message/command-result.tsx`,
 * `tests/shell-command-tokens.test.ts`.
 */

export type ShellTokenKind =
  | "command"
  | "flag"
  | "string"
  | "variable"
  | "operator"
  | "comment"
  | "danger"
  | "text";

export interface ShellToken {
  kind: ShellTokenKind;
  text: string;
}

/** Separators after which the next word is a new program. */
const COMMAND_SEPARATORS = new Set(["&&", "||", "|", ";", "&", "|&", "(", "$(", "`"]);
const OPERATORS = ["&&", "||", "|&", ">>", "2>&1", "<<", ">", "<", "|", ";", "&", "(", ")", "$("];

/** Programs that run the rest of the line as another program. */
const PREFIX_COMMANDS = new Set(["sudo", "env", "time", "nohup", "exec", "xargs", "command", "nice"]);

function isDangerFlag(program: string, subcommand: string | null, flag: string): boolean {
  if (program === "rm") return /^-[a-zA-Z]*[rRf]/.test(flag) || flag === "--force" || flag === "--recursive";
  if (program === "git") {
    if (flag === "--force" || flag === "-f" || flag === "--force-with-lease") {
      return subcommand === "push" || subcommand === "clean" || subcommand === "checkout" || subcommand === "branch";
    }
    if (flag === "--hard") return subcommand === "reset";
    if (flag === "-D") return subcommand === "branch";
    if (/^-[a-zA-Z]*[fdx]/.test(flag)) return subcommand === "clean";
  }
  if (program === "chmod" || program === "chown") return flag === "-R";
  return false;
}

function isDangerCommand(program: string) {
  return program === "sudo" || program === "dd" || program === "mkfs" || program.startsWith("mkfs.");
}

function readQuoted(line: string, start: number): number {
  const quote = line[start];
  let index = start + 1;
  while (index < line.length) {
    const char = line[index];
    if (char === "\\" && quote === '"') {
      index += 2;
      continue;
    }
    if (char === quote) return index + 1;
    index += 1;
  }
  return line.length;
}

function readWord(line: string, start: number): number {
  let index = start;
  while (index < line.length) {
    const char = line[index] ?? "";
    if (/\s/.test(char) || char === "'" || char === '"' || char === "`") break;
    if (OPERATORS.some((operator) => line.startsWith(operator, index))) break;
    if (char === "\\") {
      index += 2;
      continue;
    }
    index += 1;
  }
  return Math.max(index, start + 1);
}

export function tokenizeShellCommand(line: string): ShellToken[] {
  const tokens: ShellToken[] = [];
  const push = (kind: ShellTokenKind, text: string) => {
    const last = tokens.at(-1);
    if (last && last.kind === kind && (kind === "text" || kind === "comment")) last.text += text;
    else tokens.push({ kind, text });
  };

  let expectCommand = true;
  let program = "";
  let subcommand: string | null = null;
  let index = 0;
  while (index < line.length) {
    const char = line[index] ?? "";
    if (/\s/.test(char)) {
      let end = index;
      while (end < line.length && /\s/.test(line[end] ?? "")) end += 1;
      push("text", line.slice(index, end));
      index = end;
      continue;
    }
    if (char === "#" && (index === 0 || /\s/.test(line[index - 1] ?? ""))) {
      push("comment", line.slice(index));
      break;
    }
    const operator = OPERATORS.find((candidate) => line.startsWith(candidate, index));
    if (operator) {
      push("operator", operator);
      index += operator.length;
      if (COMMAND_SEPARATORS.has(operator)) {
        expectCommand = true;
        program = "";
        subcommand = null;
      }
      continue;
    }
    if (char === "`") {
      push("operator", char);
      index += 1;
      expectCommand = true;
      continue;
    }
    if (char === "'" || char === '"') {
      const end = readQuoted(line, index);
      push("string", line.slice(index, end));
      index = end;
      expectCommand = false;
      continue;
    }
    const end = readWord(line, index);
    const word = line.slice(index, end);
    index = end;
    if (word.startsWith("$")) {
      push("variable", word);
      continue;
    }
    // `FOO=bar cmd`: an assignment before the program keeps waiting for it.
    if (expectCommand && /^[A-Za-z_][A-Za-z0-9_]*=/.test(word)) {
      push("variable", word);
      continue;
    }
    if (expectCommand) {
      const name = word.split("/").pop() ?? word;
      push(isDangerCommand(name) ? "danger" : "command", word);
      program = name;
      subcommand = null;
      expectCommand = PREFIX_COMMANDS.has(name);
      continue;
    }
    if (word.startsWith("-") && word.length > 1) {
      push(isDangerFlag(program, subcommand, word) ? "danger" : "flag", word);
      continue;
    }
    if (subcommand === null && (program === "git" || program === "gh" || program === "bun" || program === "npm")) {
      subcommand = word;
    }
    push("text", word);
  }
  return tokens;
}
