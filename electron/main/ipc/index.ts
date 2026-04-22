import { registerFilesystemHandlers } from "./filesystem";
import { registerInlineCompletionHandlers } from "./inline-completion";
import { registerBrowserHandlers } from "./browser";
import { registerDiagnosticsHandlers } from "./diagnostics";
import { registerLocalMcpHandlers } from "./local-mcp";
import { registerEslintHandlers } from "./eslint";
import { registerLspHandlers } from "./lsp";
import { registerMetricsHandlers } from "./metrics";
import { registerPersistenceHandlers } from "./persistence";
import { registerProviderHandlers } from "./provider";
import { registerScmHandlers } from "./scm";
import { registerSkillsHandlers } from "./skills";
import { registerTerminalHandlers } from "./terminal";
import { registerToolingHandlers } from "./tooling";
import { registerWindowHandlers } from "./window";
import { registerWorkspaceScriptHandlers } from "./workspace-scripts";

export function registerHandlers() {
  registerWindowHandlers();
  registerDiagnosticsHandlers();
  registerProviderHandlers();
  registerPersistenceHandlers();
  registerTerminalHandlers();
  registerToolingHandlers();
  registerWorkspaceScriptHandlers();
  registerScmHandlers();
  registerFilesystemHandlers();
  registerSkillsHandlers();
  registerLspHandlers();
  registerEslintHandlers();
  registerInlineCompletionHandlers();
  registerMetricsHandlers();
  registerLocalMcpHandlers();
  registerBrowserHandlers();
}
