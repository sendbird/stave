import { i18n, useTranslation } from "@/i18n";
import type { ReactNode } from "react";
import { VersionCompare, type VersionCompareProps } from "@/components/ads/components/VersionCompare";

/**
 * ADS `VersionCompare` with Stave's words in English and Korean: a before and
 * after pair of review evidence (side by side, slider, onion skin or
 * difference). The version labels default to Before and After.
 */
export function ReviewVersionCompare(
  props: Omit<VersionCompareProps, "copy" | "baselineLabel" | "currentLabel"> & { baselineLabel?: ReactNode; currentLabel?: ReactNode },
) {
  useTranslation();
  const { baselineLabel, currentLabel, ...rest } = props;
  return (
    <VersionCompare
      {...rest}
      baselineLabel={baselineLabel ?? i18n.t("ui:versionCompare.before")}
      currentLabel={currentLabel ?? i18n.t("ui:versionCompare.after")}
      copy={{
        mode: i18n.t("ui:versionCompare.mode"),
        modes: {
          "side-by-side": i18n.t("ui:versionCompare.sideBySide"),
          slider: i18n.t("ui:versionCompare.slider"),
          onion: i18n.t("ui:versionCompare.onion"),
          diff: i18n.t("ui:versionCompare.diff"),
        },
        revealCurrent: i18n.t("ui:versionCompare.revealCurrent"),
        overlayCurrent: i18n.t("ui:versionCompare.overlayCurrent"),
      }}
    />
  );
}
