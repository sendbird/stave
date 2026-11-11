/**
 * Captures the end-user guide screenshots in English and Korean:
 * docs/screenshots/guide/<locale>/<name>.png.
 *
 *   node scripts/capture-guide-screenshots.mjs
 *   GUIDE_SCREENSHOT_ONLY=overview,fleet GUIDE_SCREENSHOT_LOCALES=ko node scripts/capture-guide-screenshots.mjs
 *
 * It reuses a Vite dev server on GUIDE_SCREENSHOT_PORT (default 4319) or starts
 * `bun run dev` there. Every shot uses synthetic data: the app shell is seeded
 * through `stave-store` localStorage and a stubbed `window.api` (the pattern in
 * tests/e2e/shell-chrome-alignment.e2e.ts), the rest renders the dev previews
 * routed in src/main.tsx (`?stavePreview=<name>`). No dev bridge, provider or
 * real repository is used.
 *
 * When the UI changes, re-run this script and open the PNGs. When a shot
 * breaks, update its step below: the seeded state shape lives in
 * src/store/app.store.ts, and each preview documents its query parameters at
 * the top of src/dev/<name>-preview/index.tsx. A shot that cannot render is
 * listed as skipped with its reason instead of being faked; any failure makes
 * the script exit non-zero.
 */
import { spawn } from "node:child_process";
import { existsSync } from "node:fs";
import { mkdir } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";
import { chromium } from "@playwright/test";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const outputRoot = path.join(repoRoot, "docs", "screenshots", "guide");
const port = Number(process.env.GUIDE_SCREENSHOT_PORT ?? "4319");
const baseUrl = `http://127.0.0.1:${port}`;
const systemChrome = "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";
const VIEWPORT = { width: 1440, height: 900 };
const LOCALES = ["en", "ko"];
const INTL_LOCALE = { en: "en-US", ko: "ko-KR" };
const REPOSITORY_PATH = "/tmp/acme-web";
const STAMP = "2026-10-31T09:00:00.000Z";

/* ------------------------------------------------------------------------ */
/* Synthetic content, per locale                                             */
/* ------------------------------------------------------------------------ */

const COPY = {
  en: {
    taskTitle: "Fix the login redirect",
    otherTaskTitle: "Add a sign-out confirmation",
    docsWorkspace: "Docs refresh",
    user: "After signing in, people land on /home instead of the page they came from. Please fix the redirect and add a test.",
    assistant: [
      "Fixed. The login form now keeps the `next` parameter and sends people back to that page after sign-in.",
      "",
      "- `src/auth/login.tsx` reads `next` from the URL and passes it to `signIn`.",
      "- `src/auth/redirect.ts` only accepts same-origin paths, so an external URL falls back to `/home`.",
      "- Added `tests/auth/redirect.test.ts`; `bun test tests/auth` passes (6 tests).",
    ].join("\n"),
    notes: "Redirect must stay same-origin. Check the sign-up flow uses the same helper before the release.",
    todos: ["Keep `next` through the login form", "Reject external redirect URLs", "Update the auth guide"],
    jiraTitle: "Users return to /home after sign-in",
    prTitle: "fix(auth): return to the requested page after sign-in",
    figmaTitle: "Sign-in flow",
    approvalDescription: "Run the auth tests",
    kickoffSource: "ACME-142: After sign-in, users land on /home instead of the page they came from. Keep the redirect same-origin and add a regression test.",
    notificationApproval: "Approve the deploy preview",
    notificationResult: "Sign-out confirmation is ready",
    scripts: { target: "Workspace", bootstrap: "Bootstrap", bootstrapDescription: "Install dependencies and seed the local database.", test: "Test", testDescription: "Run the unit tests.", web: "Web app", webDescription: "Serve the app on port 5173." },
    summaryRequest: "Send people back to the page they came from after sign-in.",
    summaryWork: "Kept the `next` parameter through login, limited redirects to same-origin paths and added a regression test.",
  },
  ko: {
    taskTitle: "로그인 리디렉션 수정",
    otherTaskTitle: "로그아웃 확인 창 추가",
    docsWorkspace: "문서 정리",
    user: "로그인하고 나면 원래 보던 페이지가 아니라 /home으로 이동합니다. 리디렉션을 고치고 테스트도 추가해 주세요.",
    assistant: [
      "수정했습니다. 로그인 폼이 `next` 파라미터를 유지하고, 로그인 후 그 페이지로 돌려보냅니다.",
      "",
      "- `src/auth/login.tsx`가 URL의 `next`를 읽어 `signIn`에 넘깁니다.",
      "- `src/auth/redirect.ts`는 같은 출처의 경로만 허용하므로 외부 URL은 `/home`으로 돌아갑니다.",
      "- `tests/auth/redirect.test.ts`를 추가했고 `bun test tests/auth`가 통과합니다(테스트 6개).",
    ].join("\n"),
    notes: "리디렉션은 같은 출처로만 보냅니다. 릴리스 전에 회원 가입 흐름도 같은 헬퍼를 쓰는지 확인합니다.",
    todos: ["로그인 폼에서 `next` 유지", "외부 리디렉션 URL 거부", "인증 가이드 업데이트"],
    jiraTitle: "로그인 후 /home으로 돌아가는 문제",
    prTitle: "fix(auth): 로그인 후 요청한 페이지로 돌아가기",
    figmaTitle: "로그인 흐름",
    approvalDescription: "인증 테스트 실행",
    kickoffSource: "ACME-142: 로그인하면 원래 페이지가 아니라 /home으로 이동합니다. 리디렉션은 같은 출처로만 보내고 회귀 테스트를 추가해 주세요.",
    notificationApproval: "배포 미리보기 승인",
    notificationResult: "로그아웃 확인 창 작업 완료",
    scripts: { target: "워크스페이스", bootstrap: "초기 설정", bootstrapDescription: "의존성을 설치하고 로컬 데이터베이스를 채웁니다.", test: "테스트", testDescription: "단위 테스트를 실행합니다.", web: "웹 앱", webDescription: "5173 포트에서 앱을 띄웁니다." },
    summaryRequest: "로그인 후 원래 보던 페이지로 돌아가게 합니다.",
    summaryWork: "로그인 과정에서 `next` 파라미터를 유지하고, 리디렉션을 같은 출처 경로로 제한했으며, 회귀 테스트를 추가했습니다.",
  },
};

