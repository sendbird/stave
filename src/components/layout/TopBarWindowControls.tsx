import { i18n, useTranslation } from "@/i18n";
import { Minus, Square, X } from "lucide-react";
import { memo, useEffect, useState, type CSSProperties } from "react";
import { Tooltip } from "@/components/ads/components/Tooltip";
import { Button } from "@/components/ui";
import * as stylex from "@stylexjs/stylex";
import { layoutShellStyles } from "./layout-shell.styles";

interface TopBarWindowControlsProps {
  noDragStyle: CSSProperties;
}

export const TopBarWindowControls = memo(function TopBarWindowControls({
  noDragStyle,
}: TopBarWindowControlsProps) {
  useTranslation();
  const [isMaximized, setIsMaximized] = useState(false);

  useEffect(() => {
    let mounted = true;

    const syncWindowState = async () => {
      const getState = window.api?.window?.isMaximized;
      if (!getState) {
        return;
      }
      const state = await getState();
      if (state && mounted) {
        setIsMaximized(Boolean(state.isMaximized));
      }
    };

    void syncWindowState();
    const initPoll = window.setInterval(() => {
      void syncWindowState();
    }, 250);
    const steadyPoll = window.setInterval(() => {
      void syncWindowState();
    }, 1000);
    const initStop = window.setTimeout(
      () => window.clearInterval(initPoll),
      5000,
    );

    return () => {
      mounted = false;
      window.clearInterval(initPoll);
      window.clearInterval(steadyPoll);
      window.clearTimeout(initStop);
    };
  }, []);

  const maximizeLabel = isMaximized
    ? i18n.t("shell:topBarWindowControls.restoreWindow")
    : i18n.t("shell:topBarWindowControls.maximize");

  return (
    <div {...stylex.props(layoutShellStyles.windowControls)}>
      <span {...stylex.props(layoutShellStyles.windowDivider)} aria-hidden="true" />
      <Tooltip content={i18n.t("shell:topBarWindowControls.minimize")} side="bottom">
        <Button
          variant="ghost"
          size="sm"
          xstyle={layoutShellStyles.windowButton}
          onClick={() => void window.api?.window?.minimize?.()}
          aria-label={i18n.t("shell:topBarWindowControls.minimize")}
          style={noDragStyle}
        >
          <Minus {...stylex.props(layoutShellStyles.icon14)} />
        </Button>
      </Tooltip>
      <Tooltip content={maximizeLabel} side="bottom">
        <Button
          variant="ghost"
          size="sm"
          xstyle={layoutShellStyles.windowButton}
          onClick={async () => {
            const next = await window.api?.window?.toggleMaximize?.();
            if (next) {
              setIsMaximized(next.isMaximized);
            }
          }}
          aria-label={maximizeLabel}
          style={noDragStyle}
        >
          <Square {...stylex.props(layoutShellStyles.icon14, isMaximized && layoutShellStyles.subdued)} />
        </Button>
      </Tooltip>
      <Tooltip content={i18n.t("shell:topBarWindowControls.closeWindow")} side="bottom">
        <Button
          variant="ghost"
          size="sm"
          xstyle={[layoutShellStyles.windowButton, layoutShellStyles.closeWindowButton]}
          onClick={() => void window.api?.window?.close?.()}
          aria-label={i18n.t("shell:topBarWindowControls.closeWindow")}
          style={noDragStyle}
        >
          <X {...stylex.props(layoutShellStyles.icon14)} />
        </Button>
      </Tooltip>
    </div>
  );
});
