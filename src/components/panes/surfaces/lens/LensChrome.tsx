import { i18n, useTranslation } from "@/i18n";
import { chromeStyles } from "./lens-chrome.styles";
import { transition } from "@/components/ads/recipes/transition";
import { sx } from "../../../ads/utils/stylex";
import { layoutShellStyles } from "@/components/layout/layout-shell.styles";
import {
  ArrowLeft,
  ArrowRight,
  Crosshair,
  Globe,
  Loader2,
  Maximize2,
  MessageSquarePlus,
  Minimize2,
  Monitor,
  Network,
  RotateCw,
  Square,
  Terminal,
  X,
} from "lucide-react";
import {
  useLayoutEffect,
  useState,
  type FormEvent,
  type KeyboardEvent,
  type RefObject,
} from "react";
import {
  Button,
  InputGroup,
  InputGroupAddon,
  InputGroupButton,
  InputGroupInput,
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui";
import { LENS_TOOL_ICON_CLASS } from "@/components/panes/surfaces/lens/LensLogDetail";
import { LensChromeMenu } from "@/components/panes/surfaces/lens/LensChromeMenu";
import { useLensChromeCompact } from "@/components/panes/surfaces/lens/useLensChromeCompact";
import type { LensOverlayModesHandle } from "@/components/panes/surfaces/lens/useLensOverlayModes";
import { formatLensAddressForDisplay } from "@/lib/lens/lens-address";
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

/** Full view of this pane; see `useLensFullView`. */
export type LensChromeFullView = {
  available: boolean;
  active: boolean;
  toggle: () => void;
};

/** Hand the current page to the rest of the desktop. */
export type LensChromePageLinks = {
  copyAddress: () => void;
  openInBrowser: () => void;
};

/** Page-capture affordances: screenshots and the downloads menu. */
export type LensChromeCapture = {
  downloads: LensDownloadEntry[];
  saveScreenshot: (fullPage: boolean) => Promise<void>;
  downloadPageAssets: () => Promise<void>;
  openDownloadInFinder: (savePath: string) => void;
};

/**
 * Toolbar for one Lens session, in one row: navigation, the address bar, then
 * the page tools — element picker, visual comments, the preview/console/network
 * switch, the overflow menu, and full view. A pane too narrow for one row wraps
 * the tools onto a second row rather than squeezing the address bar; a pane
 * narrower still moves the picker and comments into the overflow menu so the
 * tools keep one row.
 *
 * The picker and comments act on the page the user is looking at, so they
 * wait for the preview tab. An active comment mode can still be turned off
 * from any tab.
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
  pageLinks: LensChromePageLinks;
  fullView: LensChromeFullView;
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
    pageLinks,
    fullView,
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
    isPickerActive,
    startElementPicker,
    toggleAnnotationMode,
  } = overlayModes;

  const [isAddressFocused, setIsAddressFocused] = useState(false);
  const { ref: toolbarRef, compact } = useLensChromeCompact();
  // Focus swaps the shortened address for the full one, and React replacing
  // the value drops the selection. Select after that commit so a click or
  // Cmd+L still selects the whole address, ready to overwrite, and scroll
  // back to the start: selecting scrolls a long address toward its end.
  useLayoutEffect(() => {
    const input = urlInputRef.current;
    if (isAddressFocused && input) {
      input.select();
      input.scrollLeft = 0;
    }
  }, [isAddressFocused, urlInputRef]);
  const hasPage = !lensPageActionDisabled;
  const onPreview = lensPanelTab === "preview";
  const previewOnlyTooltip = i18n.t("lens:lensChrome.availableInPreview");
  const pickerUnavailable = pickerDisabled || !onPreview;
  const commentsUnavailable =
    lensPageActionDisabled || (!onPreview && !isAnnotationModeActive);
  const modeTabs = [
    {
      id: "preview" as const,
      label: i18n.t("lens:lensChrome.preview"),
      icon: Monitor,
      count: 0,
      countKey: null,
    },
    {
      id: "console" as const,
      label: i18n.t("lens:lensChrome.console"),
      icon: Terminal,
      count: Math.min(LENS_LOG_LIMIT, consoleEntryCount),
      countKey: "lens:lensChrome.consoleCount" as const,
    },
    {
      id: "network" as const,
      label: i18n.t("lens:lensChrome.network"),
      icon: Network,
      count: Math.min(LENS_LOG_LIMIT, networkEntryCount),
      countKey: "lens:lensChrome.networkCount" as const,
    },
  ];
  const fullViewLabel = fullView.active
    ? i18n.t("lens:lensChrome.exitFullView")
    : i18n.t("lens:lensChrome.enterFullView");

  return (
    <div
      ref={toolbarRef}
      className={sx(chromeStyles.toolbar)}
      data-testid="lens-chrome"
      data-compact={compact || undefined}
    >
      <div className={sx(chromeStyles.group)}>
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
            {/* Square, not X: X is the address field's clear control and the
                app's close/clear glyph, so an X here reads as a second clear
                button while the user edits during a load. */}
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
      </div>

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
            {isLoading ? (
              <Loader2
                aria-hidden
                className={sx(chromeStyles.compactIcon, chromeStyles.addressSpinner)}
              />
            ) : (
              <Globe aria-hidden className={sx(chromeStyles.compactIcon)} />
            )}
          </InputGroupAddon>
          <InputGroupInput
            ref={urlInputRef}
            type="text"
            inputMode="url"
            spellCheck={false}
            autoCapitalize="off"
            autoCorrect="off"
            aria-label={i18n.t("lens:lensChrome.pageAddress")}
            value={isAddressFocused ? inputUrl : formatLensAddressForDisplay(inputUrl)}
            onChange={(event) => setInputUrl(event.target.value)}
            onKeyDown={handleUrlKeyDown}
            onFocus={(event) => {
              isUrlInputFocused.current = true;
              setIsAddressFocused(true);
              event.target.select();
            }}
            onBlur={() => {
              isUrlInputFocused.current = false;
              setIsAddressFocused(false);
              // Discard any uncommitted edit and restore the current page URL.
              setInputUrl(url === "about:blank" ? "" : url);
            }}
            placeholder={
              hasLensApi
                ? i18n.t("lens:lensChrome.addressPlaceholder")
                : i18n.t("lens:lensChrome.addressUnavailable")
            }
            xstyle={chromeStyles.addressInput}
            disabled={!hasLensApi}
          />
          {isAddressFocused && inputUrl ? (
            <InputGroupAddon
              align="inline-end"
              xstyle={chromeStyles.addressEnd}
            >
              <InputGroupButton
                size="icon-xs"
                aria-label={i18n.t("lens:lensChrome.clearAddress")}
                // Pointer-only. Leaving the field restores the page URL, so a
                // Tab stop here would discard the edit and then unmount the
                // very control that took focus. Keyboard users already get the
                // whole address selected on focus and Escape to restore it.
                tabIndex={-1}
                // Keep focus in the field: a blur would restore the page URL
                // before the click could clear it.
                onMouseDown={(event) => event.preventDefault()}
                onClick={() => {
                  setInputUrl("");
                  urlInputRef.current?.focus();
                }}
              >
                <X className={sx(chromeStyles.compactIcon)} />
              </InputGroupButton>
            </InputGroupAddon>
          ) : null}
        </InputGroup>
      </form>

      <div className={sx(chromeStyles.group, chromeStyles.trailing)}>
        {compact ? null : (
          <>
            <Tooltip>
              <TooltipTrigger
                render={<span className={sx(layoutShellStyles.inlineFlex)} />}
              >
                <Button
                  type="button"
                  size="icon-sm"
                  variant="ghost"
                  xstyle={
                    isPickerActive
                      ? chromeStyles.toolActive
                      : chromeStyles.toolInactive
                  }
                  disabled={pickerUnavailable}
                  onClick={() => {
                    void startElementPicker();
                  }}
                  aria-label={i18n.t("lens:lensChrome.pickElement")}
                  aria-pressed={isPickerActive}
                >
                  <Crosshair className={LENS_TOOL_ICON_CLASS} />
                </Button>
              </TooltipTrigger>
              <TooltipContent className={sx(chromeStyles.help)}>
                {onPreview ? pickerTooltip : previewOnlyTooltip}
              </TooltipContent>
            </Tooltip>

            <Tooltip>
              <TooltipTrigger
                render={<span className={sx(layoutShellStyles.inlineFlex)} />}
              >
                <Button
                  type="button"
                  size="icon-sm"
                  variant="ghost"
                  xstyle={
                    isAnnotationModeActive
                      ? chromeStyles.toolActive
                      : chromeStyles.toolInactive
                  }
                  disabled={commentsUnavailable}
                  onClick={() => {
                    void toggleAnnotationMode();
                  }}
                  aria-label={i18n.t("lens:lensChrome.toggleVisualComments")}
                  aria-pressed={isAnnotationModeActive}
                >
                  <MessageSquarePlus className={LENS_TOOL_ICON_CLASS} />
                </Button>
              </TooltipTrigger>
              <TooltipContent>
                {isAnnotationModeActive
                  ? i18n.t("lens:lensChrome.visualCommentsActive")
                  : onPreview
                    ? i18n.t("lens:lensChrome.visualComments")
                    : previewOnlyTooltip}
              </TooltipContent>
            </Tooltip>
          </>
        )}

        <div
          className={sx(chromeStyles.modes)}
          role="group"
          aria-label={i18n.t("lens:lensChrome.panelView")}
        >
          {modeTabs.map((tab) => {
            const Icon = tab.icon;
            const active = lensPanelTab === tab.id;
            const count = tab.count > 0 ? tab.count : null;
            // The bare number reads like an error badge, so the tooltip and
            // the accessible name say what is being counted.
            const countText =
              count && tab.countKey ? i18n.t(tab.countKey, { count }) : null;
            return (
              <Tooltip key={tab.id}>
                <TooltipTrigger
                  render={
                    <Button
                      type="button"
                      size={count ? "xs" : "icon-xs"}
                      variant="ghost"
                      xstyle={[
                        chromeStyles.modeTab,
                        active ? chromeStyles.modeTabActive : chromeStyles.toolInactive,
                      ]}
                      onClick={() => setLensPanelTab(tab.id)}
                      aria-label={
                        countText
                          ? i18n.t("lens:lensChrome.showWithCount", {
                              value1: tab.label.toLowerCase(),
                              value2: countText,
                            })
                          : i18n.t("lens:lensChrome.show", { value1: tab.label.toLowerCase() })
                      }
                      aria-pressed={active}
                    />
                  }
                >
                  <Icon className={LENS_TOOL_ICON_CLASS} />
                  {count ? (
                    <span aria-hidden className={sx(chromeStyles.modeCount)}>
                      {count}
                    </span>
                  ) : null}
                </TooltipTrigger>
                <TooltipContent>
                  {countText
                    ? i18n.t("lens:lensChrome.viewWithCount", {
                        value1: tab.label,
                        value2: countText,
                      })
                    : tab.label}
                </TooltipContent>
              </Tooltip>
            );
          })}
        </div>

        <LensChromeMenu
          capture={capture}
          hasLensApi={hasLensApi}
          hasPage={hasPage}
          onOpenChange={setFloatingSurfaceOpen}
          onPreview={onPreview}
          openDevTools={openDevTools}
          overlayModes={overlayModes}
          pageLinks={pageLinks}
          pageTools={
            compact
              ? { pickerDisabled: pickerUnavailable, commentsDisabled: commentsUnavailable }
              : null
          }
        />

        <Tooltip>
          <TooltipTrigger
            render={<span className={sx(layoutShellStyles.inlineFlex)} />}
          >
            <Button
              type="button"
              size="icon-sm"
              variant="ghost"
              xstyle={
                fullView.active
                  ? chromeStyles.toolActive
                  : chromeStyles.toolInactive
              }
              disabled={!fullView.available}
              onClick={fullView.toggle}
              // The label names the action (enter or exit), so the state is
              // not repeated through aria-pressed.
              aria-label={fullViewLabel}
              data-testid="lens-full-view-toggle"
            >
              {fullView.active ? (
                <Minimize2 className={LENS_TOOL_ICON_CLASS} />
              ) : (
                <Maximize2 className={LENS_TOOL_ICON_CLASS} />
              )}
            </Button>
          </TooltipTrigger>
          <TooltipContent className={sx(chromeStyles.help)}>
            {fullView.available
              ? fullViewLabel
              : i18n.t("lens:lensChrome.fullViewUnavailable")}
          </TooltipContent>
        </Tooltip>
      </div>
    </div>
  );
}
