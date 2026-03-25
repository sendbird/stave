import { registerFilesystemHandlers } from "./filesystem";
import { registerInlineCompletionHandlers } from "./inline-completion";
import { registerLspHandlers } from "./lsp";
import { registerPersistenceHandlers } from "./persistence";
import { registerProviderHandlers } from "./provider";
import { registerScmHandlers } from "./scm";
import { registerScreenshotHandlers } from "./screenshot";
import { registerSkillsHandlers } from "./skills";
import { registerTerminalHandlers } from "./terminal";
import { registerWindowHandlers } from "./window";

export function registerHandlers() {
  registerWindowHandlers();
  registerProviderHandlers();
  registerPersistenceHandlers();
  registerTerminalHandlers();
  registerScmHandlers();
  registerFilesystemHandlers();
  registerSkillsHandlers();
  registerLspHandlers();
  registerScreenshotHandlers();
  registerInlineCompletionHandlers();
}
