import { applyAppLocale } from "@/i18n";
import { useLayoutEffect, useMemo, useState } from "react";
import * as stylex from "@stylexjs/stylex";
import { Button } from "@/components/aui/components/Button";
import { vars } from "@/components/aui/tokens/tokens.stylex";
import { sx } from "@/components/aui/utils/stylex";
import { ActivityView } from "@/components/activity/ActivityView";
import { appShellStyles } from "@/components/layout/app-shell.styles";
import { SidebarPrimaryNav, SidebarPrimaryNavCollapsed } from "@/components/layout/SidebarPrimaryNav";
import type { ExternalSessionsSnapshot } from "@/lib/external-sessions/external-sessions";
import { applyCustomTheme, applyThemeClass } from "@/lib/themes/apply";
import { BUILTIN_CUSTOM_THEMES } from "@/lib/themes/builtin-themes";
import { useAppStore } from "@/store/app.store";
import { applyExternalActivitySnapshot } from "@/store/external-activity-store";

const NOW = Date.now();

const FIXTURE: ExternalSessionsSnapshot = {
  state: "live",
  generatedAt: NOW,
  runningCount: 3,
  sessions: [
    {
      id: "claude-1", source: "claude-code", title: "Refactor the provider runtime so retries share one queue", cwd: "/work/stave/.stave/workspaces/feat",
      branch: "feat/provider-retry-queue", status: "working", startedAt: NOW - 14 * 60_000, lastAt: NOW - 5_000,
      action: { verb: "read", target: "electron/providers/claude-sdk-runtime.ts" }, steps: 42, contextTokens: 86_400, model: "claude-test",
      agents: [
        { id: "a1", agentType: "Explore", description: "Map every IPC handler that touches provider retries", status: "running", startedAt: NOW - 6 * 60_000, lastAt: NOW - 3_000,
          action: { verb: "search", target: "invokeHostService" }, steps: 17, contextTokens: 31_200 },
        { id: "a2", agentType: "general-purpose", description: "Write focused tests", status: "running", startedAt: NOW - 3 * 60_000, lastAt: NOW - 8_000,
          action: { verb: "run", target: "bun test tests/provider-retry.test.ts" }, steps: 9 },
        { id: "a3", agentType: "code-reviewer", description: "Review the diff", status: "finished", startedAt: NOW - 12 * 60_000, lastAt: NOW - 9 * 60_000, steps: 23, contextTokens: 54_000 },
      ],
    },
    {
      id: "codex-1", source: "codex", title: "Check why the desktop build fails on Linux", cwd: "/tmp/scratch", branch: "main", status: "waiting",
      startedAt: NOW - 25 * 60_000, lastAt: NOW - 2 * 60_000, action: { verb: "run", target: "bun run build:desktop" }, steps: 11, contextTokens: 12_800, agents: [],
    },
    {
      id: "claude-2", source: "claude-code", title: "Draft release notes", cwd: "/work/other", status: "idle", startedAt: NOW - 28 * 60_000,
      lastAt: NOW - 9 * 60_000, action: { verb: "tool", tool: "create_issue", target: "Release 0.40" }, steps: 4, agents: [],
    },
  ],
};

/** Dev-only: ?stavePreview=activity&theme=dark&lang=ko&width=420&state=off|empty|loading. */
export function ActivityPreview() {
  const params = new URLSearchParams(window.location.search);
  const builtin = BUILTIN_CUSTOM_THEMES.find((theme) => theme.id === params.get("theme")) ?? null;
  const [dark, setDark] = useState(params.get("theme") === "dark" || builtin?.baseMode === "dark");
  const state = params.get("state");
  const lang = params.get("lang");
  const width = Number(params.get("width"));
  const snapshot = useMemo<ExternalSessionsSnapshot>(() => state === "empty" ? { ...FIXTURE, runningCount: 0, sessions: [] }
    : state === "loading" ? { ...FIXTURE, state: "count", sessions: [] } : FIXTURE, [state]);
  useLayoutEffect(() => {
    applyAppLocale(lang);
    applyThemeClass({ enabled: dark });
    applyCustomTheme({ theme: builtin });
    applyExternalActivitySnapshot(snapshot);
    useAppStore.setState({
      repositoryPath: "/work/stave", repositoryName: "stave",
      workspaces: [{ id: "w-feat", name: "feat/provider-retry-queue", updatedAt: "" }], workspacePathById: { "w-feat": "/work/stave/.stave/workspaces/feat" },
    });
  }, [dark, builtin, lang, snapshot]);
  return <div className={sx(styles.page)}>
    <div className={sx(styles.toolbar)}><strong>Activity preview · fixture data</strong>
      <Button variant="quiet" size="sm" onClick={() => setDark((value) => !value)}>{dark ? "Light theme" : "Dark theme"}</Button>
    </div>
    <div className={sx(styles.body)}>
      <nav className={sx(styles.sidebar)} aria-label="Sidebar preview">
        <SidebarPrimaryNav showFleetView={false} />
        <div className={sx(styles.rail)}><SidebarPrimaryNavCollapsed showFleetView={false} /></div>
      </nav>
      <div className={sx(styles.frame)} style={width ? { maxInlineSize: width } : undefined}>
        <div className={sx(appShellStyles.mainSurface)}>
          <ActivityView snapshot={snapshot} enabled={state !== "off"} />
        </div>
      </div>
    </div>
  </div>;
}

const styles = stylex.create({
  page: { blockSize: "100vh", display: "flex", flexDirection: "column", color: vars["--aui-color-text"], backgroundColor: vars["--aui-color-canvas"] },
  toolbar: { display: "flex", gap: vars["--aui-space-8"], flexWrap: "wrap", alignItems: "center", padding: vars["--aui-space-8"], fontSize: vars["--aui-font-size-caption"] },
  body: { flex: "1 1 auto", minBlockSize: 0, display: "flex" },
  sidebar: { inlineSize: "15rem", flexShrink: 0, display: "flex", flexDirection: "column", gap: vars["--aui-space-4"], padding: vars["--aui-space-8"],
    borderInlineEndWidth: vars["--aui-border-width-hairline"], borderInlineEndStyle: "solid", borderInlineEndColor: vars["--aui-color-border"] },
  rail: { display: "flex", flexDirection: "column", alignItems: "start", gap: vars["--aui-space-4"], paddingBlockStart: vars["--aui-space-16"] },
  frame: { flex: "1 1 auto", minBlockSize: 0, minInlineSize: 0, display: "flex", flexDirection: "column" },
});
