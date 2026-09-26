import {
  CircleAlert,
  CircleCheck,
  CircleDashed,
  CircleDot,
  CircleMinus,
  Hand,
  type LucideIcon,
} from "lucide-react";
import { sx } from "@/components/ads/utils/stylex";
import type { StageTone } from "@/lib/missions/mission-view";
import { missionStyles as styles } from "./missions.styles";

const TONE_ICONS: Record<StageTone, LucideIcon> = {
  done: CircleCheck,
  active: CircleDot,
  waiting: Hand,
  attention: CircleAlert,
  idle: CircleDashed,
  skipped: CircleMinus,
};

const TONE_STYLES = {
  done: styles.toneDone,
  active: styles.toneActive,
  waiting: styles.toneWaiting,
  attention: styles.toneAttention,
  idle: styles.toneIdle,
  skipped: styles.toneSkipped,
} as const;

/** An icon for a stage tone. Always paired with text by the caller. */
export function StageStatusIcon({ tone }: { tone: StageTone }) {
  const Icon = TONE_ICONS[tone];
  return <Icon aria-hidden className={sx(styles.icon, TONE_STYLES[tone])} />;
}
