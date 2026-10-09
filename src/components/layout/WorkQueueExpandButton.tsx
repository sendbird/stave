import { useTranslation } from "@/i18n";
import { Maximize2 } from "lucide-react";
import { sx } from "@/components/ads/utils/stylex";
import { repositorySidebarStyles } from "@/components/layout/repository-workspace-sidebar.styles";
import { Button, Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui";
import { useAppStore } from "@/store/app.store";

/**
 * The Work queue's expand control. Fleet View is the Work queue's full view:
 * every workspace as a card, in the same order (`work-attention-order.ts`),
 * with the attention rail and board filters the sidebar has no room for.
 */
export function WorkQueueExpandButton() {
  const { t } = useTranslation(["fleet"]);
  const openFleetView = useAppStore((state) => state.openFleetView);
  return (
    <Tooltip>
      <TooltipTrigger
        render={
          <Button
            type="button"
            variant="ghost"
            size="sm"
            xstyle={repositorySidebarStyles.chromeButtonSidebar}
            onClick={() => openFleetView()}
            data-testid="work-queue-open-full-view"
            aria-label={t("fleet:sidebarWorkQueue.openFullView")}
          />
        }
      >
        <Maximize2 className={sx(repositorySidebarStyles.iconMd)} />
      </TooltipTrigger>
      <TooltipContent side="top">{t("fleet:sidebarWorkQueue.openFullView")}</TooltipContent>
    </Tooltip>
  );
}
