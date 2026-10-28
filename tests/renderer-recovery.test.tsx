import { beforeEach, describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import {
  buildRendererErrorReport,
  describeErrorChain,
  redactSensitiveText,
} from "@/lib/renderer-recovery/error-report";
import { APP_LOCALES } from "@/i18n/locale";
import {
  AUTO_RELOAD_STORAGE_KEY,
  PERSISTED_APP_STORE_KEY,
  RECOVERY_COPY_KEYS,
  RECOVERY_LOCALES,
  createAutoReloadGuard,
  getRendererRecoveryState,
  handleRendererFailure,
  installRendererRecovery,
  isChunkLoadError,
  markRendererStarted,
  readPersistedAppearance,
  recoveryCopy,
  resetRendererRecoveryStateForTests,
  resolveRecoveryDarkMode,
  setRecoveryTranslator,
  type RecoveryCopyKey,
} from "@/lib/renderer-recovery/renderer-recovery";
import {
  RendererErrorBoundary,
  RendererRecoveryRoot,
} from "@/components/system/renderer-recovery/RendererRecovery";
import { staticImportGraph } from "./fixtures/static-import-graph";

const readRepoFile = (relative: string) =>
  readFileSync(new URL(`../${relative}`, import.meta.url), "utf8");

/*
 * Credential-shaped fixtures are assembled at runtime so this file never holds
 * a literal that secret scanners would flag. None of them is a real value.
 */
const fake = (...parts: string[]) => parts.join("");
const FAKE = {
  bearer: fake("abcdefgh", "ijklmnop.qrstuv"),
  urlPassword: fake("not-a-", "real-pass"),
  apiKey: fake("abc123", "def456"),
  accessToken: fake("XYZ98", "7654"),
  password: fake("correct-", "horse"),
  anthropic: fake("sk-", "ant-api03-", "AbCdEfGhIjKlMnOpQrStUv"),
  github: fake("gh", "p_", "0123456789abcdefghij", "ABCDEFGHIJ"),
  slack: fake("xo", "xb-", "1234567890-abcdefghij"),
  jwt: fake("eyJ", "hbGciOiJIUzI1NiJ9", ".", "eyJzdWIiOiIxMjM0In0", ".", "c2lnbmF0dXJlLXZhbHVl"),
  aws: fake("AK", "IA", "ABCDEFGHIJKLMNOP"),
};

class MemoryStorage {
  values = new Map<string, string>();
  getItem(key: string) {
    return this.values.get(key) ?? null;
  }
  setItem(key: string, value: string) {
    this.values.set(key, value);
  }
}

class FakeWindow {
  listeners = new Map<string, Set<(event: Event) => void>>();
  addEventListener(type: string, listener: (event: Event) => void) {
    if (!this.listeners.has(type)) this.listeners.set(type, new Set());
    this.listeners.get(type)!.add(listener);
  }
  removeEventListener(type: string, listener: (event: Event) => void) {
    this.listeners.get(type)?.delete(listener);
  }
  dispatch(type: string, fields: Record<string, unknown>) {
    const event = Object.assign(new Event(type), fields);
    for (const listener of this.listeners.get(type) ?? []) listener(event);
  }
}

function environment(storage = new MemoryStorage()) {
  const reloads: number[] = [];
  return {
    storage,
    reloads,
    env: { sessionStorage: storage, reload: () => reloads.push(Date.now()) },
  };
}

const chunkError = () =>
  new TypeError("Failed to fetch dynamically imported module: app://stave/assets/AppShell-abc123.js");

beforeEach(() => {
  resetRendererRecoveryStateForTests();
  setRecoveryTranslator(null);
});

describe("redactSensitiveText", () => {
  test("replaces the account segment of home directory paths", () => {
    expect(redactSensitiveText("at load (/Users/jane.doe/src/stave/src/App.tsx:12:5)")).toBe(
      "at load (/Users/<user>/src/stave/src/App.tsx:12:5)",
    );
    expect(redactSensitiveText("file:///Users/jane/Library/Application Support/Stave/x.js")).toBe(
      "file:///Users/<user>/Library/Application Support/Stave/x.js",
    );
    expect(redactSensitiveText("ENOENT: /home/sam/.config/stave/state.json")).toBe(
      "ENOENT: /home/<user>/.config/stave/state.json",
    );
    expect(redactSensitiveText("open C:\\Users\\Sam Lee\\AppData\\Stave")).toBe(
      "open C:\\Users\\<user>\\AppData\\Stave",
    );
  });

  test("replaces credentials and token-shaped values", () => {
    const text = [
      `Authorization: Bearer ${FAKE.bearer}`,
      `fetch https://deploy:${FAKE.urlPassword}@git.example.com/repo.git`,
      `body {"apiKey":"${FAKE.apiKey}","name":"ok"}`,
      `url ?access_token=${FAKE.accessToken}&page=2`,
      `password=${FAKE.password}`,
      `key ${FAKE.anthropic}`,
      `gh ${FAKE.github}`,
      `slack ${FAKE.slack}`,
      `jwt ${FAKE.jwt}`,
      `aws ${FAKE.aws}`,
    ].join("\n");
    const redacted = redactSensitiveText(text);
    for (const secret of Object.values(FAKE)) {
      expect(redacted).not.toContain(secret);
    }
    expect(redacted).toContain('"name":"ok"');
    expect(redacted).toContain("page=2");
  });

  test("leaves ordinary stack frames alone", () => {
    const frame = "at tokenize (app://stave/assets/token-utils-1a2b.js:10:4)";
    expect(redactSensitiveText(frame)).toBe(frame);
  });
});

describe("describeErrorChain", () => {
  test("follows causes, stops at cycles and describes non-errors", () => {
    const root = new Error("outer", { cause: new TypeError("inner", { cause: "plain reason" }) });
    expect(describeErrorChain(root).map((entry) => entry.title)).toEqual([
      "Error: outer",
      "TypeError: inner",
      "plain reason",
    ]);
    const cyclic = new Error("loop") as Error & { cause?: unknown };
    cyclic.cause = cyclic;
    expect(describeErrorChain(cyclic)).toHaveLength(1);
    expect(describeErrorChain({ code: 7 })[0]?.title).toBe('{"code":7}');
  });
});

describe("buildRendererErrorReport", () => {
  test("includes version, platform, message, stack and causes with private data redacted", () => {
    const cause = new Error(`token=${FAKE.accessToken} rejected`);
    const error = new Error("Cannot read /Users/jane/project/state.json", { cause });
    error.stack = "Error: Cannot read /Users/jane/project/state.json\n    at read (/Users/jane/stave/src/store.ts:4:2)";
    const report = buildRendererErrorReport({
      error,
      kind: "render",
      appVersion: "0.28.1",
      platform: "darwin",
      userAgent: "Stave test agent",
      componentStack: "\n    at App\n    at StaveDesignProvider",
      occurredAt: new Date("2026-10-27T10:00:00.000Z"),
    });
    expect(report).toContain("Kind: render");
    expect(report).toContain("App version: 0.28.1");
    expect(report).toContain("Platform: darwin");
    expect(report).toContain("Time: 2026-10-27T10:00:00.000Z");
    expect(report).toContain("\nError: Cannot read /Users/<user>/project/state.json\n");
    expect(report).toContain("at read (/Users/<user>/stave/src/store.ts:4:2)");
    expect(report).toContain("Caused by: Error: token=<redacted> rejected");
    expect(report).toContain("Component stack:\nat App");
    expect(report).not.toContain("jane");
    expect(report).not.toContain(FAKE.accessToken);
  });

  test("reports unknown versions and truncates very long reports", () => {
    const report = buildRendererErrorReport({
      error: new Error("x".repeat(30_000)),
      kind: "startup",
      appVersion: null,
      platform: null,
      userAgent: null,
      occurredAt: new Date(0),
    });
    expect(report).toContain("App version: unknown");
    expect(report.endsWith("[truncated]")).toBe(true);
    expect(report.length).toBeLessThan(20_100);
  });
});

describe("automatic reload guard", () => {
  test("allows one reload per session", () => {
    const storage = new MemoryStorage();
    expect(createAutoReloadGuard(storage).tryClaim(1)).toBe(true);
    expect(storage.getItem(AUTO_RELOAD_STORAGE_KEY)).toBe("1");
    // The mark survives the reload, so a fresh guard (new page) refuses.
    expect(createAutoReloadGuard(storage).tryClaim(2)).toBe(false);
  });

  test("refuses when storage is missing or throws, so it can never loop", () => {
    expect(createAutoReloadGuard(null).tryClaim()).toBe(false);
    const broken = {
      getItem: () => {
        throw new Error("denied");
      },
      setItem: () => undefined,
    };
    expect(createAutoReloadGuard(broken).tryClaim()).toBe(false);
  });

  test("recognises chunk load failures", () => {
    expect(isChunkLoadError(chunkError())).toBe(true);
    expect(isChunkLoadError(new Error("Unable to preload CSS for /assets/x.css"))).toBe(true);
    expect(isChunkLoadError(new TypeError("Importing a module script failed."))).toBe(true);
    expect(isChunkLoadError(new TypeError("x is not a function"))).toBe(false);
    expect(isChunkLoadError(null)).toBe(false);
  });
});

describe("handleRendererFailure", () => {
  test("reloads once for a chunk failure, then shows the screen", () => {
    const { storage, reloads, env } = environment();
    expect(handleRendererFailure({ error: chunkError(), kind: "render" }, env).status).toBe("reloading");
    expect(reloads).toHaveLength(1);

    // After the reload: same session storage, fresh module state.
    resetRendererRecoveryStateForTests();
    const next = environment(storage);
    const state = handleRendererFailure({ error: chunkError(), kind: "render" }, next.env);
    expect(next.reloads).toHaveLength(0);
    expect(state.status).toBe("failed");
    expect(state.status === "failed" && state.failure.kind).toBe("chunk-load");
  });

  test("shows the screen without reloading for other errors and keeps the first failure", () => {
    const { reloads, env } = environment();
    const first = new Error("first");
    handleRendererFailure({ error: first, kind: "render" }, env);
    handleRendererFailure({ error: new Error("second"), kind: "render" }, env);
    const state = getRendererRecoveryState();
    expect(reloads).toHaveLength(0);
    expect(state.status === "failed" && state.failure.error).toBe(first);
  });
});

describe("installRendererRecovery", () => {
  test("a preload error reloads once, then a second one shows the screen", () => {
    const target = new FakeWindow();
    const { storage, reloads, env } = environment();
    const startupFailures: number[] = [];
    const dispose = installRendererRecovery({
      target,
      environment: () => env,
      onStartupFailure: () => startupFailures.push(1),
    });
    target.dispatch("vite:preloadError", { payload: chunkError() });
    expect(reloads).toHaveLength(1);
    expect(getRendererRecoveryState().status).toBe("reloading");

    dispose();
    resetRendererRecoveryStateForTests();
    const next = environment(storage);
    installRendererRecovery({ target, environment: () => next.env, onStartupFailure: () => undefined });
    target.dispatch("vite:preloadError", { payload: chunkError() });
    expect(next.reloads).toHaveLength(0);
    expect(getRendererRecoveryState().status).toBe("failed");
    expect(startupFailures).toHaveLength(0);
  });

  test("an error before start-up mounts the screen; after start-up it is left to the boundary", () => {
    const target = new FakeWindow();
    const { env } = environment();
    const startupFailures: unknown[] = [];
    installRendererRecovery({
      target,
      environment: () => env,
      onStartupFailure: () => startupFailures.push(getRendererRecoveryState()),
    });
    markRendererStarted();
    target.dispatch("error", { error: new Error("late") });
    expect(startupFailures).toHaveLength(0);
    expect(getRendererRecoveryState().status).toBe("running");

    resetRendererRecoveryStateForTests();
    target.dispatch("error", { error: new Error("module failed") });
    expect(startupFailures).toHaveLength(1);
    const state = getRendererRecoveryState();
    expect(state.status === "failed" && state.failure.kind).toBe("startup");
  });
});

describe("recovery copy", () => {
  const english = JSON.parse(readRepoFile("src/locales/en/app.json")).rendererRecovery as Record<string, string>;
  const korean = JSON.parse(readRepoFile("src/locales/ko/app.json")).rendererRecovery as Record<string, string>;
  const keys = Object.keys(RECOVERY_COPY_KEYS) as RecoveryCopyKey[];

  test("the English fallback matches the English catalog", () => {
    for (const key of keys) {
      expect(RECOVERY_COPY_KEYS[key]).toBe(`app:rendererRecovery.${key}`);
      expect(recoveryCopy(key, "ko")).toBe(english[key]);
    }
  });

  test("uses the translator once i18n has loaded, in the saved language", async () => {
    await import("@/lib/renderer-recovery/recovery-i18n");
    for (const key of keys) {
      expect(recoveryCopy(key, "ko")).toBe(korean[key]);
      expect(recoveryCopy(key, "en")).toBe(english[key]);
    }
  });
});

describe("appearance", () => {
  test("reads the saved language and theme mode, tolerating bad data", () => {
    const storage = new MemoryStorage();
    expect(readPersistedAppearance(storage)).toEqual({ locale: null, themeMode: null });
    storage.setItem(
      PERSISTED_APP_STORE_KEY,
      JSON.stringify({ state: { settings: { language: "ko", themeMode: "light" } }, version: 3 }),
    );
    expect(readPersistedAppearance(storage)).toEqual({ locale: "ko", themeMode: "light" });
    storage.setItem(PERSISTED_APP_STORE_KEY, "{not json");
    expect(readPersistedAppearance(storage)).toEqual({ locale: null, themeMode: null });
    expect(readPersistedAppearance(null)).toEqual({ locale: null, themeMode: null });
  });

  test("the persisted key is the app store's key", () => {
    expect(readRepoFile("src/store/app-store-persistence.ts")).toContain(
      `const APP_STORE_KEY = "${PERSISTED_APP_STORE_KEY}";`,
    );
  });

  test("keeps the applied theme after start-up and uses saved or system mode before it", () => {
    const base = { documentIsDark: false, themeMode: null, systemPrefersDark: true } as const;
    expect(resolveRecoveryDarkMode({ ...base, kind: "render" })).toBe(false);
    expect(resolveRecoveryDarkMode({ ...base, kind: "render", documentIsDark: true })).toBe(true);
    expect(resolveRecoveryDarkMode({ ...base, kind: "startup" })).toBe(true);
    expect(resolveRecoveryDarkMode({ ...base, kind: "startup", themeMode: "light" })).toBe(false);
    expect(
      resolveRecoveryDarkMode({ ...base, kind: "startup", themeMode: "dark", systemPrefersDark: false }),
    ).toBe(true);
  });
});

describe("RendererRecoveryRoot", () => {
  test("renders the app while running and the recovery screen after a failure", () => {
    const app = createElement("p", null, "app body");
    expect(renderToStaticMarkup(createElement(RendererRecoveryRoot, null, app))).toContain("app body");

    handleRendererFailure({ error: new Error("boom"), kind: "render" }, environment().env);
    const html = renderToStaticMarkup(createElement(RendererRecoveryRoot, null, app));
    expect(html).not.toContain("app body");
    expect(html).toContain("<h1");
    expect(html).toContain("Stave ran into a problem");
    expect(html).toContain("Reload window");
    expect(html).toContain("Copy error details");
    expect(html).toContain('role="status"');
  });

  test("a chunk failure that already reloaded uses the update wording", () => {
    const storage = new MemoryStorage();
    storage.setItem(AUTO_RELOAD_STORAGE_KEY, "1");
    handleRendererFailure({ error: chunkError(), kind: "render" }, environment(storage).env);
    const html = renderToStaticMarkup(createElement(RendererRecoveryRoot));
    expect(html).toContain("Stave needs to reload");
  });

  test("the boundary records render errors with the component stack", () => {
    const boundary = new RendererErrorBoundary({ children: null });
    expect(RendererErrorBoundary.getDerivedStateFromError()).toEqual({ caught: true });
    boundary.componentDidCatch(new Error("render failed"), { componentStack: "\n    at Broken" });
    const state = getRendererRecoveryState();
    expect(state.status).toBe("failed");
    expect(state.status === "failed" && state.failure.kind).toBe("render");
    expect(state.status === "failed" && state.failure.componentStack).toContain("at Broken");
  });

  test("the renderer entry installs recovery before anything else and wraps the app", () => {
    const entry = readRepoFile("src/main.tsx");
    const firstImport = entry.split("\n").find((line) => line.startsWith("import "));
    expect(firstImport).toBe('import "@/components/system/renderer-recovery/install-renderer-recovery";');
    expect(entry.indexOf('import "@/lib/renderer-recovery/recovery-i18n";')).toBeGreaterThan(
      entry.indexOf('import "@/i18n";'),
    );
    expect(entry).toContain("<RendererRecoveryRoot>");
    expect(entry).toContain("markRendererStarted();");
  });
});

describe("recovery without i18n", () => {
  test("nothing the recovery module loads statically reaches an i18n module", async () => {
    const graph = await staticImportGraph(
      new URL("../src/components/system/renderer-recovery/install-renderer-recovery.tsx", import.meta.url)
        .pathname,
    );
    const reached = [...graph.entries()]
      .filter(([file]) => /[\\/]src[\\/]i18n[\\/]/.test(file))
      .map(([, chain]) => chain.map((file) => file.split("/src/")[1]).join(" -> "));
    expect(reached).toEqual([]);
    // The walk itself reached the recovery screen and its logic.
    expect([...graph.keys()].some((file) => file.endsWith("RendererRecovery.tsx"))).toBe(true);
    expect([...graph.keys()].some((file) => file.endsWith("renderer-recovery.ts"))).toBe(true);
  });

  test("the locale list repeated for recovery matches the app's", () => {
    expect([...RECOVERY_LOCALES]).toEqual([...APP_LOCALES]);
  });

  test("when i18n fails to initialize, the listeners still install and the screen renders", () => {
    const run = Bun.spawnSync({
      cmd: [
        process.execPath,
        "--preload",
        "./tests/fixtures/i18n-init-failure.preload.ts",
        "--preload",
        "./tests/stylex-preload.ts",
        "./tests/fixtures/renderer-recovery-i18n-failure.ts",
      ],
      cwd: new URL("..", import.meta.url).pathname,
      stdout: "pipe",
      stderr: "pipe",
    });
    expect(run.exitCode, run.stderr.toString()).toBe(0);
    const output = run.stdout.toString().trim().split("\n").at(-1) ?? "";
    const result = JSON.parse(output) as {
      i18nError: string | null;
      translatorError: string | null;
      listenerTypes: string[];
      state: string;
      startupMounts: string[];
      html: string;
    };
    // The simulation took effect: i18n and the translator registration threw.
    expect(result.i18nError).toContain("i18n init failed");
    expect(result.translatorError).not.toBeNull();
    expect(result.listenerTypes).toEqual(["error", "vite:preloadError"]);
    expect(result.state).toBe("failed");
    expect(result.startupMounts).toEqual(["root"]);
    expect(result.html).toContain("Stave ran into a problem");
    expect(result.html).toContain("Reload window");
    expect(result.html).toContain("Copy error details");
  }, 60_000);
});
