import { i18n } from "@/i18n/runtime";
import { buildProviderOutputTruncationDisplay } from "@/lib/truncation-visibility";

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
  const key = SYSTEM_EVENT_COPY[content.trim() as keyof typeof SYSTEM_EVENT_COPY];
  return key ? i18n.t(key) : buildProviderOutputTruncationDisplay(content);
}
