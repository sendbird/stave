import { useLayoutEffect, useRef, useState } from "react";
import {
  DockviewReact,
  type DockviewReadyEvent,
  type IDockviewPanelProps,
} from "dockview-react";
import "dockview-react/dist/styles/dockview.css";
import { useLensFullView } from "@/components/panes/surfaces/lens/useLensFullView";
import * as stylex from "@stylexjs/stylex";
import { applyAppLocale } from "@/i18n";
import { vars } from "@/components/ads/tokens/tokens.stylex";
import { sx } from "@/components/ads/utils/stylex";
import { TooltipProvider } from "@/components/ui";
import {
  LensChrome,
  type LensChromeNavigation,
} from "@/components/panes/surfaces/lens/LensChrome";
import type { LensOverlayModesHandle } from "@/components/panes/surfaces/lens/useLensOverlayModes";
import type { LensPanelTab } from "@/lib/lens/lens-log-format";
import { applyCustomTheme, applyThemeClass } from "@/lib/themes/apply";
import { BUILTIN_CUSTOM_THEMES } from "@/lib/themes/builtin-themes";

/**
 * The Lens toolbar on the dev preview (`?stavePreview=lens-chrome`), at the
 * pane widths it actually gets: wide, a typical split beside a task, and a
 * narrow column. `&theme=dark` or `&theme=<built-in theme id>` and `&lang=ko`
 * apply.
 */
const params = new URLSearchParams(window.location.search);

const CASES: Array<{
  id: string;
  width: number;
  url: string;
  isLoading?: boolean;
  annotation?: boolean;
  maximized?: boolean;
  canMaximize?: boolean;
  tab?: LensPanelTab;
  counts?: [number, number];
}> = [
  { id: "wide", width: 1120, url: "http://localhost:5173/settings/profile", canMaximize: true },
  { id: "split", width: 640, url: "https://example.com/docs/getting-started", annotation: true, canMaximize: true },
  { id: "split-maximized", width: 640, url: "http://localhost:3000/", isLoading: true, maximized: true, canMaximize: true },
  { id: "narrow", width: 420, url: "http://localhost:5173/a/very/long/path/that/needs/to/truncate?query=1", canMaximize: true },
  { id: "single-pane", width: 640, url: "about:blank", canMaximize: false },
  { id: "console-tab", width: 640, url: "http://localhost:5173/", annotation: true, canMaximize: true, tab: "console" },
  { id: "compact-edge-max-counts", width: 322, url: "http://localhost:5173/", canMaximize: true, counts: [200, 200] },
  { id: "below-compact", width: 318, url: "http://localhost:5173/", canMaximize: true },
  { id: "tiny", width: 240, url: "http://localhost:5173/", canMaximize: true },
];

function noop() {}
async function asyncNoop() {}

type PreviewCaseProps = (typeof CASES)[number] & {
  fullViewOverride?: { available: boolean; active: boolean; toggle: () => void };
  fill?: boolean;
};

function PreviewCase(props: PreviewCaseProps) {
  const [inputUrl, setInputUrl] = useState(props.url === "about:blank" ? "" : props.url);
  const [panelTab, setPanelTab] = useState<LensPanelTab>(props.tab ?? "preview");
  const [maximized, setMaximized] = useState(Boolean(props.maximized));
  const urlInputRef = useRef<HTMLInputElement | null>(null);
  const isUrlInputFocused = useRef(false);
  const navigation: LensChromeNavigation = {
    url: props.url,
    inputUrl,
    setInputUrl,
    isLoading: Boolean(props.isLoading),
    canGoBack: true,
    canGoForward: false,
    goBack: noop,
    goForward: noop,
    reload: noop,
    stop: noop,
    openDevTools: noop,
    onSubmit: (event) => event.preventDefault(),
    onUrlKeyDown: noop,
    urlInputRef,
    isUrlInputFocused,
  };
  const overlayModes: LensOverlayModesHandle = {
    isAnnotationModeActive: Boolean(props.annotation),
    isBoxInspectActive: false,
    isPickerActive: false,
    toggleAnnotationMode: asyncNoop,
    toggleBoxInspect: asyncNoop,
    startElementPicker: asyncNoop,
    setIsAnnotationModeActive: noop,
    setIsBoxInspectActive: noop,
  };
  const blank = props.url === "about:blank";
  return (
    <section className={sx(styles.case)} data-preview-case={props.id}>
      {props.fill ? null : (
        <p className={sx(styles.caption)}>
          {props.id} · {props.width}px
        </p>
      )}
      <div className={sx(styles.frame, props.fill && styles.frameFill)} style={props.fill ? undefined : { width: props.width }}>
        <LensChrome
          capture={{
            downloads: [],
            saveScreenshot: asyncNoop,
            downloadPageAssets: asyncNoop,
            openDownloadInFinder: noop,
          }}
          consoleEntryCount={props.counts?.[0] ?? 12}
          pageLinks={{ copyAddress: noop, openInBrowser: noop }}
          hasLensApi
          lensPageActionDisabled={blank}
          navigation={navigation}
          networkEntryCount={props.counts?.[1] ?? 3}
          onFloatingSurfaceOpenChange={noop}
          onPanelTabChange={setPanelTab}
          overlayModes={overlayModes}
          panelTab={panelTab}
          picker={{ disabled: blank, tooltip: "Pick an element" }}
          fullView={props.fullViewOverride ?? {
            available: Boolean(props.canMaximize),
            active: maximized,
            toggle: () => setMaximized((current) => !current),
          }}
        />
        <div className={sx(styles.page)} />
      </div>
    </section>
  );
}

