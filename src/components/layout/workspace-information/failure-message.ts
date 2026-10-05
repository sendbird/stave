import { i18n } from "@/i18n";

/**
 * A translated failure summary, followed by the raw technical detail (an IPC
 * or main-process message) when the failure carried one. Runs where the error
 * is caught, so it reads the display language at that moment.
 */
export function failureMessage(summary: string, error: unknown): string {
  const detail = error instanceof Error ? error.message.trim() : "";
  return detail
    ? i18n.t("workspace:informationPanel.failureWithDetail", { summary, detail })
    : summary;
}