const WORKSPACE_IDS = { main: "ws-main", login: "ws-login", docs: "ws-docs" };
const TASK_ID = "task-login";
const OTHER_TASK_ID = "task-signout";

function workspacesFor(copy) {
  return [
    { id: WORKSPACE_IDS.main, name: "main", updatedAt: STAMP },
    { id: WORKSPACE_IDS.login, name: "feat/login-redirect", updatedAt: STAMP },
    { id: WORKSPACE_IDS.docs, name: copy.docsWorkspace, updatedAt: STAMP },
  ];
}

function conversationFor(copy) {
  const tool = (toolUseId, toolName, input, output) => ({
    type: "tool_use",
    toolUseId,
    toolName,
    input: JSON.stringify(input),
    output,
    state: "output-available",
  });
  return [
    {
      id: "u1",
      role: "user",
      model: "",
      providerId: "user",
      content: copy.user,
      startedAt: "2026-10-31T08:52:00.000Z",
      parts: [{ type: "text", text: copy.user }],
    },
    {
      id: "a1",
      role: "assistant",
      model: "claude-opus-5-5",
      providerId: "claude-code",
      content: "",
      startedAt: "2026-10-31T08:52:04.000Z",
      completedAt: "2026-10-31T08:56:41.000Z",
      parts: [
        tool("t1", "Grep", { pattern: "redirectTo" }, "src/auth/login.tsx:42"),
        tool("t2", "Read", { file_path: `${REPOSITORY_PATH}/src/auth/login.tsx` }, "export function LoginForm() {}"),
        tool("t3", "Edit", { file_path: `${REPOSITORY_PATH}/src/auth/redirect.ts` }, "ok"),
        { ...tool("t4", "Bash", { command: "bun test tests/auth" }, "6 pass"), exitCode: 0 },
        { type: "text", text: copy.assistant },
      ],
    },
  ];
}

function informationFor(copy) {
  return {
    jiraIssues: [
      { id: "jira-1", issueKey: "ACME-142", title: copy.jiraTitle, url: "https://acme.atlassian.net/browse/ACME-142", status: "In Progress", note: "" },
    ],
    craneIssues: [],
    confluencePages: [],
    figmaResources: [
      { id: "figma-1", title: copy.figmaTitle, url: "https://www.figma.com/design/AbCdEf123/acme-web?node-id=12-34", nodeId: "12:34", note: "" },
    ],
    storybookResources: [],
    linkedPullRequests: [
      { id: "pr-1", title: copy.prTitle, url: "https://github.com/acme/acme-web/pull/87", status: "review", note: "" },
    ],
    amplifyLinks: [],
    slackThreads: [],
    martinProject: null,
    notes: copy.notes,
    todos: copy.todos.map((text, index) => ({
      id: `todo-${index + 1}`,
      text,
      completed: index === 0,
      status: index === 0 ? "completed" : index === 1 ? "in_progress" : "pending",
    })),
    customFields: [],
    intentAnchorIds: [],
    turnSummary: {
      turnId: "turn-login",
      taskId: TASK_ID,
      taskTitle: copy.taskTitle,
      generatedAt: "2026-10-31T08:56:45.000Z",
      model: "claude-opus-5-5",
      requestSummary: copy.summaryRequest,
      workSummary: copy.summaryWork,
    },
  };
}

