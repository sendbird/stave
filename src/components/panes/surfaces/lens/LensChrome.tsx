import { i18n, useTranslation } from "@/i18n";
import { chromeStyles } from "./lens-chrome.styles";
import { transition } from "@/components/ads/recipes/transition";
import { sx } from "../../../ads/utils/stylex";
import { CountBadge } from "@/components/system/CountBadge";
import {
  ArrowLeft,
  ArrowRight,
  Crosshair,
  Globe,
  Highlighter,
  Monitor,
  MoreHorizontal,
  Square,
  CodeXml,
  Network,
  RotateCw,
  Terminal,
  X,
} from "lucide-react";
import type { FormEvent, KeyboardEvent, RefObject } from "react";
import {
  Button,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
  InputGroup,
  InputGroupAddon,
  InputGroupButton,
  InputGroupInput,
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui";
import { LENS_TOOL_ICON_CLASS } from "@/components/panes/surfaces/lens/LensLogDetail";
import type { LensOverlayModesHandle } from "@/components/panes/surfaces/lens/useLensOverlayModes";
import { LENS_LOG_LIMIT, type LensPanelTab } from "@/lib/lens/lens-log-format";
import type { LensDownloadEntry } from "@/lib/lens/lens.types";

/**
 * Address-bar state and handlers. Structural on purpose: the panel satisfies
 * this today from its own state, and the session hook that will own navigation
 * satisfies it unchanged.
 */
export type LensChromeNavigation = {
  url: string;
  inputUrl: string;
  setInputUrl: (value: string) => void;
  isLoading: boolean;
  canGoBack: boolean;
  canGoForward: boolean;
  goBack: () => void;
  goForward: () => void;
  reload: () => void;
  stop: () => void;
  openDevTools: () => void;
  onSubmit: (event: FormEvent) => void;
  onUrlKeyDown: (event: KeyboardEvent<HTMLInputElement>) => void;
  urlInputRef: RefObject<HTMLInputElement | null>;
  /**
   * Set while the address bar holds focus. Navigation events consult it so an
   * in-flight SPA redirect cannot erase a half-typed address.
   */
  isUrlInputFocused: RefObject<boolean>;
};

/** Page-capture affordances: screenshots and the downloads menu. */
export type LensChromeCapture = {
  downloads: LensDownloadEntry[];
  saveScreenshot: (fullPage: boolean) => Promise<void>;
  downloadPageAssets: () => Promise<void>;
  openDownloadInFinder: (savePath: string) => void;
};

/**
 * Toolbar for one Lens session: navigation controls, address bar, the
 * preview/console/network tab strip, the overlay-mode toggles, and the capture
 * menus.
 *
 * Pure presentation over handles owned elsewhere. It holds no session state and
 * performs no IPC, so the guest can change from a composited native view to a
 * DOM element without this file moving.
 *
 * `onFloatingSurfaceOpenChange` is the one exception and it is temporary: both
 * dropdowns here paint over the preview, which today means the guest has to be
 * hidden for as long as they are open. It disappears with the rest of the
 * suppression path.
 */
export function LensChrome(props: {
  hasLensApi: boolean;
  /** True when the page has nothing to act on (no API, or `about:blank`). */
  lensPageActionDisabled: boolean;
  navigation: LensChromeNavigation;
  panelTab: LensPanelTab;
  onPanelTabChange: (tab: LensPanelTab) => void;
  /** Console/network badge counts, live plus buffered. */
  consoleEntryCount: number;
  networkEntryCount: number;
  overlayModes: LensOverlayModesHandle;
  /**
   * Whether the element picker can run, and why not when it cannot. Separate
   * from `overlayModes` because both answers turn on the active task and the
   * current address, neither of which the overlay modes know about.
   */
  picker: { disabled: boolean; tooltip: string };
  capture: LensChromeCapture;
  onFloatingSurfaceOpenChange: (open: boolean) => void;
}) {
  useTranslation();
  const {
    hasLensApi,
    lensPageActionDisabled,
    panelTab: lensPanelTab,
    onPanelTabChange: setLensPanelTab,
    consoleEntryCount,
    networkEntryCount,
    overlayModes,
    picker,
    capture,
    onFloatingSurfaceOpenChange: setFloatingSurfaceOpen,
  } = props;
  const { disabled: pickerDisabled, tooltip: pickerTooltip } = picker;
  const {
    url,
    inputUrl,
    setInputUrl,
    isLoading,
    canGoBack,
    canGoForward,
    goBack,
    goForward,
    reload,
    stop,
    openDevTools,
    onSubmit: handleSubmit,
    onUrlKeyDown: handleUrlKeyDown,
    urlInputRef,
    isUrlInputFocused,
  } = props.navigation;
  const {
    isAnnotationModeActive,
    isBoxInspectActive,
    isPickerActive,
    startElementPicker,
    toggleAnnotationMode,
    toggleBoxInspect,
  } = overlayModes;
  const {
    downloads,
    saveScreenshot,
    downloadPageAssets,
    openDownloadInFinder,
  } = capture;

  return (
    <div className={sx(chromeStyles.toolbar)}>
      <div className={sx(chromeStyles.row)}>
        <Tooltip>
          <TooltipTrigger
            render={
              <Button
                type="button"
                size="icon-sm"
                variant="ghost"
                xstyle={chromeStyles.toolInactive}
                disabled={!canGoBack || !hasLensApi}
                onClick={goBack}
                aria-label={i18n.t("lens:lensChrome.goBack")}
              />
            }
          >
            <ArrowLeft className={LENS_TOOL_ICON_CLASS} />
          </TooltipTrigger>
          <TooltipContent>{i18n.t("lens:lensChrome.back")}</TooltipContent>
        </Tooltip>

        <Tooltip>
          <TooltipTrigger
            render={
              <Button
                type="button"
                size="icon-sm"
                variant="ghost"
                xstyle={chromeStyles.toolInactive}
                disabled={!canGoForward || !hasLensApi}
                onClick={goForward}
                aria-label={i18n.t("lens:lensChrome.goForward")}
              />
            }
          >
            <ArrowRight className={LENS_TOOL_ICON_CLASS} />
          </TooltipTrigger>
          <TooltipContent>{i18n.t("lens:lensChrome.forward")}</TooltipContent>
        </Tooltip>

        <Tooltip>
          <TooltipTrigger
            render={
              <Button
                type="button"
                size="icon-sm"
                variant="ghost"
                xstyle={chromeStyles.toolInactive}
                disabled={!hasLensApi}
                onClick={isLoading ? stop : reload}
                aria-label={isLoading ? i18n.t("lens:lensChrome.stopLoading") : i18n.t("lens:lensChrome.reloadPage")}
              />
            }
          >
            {isLoading ? (
              <Square className={LENS_TOOL_ICON_CLASS} />
            ) : (
              <RotateCw className={LENS_TOOL_ICON_CLASS} />
            )}
          </TooltipTrigger>
          <TooltipContent>
            {isLoading ? i18n.t("lens:lensChrome.stopLoading") : i18n.t("lens:lensChrome.reload")}
          </TooltipContent>
        </Tooltip>

        <form onSubmit={handleSubmit} className={sx(chromeStyles.addressForm)}>
          <InputGroup
            xstyle={[
              chromeStyles.address,
              transition.ring,
              transition.motionDurationNormal,
            ]}
          >
            <InputGroupAddon
              align="inline-start"
              xstyle={chromeStyles.addressStart}
            >
              <Globe className={LENS_TOOL_ICON_CLASS} />
            </InputGroupAddon>
            <InputGroupInput
              ref={urlInputRef}
              type="text"
              aria-label={i18n.t("lens:lensChrome.pageAddress")}
              value={inputUrl}
              onChange={(event) => setInputUrl(event.target.value)}
              onKeyDown={handleUrlKeyDown}
              onFocus={(event) => {
                isUrlInputFocused.current = true;
                event.target.select();
              }}
              onBlur={() => {
                isUrlInputFocused.current = false;
                // Discard any uncommitted edit and restore the current page URL.
                setInputUrl(url === "about:blank" ? "" : url);
              }}
              placeholder={
                hasLensApi
                  ? "http://localhost:3000 or https://example.com"
                  : "Lens is unavailable in browser-only mode"
              }
              xstyle={chromeStyles.addressInput}
              disabled={!hasLensApi}
            />
            {inputUrl ? (
              <InputGroupAddon
                align="inline-end"
                xstyle={chromeStyles.addressEnd}
              >
                <InputGroupButton
                  size="icon-sm"
                  aria-label={i18n.t("lens:lensChrome.clearAddress")}
                  onClick={() => setInputUrl("")}
                >
                  <X className={sx(chromeStyles.compactIcon)} />
                </InputGroupButton>
              </InputGroupAddon>
            ) : null}
          </InputGroup>
        </form>
      </div>
      <div className={sx(chromeStyles.row)}>
        <div className={sx(chromeStyles.modes)}>
          {[
            {
              id: "preview" as const,
              label: i18n.t("lens:lensChrome.preview"),
              icon: Monitor,
              count: null,
            },
            {
              id: "console" as const,
              label: i18n.t("lens:lensChrome.console"),
              icon: Terminal,
              count: Math.min(LENS_LOG_LIMIT, consoleEntryCount),
            },
            {
              id: "network" as const,
              label: i18n.t("lens:lensChrome.network"),
              icon: Network,
              count: Math.min(LENS_LOG_LIMIT, networkEntryCount),
            },
          ].map((tab) => {
            const Icon = tab.icon;
            const active = lensPanelTab === tab.id;
            return (
              <Tooltip key={tab.id}>
                <TooltipTrigger
                  render={
                    <Button
                      type="button"
                      size="icon-sm"
                      variant={active ? "secondary" : "ghost"}
                      xstyle={[
                        chromeStyles.tab,
                        active
                          ? chromeStyles.toolActive
                          : chromeStyles.toolInactive,
                      ]}
                      onClick={() => setLensPanelTab(tab.id)}
                      aria-label={i18n.t("lens:lensChrome.show", { value1: tab.label.toLowerCase() })}
                      aria-pressed={active}
                      indicator={
                        tab.count ? (
                          <CountBadge count={tab.count} tone="neutral" />
                        ) : null
                      }
                    />
                  }
                >
                  <Icon className={LENS_TOOL_ICON_CLASS} />
                </TooltipTrigger>
                <TooltipContent>{tab.label}</TooltipContent>
              </Tooltip>
            );
          })}
        </div>

        <Tooltip>
          <TooltipTrigger
            render={
              <Button
                type="button"
                size="icon-sm"
                variant={isPickerActive ? "secondary" : "outline"}
                xstyle={[
                  isPickerActive
                    ? chromeStyles.toolActive
                    : chromeStyles.toolInactive,
                ]}
                disabled={pickerDisabled}
                onClick={() => {
                  void startElementPicker();
                }}
                aria-label={i18n.t("lens:lensChrome.pickElement")}
                aria-pressed={isPickerActive}
              />
            }
          >
            <Crosshair className={LENS_TOOL_ICON_CLASS} />
          </TooltipTrigger>
          <TooltipContent className={sx(chromeStyles.help)}>
            {pickerTooltip}
          </TooltipContent>
        </Tooltip>

        <Tooltip>
          <TooltipTrigger
            render={
              <Button
                type="button"
                size="icon-sm"
                variant={isAnnotationModeActive ? "secondary" : "outline"}
                xstyle={[
                  isAnnotationModeActive
                    ? chromeStyles.toolActive
                    : chromeStyles.toolInactive,
                ]}
                disabled={lensPageActionDisabled}
                onClick={() => {
                  void toggleAnnotationMode();
                }}
                aria-label={i18n.t("lens:lensChrome.toggleVisualComments")}
                aria-pressed={isAnnotationModeActive}
              />
            }
          >
            <Highlighter className={LENS_TOOL_ICON_CLASS} />
          </TooltipTrigger>
          <TooltipContent>
            {isAnnotationModeActive
              ? i18n.t("lens:lensChrome.visualCommentsActive")
              : i18n.t("lens:lensChrome.visualComments")}
          </TooltipContent>
        </Tooltip>

        <Tooltip>
          <TooltipTrigger
            render={
              <Button
                type="button"
                size="icon-sm"
                variant="ghost"
                disabled={lensPageActionDisabled}
                onClick={openDevTools}
                aria-label={i18n.t("lens:lensChrome.openDeveloperTools")}
              />
            }
          >
            <CodeXml className={LENS_TOOL_ICON_CLASS} />
          </TooltipTrigger>
          <TooltipContent>{i18n.t("lens:lensChrome.developerTools")}</TooltipContent>
        </Tooltip>
        <DropdownMenu onOpenChange={setFloatingSurfaceOpen}>
          <DropdownMenuTrigger
            render={
              <Button
                type="button"
                size="icon-sm"
                variant="ghost"
                disabled={!hasLensApi}
                aria-label={i18n.t("lens:lensChrome.moreBrowserTools")}
              />
            }
          >
            <MoreHorizontal className={LENS_TOOL_ICON_CLASS} />
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" xstyle={chromeStyles.downloadsMenu}>
            <DropdownMenuItem
              disabled={lensPageActionDisabled}
              onSelect={() => {
                void toggleBoxInspect();
              }}
            >
              {isBoxInspectActive ? i18n.t("lens:lensChrome.stopMeasuring") : i18n.t("lens:lensChrome.measureSpacing")}
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem
              disabled={lensPageActionDisabled}
              onSelect={() => {
                void saveScreenshot(false);
              }}
            >
              {i18n.t("lens:lensChrome.saveViewportScreenshot")}
            </DropdownMenuItem>
            <DropdownMenuItem
              disabled={lensPageActionDisabled}
              onSelect={() => {
                void saveScreenshot(true);
              }}
            >
              {i18n.t("lens:lensChrome.saveFullPageScreenshot")}
            </DropdownMenuItem>
            <DropdownMenuItem
              disabled={lensPageActionDisabled}
              onSelect={() => {
                void downloadPageAssets();
              }}
            >
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
                    <span className={sx(chromeStyles.downloadName)}>
                      {entry.filename}
                    </span>
                    <span className={sx(chromeStyles.downloadSize)}>
                      {entry.state}
                    </span>
                  </DropdownMenuItem>
                ))
            ) : (
              <DropdownMenuItem disabled>{i18n.t("lens:lensChrome.noDownloadsYet")}</DropdownMenuItem>
            )}
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </div>
  );
}
