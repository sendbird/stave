import { i18n, useTranslation } from "@/i18n";
import { GitCompareArrows, MessageSquare } from "lucide-react";
import { ToggleGroup } from "@/components/ads/components/ToggleGroup";
import { sx } from "@/components/ads/utils/stylex";
import { ShortcutKeys } from "@/components/system/ShortcutKeys";
import { resolveKeybindingPlatform } from "@/lib/keybindings/key-chord";
import { getKeybinding } from "@/lib/keybindings/keybinding-registry";
import { formatKeybindingDisplay } from "@/lib/keybindings/keybinding-settings";
import { useTaskReviewModeStore, type TaskSurfaceMode } from "@/store/task-review-mode-store";
import { reviewStyles as styles } from "./review.styles";

/** Conversation | Review on the task surface (D7): one task, two ways to look at it. */
export function TaskSurfaceModeBar(props: { taskId: string; mode: TaskSurfaceMode }) {
  useTranslation();
  const openReview = useTaskReviewModeStore((state) => state.openReview);
  const showConversation = useTaskReviewModeStore((state) => state.showConversation);
  const shortcut = formatKeybindingDisplay(getKeybinding("task.toggle-review").keys, resolveKeybindingPlatform());
  return (
    <div className={sx(styles.modeBar)}>
      <ToggleGroup
        aria-label={i18n.t("review:mode.label")}
        density="compact"
        value={[props.mode]}
        items={[
          { value: "conversation", label: i18n.t("review:mode.conversation"), icon: <MessageSquare aria-hidden /> },
          { value: "review", label: i18n.t("review:mode.review"), icon: <GitCompareArrows aria-hidden /> },
        ]}
        onValueChange={(next) => {
          if (next[0] === "review") openReview(props.taskId);
          else if (next[0] === "conversation") showConversation(props.taskId);
        }}
      />
      <span className={sx(styles.modeHint)} aria-hidden>
        <ShortcutKeys {...shortcut} />
      </span>
    </div>
  );
}