function approvalMessageFor(copy) {
  return {
    id: "a-approval",
    role: "assistant",
    model: "claude-opus-5-5",
    providerId: "claude-code",
    content: "",
    turnId: "turn-approval",
    startedAt: "2026-10-31T08:58:00.000Z",
    parts: [
      {
        type: "approval",
        requestId: "approval-auth-tests",
        toolName: "Bash",
        description: copy.approvalDescription,
        input: JSON.stringify({ command: "bun test tests/auth" }),
        state: "approval-requested",
        supportsAllowAlways: true,
      },
    ],
  };
}

function scriptsConfig(copy) {
  const target = { id: "workspace", label: copy.scripts.target, cwd: "workspace", env: {} };
  return {
    actions: [
      { id: "bootstrap", kind: "action", label: copy.scripts.bootstrap, description: copy.scripts.bootstrapDescription, commands: ["bun install", "bun run db:seed"], targetId: "workspace", target, timeoutMs: 120000, source: "script" },
      { id: "test", kind: "action", label: copy.scripts.test, description: copy.scripts.testDescription, commands: ["bun test"], targetId: "workspace", target, source: "script" },
    ],
    services: [
      { id: "web", kind: "service", label: copy.scripts.web, description: copy.scripts.webDescription, commands: ["bun run dev"], targetId: "workspace", target, restartOnRun: true, source: "script" },
    ],
    hooks: {
      "task.created": [{ trigger: "task.created", scriptId: "bootstrap", scriptKind: "action", blocking: true }],
    },
    targets: { workspace: target },
    legacyPhases: { setup: [], run: [], teardown: [] },
  };
}

function scriptStatuses() {
  return [
    { scriptId: "web", scriptKind: "service", running: true, log: "[09:02:11] bun run dev\n[09:02:12] Local: http://localhost:5173/\n", runId: "run-web", sessionId: "session-web", source: { kind: "manual" } },
    { scriptId: "bootstrap", scriptKind: "action", running: false, log: "[08:50:44] bun install\n[08:51:02] bun run db:seed\n[08:51:05] Done\n", runId: "run-bootstrap", sessionId: "session-bootstrap", source: { kind: "hook", trigger: "task.created" } },
  ];
}

function localMcpStatus() {
  const home = "/tmp/stave-home";
  return {
    config: { enabled: true, port: 43127, token: "stave-local-token-example", claudeCodeAutoRegister: true, codexAutoRegister: true },
    running: true,
    manifest: {
      version: 1,
      name: "stave-local-mcp",
      mode: "local-only",
      url: "http://127.0.0.1:43127/mcp",
      healthUrl: "http://127.0.0.1:43127/health",
      token: "stave-local-token-example",
      host: "127.0.0.1",
      port: 43127,
      pid: 4821,
      appVersion: "0.29.2",
      startedAt: STAMP,
      stdioProxyScript: "/Applications/Stave.app/Contents/Resources/app.asar.unpacked/out/main/stave-mcp-stdio-proxy.mjs",
    },
    manifestPaths: [`${home}/.stave/local-mcp.json`],
    configPath: `${home}/Library/Application Support/Stave/local-mcp.json`,
    claudeCodeRegistration: { autoRegister: true, configPath: `${home}/.claude.json`, installed: true, matchesCurrentManifest: true, transportType: "http", url: "http://127.0.0.1:43127/mcp", detail: "Stave manages the Claude Code MCP entry." },
    codexRegistration: { autoRegister: true, configPath: `${home}/.codex/config.toml`, installed: true, matchesCurrentManifest: true, url: "http://127.0.0.1:43127/mcp", bearerTokenEnvVar: "STAVE_LOCAL_MCP_TOKEN", detail: "Stave manages the Codex MCP entry." },
  };
}

function notificationsFor(copy) {
  const base = {
    repositoryPath: REPOSITORY_PATH,
    repositoryName: "acme-web",
    workspaceId: WORKSPACE_IDS.login,
    workspaceName: "feat/login-redirect",
    providerId: "claude-code",
    payload: {},
    resolvedAt: null,
    expiresAt: null,
  };
  return [
    {
      ...base,
      id: "notification-approval",
      kind: "task.approval_requested",
      title: copy.notificationApproval,
      body: copy.approvalDescription,
      taskId: TASK_ID,
      taskTitle: copy.taskTitle,
      turnId: "turn-approval",
      action: { type: "approval", requestId: "approval-auth-tests", messageId: "a-approval" },
      createdAt: "2026-10-31T08:58:00.000Z",
      readAt: null,
    },
    {
      ...base,
      id: "notification-result",
      kind: "task.turn_completed",
      title: copy.notificationResult,
      body: copy.otherTaskTitle,
      taskId: OTHER_TASK_ID,
      taskTitle: copy.otherTaskTitle,
      turnId: "turn-signout",
      action: null,
      createdAt: "2026-10-31T08:40:00.000Z",
      readAt: null,
    },
  ];
}

/* ------------------------------------------------------------------------ */
/* Browser helpers                                                           */
/* ------------------------------------------------------------------------ */

