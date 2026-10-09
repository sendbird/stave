import { BrowserWindow, type NativeImage, type Session, type WebContents } from "electron";
import {
  formatInlineRenderPreviewConsoleMessage,
  INLINE_RENDER_PREVIEW_INITIAL_HEIGHT,
  INLINE_RENDER_PREVIEW_LOAD_BUDGET_MS,
  INLINE_RENDER_PREVIEW_MAX_RESIZE_ROUNDS,
  inlineRenderPreviewCaptureHeight,
  nextInlineRenderPreviewViewport,
  planInlineRenderPreviewSlices,
  shouldBlockInlineRenderPreviewNavigation,
  shouldReportInlineRenderPreviewConsoleMessage,
  type InlineRenderPreviewImage,
  type InlineRenderPreviewMessageLog,
} from "../../../src/lib/inline-render/inline-render-preview";

/**
 * Stave's measurements run in their own JavaScript world: the page shares the
 * DOM with it but none of its globals, so a page cannot fake its size by
 * overriding the timers, `requestAnimationFrame`, or layout reads.
 */
const MEASURE_WORLD_ID = 1_074;

/** A slice bigger than this is sent as JPEG so one image stays well under model upload limits. */
const MAX_PNG_SLICE_BYTES = 3 * 1024 * 1024;

/**
 * Waits for the viewport Stave asked for, the page's fonts, and two animation
 * frames (each capped, so a page that never settles is still measured), then
 * measures the content the same way the conversation frame's bootstrap does,
 * and reports the viewport the window really got.
 */
function settleAndMeasureScript(viewportHeight: number): string {
  return `(async () => {
    const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
    const frame = () => new Promise((resolve) => requestAnimationFrame(() => resolve()));
    for (let waited = 0; window.innerHeight !== ${viewportHeight} && waited < 1000; waited += 25) await sleep(25);
    try { if (document.fonts) await Promise.race([document.fonts.ready, sleep(3000)]); } catch (error) {}
    await Promise.race([frame().then(frame), sleep(500)]);
    const root = document.documentElement;
    const body = document.body;
    return {
      contentHeight: Math.ceil(Math.max(root.getBoundingClientRect().height, body ? body.scrollHeight : 0)),
      viewportHeight: window.innerHeight,
    };
  })()`;
}

async function settleAndMeasure(
  contents: WebContents,
  viewportHeight: number,
): Promise<{ contentHeight: number; viewportHeight: number }> {
  const measured = (await contents.executeJavaScriptInIsolatedWorld(MEASURE_WORLD_ID, [
    { code: settleAndMeasureScript(viewportHeight) },
  ])) as { contentHeight?: unknown; viewportHeight?: unknown } | null;
  const read = (value: unknown, fallback: number) =>
    typeof value === "number" && Number.isFinite(value) && value >= 0 ? value : fallback;
  return {
    contentHeight: read(measured?.contentHeight, 0),
    viewportHeight: read(measured?.viewportHeight, viewportHeight),
  };
}

function throwIfAborted(signal: AbortSignal) {
  if (signal.aborted) throw new Error("preview stopped");
}

/**
 * Loads the page and resolves once it has loaded, or with `true` once the
 * load budget runs out first: a page waiting on a slow resource is still
 * worth capturing as it is.
 */
async function loadWithinBudget(window: BrowserWindow, url: string): Promise<boolean> {
  const loading = window.loadURL(url);
  // Rejections after the budget (the window torn down mid-load) are not news.
  loading.catch(() => undefined);
  let timer: ReturnType<typeof setTimeout> | undefined;
  const budget = new Promise<"budget">((resolve) => {
    timer = setTimeout(() => resolve("budget"), INLINE_RENDER_PREVIEW_LOAD_BUDGET_MS);
  });
  try {
    return (await Promise.race([loading.then(() => "loaded" as const), budget])) === "budget";
  } finally {
    clearTimeout(timer);
  }
}

function encodeSlices(
  capture: NativeImage,
  width: number,
  capturedHeight: number,
): InlineRenderPreviewImage[] {
  if (capture.isEmpty()) {
    throw new Error("The preview window produced no frame to capture.");
  }
  // The capture comes back at the display's scale factor; the agent reasons
  // in CSS pixels, so it gets one image pixel per CSS pixel.
  const image = capture.resize({ width, height: capturedHeight, quality: "best" });
  return planInlineRenderPreviewSlices(capturedHeight).map(({ top, height }) => {
    const slice = image.crop({ x: 0, y: top, width, height });
    const png = slice.toPNG();
    return png.length <= MAX_PNG_SLICE_BYTES
      ? { data: png.toString("base64"), mimeType: "image/png" as const, top, height }
      : { data: slice.toJPEG(85).toString("base64"), mimeType: "image/jpeg" as const, top, height };
  });
}

