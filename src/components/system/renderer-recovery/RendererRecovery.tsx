import {
  Component,
  useLayoutEffect,
  useState,
  useSyncExternalStore,
  type ErrorInfo,
  type ReactNode,
} from "react";
import { Button } from "@/components/ads/components/Button";
import { sx } from "@/components/ads/utils/stylex";
import { adsThemeVariables } from "@/components/system/ads-theme";
import { copyTextToClipboard } from "@/lib/clipboard";
import { buildRendererErrorReport } from "@/lib/renderer-recovery/error-report";
import {
  getRendererRecoveryState,
  handleRendererFailure,
  readPersistedAppearance,
  recoveryCopy,
  resolveRecoveryDarkMode,
  subscribeRendererRecoveryState,
  type RecoveryEnvironment,
  type RendererFailure,
} from "@/lib/renderer-recovery/renderer-recovery";
import { recoveryStyles as styles } from "./RendererRecovery.styles";

/*
 * The window-level recovery screen. It sits above every provider, so it does
 * not rely on `StaveDesignProvider` or `useTranslation`, either of which may be
 * what failed: it publishes the same ADS-to-Stave role mapping on its own root
 * (so ADS controls resolve to the theme's colors) and looks its copy up itself.
 */

function safeStorage(name: "localStorage" | "sessionStorage"): Storage | null {
  try {
    return typeof window === "undefined" ? null : window[name];
  } catch {
    return null;
  }
}

export function browserRecoveryEnvironment(): RecoveryEnvironment {
  return {
    sessionStorage: safeStorage("sessionStorage"),
    reload: () => window.location.reload(),
  };
}

const APP_VERSION_TIMEOUT_MS = 1_000;

async function readAppVersion(): Promise<string | null> {
  const read = window.api?.tooling?.getAppUpdateStatus;
  if (!read) return null;
  try {
    const status = await Promise.race([
      read(),
      new Promise<null>((resolve) => setTimeout(() => resolve(null), APP_VERSION_TIMEOUT_MS)),
    ]);
    return status?.currentVersion ?? null;
  } catch {
    return null;
  }
}

type CopyStatus = "idle" | "copied" | "failed";

export function RendererRecoveryScreen({ failure }: { failure: RendererFailure }) {
  const [appearance] = useState(() => {
    const persisted = readPersistedAppearance(safeStorage("localStorage"));
    const dark = resolveRecoveryDarkMode({
      kind: failure.kind,
      documentIsDark:
        typeof document !== "undefined" && document.documentElement.classList.contains("dark"),
      themeMode: persisted.themeMode,
      systemPrefersDark:
        typeof window !== "undefined" &&
        typeof window.matchMedia === "function" &&
        window.matchMedia("(prefers-color-scheme: dark)").matches,
    });
    return { dark, locale: persisted.locale };
  });
  useLayoutEffect(() => {
    // A start-up failure happens before the app applied its theme; the role
    // color tokens follow this class.
    document.documentElement.classList.toggle("dark", appearance.dark);
  }, [appearance.dark]);
  const [copyStatus, setCopyStatus] = useState<CopyStatus>("idle");
  const copy = (key: Parameters<typeof recoveryCopy>[0]) => recoveryCopy(key, appearance.locale);
  const chunk = failure.kind === "chunk-load";

  const copyDetails = async () => {
    try {
      const report = buildRendererErrorReport({
        error: failure.error,
        kind: failure.kind,
        componentStack: failure.componentStack,
        occurredAt: failure.occurredAt,
        appVersion: await readAppVersion(),
        platform: window.api?.platform ?? navigator.platform ?? null,
        userAgent: navigator.userAgent ?? null,
      });
      await copyTextToClipboard(report);
      setCopyStatus("copied");
    } catch {
      setCopyStatus("failed");
    }
  };

  return (
    <div
      className={sx(styles.root, appearance.dark ? styles.rootDark : styles.rootLight)}
      style={adsThemeVariables}
      lang={appearance.locale ?? undefined}
    >
      <div className={sx(styles.frame)}>
        <main className={sx(styles.panel)} aria-labelledby="stave-recovery-title">
          <h1 id="stave-recovery-title" className={sx(styles.title)}>
            {copy(chunk ? "chunkTitle" : "errorTitle")}
          </h1>
          <p className={sx(styles.body)}>{copy(chunk ? "chunkBody" : "errorBody")}</p>
          <div className={sx(styles.actions)}>
            <Button
              type="button"
              variant="primary"
              autoFocus
              onClick={() => window.location.reload()}
            >
              {copy("reload")}
            </Button>
            <Button type="button" variant="outline" onClick={() => void copyDetails()}>
              {copy("copyDetails")}
            </Button>
          </div>
          <p className={sx(styles.status)} role="status" aria-live="polite">
            {copyStatus === "copied" ? copy("copied") : copyStatus === "failed" ? copy("copyFailed") : null}
          </p>
        </main>
      </div>
    </div>
  );
}

interface BoundaryState {
  caught: boolean;
}

/**
 * Catches render errors anywhere below it, including the first render of the
 * app shell, and hands them to the shared recovery state (which may reload
 * once for a chunk that failed to load).
 */
export class RendererErrorBoundary extends Component<{ children: ReactNode }, BoundaryState> {
  state: BoundaryState = { caught: false };

  static getDerivedStateFromError(): BoundaryState {
    return { caught: true };
  }

  componentDidCatch(error: unknown, info: ErrorInfo) {
    handleRendererFailure(
      { error, kind: "render", componentStack: info.componentStack ?? null },
      browserRecoveryEnvironment(),
    );
  }

  render() {
    // Once caught, the recovery root renders the screen (or nothing while the
    // window reloads); never re-render the subtree that threw.
    return this.state.caught ? null : this.props.children;
  }
}

/**
 * Root of the renderer: the app inside an error boundary, replaced by the
 * recovery screen once a fatal failure is recorded. Without children it
 * renders only the screen, which is how a start-up failure is shown.
 */
export function RendererRecoveryRoot({ children }: { children?: ReactNode }) {
  const state = useSyncExternalStore(
    subscribeRendererRecoveryState,
    getRendererRecoveryState,
    getRendererRecoveryState,
  );
  if (state.status === "failed") return <RendererRecoveryScreen failure={state.failure} />;
  if (state.status === "reloading") return null;
  return <RendererErrorBoundary>{children}</RendererErrorBoundary>;
}
