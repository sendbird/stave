/**
 * Display labels and default titles for terminal and CLI session tabs.
 *
 * Lives apart from `types.ts` on purpose: `types.ts` is also bundled into the
 * Electron host service, which must not pull in the renderer i18n instance.
 * Default titles are stored on the tab when it is created, so they keep the
 * display language that was active at creation time.
 */
import { i18n, type AppTFunction, type I18nKey } from "@/i18n/runtime";
import type { ManagedExecutionProviderId } from "@/lib/providers/provider.types";
import { resolvePathBaseName } from "@/lib/path-utils";
import {
  getCliSessionProviderLabel,
  type CliSessionContextMode,
} from "@/lib/terminal/types";

export const CLI_SESSION_CONTEXT_LABEL_KEYS = {
  workspace: "terminal:cliSession.context.workspace",
  "active-task": "terminal:cliSession.context.activeTask",
} as const satisfies Record<CliSessionContextMode, I18nKey>;

const CLI_SESSION_DEFAULT_TITLE_KEYS = {
  workspace: "terminal:cliSession.defaultTitle.workspace",
  "active-task": "terminal:cliSession.defaultTitle.activeTask",
} as const satisfies Record<CliSessionContextMode, I18nKey>;

/**
 * Translates with `t` when a component passes its own; otherwise resolves in
 * the current display language at call time. Components rendering the label
 * should call `useTranslation()` so they re-render on a language change.
 */
export function getCliSessionContextLabel(
  contextMode: CliSessionContextMode,
  t: AppTFunction = i18n.t,
) {
  return t(CLI_SESSION_CONTEXT_LABEL_KEYS[contextMode]);
}

export function getTerminalTabDefaultTitle(args: {
  cwd: string;
  linkedTaskTitle?: string | null;
}) {
  const linkedTaskTitle = args.linkedTaskTitle?.trim();
  if (linkedTaskTitle) {
    return linkedTaskTitle;
  }

  return resolvePathBaseName({
    path: args.cwd,
    fallback: i18n.t("terminal:terminalTab.defaultTitle"),
  });
}

export function getCliSessionTabDefaultTitle(args: {
  providerId: ManagedExecutionProviderId;
  contextMode: CliSessionContextMode;
  linkedTaskTitle?: string | null;
}) {
  const providerLabel = getCliSessionProviderLabel(args.providerId);
  const linkedTaskTitle = args.linkedTaskTitle?.trim();
  if (args.contextMode === "active-task" && linkedTaskTitle) {
    return `${providerLabel}: ${linkedTaskTitle}`;
  }
  return i18n.t(CLI_SESSION_DEFAULT_TITLE_KEYS[args.contextMode], {
    provider: providerLabel,
  });
}
