import path from "node:path";

const INTERACTIVE_SHELLS = new Set(["sh", "bash", "zsh", "fish", "dash", "ksh", "tcsh", "csh", "nu", "pwsh", "powershell", "cmd"]);
const processName = (value: string) => path.basename(value.trim()).replace(/^-/, "").replace(/\.exe$/i, "").toLowerCase();

/**
 * A terminal is busy unless it is an interactive shell waiting at its prompt.
 * CLI sessions, running commands and an unreadable foreground process all
 * count as busy, because any of them may write files.
 */
export function isTerminalSessionBusy(args: { command: string; readForeground: () => string }): boolean {
  const shell = processName(args.command);
  if (!INTERACTIVE_SHELLS.has(shell)) return true;
  try {
    const foreground = processName(args.readForeground());
    return foreground !== shell;
  }
  catch {
    return true;
  }
}
