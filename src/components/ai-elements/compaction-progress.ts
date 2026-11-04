import { formatElapsed } from "@/i18n/format";

export function compactionElapsed(startedAt: string | undefined, now: number): string | null {
  if (!startedAt || !Number.isFinite(Date.parse(startedAt))) return null;
  return formatElapsed(startedAt, now);
}
