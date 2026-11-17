import type { WebContents } from "electron";
import { getMainLocale, tMain } from "../i18n";
import { ensurePersistenceReady } from "../state";
import { getMainWindow } from "../window";
import type { RemoteAdminResult } from "../../../src/lib/remote-control";
import { createRemoteMobileAssets, REMOTE_MOBILE_COPY_KEYS, type RemoteMobileCopyKey } from "./mobile-page";
import type { RemoteRendererTarget } from "./renderer-bridge";
import { createRemoteControlRuntime, type RemoteControlRuntime } from "./runtime";

let runtime: Promise<RemoteControlRuntime> | null = null;
let readyContents: WebContents | null = null;
const watched = new WeakSet<WebContents>();

function readCopy() {
  const copy = {} as Record<RemoteMobileCopyKey, string>;
  for (const key of REMOTE_MOBILE_COPY_KEYS) copy[key] = tMain(`remoteControlMobile.${key}`);
  return { locale: getMainLocale(), copy };
}

/** The main window, while it has said its responder is listening and is not reloading. */
function currentTarget(): RemoteRendererTarget | null {
  const window = getMainWindow();
  const contents = readyContents;
  if (!window || window.isDestroyed() || !contents || contents.isDestroyed()) return null;
  if (window.webContents !== contents || contents.isLoadingMainFrame()) return null;
  return { id: contents.id, send: (channel, payload) => contents.send(channel, payload) };
}

function ensureRuntime() {
  runtime ??= ensurePersistenceReady().then((store) =>
    createRemoteControlRuntime({
      store: store.remoteControl,
      getTarget: currentTarget,
      asset: createRemoteMobileAssets(readCopy),
    }),
  );
  return runtime;
}

/** Restore the saved listener at launch. Off unless the user turned it on. */
export async function startRemoteControlRuntime() {
  await (await ensureRuntime()).restore();
}

export async function stopRemoteControlRuntime() {
  if (!runtime) return;
  await (await runtime).close();
}

export async function handleRemoteControlAdmin(raw: unknown): Promise<RemoteAdminResult> {
  return (await ensureRuntime()).admin(raw);
}

export function isRemoteControlSender(contents: WebContents) {
  const window = getMainWindow();
  return Boolean(window && !window.isDestroyed() && window.webContents === contents);
}

export async function resolveRemoteControlResponse(contents: WebContents, raw: unknown) {
  if (!runtime) return { ok: false };
  return (await runtime).bridge.resolve(contents.id, raw);
}

export async function setRemoteControlResponderReady(contents: WebContents, ready: boolean) {
  const service = await ensureRuntime();
  if (!ready) {
    if (readyContents === contents) readyContents = null;
    service.bridge.dropTarget(contents.id);
    return;
  }
  readyContents = contents;
  if (watched.has(contents)) return;
  watched.add(contents);
  const clear = () => {
    if (readyContents === contents) readyContents = null;
    service.bridge.dropTarget(contents.id);
  };
  // A reload or crash drops the listener; the reloaded renderer says ready again.
  contents.on("did-start-navigation", (_event, _url, isInPlace, isMainFrame) => {
    if (isMainFrame && !isInPlace) clear();
  });
  contents.on("render-process-gone", clear);
  contents.once("destroyed", clear);
}
