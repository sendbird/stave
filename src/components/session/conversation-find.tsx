import * as stylex from "@stylexjs/stylex";
import { Search } from "lucide-react";
import { i18n, useTranslation } from "@/i18n";
import { Button } from "@/components/ads/components/Button";
import { Tooltip } from "@/components/ads/components/Tooltip";
import { vars } from "@/components/ads/tokens/tokens.stylex";
import { useShortcutHint } from "@/components/system/ShortcutKeys";
import { localStack } from "@/lib/ui-layers.stylex";
import { conversationFindMarker } from "./conversation-find.stylex";

/** The floating icon that opens find; shown while the transcript is hovered or holds focus. */
export function ConversationFindTrigger(props: {
  onOpen: () => void;
  /** Take focus on mount: find just closed and its opener was this trigger. */
  autoFocus?: boolean;
}) {
  useTranslation();
  const shortcut = useShortcutHint("conversation.find");
  const label = i18n.t("common:transcriptFind.chat");
  return (
    <Tooltip content={label} shortcut={shortcut} side="bottom">
      <Button
        type="button"
        size="xs"
        variant="floating"
        iconOnly
        xstyle={styles.trigger}
        aria-label={label}
        aria-keyshortcuts="Meta+F Control+F"
        autoFocus={props.autoFocus}
        onClick={props.onOpen}
      >
        <Search aria-hidden />
      </Button>
    </Tooltip>
  );
}

const styles = stylex.create({
  trigger: {
    position: "absolute",
    top: vars["--ads-space-8"],
    insetInlineEnd: vars["--ads-space-12"],
    zIndex: localStack["--stave-stack-floating"],
    opacity: {
      default: 0,
      ":focus-visible": 1,
      [stylex.when.ancestor(":is(:hover, :focus-within)", conversationFindMarker)]: 1,
      "@media (hover: none)": 1,
    },
    transitionProperty: "opacity",
    transitionDuration: {
      default: vars["--ads-motion-duration-fast"],
      "@media (prefers-reduced-motion: reduce)": "0s",
    },
  },
});
