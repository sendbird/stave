import { useTranslation } from "@/i18n";
import * as stylex from "@stylexjs/stylex";
import { Upload } from "lucide-react";
import { vars } from "@/components/ads/tokens/tokens.stylex";
import { sx } from "@/components/ads/utils/stylex";
import { localStack } from "@/lib/ui-layers.stylex";

/**
 * Says what a file drop on the composer does while files are dragged over
 * it. It covers the input card without moving any control: absolutely
 * placed inside the form, it takes no layout space and no pointer events, so
 * the drop still lands on the form. Drag and drop is pointer-only; the
 * attach button and paste stay the keyboard paths, so it is hidden from
 * assistive technology rather than announced on every drag.
 */
export function PromptInputFileDropOverlay() {
  const { t } = useTranslation(["composer"]);
  return (
    <div aria-hidden className={sx(styles.overlay)} data-composer-file-drop="">
      <Upload className={sx(styles.icon)} />
      <span className={sx(styles.title)}>{t("composer:fileDrop.title")}</span>
      <span className={sx(styles.hint)}>{t("composer:fileDrop.hint")}</span>
    </div>
  );
}

const styles = stylex.create({
  overlay: {
    position: "absolute",
    inset: 0,
    zIndex: localStack["--stave-stack-overlay"],
    display: "flex",
    flexWrap: "wrap",
    alignItems: "center",
    justifyContent: "center",
    gap: vars["--ads-space-8"],
    padding: vars["--ads-space-12"],
    borderRadius: "inherit",
    // The form's dashed drop outline sits inside its box, under this layer, so the layer draws it again.
    outlineColor: vars["--ads-color-accent"],
    outlineOffset: -2,
    outlineStyle: "dashed",
    outlineWidth: 2,
    // Opaque enough to put the draft behind the words, in the accent wash the outline already uses.
    backgroundColor: `color-mix(in oklch, ${vars["--ads-color-accent-soft"]} 92%, ${vars["--ads-color-surface"]})`,
    color: vars["--ads-color-text"],
    pointerEvents: "none",
    textAlign: "center",
  },
  icon: {
    flexShrink: 0,
    inlineSize: vars["--ads-control-icon-size-md"],
    blockSize: vars["--ads-control-icon-size-md"],
    color: vars["--ads-color-accent"],
  },
  title: {
    fontSize: vars["--ads-font-size-body"],
    fontWeight: vars["--ads-font-weight-semibold"],
    lineHeight: vars["--ads-line-height-tight"],
  },
  hint: {
    color: vars["--ads-color-text-muted"],
    fontSize: vars["--ads-font-size-body"],
    lineHeight: vars["--ads-line-height-tight"],
  },
});