async function newPage(browser, locale, viewport = VIEWPORT) {
  const context = await browser.newContext({
    viewport,
    deviceScaleFactor: 2,
    locale: INTL_LOCALE[locale],
    timezoneId: "UTC",
    colorScheme: "dark",
    reducedMotion: "reduce",
  });
  const page = await context.newPage();
  const problems = [];
  page.on("pageerror", (error) => problems.push(`pageerror: ${error.message}`));
  return { context, page, problems };
}

/**
 * Seeds the full app shell. `scenario` adds the conversation, an approval, the
 * Information panel content and Fleet notifications.
 */
async function openApp(page, locale, scenario = {}) {
  const copy = COPY[locale];
  const payload = {
    locale,
    repositoryPath: REPOSITORY_PATH,
    workspaces: workspacesFor(copy),
    ids: WORKSPACE_IDS,
    taskId: TASK_ID,
    otherTaskId: OTHER_TASK_ID,
    taskTitle: copy.taskTitle,
    otherTaskTitle: copy.otherTaskTitle,
    messages: [...(scenario.conversation === false ? [] : conversationFor(copy)), ...(scenario.approval ? [approvalMessageFor(copy)] : [])],
    information: informationFor(copy),
    notifications: scenario.notifications ? notificationsFor(copy) : null,
    scripts: { config: scriptsConfig(copy), statuses: scriptStatuses() },
    localMcp: localMcpStatus(),
    stamp: STAMP,
  };
  await page.addInitScript((data) => {
    const tasks = [
      { id: data.taskId, title: data.taskTitle, provider: "claude-code", updatedAt: data.stamp, unread: false, archivedAt: null },
      { id: data.otherTaskId, title: data.otherTaskTitle, provider: "codex", updatedAt: "2026-10-31T08:40:00.000Z", unread: false, archivedAt: null },
    ];
    const snapshot = {
      activeTaskId: data.taskId,
      openTaskTabIds: [data.taskId],
      activeSurface: { kind: "task", taskId: data.taskId },
      tasks,
      messagesByTask: { [data.taskId]: data.messages, [data.otherTaskId]: [] },
      workspaceInformation: data.information,
    };
    const empty = { activeTaskId: "", tasks: [], messagesByTask: {} };
    window.localStorage.setItem(
      "stave:workspace-fallback:v1",
      JSON.stringify(data.workspaces.map((workspace) => ({ ...workspace, snapshot: workspace.id === data.ids.login ? snapshot : empty }))),
    );
    window.localStorage.setItem(
      "stave-store",
      JSON.stringify({
        state: {
          repositoryPath: data.repositoryPath,
          repositoryName: "acme-web",
          defaultBranch: "main",
          workspaces: data.workspaces,
          activeWorkspaceId: data.ids.main,
          workspaceBranchById: { [data.ids.main]: "main", [data.ids.login]: "feat/login-redirect", [data.ids.docs]: "docs/refresh" },
          workspacePathById: Object.fromEntries(data.workspaces.map((workspace) => [workspace.id, data.repositoryPath])),
          workspaceDefaultById: { [data.ids.main]: true },
          providerAvailability: { "claude-code": true, codex: true },
          settings: { language: data.locale, themeMode: "dark" },
          ...empty,
        },
        version: 0,
      }),
    );
    if (data.notifications) {
      window.localStorage.setItem("stave:notifications-fallback:v1", JSON.stringify(data.notifications));
    }
    const ok = async () => ({ ok: true });
    window.api = {
      provider: {
        streamTurn: async () => [],
        respondApproval: ok,
        checkAvailability: async () => ({ ok: true, available: true }),
        getModelCatalog: async ({ providerId }) => ({ providerId, ok: true, detail: "", models: [] }),
        getCodexModelCatalog: async () => ({ ok: true, models: [], detail: "" }),
        // Settings → MCP: no provider-native servers, so the Local MCP card leads.
        discoverMcpServers: async () => ({ ok: true, servers: [], errors: [], discoveredAt: Date.now() }),
        listMcpServerConfigs: async () => ({ ok: true, detail: "", servers: [], errors: [], loadedAt: Date.now() }),
        getClaudeMcpStatus: async () => ({ ok: true, detail: "", servers: [], checkedAt: Date.now() }),
        getCodexMcpStatus: async () => ({ ok: true, detail: "", servers: [] }),
      },
      terminal: { runCommand: async () => ({ ok: true, code: 0, stdout: "", stderr: "" }) },
      sourceControl: {
        getStatus: async () => ({ ok: true, branch: "main", items: [], hasConflicts: false, stderr: "" }),
        getHistory: async () => ({ ok: true, items: [], stderr: "" }),
      },
      scripts: {
        getConfig: async () => ({ ok: true, config: data.scripts.config }),
        getStatus: async () => ({ ok: true, statuses: data.scripts.statuses }),
        runEntry: async () => ({ ok: true, runId: "run", sessionId: "session", alreadyRunning: false }),
        stopEntry: ok,
        stopAll: ok,
        runHook: async (args) => ({ ok: true, summary: { trigger: args.trigger, totalEntries: 0, executedEntries: 0, failures: [] } }),
        subscribeEvents: () => () => {},
      },
      localMcp: {
        getStatus: async () => ({ ok: true, status: data.localMcp }),
        updateConfig: async () => ({ ok: true, status: data.localMcp }),
        rotateToken: async () => ({ ok: true, status: data.localMcp }),
        listRequestLogs: async () => ({ ok: true, logs: [], total: 0, limit: 25, offset: 0, hasMore: false }),
        getRequestLog: async () => ({ ok: true, log: null }),
        clearRequestLogs: async () => ({ ok: true, cleared: 0 }),
      },
    };
  }, payload);
  await page.goto(`${baseUrl}/`, { waitUntil: "domcontentloaded" });
  await page.getByTestId("top-bar").waitFor({ timeout: 60_000 });
  // The browser build lists only the worktrees it finds; restate the three
  // and stop the 30-second re-list from dropping them again.
  await page.evaluate(async (data) => {
    const { useAppStore } = await import("/src/store/app.store.ts");
    useAppStore.setState({ refreshWorkspaces: async () => {} });
    useAppStore.setState({
      workspaces: data.workspaces,
      workspaceBranchById: { [data.ids.main]: "main", [data.ids.login]: "feat/login-redirect", [data.ids.docs]: "docs/refresh" },
      workspacePathById: Object.fromEntries(data.workspaces.map((workspace) => [workspace.id, data.repositoryPath])),
      workspaceDefaultById: { [data.ids.main]: true },
    });
    // Open the feature workspace, the way clicking its row does.
    await useAppStore.getState().switchWorkspace({ workspaceId: data.ids.login });
    // The "Welcome back" summary reads the seeded clock as days away.
    const { useTaskReturnStore } = await import("/src/store/task-return-store.ts");
    useTaskReturnStore.getState().dismiss(data.taskId);
  }, payload);
  if (scenario.approval) {
    await page.evaluate(async (taskId) => {
      const { useAppStore } = await import("/src/store/app.store.ts");
      useAppStore.setState((state) => ({
        activeTurnIdsByTask: { ...state.activeTurnIdsByTask, [taskId]: "turn-approval" },
      }));
    }, TASK_ID);
  }
  await settle(page);
}

