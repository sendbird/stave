import { i18n, useTranslation } from "@/i18n";
import type { CSSProperties } from "react";
import { Terminal } from "lucide-react";
import {
  Button,
  Popover,
  PopoverTrigger,
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui";
import { StandaloneCliPopoverContent } from "@/components/layout/standalone-cli/StandaloneCliPopover";
import * as stylex from "@stylexjs/stylex";
import { layoutShellStyles } from "./layout-shell.styles";
import { useAppStore } from "@/store/app.store";
import { useStandaloneCliStore } from "@/store/standalone-cli.store";

export function buildStandaloneCliTriggerLabel(args: {
  folderPath: string;
  open: boolean;
}) {
  if (!args.folderPath) {
    return i18n.t("shell:topBarStandaloneCli.standaloneCLISetAFolderIn");
  }
  return args.open ? i18n.t("shell:topBarStandaloneCli.closeStandaloneCLI") : i18n.t("shell:topBarStandaloneCli.openStandaloneCLI");
}

/**
 * `Escape` is the cancel key inside every CLI's TUI, so it has to reach the
 * PTY rather than dismiss the popover. Every other dismissal reason -- an
 * outside press, focus leaving the panel, a second press on the trigger --
 * closes normally.
 */
export function shouldCancelStandaloneCliOpenChange(reason: string) {
  return reason === "escape-key";
}

export function TopBarStandaloneCli(props: { noDragStyle: CSSProperties }) {
  useTranslation();
  const open = useStandaloneCliStore((state) => state.open);
  const openOverlay = useStandaloneCliStore((state) => state.openOverlay);
  const closeOverlay = useStandaloneCliStore((state) => state.closeOverlay);
  const folderPath = useAppStore(
    (state) => state.settings.standaloneCliFolderPath,
  );
  const label = buildStandaloneCliTriggerLabel({ folderPath, open });

  return (
    <Popover
      open={open}
      onOpenChange={(nextOpen, eventDetails) => {
        if (shouldCancelStandaloneCliOpenChange(eventDetails.reason)) {
          eventDetails.cancel();
          return;
        }
        if (nextOpen) {
          openOverlay();
          return;
        }
        closeOverlay();
      }}
    >
      <Tooltip>
        <TooltipTrigger
          render={<span {...stylex.props(layoutShellStyles.inlineFlex)} />}
        >
          <PopoverTrigger
            render={
              <Button
                variant="ghost"
                size="sm"
                aria-label={label}
                style={props.noDragStyle}
                xstyle={[
                  layoutShellStyles.topBarButton,
                  open && layoutShellStyles.topBarButtonActive,
                ]}
              />
            }
          >
            <Terminal {...stylex.props(layoutShellStyles.icon16)} />
          </PopoverTrigger>
        </TooltipTrigger>
        <TooltipContent side="bottom">{label}</TooltipContent>
      </Tooltip>
      <StandaloneCliPopoverContent />
    </Popover>
  );
}
