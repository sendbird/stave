import { isAppLocale, type AppLocale } from "@/i18n/locale";
import type { I18nKey } from "@/i18n/runtime";
import type { RendererFailureKind } from "./error-report";

/*
 * Renderer start-up recovery, kept free of React, i18next and the app store so
 * it still works when one of those is what failed. `install-renderer-recovery`
 * wires it to the window before any other renderer module evaluates.
 */

// ---------------------------------------------------------------------------
// Chunk load failures and the automatic reload guard
// ---------------------------------------------------------------------------

const CHUNK_LOAD_ERROR_PATTERN =
  /Failed to fetch dynamically imported module|error loading dynamically imported module|Importing a module script failed|Failed to load module script|Unable to preload CSS|Outdated Optimize Dep/i;

/** A lazily loaded part of the app could not be fetched, usually a stale build after an update. */
export function isChunkLoadError(error: unknown): boolean {
  if (!error || typeof error !== "object") {
    return typeof error === "string" && CHUNK_LOAD_ERROR_PATTERN.test(error);
  }
  const { name, message } = error as { name?: unknown; message?: unknown };
  return (
    name === "ChunkLoadError" ||
    (typeof message === "string" && CHUNK_LOAD_ERROR_PATTERN.test(message))
  );
}

export const AUTO_RELOAD_STORAGE_KEY = "stave:renderer-recovery:auto-reload";

type SessionStorageLike = Pick<Storage, "getItem" | "setItem">;

/**
 * Allows one automatic reload per window session. The mark lives in
 * `sessionStorage`, which survives the reload itself, so a build that keeps
 * failing reaches the recovery screen instead of reloading forever. When the
 * storage cannot be read or written the guard refuses, for the same reason.
 */
export function createAutoReloadGuard(storage: SessionStorageLike | null) {
  return {
    tryClaim(now: number = Date.now()): boolean {
      if (!storage) return false;
      try {
        if (storage.getItem(AUTO_RELOAD_STORAGE_KEY) !== null) return false;
        storage.setItem(AUTO_RELOAD_STORAGE_KEY, String(now));
        return storage.getItem(AUTO_RELOAD_STORAGE_KEY) !== null;
      } catch {
        return false;
      }
    },
  };
}

// ---------------------------------------------------------------------------
// Fatal failure state shared with the recovery screen
// ---------------------------------------------------------------------------

export interface RendererFailure {
  error: unknown;
  kind: RendererFailureKind;
  componentStack?: string | null;
  occurredAt: Date;
}

export type RendererRecoveryState =
  | { status: "running" }
  | { status: "reloading" }
  | { status: "failed"; failure: RendererFailure };

let state: RendererRecoveryState = { status: "running" };
const listeners = new Set<() => void>();

export function getRendererRecoveryState(): RendererRecoveryState {
  return state;
}

