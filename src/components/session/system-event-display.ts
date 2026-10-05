import { i18n } from "@/i18n/runtime";
import { buildProviderOutputTruncationDisplay } from "@/lib/truncation-visibility";
import { formatProviderErrorDisplay } from "@/lib/providers/error-display";

const SYSTEM_EVENT_COPY = {
  // i18n-ignore: canonical provider compaction markers; presentation only
  "Compacting conversation context": "session:systemEvent.compacting",
  // i18n-ignore: canonical provider compaction markers; presentation only
  "Context compacted": "session:systemEvent.compacted",
  // i18n-ignore: canonical stored transcript marker; translate only its presentation
  "Generation was stopped locally before completion.": "session:systemEvent.stopped",
  // i18n-ignore: canonical stored transcript marker; translate only its presentation
  "Generation stopped because the task was archived before this turn completed.": "session:systemEvent.archived",
  // i18n-ignore: canonical stored transcript marker; translate only its presentation
  "Managed run stopped from Stave before completion.": "session:systemEvent.managedStopped",
} as const;

export function formatSystemEventDisplay(content: string): string {
  const normalized = content.trim().replace(/…$/, "");
  const key = SYSTEM_EVENT_COPY[normalized as keyof typeof SYSTEM_EVENT_COPY];
  // i18n-ignore: canonical runtime markers; never rewrite the stored transcript
  if (normalized === "Sending request to model") return i18n.t("session:systemEvent.sending");
  // i18n-ignore: canonical runtime marker
  if (normalized === "Checkpoint captured before Codex turn.") return i18n.t("session:systemEvent.checkpoint");
  // i18n-ignore: canonical runtime wrapper around provider-generated progress
  const progress = normalized.match(/^Subagent progress: (.+)$/s);
  if (progress) return i18n.t("session:systemEvent.subagentProgress", { summary: progress[1] });
  // i18n-ignore: canonical runtime plugin notices
  const plugin = normalized.match(/^Plugin (installed|install failed): (.+)$/s);
  if (plugin) {
    if (plugin[1] === "installed") return i18n.t("session:systemEvent.pluginInstalled", { name: plugin[2] });
    const split = plugin[2]!.indexOf(" — ");
    return split < 0
      ? i18n.t("session:systemEvent.pluginFailed", { name: plugin[2] })
      : i18n.t("session:systemEvent.pluginFailedReason", { name: plugin[2]!.slice(0, split), error: plugin[2]!.slice(split + 3) });
  }
  return key ? i18n.t(key) : formatProviderErrorDisplay(buildProviderOutputTruncationDisplay(content));
}