export interface InlineRenderPreviewWindowResult {
  firstContentHeight: number;
  contentHeight: number;
  viewportHeight: number;
  capturedHeight: number;
  loadTimedOut: boolean;
  images: InlineRenderPreviewImage[];
}

/**
 * Renders one page in a hidden window and captures it. The window is always
 * destroyed before this returns, and at once when `signal` aborts (the
 * deadline), even if the page's renderer is stuck in a loop.
 *
 * The window is a plain sandboxed renderer: no preload, no Node, context
 * isolation, in the slot's own session. It refuses every navigation and
 * window the page starts, and the page's CSP (the conversation's, from the
 * response header) applies the user's network policy and the frame sandbox.
 */
export async function captureInlineRenderPreviewWindow(args: {
  session: Session;
  url: string;
  width: number;
  documentLineOffset: number;
  signal: AbortSignal;
  consoleLog: InlineRenderPreviewMessageLog;
  blockedNavigations: InlineRenderPreviewMessageLog;
}): Promise<InlineRenderPreviewWindowResult> {
  throwIfAborted(args.signal);
  const window = new BrowserWindow({
    show: false,
    width: args.width,
    height: INLINE_RENDER_PREVIEW_INITIAL_HEIGHT,
    useContentSize: true,
    frame: false,
    // A tall page needs a viewport taller than the screen.
    enableLargerThanScreen: true,
    skipTaskbar: true,
    focusable: false,
    // Painting a hidden window is what makes it measurable and capturable.
    paintWhenInitiallyHidden: true,
    webPreferences: {
      session: args.session,
      sandbox: true,
      contextIsolation: true,
      nodeIntegration: false,
      nodeIntegrationInWorker: false,
      nodeIntegrationInSubFrames: false,
      webSecurity: true,
      allowRunningInsecureContent: false,
      webviewTag: false,
      devTools: false,
      spellcheck: false,
      disableDialogs: true,
      navigateOnDragDrop: false,
      autoplayPolicy: "document-user-activation-required",
      // Animation frames and timers must run although nothing is on screen.
      backgroundThrottling: false,
    },
  });
  const contents = window.webContents;
  const destroy = () => {
    if (!window.isDestroyed()) window.destroy();
  };
  const stop = () => {
    try {
      // A page stuck in a loop never yields; take its renderer down first.
      if (!contents.isDestroyed()) contents.forcefullyCrashRenderer();
    } catch {
      // Already gone.
    }
    destroy();
  };
  args.signal.addEventListener("abort", stop, { once: true });
  try {
    contents.setWindowOpenHandler(() => ({ action: "deny" }));
    contents.on("will-frame-navigate", (details) => {
      if (
        shouldBlockInlineRenderPreviewNavigation({
          isMainFrame: details.isMainFrame,
          isSameDocument: details.isSameDocument,
          targetUrl: details.url,
        })
      ) {
        details.preventDefault();
        args.blockedNavigations.add(details.url);
      }
    });
    contents.on("will-attach-webview", (event) => event.preventDefault());
    contents.on("console-message", (event) => {
      const source = { level: event.level, sourceId: event.sourceId };
      if (!shouldReportInlineRenderPreviewConsoleMessage(source)) return;
      args.consoleLog.add(
        formatInlineRenderPreviewConsoleMessage({
          level: source.level,
          message: event.message,
          sourceId: source.sourceId,
          lineNumber: event.lineNumber,
          documentLineOffset: args.documentLineOffset,
        }),
      );
    });

    const loadTimedOut = await loadWithinBudget(window, args.url);
    throwIfAborted(args.signal);

    // Grow the viewport to the content, as the conversation frame grows, and
    // measure again: a page that sizes itself to its viewport keeps growing.
    let requested = INLINE_RENDER_PREVIEW_INITIAL_HEIGHT;
    let measured = await settleAndMeasure(contents, requested);
    const firstContentHeight = measured.contentHeight;
    for (let round = 0; round < INLINE_RENDER_PREVIEW_MAX_RESIZE_ROUNDS; round += 1) {
      const next = nextInlineRenderPreviewViewport(measured.contentHeight);
      if (next === requested) break;
      throwIfAborted(args.signal);
      window.setContentSize(args.width, next);
      requested = next;
      measured = await settleAndMeasure(contents, requested);
    }
    throwIfAborted(args.signal);

    // Never capture past the viewport the window really got.
    const viewportHeight = Math.min(requested, measured.viewportHeight);
    const contentHeight = measured.contentHeight;
    const capturedHeight = inlineRenderPreviewCaptureHeight(contentHeight, viewportHeight);
    const capture = await contents.capturePage({
      x: 0,
      y: 0,
      width: args.width,
      height: capturedHeight,
    });
    throwIfAborted(args.signal);
    return {
      firstContentHeight,
      contentHeight,
      viewportHeight,
      capturedHeight,
      loadTimedOut,
      images: encodeSlices(capture, args.width, capturedHeight),
    };
  } finally {
    args.signal.removeEventListener("abort", stop);
    destroy();
  }
}
