export function shouldAutoCreateDockTerminalTab(args: {
  isTerminalDocked: boolean;
  wasTerminalDocked: boolean | null;
  terminalTabCount: number;
  workspacePath: string;
}) {
  // Dock must be open, path must exist, zero tabs present.
  if (
    !args.isTerminalDocked ||
    args.terminalTabCount > 0 ||
    !args.workspacePath.trim()
  ) {
    return false;
  }
  // Skip the very first render (wasTerminalDocked still null).
  if (args.wasTerminalDocked === null) {
    return false;
  }
  // Only create a tab when the user explicitly opened the dock.
  return args.wasTerminalDocked === false;
}