async function openPreview(page, locale, query) {
  await page.goto(`${baseUrl}/?stavePreview=${query}&lang=${locale}`, { waitUntil: "networkidle" });
  // Not every preview reads `&lang`; apply it the way the app does.
  await page.evaluate(async (locale) => {
    const { applyAppLocale } = await import("/src/i18n/index.ts");
    applyAppLocale(locale);
  }, locale);
  await settle(page);
}

async function settle(page) {
  await page.evaluate(() => document.fonts.ready);
  await page.waitForTimeout(600);
}

async function setLayout(page, patch) {
  await page.evaluate(async (patch) => {
    const { useAppStore } = await import("/src/store/app.store.ts");
    useAppStore.setState((state) => ({ layout: { ...state.layout, ...patch } }));
  }, patch);
}

async function openRightPanel(page, tab, readyText) {
  await setLayout(page, { sidebarOverlayVisible: true, sidebarOverlayTab: tab });
  const panel = page.locator("[data-stave-right-panel][data-state='open']");
  await panel.waitFor();
  // Panels load lazily; wait for their content, not the loading line.
  if (readyText) await panel.getByText(readyText).first().waitFor();
  await settle(page);
}

async function openSettings(page, section) {
  await page.evaluate((section) => {
    window.dispatchEvent(new CustomEvent("stave:open-settings", { detail: { section } }));
  }, section);
  const dialog = page.getByRole("dialog").last();
  await dialog.waitFor();
  await settle(page);
  return dialog;
}

/** Drops the focus ring a dialog puts on its first control. */
async function blur(page) {
  await page.evaluate(() => document.activeElement instanceof HTMLElement && document.activeElement.blur());
}

/** Hides hover tooltips and the text caret so they do not land in a shot. */
async function quietChrome(page) {
  await page.addStyleTag({
    content: '[data-slot="tooltip-content"], [data-slot="tooltip-positioner"] { display: none !important; } * { caret-color: transparent !important; }',
  });
}

async function save(page, target, file, { padding = 0, clip } = {}) {
  await mkdir(path.dirname(file), { recursive: true });
  if (clip) {
    await page.screenshot({ path: file, clip, animations: "disabled" });
    return;
  }
  if (!target) {
    await page.screenshot({ path: file, animations: "disabled" });
    return;
  }
  await target.waitFor();
  await target.scrollIntoViewIfNeeded();
  if (padding === 0) {
    await target.screenshot({ path: file, animations: "disabled" });
    return;
  }
  const box = await target.boundingBox();
  const viewport = page.viewportSize();
  const x = Math.max(0, box.x - padding);
  const y = Math.max(0, box.y - padding);
  await page.screenshot({
    path: file,
    animations: "disabled",
    clip: {
      x,
      y,
      width: Math.min(viewport.width - x, box.width + padding * 2),
      height: Math.min(viewport.height - y, box.height + padding * 2),
    },
  });
}