export function subscribeRendererRecoveryState(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

function setState(next: RendererRecoveryState) {
  // A reload in flight wins; the first failure is the one worth reporting.
  if (state.status !== "running") return;
  state = next;
  for (const listener of listeners) listener();
}

export interface RecoveryEnvironment {
  sessionStorage: SessionStorageLike | null;
  reload: () => void;
}

/**
 * Settle a failure: a chunk that failed to load gets one automatic reload per
 * session, anything else (or a second chunk failure) shows the recovery screen.
 * Returns the resulting state.
 */
export function handleRendererFailure(
  failure: Omit<RendererFailure, "occurredAt"> & { occurredAt?: Date },
  environment: RecoveryEnvironment,
): RendererRecoveryState {
  if (state.status !== "running") return state;
  const chunkFailure = failure.kind === "chunk-load" || isChunkLoadError(failure.error);
  if (chunkFailure && createAutoReloadGuard(environment.sessionStorage).tryClaim()) {
    setState({ status: "reloading" });
    environment.reload();
    return state;
  }
  setState({
    status: "failed",
    failure: {
      ...failure,
      kind: chunkFailure ? "chunk-load" : failure.kind,
      occurredAt: failure.occurredAt ?? new Date(),
    },
  });
  return state;
}

/** Test seam: forget any recorded failure. */
export function resetRendererRecoveryStateForTests() {
  state = { status: "running" };
  listeners.clear();
  started = false;
}

// ---------------------------------------------------------------------------
// Start-up detection and window listeners
// ---------------------------------------------------------------------------

let started = false;

/**
 * Called by the entry module once every module it imports has evaluated. Until
 * then an uncaught error means the renderer could not start.
 */
export function markRendererStarted() {
  started = true;
}

export function isRendererStarted() {
  return started;
}

interface RecoveryWindow {
  addEventListener: (type: string, listener: (event: Event) => void) => void;
  removeEventListener: (type: string, listener: (event: Event) => void) => void;
}

/**
 * - `vite:preloadError`: a lazily loaded chunk or its CSS failed to load. The
 *   error still propagates to the importer; this only decides between the
 *   guarded reload and the recovery screen.
 * - `error` before start-up finished: a module failed to evaluate, so the app
 *   never rendered. `onStartupFailure` mounts the recovery screen.
 */
export function installRendererRecovery(args: {
  target: RecoveryWindow;
  environment: () => RecoveryEnvironment;
  onStartupFailure: () => void;
}): () => void {
  const onPreloadError = (event: Event) => {
    const payload = (event as Event & { payload?: unknown }).payload;
    handleRendererFailure(
      { error: payload ?? new Error("A part of the app failed to load."), kind: "chunk-load" },
      args.environment(),
    );
  };
  const onError = (event: Event) => {
    if (started) return;
    const errorEvent = event as ErrorEvent;
    const result = handleRendererFailure(
      { error: errorEvent.error ?? errorEvent.message, kind: "startup" },
      args.environment(),
    );
    if (result.status === "failed") args.onStartupFailure();
  };
  args.target.addEventListener("vite:preloadError", onPreloadError);
  args.target.addEventListener("error", onError);
  return () => {
    args.target.removeEventListener("vite:preloadError", onPreloadError);
    args.target.removeEventListener("error", onError);
  };
}

// ---------------------------------------------------------------------------
// Copy for the screen: translated when i18n loaded, English otherwise
// ---------------------------------------------------------------------------

export type RecoveryCopyKey =
  | "errorTitle"
  | "errorBody"
  | "chunkTitle"
  | "chunkBody"
  | "reload"
  | "copyDetails"
  | "copied"
  | "copyFailed";

export const RECOVERY_COPY_KEYS = {
  errorTitle: "app:rendererRecovery.errorTitle",
  errorBody: "app:rendererRecovery.errorBody",
  chunkTitle: "app:rendererRecovery.chunkTitle",
  chunkBody: "app:rendererRecovery.chunkBody",
  reload: "app:rendererRecovery.reload",
  copyDetails: "app:rendererRecovery.copyDetails",
  copied: "app:rendererRecovery.copied",
  copyFailed: "app:rendererRecovery.copyFailed",
} as const satisfies Record<RecoveryCopyKey, I18nKey>;

export type RecoveryI18nKey = (typeof RECOVERY_COPY_KEYS)[RecoveryCopyKey];

/*
 * Used only when the translation catalogs never loaded (the i18n module
 * itself failed), so there is no translator to ask. Same text as
 * `src/locales/en/app.json` → `rendererRecovery`.
 */
const ENGLISH_FALLBACK_COPY: Record<RecoveryCopyKey, string> = {
  // i18n-ignore: fallback for when the i18n catalogs failed to load
  errorTitle: "Stave ran into a problem",
  // i18n-ignore: fallback for when the i18n catalogs failed to load
  errorBody: "An unexpected error stopped this window. Reload to try again.",
  // i18n-ignore: fallback for when the i18n catalogs failed to load
  chunkTitle: "Stave needs to reload",
  // i18n-ignore: fallback for when the i18n catalogs failed to load
  chunkBody: "Part of the app didn't load, which can happen right after an update. Reload to continue.",
  // i18n-ignore: fallback for when the i18n catalogs failed to load
  reload: "Reload window",
  // i18n-ignore: fallback for when the i18n catalogs failed to load
  copyDetails: "Copy error details",
  // i18n-ignore: fallback for when the i18n catalogs failed to load
  copied: "Error details copied",
  // i18n-ignore: fallback for when the i18n catalogs failed to load
  copyFailed: "Couldn't copy the error details",
};

type RecoveryTranslator = (key: RecoveryI18nKey, locale: AppLocale | null) => string;

let translator: RecoveryTranslator | null = null;

/** Registered by `recovery-i18n.ts` as soon as the i18n runtime has loaded. */
export function setRecoveryTranslator(next: RecoveryTranslator | null) {
  translator = next;
}

export function recoveryCopy(key: RecoveryCopyKey, locale: AppLocale | null): string {
  if (translator) {
    try {
      const text = translator(RECOVERY_COPY_KEYS[key], locale);
      if (text && text !== RECOVERY_COPY_KEYS[key]) return text;
    } catch {
      // Fall through to English.
    }
  }
  return ENGLISH_FALLBACK_COPY[key];
}

// ---------------------------------------------------------------------------
// Appearance when the app store never ran
// ---------------------------------------------------------------------------

/** Key of the persisted app store (`APP_STORE_KEY` in `src/store/app-store-persistence.ts`). */
export const PERSISTED_APP_STORE_KEY = "stave-store";

export interface PersistedAppearance {
  locale: AppLocale | null;
  themeMode: "light" | "dark" | "system" | null;
}

/**
 * The display language and theme mode the user saved, read straight from
 * storage so the recovery screen can follow them even when the store module
 * never evaluated. Any parse problem yields nulls.
 */
export function readPersistedAppearance(
  storage: Pick<Storage, "getItem"> | null,
): PersistedAppearance {
  const empty: PersistedAppearance = { locale: null, themeMode: null };
  if (!storage) return empty;
  try {
    const raw = storage.getItem(PERSISTED_APP_STORE_KEY);
    if (!raw) return empty;
    const settings = (JSON.parse(raw) as { state?: { settings?: Record<string, unknown> } })
      ?.state?.settings;
    const themeMode = settings?.themeMode;
    return {
      locale: isAppLocale(settings?.language) ? settings.language : null,
      themeMode:
        themeMode === "light" || themeMode === "dark" || themeMode === "system"
          ? themeMode
          : null,
    };
  } catch {
    return empty;
  }
}

/**
 * Dark or light for the recovery screen. A failure after start-up keeps what
 * the app applied (`.dark` on `<html>`); a start-up failure uses the saved
 * theme mode, then the system preference.
 */
export function resolveRecoveryDarkMode(args: {
  kind: RendererFailureKind;
  documentIsDark: boolean;
  themeMode: PersistedAppearance["themeMode"];
  systemPrefersDark: boolean;
}): boolean {
  if (args.kind !== "startup" || args.documentIsDark) return args.documentIsDark;
  if (args.themeMode === "dark") return true;
  if (args.themeMode === "light") return false;
  return args.systemPrefersDark;
}