/** A Lens toolbar wired to a real pane host, so full view drives Dockview. */
function DockLensPanel(props: IDockviewPanelProps) {
  const fullView = useLensFullView({ panelApi: props.api, containerApi: props.containerApi });
  return (
    <div className={sx(styles.dockPanel)} data-dock-lens-panel="">
      <PreviewCase id="dock" width={0} url="http://localhost:5173/" fill fullViewOverride={fullView} />
    </div>
  );
}

function DockOtherPanel() {
  return <div className={sx(styles.dockPanel)} data-dock-other-panel="">Task</div>;
}

function onDockReady(event: DockviewReadyEvent) {
  // Dev preview only: lets a browser check drive layout changes from outside.
  (window as unknown as { __lensPreviewDockApi?: unknown }).__lensPreviewDockApi = event.api;
  event.api.addPanel({ id: "task", component: "other", title: "Task" });
  event.api.addPanel({
    id: "lens",
    component: "lens",
    title: "Lens",
    position: { referencePanel: "task", direction: "right" },
  });
}

function DockCase() {
  return (
    <section className={sx(styles.case)} data-preview-case="dock">
      <p className={sx(styles.caption)}>dock · two groups</p>
      <div className={sx(styles.dock)} data-dock-host="">
        <DockviewReact
          components={{ lens: DockLensPanel, other: DockOtherPanel }}
          onReady={onDockReady}
        />
      </div>
    </section>
  );
}

export function LensChromePreview() {
  const theme = params.get("theme");
  const builtinTheme = BUILTIN_CUSTOM_THEMES.find((candidate) => candidate.id === theme) ?? null;
  useLayoutEffect(() => {
    applyThemeClass({ enabled: theme === "dark" || builtinTheme?.baseMode === "dark" });
    applyCustomTheme({ theme: builtinTheme });
    applyAppLocale(params.get("lang") ?? "en");
  }, [theme, builtinTheme]);
  return (
    <TooltipProvider delay={120}>
      <main className={sx(styles.root)}>
        {CASES.map((entry) => (
          <PreviewCase key={entry.id} {...entry} />
        ))}
        <DockCase />
      </main>
    </TooltipProvider>
  );
}

const styles = stylex.create({
  root: { display: "grid", gap: vars["--ads-space-16"], padding: vars["--ads-space-24"], backgroundColor: vars["--ads-color-canvas"], minHeight: "100vh", alignContent: "start" },
  case: { display: "grid", gap: vars["--ads-space-8"] },
  caption: { margin: 0, fontSize: vars["--ads-font-size-caption"], color: vars["--ads-color-text-subtle"] },
  frame: { display: "flex", flexDirection: "column", overflow: "hidden", borderRadius: vars["--ads-radius-panel"], borderWidth: vars["--ads-border-width-hairline"], borderStyle: "solid", borderColor: vars["--ads-color-border"], backgroundColor: vars["--ads-color-canvas-subtle"] },
  frameFill: { height: "100%", borderRadius: 0, borderWidth: 0 },
  page: { height: 96, backgroundColor: vars["--ads-color-canvas"] },
  dock: { height: 260, width: 1120, borderWidth: vars["--ads-border-width-hairline"], borderStyle: "solid", borderColor: vars["--ads-color-border"] },
  dockPanel: { height: "100%", overflow: "hidden", padding: vars["--ads-space-8"], boxSizing: "border-box" },
});