/** The element's box, cut below its last visible content so a tall panel has no empty tail. */
async function contentClip(page, locator, padding = 16) {
  await locator.waitFor();
  return locator.evaluate((element, padding) => {
    const box = element.getBoundingClientRect();
    let bottom = box.top;
    for (const node of element.querySelectorAll("*")) {
      const rect = node.getBoundingClientRect();
      const leaf = node.children.length === 0 || node.matches("button, input, textarea, svg");
      if (!leaf || rect.width === 0 || rect.height === 0 || rect.bottom > box.bottom) continue;
      if (getComputedStyle(node).visibility === "hidden") continue;
      bottom = Math.max(bottom, rect.bottom);
    }
    return { x: box.left, y: box.top, width: box.width, height: Math.min(box.height, bottom - box.top + padding) };
  }, padding);
}

/** Union of several boxes, padded and kept inside the viewport. */
async function unionClip(page, locators, padding = 12, { top = padding } = {}) {
  const boxes = [];
  for (const locator of locators) {
    await locator.waitFor();
    boxes.push(await locator.boundingBox());
  }
  const viewport = page.viewportSize();
  const left = Math.max(0, Math.min(...boxes.map((box) => box.x)) - padding);
  const upper = Math.max(0, Math.min(...boxes.map((box) => box.y)) - top);
  const right = Math.min(viewport.width, Math.max(...boxes.map((box) => box.x + box.width)) + padding);
  const bottom = Math.min(viewport.height, Math.max(...boxes.map((box) => box.y + box.height)) + padding);
  return { x: left, y: upper, width: right - left, height: bottom - upper };
}

/** Fails the shot on an error overlay, a crash screen or the wrong language. */
async function assertHealthy(page, locale, problems) {
  const overlay = await page.locator("vite-error-overlay").count();
  if (overlay) throw new Error("Vite error overlay is showing");
  const lang = await page.evaluate(() => document.documentElement.lang);
  if (lang !== INTL_LOCALE[locale]) throw new Error(`<html lang> is ${lang}, expected ${INTL_LOCALE[locale]}`);
  if (problems.length) throw new Error(problems.join("\n"));
}

/* ------------------------------------------------------------------------ */
/* Shots                                                                     */
/* ------------------------------------------------------------------------ */

