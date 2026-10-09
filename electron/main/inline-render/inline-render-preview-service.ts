import { randomBytes, randomUUID } from "node:crypto";
import { session as electronSession, type Session } from "electron";
import {
  buildInlineRenderThemeFragment,
  buildInlineRenderUrl,
  INLINE_RENDER_SCHEME,
  isInlineRenderUrl,
  parseInlineRenderUrl,
  prepareInlineRenderDocument,
  type InlineRenderNetworkPolicy,
} from "../../../src/lib/inline-render/inline-render";
import {
  buildInlineRenderPreviewToolResult,
  createInlineRenderPreviewMessageLog,
  INITIAL_INLINE_RENDER_PREVIEW_CONTEXT,
  INLINE_RENDER_PREVIEW_MAX_BLOCKED_NAVIGATIONS,
  INLINE_RENDER_PREVIEW_MAX_CONCURRENT,
  INLINE_RENDER_PREVIEW_MAX_CONSOLE_MESSAGES,
  INLINE_RENDER_PREVIEW_MAX_FAILED_REQUESTS,
  INLINE_RENDER_PREVIEW_MAX_WAITING,
  INLINE_RENDER_PREVIEW_TIMEOUT_MS,
  inlineRenderPreviewLineOffset,
  normalizeInlineRenderPreviewContext,
  normalizeInlineRenderPreviewOptions,
  resolveInlineRenderPreviewTheme,
  type InlineRenderPreviewContext,
} from "../../../src/lib/inline-render/inline-render-preview";
import { respondToInlineRenderRequest } from "./inline-render-protocol";
import {
  createInlineRenderPreviewSlots,
  runWithInlineRenderPreviewDeadline,
} from "./inline-render-preview-queue";
import { captureInlineRenderPreviewWindow } from "./inline-render-preview-window";

/* ─── Context the renderer syncs ─────────────────────────────────── */

let context: InlineRenderPreviewContext = INITIAL_INLINE_RENDER_PREVIEW_CONTEXT;

/**
 * The renderer owns the network setting and the theme, and reports both at
 * startup and whenever either changes. Until then previews run with no
 * network and Stave's default palette.
 */
export function setInlineRenderPreviewContext(value: unknown): InlineRenderPreviewContext {
  context = normalizeInlineRenderPreviewContext(value);
  return context;
}

export function getInlineRenderPreviewContext(): InlineRenderPreviewContext {
  return context;
}

/* ─── Slots ──────────────────────────────────────────────────────── */

interface PreviewPage {
  renderId: string;
  html: string;
  networkPolicy: InlineRenderNetworkPolicy;
}

interface PreviewSeat {
  session: Session;
  page: PreviewPage | null;
}

const slots = createInlineRenderPreviewSlots({
  size: INLINE_RENDER_PREVIEW_MAX_CONCURRENT,
  maxWaiting: INLINE_RENDER_PREVIEW_MAX_WAITING,
  waitTimeoutMs: INLINE_RENDER_PREVIEW_TIMEOUT_MS,
});

const seats = new Map<number, PreviewSeat>();

/**
 * Each slot renders in its own in-memory session (no `persist:` prefix), so
 * nothing reaches disk, nothing is shared with the app's session or a Lens
 * partition, and two previews running at once share no cookies or handler.
 * The session lives as long as the app, so the slots are reused rather than
 * one session made per preview.
 */
function seatFor(index: number): PreviewSeat {
  const existing = seats.get(index);
  if (existing) return existing;
  const previewSession = electronSession.fromPartition(`inline-render-preview-${index}`, {
    cache: false,
  });
  const seat: PreviewSeat = { session: previewSession, page: null };
  previewSession.setPermissionRequestHandler((_contents, _permission, callback) => callback(false));
  previewSession.setPermissionCheckHandler(() => false);
  previewSession.setDevicePermissionHandler(() => false);
  previewSession.on("will-download", (event) => event.preventDefault());
  previewSession.protocol.handle(INLINE_RENDER_SCHEME, (request) => {
    const target = parseInlineRenderUrl(request.url);
    const page = seat.page;
    // Only the page this slot is rendering, and only under the policy it was
    // started with: a nested frame cannot load it again under another.
    const servable =
      page &&
      target &&
      target.renderId === page.renderId &&
      target.networkPolicy === page.networkPolicy
        ? page
        : null;
    return respondToInlineRenderRequest({
      url: request.url,
      method: request.method,
      store: { read: async () => servable },
      backdrop: true,
    });
  });
  seats.set(index, seat);
  return seat;
}

/** A well-formed render id that names no stored page. */
function createPreviewRenderId(): string {
  return `${randomBytes(8).toString("hex")}-${randomUUID()}`;
}

