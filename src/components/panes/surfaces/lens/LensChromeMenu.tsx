import { i18n } from "@/i18n";
import { chromeStyles } from "./lens-chrome.styles";
import { sx } from "../../../ads/utils/stylex";
import { layoutShellStyles } from "@/components/layout/layout-shell.styles";
import {
  Camera,
  CodeXml,
  Crosshair,
  Download,
  ExternalLink,
  Link2,
  MessageSquarePlus,
  MoreHorizontal,
  Ruler,
  ScrollText,
} from "lucide-react";
import {
  Button,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui";
import { LENS_TOOL_ICON_CLASS } from "@/components/panes/surfaces/lens/LensLogDetail";
import type { LensOverlayModesHandle } from "@/components/panes/surfaces/lens/useLensOverlayModes";
import type {
  LensChromeCapture,
  LensChromePageLinks,
} from "@/components/panes/surfaces/lens/LensChrome";

/**
 * The toolbar's overflow menu: page links, developer tools, captures, and
 * recent downloads. In a compact toolbar it also carries the element picker
 * and visual comments, which no longer fit as buttons.
 */
export function LensChromeMenu(props: {
  hasLensApi: boolean;
  /** A page is loaded (not `about:blank`). */
  hasPage: boolean;
  /**
   * The preview is the visible tab. The page overlays (picker, comments,
   * measuring) act on what the user is looking at, so they wait for it.
   */
  onPreview: boolean;
  openDevTools: () => void;
  overlayModes: LensOverlayModesHandle;
  pageLinks: LensChromePageLinks;
  capture: LensChromeCapture;
  /** Set when the toolbar is compact and the page tools live here. */
  pageTools: { pickerDisabled: boolean; commentsDisabled: boolean } | null;
  onOpenChange: (open: boolean) => void;
}) {
  const { hasLensApi, hasPage, onPreview, overlayModes, pageLinks, pageTools } = props;
  const { downloads, saveScreenshot, downloadPageAssets, openDownloadInFinder } = props.capture;
  const {
    isAnnotationModeActive,
    isBoxInspectActive,
    startElementPicker,
    toggleAnnotationMode,
    toggleBoxInspect,
  } = overlayModes;

  return (
    <DropdownMenu onOpenChange={props.onOpenChange}>
      <Tooltip>
        <TooltipTrigger render={<span className={sx(layoutShellStyles.inlineFlex)} />}>
          <DropdownMenuTrigger
            render={
              <Button
                type="button"
                size="icon-sm"
                variant="ghost"
                xstyle={chromeStyles.toolInactive}
                disabled={!hasLensApi}
                aria-label={i18n.t("lens:lensChrome.moreBrowserTools")}
              />
            }
          >
            <MoreHorizontal className={LENS_TOOL_ICON_CLASS} />
          </DropdownMenuTrigger>
        </TooltipTrigger>
        <TooltipContent>{i18n.t("lens:lensChrome.moreBrowserTools")}</TooltipContent>
      </Tooltip>
      <DropdownMenuContent align="end" xstyle={chromeStyles.downloadsMenu}>
        {pageTools ? (
          <>
            <DropdownMenuItem
              disabled={pageTools.pickerDisabled}
              onSelect={() => {
                void startElementPicker();
              }}
            >
              <Crosshair aria-hidden className={LENS_TOOL_ICON_CLASS} />
              {i18n.t("lens:lensChrome.pickElement")}
            </DropdownMenuItem>
            <DropdownMenuItem
              disabled={pageTools.commentsDisabled}
              onSelect={() => {
                void toggleAnnotationMode();
              }}
            >
              <MessageSquarePlus aria-hidden className={LENS_TOOL_ICON_CLASS} />
              {isAnnotationModeActive
                ? i18n.t("lens:lensChrome.stopVisualComments")
                : i18n.t("lens:lensChrome.visualComments")}
            </DropdownMenuItem>
            <DropdownMenuSeparator />
          </>
        ) : null}
        <DropdownMenuItem disabled={!hasPage} onSelect={pageLinks.copyAddress}>
          <Link2 aria-hidden className={LENS_TOOL_ICON_CLASS} />
          {i18n.t("lens:lensChrome.copyPageAddress")}
        </DropdownMenuItem>
        <DropdownMenuItem disabled={!hasPage} onSelect={pageLinks.openInBrowser}>
          <ExternalLink aria-hidden className={LENS_TOOL_ICON_CLASS} />
          {i18n.t("lens:lensChrome.openInDefaultBrowser")}
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        <DropdownMenuItem disabled={!hasPage} onSelect={props.openDevTools}>
          <CodeXml aria-hidden className={LENS_TOOL_ICON_CLASS} />
          {i18n.t("lens:lensChrome.openDeveloperTools")}
        </DropdownMenuItem>
        <DropdownMenuItem
          // Turning an active measure off stays possible from any tab.
          disabled={!hasPage || (!onPreview && !isBoxInspectActive)}
          onSelect={() => {
            void toggleBoxInspect();
          }}
        >
          <Ruler aria-hidden className={LENS_TOOL_ICON_CLASS} />
          {isBoxInspectActive
            ? i18n.t("lens:lensChrome.stopMeasuring")
            : i18n.t("lens:lensChrome.measureSpacing")}
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        <DropdownMenuItem
          disabled={!hasPage}
          onSelect={() => {
            void saveScreenshot(false);
          }}
        >
          <Camera aria-hidden className={LENS_TOOL_ICON_CLASS} />
          {i18n.t("lens:lensChrome.saveViewportScreenshot")}
        </DropdownMenuItem>
        <DropdownMenuItem
          disabled={!hasPage}
          onSelect={() => {
            void saveScreenshot(true);
          }}
        >
          <ScrollText aria-hidden className={LENS_TOOL_ICON_CLASS} />
          {i18n.t("lens:lensChrome.saveFullPageScreenshot")}
        </DropdownMenuItem>
        <DropdownMenuItem
          disabled={!hasPage}
          onSelect={() => {
            void downloadPageAssets();
          }}
        >
          <Download aria-hidden className={LENS_TOOL_ICON_CLASS} />
          {i18n.t("lens:lensChrome.downloadPageAssets")}
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        <DropdownMenuLabel>{i18n.t("lens:lensChrome.recentDownloads")}</DropdownMenuLabel>
        {downloads.length > 0 ? (
          downloads
            .slice(-5)
            .reverse()
            .map((entry) => (
              <DropdownMenuItem
                key={entry.id}
                className={sx(chromeStyles.downloadRow)}
                onSelect={() => openDownloadInFinder(entry.savePath)}
              >
                <span className={sx(chromeStyles.downloadName)}>{entry.filename}</span>
                <span className={sx(chromeStyles.downloadSize)}>{entry.state}</span>
              </DropdownMenuItem>
            ))
        ) : (
          <DropdownMenuItem disabled>{i18n.t("lens:lensChrome.noDownloadsYet")}</DropdownMenuItem>
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