const SHOTS = [
  {
    name: "overview",
    async capture({ page, locale, file, t }) {
      await openApp(page, locale);
      await page.locator('[data-message-id="a1"]').waitFor();
      await openRightPanel(page, "information", await t("workspace:workspaceInformationPanel.todos"));
      await quietChrome(page);
      await save(page, null, file);
    },
  },
  {
    name: "subagent-results",
    async capture({ page, locale, file }) {
      await openPreview(page, locale, "agent-messages");
      await settle(page);
      await save(page, page.getByTestId("message-subagents"), file, { padding: 16 });
    },
  },
  {
    name: "new-workspace",
    async capture({ page, locale, file, t }) {
      await openApp(page, locale);
      await quietChrome(page);
      const trigger = page.getByRole("button", { name: await t("workspace:repositoryWorkspaceSidebar.accessibility.newProjectWorkspace", { value1: "acme-web" }) });
      // The row's actions show on hover; the repository name sits over them until then.
      await trigger.hover({ force: true });
      await trigger.click({ force: true });
      const dialog = page.getByRole("dialog").last();
      await settle(page);
      await save(page, dialog, file, { padding: 16 });
    },
  },
  {
    name: "kickoff",
    async capture({ page, locale, file }) {
      await openPreview(page, locale, "kickoff");
      const dialog = page.getByRole("dialog").last();
      await dialog.locator("textarea").first().fill(COPY[locale].kickoffSource);
      await settle(page);
      await save(page, dialog, file, { padding: 16 });
    },
  },
  {
    name: "model-picker",
    async capture({ page, locale, file, t }) {
      // Render the shipping selector directly; the shell's session restore is
      // independent of the model-row contract this image documents.
      await openPreview(page, locale, "model-auto-tab&theme=dark");
      await page.locator('[data-model-effort-control] button').first().click();
      const selector = page.getByRole('dialog', { name: await t('composer:modelEffortSelector.ariaLabel3'), exact: true });
      await selector.waitFor();
      await settle(page);
      await save(page, selector, file, { padding: 16 });
    },
  },
  {
    name: "approval",
    async capture({ page, locale, file }) {
      await openApp(page, locale, { approval: true });
      await quietChrome(page);
      const request = page.getByTestId("composer-approval-row").first();
      await request.waitFor();
      await settle(page);
      await save(page, null, file, { clip: await unionClip(page, [request, page.getByTestId("composer-workspace-bar")], 16) });
    },
  },
  {
    name: "queue-usage-limit",
    async capture({ page, locale, file }) {
      await openPreview(page, locale, "composer-frame&case=limited&theme=dark");
      await quietChrome(page);
      await page.getByTestId("composer-shelf-usage-limit").waitFor();
      await save(page, null, file, { clip: await unionClip(page, [page.getByTestId("composer-shelf"), page.getByTestId("composer-workspace-bar")], 16) });
    },
  },
  {
    name: "agents",
    async capture({ page, locale, file }) {
      await openPreview(page, locale, "agents&surface=1&theme=dark&edit=1");
      await save(page, null, file);
    },
  },
  {
    name: "agent-run-panel",
    viewport: { width: 448, height: 900 },
    async capture({ page, locale, file }) {
      await openPreview(page, locale, "task-panel&task=agent-run&tab=progress&theme=dark&panelWidth=416");
      await save(page, null, file, { clip: await contentClip(page, page.getByTestId("task-panel-frame")) });
    },
  },
  {
    name: "run-sign-off",
    viewport: { width: 1440, height: 4200 },
    async capture({ page, locale, file }) {
      await openPreview(page, locale, "agent-run&theme=dark");
      await save(page, page.getByTestId("agent-run-sign-off").first(), file, { padding: 12 });
    },
  },
  {
    name: "fleet",
    async capture({ page, locale, file }) {
      await openApp(page, locale, { approval: true, notifications: true });
      await quietChrome(page);
      await page.evaluate(async () => {
        const { useAppStore } = await import("/src/store/app.store.ts");
        useAppStore.getState().openFleetView();
      });
      await page.locator("[data-fleet-view-root='true']").waitFor();
      await settle(page);
      await save(page, null, file);
    },
  },
  {
    name: "schedules",
    async capture({ page, locale, file }) {
      await openPreview(page, locale, "schedules&theme=dark");
      await save(page, null, file);
    },
  },
  {
    name: "review",
    async capture({ page, locale, file }) {
      await openPreview(page, locale, "review&theme=dark");
      await save(page, null, file);
    },
  },
  {
    name: "results",
    viewport: { width: 448, height: 900 },
    async capture({ page, locale, file }) {
      await openPreview(page, locale, "task-panel&tab=results&theme=dark&panelWidth=416");
      // The preview stubs only the turn-history half of the persistence bridge, so
      // the Outputs tab reports "storage unavailable". Without a bridge it reads
      // the results the preview seeded into localStorage, as the browser build does.
      await page.evaluate(async () => {
        delete window.api.persistence;
        const { invalidateResultReviews } = await import("/src/lib/reviews/result-review-client.ts");
        invalidateResultReviews();
      });
      const entry = page.getByText("Tightened the row gaps to 8px and kept the keyboard order; typecheck and the focused tests pass.", { exact: true }).first();
      await entry.click();
      await settle(page);
      const frame = page.getByTestId("task-panel-frame");
      await save(page, null, file, { clip: await contentClip(page, frame) });
    },
  },
  {
    name: "settings-providers",
    async capture({ page, locale, file }) {
      await openApp(page, locale);
      await quietChrome(page);
      const dialog = await openSettings(page, "providers");
      await blur(page);
      await save(page, dialog, file);
    },
  },
  {
    name: "settings-mcp",
    async capture({ page, locale, file, t }) {
      await openApp(page, locale);
      await quietChrome(page);
      const dialog = await openSettings(page, "mcp");
      const title = dialog.getByText(await t("settings:developerSection.localMcp.title"), { exact: true }).first();
      await title.evaluate((element) => element.scrollIntoView({ block: "start" }));
      await blur(page);
      await settle(page);
      await save(page, dialog, file);
    },
  },
  {
    name: "command-palette",
    async capture({ page, locale, file }) {
      await openApp(page, locale);
      await quietChrome(page);
      await page.locator("body").click({ position: { x: 700, y: 300 } });
      await page.keyboard.press("Meta+Shift+P");
      const palette = page.getByRole("dialog").last();
      await palette.waitFor({ timeout: 5_000 }).catch(async () => {
        await page.keyboard.press("Control+Shift+P");
        await palette.waitFor();
      });
      await settle(page);
      await save(page, null, file);
    },
  },
  {
    name: "workspace-tools",
    async capture({ page, locale, file }) {
      await openApp(page, locale);
      await openRightPanel(page, "scripts", COPY[locale].scripts.web);
      await quietChrome(page);
      await save(page, null, file, { clip: await contentClip(page, page.locator("[data-stave-right-panel][data-state='open']")) });
    },
  },
  {
    name: "information-panel",
    // Tall enough to show the linked resources below the notes.
    viewport: { width: 1440, height: 2000 },
    async capture({ page, locale, file, t }) {
      await openApp(page, locale);
      await openRightPanel(page, "information", await t("workspace:workspaceInformationPanel.todos"));
      const panel = page.locator("[data-stave-right-panel][data-state='open']");
      const sections = ["todos", "notes", "pullRequests", "jiraIssues"].map((key) => `workspace:workspaceInformationPanel.${key}`);
      for (const label of [...(await Promise.all(sections.map((key) => t(key)))), "Figma"]) {
        const toggle = panel.getByRole("button", { name: new RegExp(`^${label}`), expanded: false }).first();
        if (await toggle.count()) await toggle.click();
      }
      await panel.getByText(COPY[locale].notes).first().waitFor();
      await panel.getByText(COPY[locale].prTitle).first().waitFor();
      await settle(page);
      await quietChrome(page);
      await save(page, null, file, { clip: await contentClip(page, panel) });
    },
  },
  {
    name: "lens",
    async capture({ page, locale, file }) {
      await openPreview(page, locale, "lens-chrome&theme=dark");
      // The browser build has no webview, so only the toolbar is real: show the
      // full-pane case without the preview's caption.
      const frame = page.locator('[data-preview-case="wide"] > div').last();
      await save(page, null, file, { clip: await unionClip(page, [frame], 12, { top: 4 }) });
    },
  },
];