function truncateUrl(url: string): string {
  return url.length > 300 ? `${url.slice(0, 299)}…` : url;
}

/* ─── Preview ────────────────────────────────────────────────────── */

/**
 * Renders `html` offscreen as the conversation would show it and returns the
 * `stave_preview_html` result: a JSON summary and the capture. Throws when no
 * slot comes free or the page does not settle before the deadline.
 */
export async function previewInlineRenderHtml(input: {
  html: string;
  width?: number;
  appearance?: "light" | "dark";
}) {
  const snapshot = context;
  const options = normalizeInlineRenderPreviewOptions(input, {
    appearance: snapshot.theme?.appearance ?? null,
  });
  const theme = resolveInlineRenderPreviewTheme(options.appearance, snapshot.theme);
  const slot = await slots.acquire();
  const seat = seatFor(slot.index);
  const page: PreviewPage = {
    renderId: createPreviewRenderId(),
    html: input.html,
    networkPolicy: snapshot.networkPolicy,
  };
  seat.page = page;

  const consoleLog = createInlineRenderPreviewMessageLog({
    maxEntries: INLINE_RENDER_PREVIEW_MAX_CONSOLE_MESSAGES,
  });
  const failedRequests = createInlineRenderPreviewMessageLog({
    maxEntries: INLINE_RENDER_PREVIEW_MAX_FAILED_REQUESTS,
  });
  const blockedNavigations = createInlineRenderPreviewMessageLog({
    maxEntries: INLINE_RENDER_PREVIEW_MAX_BLOCKED_NAVIGATIONS,
  });
  // Requests the CSP refuses never reach the network and show up as console
  // errors instead; these are the ones that left and failed.
  seat.session.webRequest.onErrorOccurred((details) => {
    if (isInlineRenderUrl(details.url) || details.error === "net::ERR_ABORTED") return;
    failedRequests.add(`${details.method} ${truncateUrl(details.url)}: ${details.error}`);
  });
  seat.session.webRequest.onCompleted((details) => {
    if (isInlineRenderUrl(details.url) || details.statusCode < 400) return;
    failedRequests.add(`${details.method} ${truncateUrl(details.url)}: HTTP ${details.statusCode}`);
  });

  const url = `${buildInlineRenderUrl({
    renderId: page.renderId,
    networkPolicy: page.networkPolicy,
  })}${buildInlineRenderThemeFragment(theme)}`;
  try {
    const capture = await runWithInlineRenderPreviewDeadline(
      (signal) =>
        captureInlineRenderPreviewWindow({
          session: seat.session,
          url,
          width: options.width,
          documentLineOffset: inlineRenderPreviewLineOffset(
            input.html,
            prepareInlineRenderDocument(input.html, { backdrop: true }),
          ),
          signal,
          consoleLog,
          blockedNavigations,
        }),
      {
        timeoutMs: INLINE_RENDER_PREVIEW_TIMEOUT_MS,
        message: () => {
          const messages = consoleLog.list();
          return [
            `The page did not finish rendering within ${INLINE_RENDER_PREVIEW_TIMEOUT_MS / 1000} s, so the preview was stopped. A script may loop forever, or the page waits on something that never arrives.`,
            ...(messages.length > 0 ? [`Console so far: ${JSON.stringify(messages)}`] : []),
          ].join("\n");
        },
      },
    );
    return buildInlineRenderPreviewToolResult(
      {
        width: options.width,
        appearance: options.appearance,
        networkPolicy: page.networkPolicy,
        firstContentHeight: capture.firstContentHeight,
        contentHeight: capture.contentHeight,
        viewportHeight: capture.viewportHeight,
        capturedHeight: capture.capturedHeight,
        loadTimedOut: capture.loadTimedOut,
        consoleMessages: consoleLog.list(),
        failedRequests: failedRequests.list(),
        blockedNavigations: blockedNavigations.list(),
      },
      capture.images,
    );
  } finally {
    seat.page = null;
    seat.session.webRequest.onErrorOccurred(null);
    seat.session.webRequest.onCompleted(null);
    // Cookies a response set under the open policy must not reach the next page.
    await seat.session.clearStorageData().catch(() => undefined);
    slot.release();
  }
}

/**
 * The Electron end-to-end suite has no provider turn to call the tool from,
 * so its launcher sets this flag and drives the preview directly. Off in
 * every other launch.
 */
export function exposeInlineRenderPreviewForE2e() {
  if (process.env.STAVE_E2E_INLINE_RENDER_PREVIEW !== "1") return;
  (globalThis as { __staveInlineRenderPreviewE2e?: unknown }).__staveInlineRenderPreviewE2e = {
    preview: previewInlineRenderHtml,
    context: getInlineRenderPreviewContext,
  };
}
