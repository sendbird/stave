import * as stylex from "@stylexjs/stylex";
import { useTranslation } from "@/i18n";
import { Button } from "@/components/aui/components/Button";
import { vars } from "@/components/aui/tokens/tokens.stylex";
import { sx } from "@/components/aui/utils/stylex";

export function FeatureEnableHint(props: { feature: "steering" | "checkpoints"; onEnable: () => void }) {
  const { t } = useTranslation("session");
  return (
    <div className={sx(styles.row)} data-feature-hint={props.feature}>
      <span>{t(`featureDiscovery.${props.feature}`)}</span>
      <Button variant="link" size="sm" onClick={props.onEnable}>
        {t("featureDiscovery.enable")}
      </Button>
    </div>
  );
}

const styles = stylex.create({
  row: {
    display: "flex",
    alignItems: "center",
    flexWrap: "wrap",
    gap: vars["--aui-space-4"],
    color: vars["--aui-color-text-muted"],
    fontSize: vars["--aui-font-size-caption"],
    minWidth: 0,
  },
});