/* ------------------------------------------------------------------------ */
/* Runner                                                                    */
/* ------------------------------------------------------------------------ */

async function isServing() {
  try {
    const response = await fetch(`${baseUrl}/src/main.tsx`);
    return response.ok;
  } catch {
    return false;
  }
}

async function startDevServer() {
  const child = spawn("bun", ["run", "dev", "--", "--host", "127.0.0.1", "--port", String(port), "--strictPort"], {
    cwd: repoRoot,
    stdio: ["ignore", "pipe", "pipe"],
    env: { ...process.env, CI: "1" },
  });
  let output = "";
  child.stdout.on("data", (chunk) => { output += chunk; });
  child.stderr.on("data", (chunk) => { output += chunk; });
  const deadline = Date.now() + 120_000;
  while (Date.now() < deadline) {
    if (child.exitCode !== null) throw new Error(`Dev server exited:\n${output}`);
    if (await isServing()) return child;
    await new Promise((resolve) => setTimeout(resolve, 500));
  }
  child.kill("SIGTERM");
  throw new Error(`Dev server did not start on ${baseUrl}:\n${output}`);
}

function listFromEnv(name, fallback) {
  const values = (process.env[name] ?? "").split(",").map((value) => value.trim()).filter(Boolean);
  return values.length ? values : fallback;
}

async function main() {
  const locales = listFromEnv("GUIDE_SCREENSHOT_LOCALES", LOCALES);
  const only = listFromEnv("GUIDE_SCREENSHOT_ONLY", SHOTS.map((shot) => shot.name));
  const unknown = [...locales.filter((locale) => !LOCALES.includes(locale)), ...only.filter((name) => !SHOTS.some((shot) => shot.name === name))];
  if (unknown.length) throw new Error(`Unknown locale or shot: ${unknown.join(", ")}`);

  const devServer = (await isServing()) ? null : await startDevServer();
  console.log(devServer ? `[guide] started dev server on ${baseUrl}` : `[guide] reusing dev server on ${baseUrl}`);
  const browser = await chromium.launch({ headless: true, ...(existsSync(systemChrome) ? { executablePath: systemChrome } : {}) });
  const failures = [];
  const skipped = [];
  let written = 0;
  try {
    for (const locale of locales) {
      for (const shot of SHOTS.filter((candidate) => only.includes(candidate.name))) {
        if (shot.skip) {
          skipped.push(`${locale}/${shot.name}: ${shot.skip}`);
          console.log(`[guide] skip ${locale}/${shot.name}: ${shot.skip}`);
          continue;
        }
        const file = path.join(outputRoot, locale, `${shot.name}.png`);
        const { context, page, problems } = await newPage(browser, locale, shot.viewport);
        page.setDefaultTimeout(20_000);
        const t = (key, options) =>
          page.evaluate(async ({ key, options }) => {
            const { i18n } = await import("/src/i18n/index.ts");
            return i18n.t(key, options);
          }, { key, options });
        try {
          await shot.capture({ page, locale, file, t });
          await assertHealthy(page, locale, problems);
          written += 1;
          console.log(`[guide] ok   ${locale}/${shot.name}`);
        } catch (error) {
          const debugFile = path.join(os.tmpdir(), `guide-failed-${locale}-${shot.name}.png`);
          await page.screenshot({ path: debugFile }).catch(() => {});
          console.error(`[guide] page at failure: ${debugFile}`);
          failures.push(`${locale}/${shot.name}: ${error instanceof Error ? error.message.split("\n")[0] : String(error)}`);
          console.error(`[guide] FAIL ${locale}/${shot.name}: ${error instanceof Error ? error.message : String(error)}`);
        } finally {
          await context.close();
        }
      }
    }
  } finally {
    await browser.close();
    devServer?.kill("SIGTERM");
  }
  console.log(`[guide] wrote ${written} screenshot(s) to ${path.relative(repoRoot, outputRoot)}`);
  for (const line of skipped) console.log(`[guide] skipped ${line}`);
  if (failures.length) {
    console.error(`[guide] ${failures.length} failure(s):\n  ${failures.join("\n  ")}`);
    process.exitCode = 1;
  }
}

await main();
