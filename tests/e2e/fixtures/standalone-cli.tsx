import { createRoot } from "react-dom/client";
import { applyAppLocale } from "@/i18n";
import { TopBarStandaloneCli } from "@/components/layout/TopBarStandaloneCli";
import { TooltipProvider } from "@/components/ui";
import { useAppStore } from "@/store/app.store";
import { useStandaloneCliStore } from "@/store/standalone-cli.store";
import { buildStandaloneCliSlotKey } from "@/lib/terminal/standalone-cli";
import { applyCustomTheme } from "@/lib/themes/apply";
import { BUILTIN_CUSTOM_THEMES } from "@/lib/themes/builtin-themes";
import "@/globals.css";

// Real React effects and xterm, with controllable IPC and no operating-system PTYs.
const params = new URLSearchParams(location.search);
const calls: string[] = [];
const detachCalls: string[] = [];
const sessions = new Map<string, { slotKey: string; account: string }>();
let releaseCreate = () => {};
let releaseClose = () => {};
let exitListener: ((event: { sessionId: string; exitCode: number }) => void) | undefined;
let createCount = 0;
const profiles = ["claude-code", "codex"].flatMap((providerId) => [
  { id: "system-default", providerId, label: "System default", kind: "system" },
  { id: "work", providerId, label: "Work", kind: "managed" },
]);
window.api = {
  providerAccounts: { list: async () => ({ ok: true, profiles }) },
  terminal: {
    createCliSession: async (args) => {
      const account = args.runtimeOptions?.claudeAccountProfileId ?? args.runtimeOptions?.codexAccountProfileId ?? "system-default";
      const sessionId = `session-${++createCount}`;
      calls.push(`create:${account}:${args.nativeSessionId ?? "fresh"}`);
      if (createCount === 1 && params.has("pending")) {
        await new Promise<void>((resolve) => { releaseCreate = resolve; });
      }
      sessions.set(sessionId, { slotKey: buildStandaloneCliSlotKey(args.providerId), account });
      return { ok: true, sessionId, nativeSessionId: `native-${sessionId}` };
    },
    getSlotState: async ({ slotKey }) => {
      const entry = [...sessions].find(([, session]) => session.slotKey === slotKey);
      return entry ? { state: "running", sessionId: entry[0] } : { state: "idle" };
    },
    attachSession: async ({ sessionId }) => {
      calls.push(`attach:${sessionId}`);
      return { ok: sessions.has(sessionId), attachmentId: `attachment-${sessionId}`, backlog: "Ready\r\n" };
    },
    detachSession: async ({ sessionId }) => { detachCalls.push(sessionId); return { ok: true }; },
    resumeSessionStream: async () => ({ ok: true }),
    resizeSession: async () => ({ ok: true }),
    closeSession: async ({ sessionId }) => {
      calls.push(`close:${sessionId}`);
      if (params.has("close-error")) return { ok: false, stderr: "Cannot stop session" };
      if (params.has("pending-close")) {
        await new Promise<void>((resolve) => { releaseClose = resolve; });
      }
      sessions.delete(sessionId);
      calls.push(`closed:${sessionId}`);
      return { ok: true };
    },
    closeSessionsBySlotPrefix: async () => ({ ok: true, closedCount: 0 }),
    subscribeSessionOutput: () => () => {},
    subscribeSessionExit: (listener) => { exitListener = listener; return () => { exitListener = undefined; }; },
    writeSession: async ({ sessionId }) => { calls.push(`write:${sessions.get(sessionId)?.account}`); return { ok: true }; },
  },
} as Window["api"];

useAppStore.setState((state) => ({
  settings: { ...state.settings, standaloneCliFolderPath: "/tmp/standalone-cli-fixture" },
  providerAvailability: { "claude-code": true, codex: true, cursor: false, kiro: false },
}));
useStandaloneCliStore.setState({
  open: false,
  activeTabId: params.get("provider") === "codex" ? "codex" : "claude-code",
  adoptedFolderPath: "/tmp/standalone-cli-fixture",
  accountProfileIdByTab: {},
  nativeSessionIdByTab: {},
});

Object.assign(window, {
  cliFixture: {
    calls,
    detachCalls,
    locale: applyAppLocale,
    releaseCreate: () => releaseCreate(),
    releaseClose: () => releaseClose(),
    state: () => useStandaloneCliStore.getState(),
    exit: () => {
      const sessionId = [...sessions.keys()][0];
      if (sessionId) exitListener?.({ sessionId, exitCode: 0 });
    },
    themes: BUILTIN_CUSTOM_THEMES.map((theme) => theme.id),
    theme: (id: string) => {
      const theme = BUILTIN_CUSTOM_THEMES.find((theme) => theme.id === id);
      document.documentElement.classList.toggle("dark", theme?.baseMode === "dark");
      applyCustomTheme({ theme: theme ?? null });
    },
  },
});

createRoot(document.getElementById("root")!).render(
  <TooltipProvider><TopBarStandaloneCli noDragStyle={{}} /></TooltipProvider>,
);
