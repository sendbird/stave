import { spawn } from "node:child_process";
import { mkdir } from "node:fs/promises";
import path from "node:path";
import process from "node:process";
import { chromium } from "@playwright/test";

const repoRoot = process.cwd();
const outputDir = path.join(repoRoot, "docs", "screenshots");
const port = Number(process.env.DOC_SCREENSHOT_PORT ?? "4173");
const baseUrl = `http://127.0.0.1:${port}`;
const chromeExecutablePath =
  "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";
const sampleTimestamp = new Date().toISOString();
const sampleHomePath = "/tmp/stave-home";

function createWorkspaceInformation() {
  return {
    jiraIssues: [
      {
        id: "jira-1",
        issueKey: "STAVE-482",
        title: "Polish docs onboarding",
        url: "https://jira.example.com/browse/STAVE-482",
        status: "In Review",
        note: "Docs flow should match the new Pages site.",
      },
    ],
    confluencePages: [
      {
        id: "confluence-1",
        title: "Docs launch checklist",
        url: "https://confluence.example.com/display/STAVE/Docs+launch",
        spaceKey: "STAVE",
        note: "Launch checklist for site rollout.",
      },
    ],
    figmaResources: [
      {
        id: "figma-1",
        title: "Landing page cleanup",
        url: "https://figma.com/design/example/stave-landing?node-id=1-2",
        nodeId: "1:2",
        note: "Reference layout for the simplified product site.",
      },
    ],
    linkedPullRequests: [
      {
        id: "pr-1",
        title: "docs(site): add static docs site",
        url: "https://github.com/sendbird/stave/pull/480",
        status: "review",
        note: "Pages build, landing cleanup, docs rendering.",
      },
    ],
    slackThreads: [
      {
        id: "slack-1",
        url: "https://app.slack.com/client/T123/C456/thread/C456-123.456",
        channelName: "stave-dev",
        note: "Release follow-up thread for docs feedback.",
      },
    ],
    turnSummary: {
      turnId: "turn-1",
      taskId: "task-1",
      taskTitle: "Ship the docs site",
      generatedAt: sampleTimestamp,
      model: "gpt-5.4-mini",
      requestSummary: "Add a docs site and simplify the landing page.",
      workSummary:
        "Captured product screenshots, reorganized the docs index, and wired a static docs build for GitHub Pages.",
    },
    notes:
      "Keep the public site simple and product-focused. Docs should cover install, workflow, and key feature entry points before architecture detail.",
    todos: [
      {
        id: "todo-1",
        text: "Validate Pages build output locally",
        completed: false,
      },
      {
        id: "todo-2",
        text: "Attach screenshots to the highest-traffic guides",
        completed: true,
      },
    ],
    customFields: [
      {
        id: "field-1",
        type: "single_select",
        label: "Release lane",
        value: "docs",
        options: ["docs", "product", "release"],
      },
    ],
  };
}

function createTask(args = {}) {
  return {
    id: "task-1",
    title: args.title ?? "Ship the docs site",
    provider: args.provider ?? "codex",
    updatedAt: sampleTimestamp,
    unread: false,
    archivedAt: null,
    controlMode: args.controlMode ?? "interactive",
    controlOwner: args.controlOwner ?? "stave",
  };
}

function createSkillCatalog(workspacePath) {
  return {
    ok: true,
    catalog: {
      workspacePath,
      sharedSkillsHome: null,
      fetchedAt: sampleTimestamp,
      roots: [
        {
          id: "root-workspace",
          scope: "local",
          provider: "shared",
          source: "workspace",
          path: `${workspacePath}/skills`,
          realPath: `${workspacePath}/skills`,
          exists: true,
          detail: "Workspace-local skills.",
        },
        {
          id: "root-shared",
          scope: "global",
          provider: "shared",
          source: "shared_root",
          path: `${sampleHomePath}/.agents/skills`,
          realPath: `${sampleHomePath}/.agents/skills`,
          exists: true,
          detail: "Shared skills root configured in Settings.",
        },
      ],
      skills: [
        {
          id: "skill-frontend",
          slug: "the-frontend-director",
          name: "the-frontend-director",
          description:
            "Shape product-facing UI with a calm, structured layout.",
          scope: "global",
          provider: "shared",
          path: `${sampleHomePath}/.agents/skills/the-frontend-director/SKILL.md`,
          realPath: `${sampleHomePath}/.agents/skills/the-frontend-director/SKILL.md`,
          sourceRootPath: `${sampleHomePath}/.agents/skills`,
          sourceRootRealPath: `${sampleHomePath}/.agents/skills`,
          invocationToken: "$the-frontend-director",
          instructions:
            "Use for design-sensitive frontend work and landing-page redesigns.",
        },
        {
          id: "skill-terminal",
          slug: "the-terminal-surface-guard",
          name: "the-terminal-surface-guard",
          description:
            "Protect terminal surfaces, PTY lifecycle, and docked shell behavior.",
          scope: "global",
          provider: "shared",
          path: `${sampleHomePath}/.agents/skills/the-terminal-surface-guard/SKILL.md`,
          realPath: `${sampleHomePath}/.agents/skills/the-terminal-surface-guard/SKILL.md`,
          sourceRootPath: `${sampleHomePath}/.agents/skills`,
          sourceRootRealPath: `${sampleHomePath}/.agents/skills`,
          invocationToken: "$the-terminal-surface-guard",
          instructions:
            "Use when editing docked terminals, CLI sessions, or PTY restore logic.",
        },
        {
          id: "skill-release",
          slug: "stave-release",
          name: "stave-release",
          description:
            "Prepare release branches, release notes, and versioned rollout docs.",
          scope: "local",
          provider: "shared",
          path: `${workspacePath}/skills/stave-release/SKILL.md`,
          realPath: `${workspacePath}/skills/stave-release/SKILL.md`,
          sourceRootPath: `${workspacePath}/skills`,
          sourceRootRealPath: `${workspacePath}/skills`,
          invocationToken: "$stave-release",
          instructions: "Use only for explicit Stave release requests.",
        },
      ],
      detail: "Loaded 3 skills across workspace and shared roots.",
    },
  };
}

function createScriptsConfig() {
  return {
    actions: [
      {
        id: "bootstrap",
        kind: "action",
        label: "Bootstrap",
        description: "Install dependencies and prepare the workspace.",
        commands: ["bun install", "bun run build:pages"],
        targetId: "workspace",
        target: {
          id: "workspace",
          label: "Workspace",
          cwd: "workspace",
          env: {},
        },
        timeoutMs: 120000,
        source: "script",
      },
    ],
    services: [
      {
        id: "docs-site",
        kind: "service",
        label: "Docs site preview",
        description: "Serve the built Pages output locally for review.",
        commands: ["python3 -m http.server 4174 -d .pages-dist"],
        targetId: "workspace",
        target: {
          id: "workspace",
          label: "Workspace",
          cwd: "workspace",
          env: {},
        },
        restartOnRun: true,
        orbit: {
          name: "stave-docs",
          noTls: true,
        },
        source: "script",
      },
    ],
    hooks: {
      "task.created": [
        {
          trigger: "task.created",
          scriptId: "bootstrap",
          scriptKind: "action",
          blocking: true,
        },
      ],
      "turn.completed": [
        {
          trigger: "turn.completed",
          scriptId: "docs-site",
          scriptKind: "service",
          blocking: false,
        },
      ],
    },
    targets: {
      workspace: {
        id: "workspace",
        label: "Workspace",
        cwd: "workspace",
        env: {},
      },
    },
    legacyPhases: {
      setup: [],
      run: [],
      teardown: [],
    },
  };
}

function createScriptStatuses() {
  return [
    {
      scriptId: "docs-site",
      scriptKind: "service",
      running: true,
      log: `[09:28:11] Starting docs-site
[09:28:12] Serving .pages-dist at http://127.0.0.1:4174
[09:28:18] GET /docs/install-guide/ 200
`,
      runId: "run-docs-site",
      sessionId: "session-docs-site",
      orbitUrl: "http://stave-docs.orbit.local",
      source: { kind: "manual" },
    },
    {
      scriptId: "bootstrap",
      scriptKind: "action",
      running: false,
      log: `[09:26:44] bun install
[09:27:01] bun run build:pages
[09:27:06] Completed successfully
`,
      runId: "run-bootstrap",
      sessionId: "session-bootstrap",
      source: { kind: "hook", trigger: "task.created" },
    },
  ];
}

function createNotifications(projectPath) {
  return [
    {
      id: "notification-1",
      kind: "task.turn_completed",
      title: "Docs site build finished",
      body: "The latest task turn completed and wrote the Pages output.",
      projectPath,
      projectName: "stave",
      workspaceId: "ws-main",
      workspaceName: "main",
      taskId: "task-1",
      taskTitle: "Ship the docs site",
      turnId: "turn-1",
      providerId: "codex",
      action: null,
      payload: {},
      createdAt: "2026-04-16T09:28:00.000Z",
      readAt: null,
    },
    {
      id: "notification-2",
      kind: "task.approval_requested",
      title: "Approval requested",
      body: "Codex needs confirmation before updating the Pages workflow.",
      projectPath,
      projectName: "stave",
      workspaceId: "ws-main",
      workspaceName: "main",
      taskId: "task-1",
      taskTitle: "Ship the docs site",
      turnId: "turn-2",
      providerId: "codex",
      action: {
        type: "approval",
        requestId: "approval-1",
        messageId: "message-approval-1",
      },
      payload: {},
      createdAt: "2026-04-16T09:24:00.000Z",
      readAt: null,
    },
    {
      id: "notification-3",
      kind: "task.turn_completed",
      title: "Landing page cleanup shipped",
      body: "The simplified landing page changes are ready for review.",
      projectPath,
      projectName: "stave",
      workspaceId: "ws-main",
      workspaceName: "main",
      taskId: "task-1",
      taskTitle: "Ship the docs site",
      turnId: "turn-0",
      providerId: "claude-code",
      action: null,
      payload: {},
      createdAt: "2026-04-16T08:52:00.000Z",
      readAt: "2026-04-16T09:00:00.000Z",
    },
  ];
}

function createLocalMcpStatus() {
  return {
    config: {
      enabled: true,
      port: 43127,
      token: "stave-token-demo",
      claudeCodeAutoRegister: true,
      codexAutoRegister: true,
    },
    running: true,
    manifest: {
      version: 1,
      name: "stave-local-mcp",
      mode: "local-only",
      url: "http://127.0.0.1:43127/mcp",
      healthUrl: "http://127.0.0.1:43127/health",
      token: "stave-token-demo",
      host: "127.0.0.1",
      port: 43127,
      pid: 4821,
      appVersion: "0.5.0",
      startedAt: sampleTimestamp,
      stdioProxyScript:
        "/Applications/Stave.app/Contents/Resources/app.asar.unpacked/out/main/stave-mcp-stdio-proxy.mjs",
    },
    manifestPaths: [
      `${sampleHomePath}/.stave/local-mcp.json`,
      `${sampleHomePath}/Library/Application Support/Stave/stave-local-mcp.json`,
    ],
    configPath: `${sampleHomePath}/Library/Application Support/Stave/local-mcp.json`,
    claudeCodeRegistration: {
      autoRegister: true,
      configPath: `${sampleHomePath}/.claude/settings.json`,
      installed: true,
      matchesCurrentManifest: true,
      transportType: "http",
      url: "http://127.0.0.1:43127/mcp",
      detail: "Stave manages the Claude Code MCP entry.",
    },
    codexRegistration: {
      autoRegister: true,
      configPath: `${sampleHomePath}/.codex/config.toml`,
      installed: true,
      matchesCurrentManifest: true,
      url: "http://127.0.0.1:43127/mcp",
      bearerTokenEnvVar: "STAVE_LOCAL_MCP_TOKEN",
      detail: "Stave manages the Codex MCP entry.",
    },
  };
}

function createLocalMcpLogs() {
  return [
    {
      id: "log-1",
      httpMethod: "POST",
      path: "/mcp",
      rpcMethod: "tools/call",
      rpcRequestId: "req-1",
      toolName: "stave_run_task",
      statusCode: 200,
      durationMs: 84,
      hasRequestPayload: true,
      requestPayload: {
        method: "tools/call",
        params: {
          name: "stave_run_task",
          arguments: {
            workspaceId: "ws-main",
            prompt: "Summarize the new docs site changes.",
          },
        },
      },
      errorMessage: null,
      createdAt: "2026-04-16T09:22:00.000Z",
    },
    {
      id: "log-2",
      httpMethod: "POST",
      path: "/mcp",
      rpcMethod: "tools/list",
      rpcRequestId: "req-0",
      toolName: null,
      statusCode: 200,
      durationMs: 22,
      hasRequestPayload: false,
      requestPayload: null,
      errorMessage: null,
      createdAt: "2026-04-16T09:21:10.000Z",
    },
  ];
}

function createCodexMcpServers() {
  return [
    {
      name: "stave-local",
      enabled: true,
      disabledReason: null,
      transportType: "http",
      url: "http://127.0.0.1:43127/mcp",
      bearerTokenEnvVar: "STAVE_LOCAL_MCP_TOKEN",
      authStatus: "bearer_token",
      startupTimeoutSec: 20,
      toolTimeoutSec: 120,
      tools: [
        {
          name: "stave_run_task",
          title: "Run a task",
          description: "Start or continue a task inside a Stave workspace.",
        },
      ],
    },
  ];
}

function createBaseScenario(args = {}) {
  const projectPath = "/tmp/stave-project";
  const task = createTask(args.task ?? {});

  const state = {
    projectPath,
    projectName: "stave",
    workspaces: [
      {
        id: "ws-main",
        name: "main",
        updatedAt: sampleTimestamp,
      },
    ],
    activeWorkspaceId: "ws-main",
    workspaceBranchById: { "ws-main": "main" },
    workspacePathById: { "ws-main": projectPath },
    workspaceDefaultById: { "ws-main": true },
    activeTaskId: task.id,
    tasks: [task],
    messagesByTask: {
      [task.id]: [],
    },
    messageCountByTask: { [task.id]: 0 },
    nativeSessionReadyByTask: {},
    providerSessionByTask: {},
    taskWorkspaceIdById: { [task.id]: "ws-main" },
    projectFiles: [
      "README.md",
      "docs/install-guide.md",
      "docs/features/integrated-terminal.md",
      "site/index.html",
      "site/docs/index.html",
      "scripts/build-pages-site.ts",
      "src/components/layout/SettingsDialog.tsx",
    ],
    ...args.state,
  };

  const snapshot = {
    activeTaskId: task.id,
    tasks: [task],
    messagesByTask: {
      [task.id]: [],
    },
    activeSurface: { kind: "task", taskId: task.id },
    ...args.snapshot,
  };

  return {
    scenario: args.scenario ?? "overview",
    store: {
      state,
      version: 0,
    },
    workspaceFallback: [
      {
        id: "ws-main",
        name: "main",
        updatedAt: sampleTimestamp,
        snapshot,
      },
    ],
  };
}

function buildOverviewState() {
  return createBaseScenario({
    scenario: "overview",
  });
}

function buildTerminalState() {
  return createBaseScenario({
    scenario: "terminal",
    task: {
      title: "Inspect terminal layout",
      provider: "claude-code",
    },
  });
}

function buildInformationState() {
  const workspaceInformation = createWorkspaceInformation();
  return createBaseScenario({
    scenario: "information",
    state: {
      workspaceInformation,
    },
    snapshot: {
      workspaceInformation,
    },
  });
}

function buildSkillsState() {
  const catalog = createSkillCatalog("/tmp/stave-project").catalog;
  return createBaseScenario({
    scenario: "skills",
    state: {
      settings: {
        skillsEnabled: true,
        sharedSkillsHome: "",
      },
      skillCatalog: {
        status: "ready",
        workspacePath: catalog.workspacePath,
        sharedSkillsHome: catalog.sharedSkillsHome,
        fetchedAt: catalog.fetchedAt,
        skills: catalog.skills,
        roots: catalog.roots,
        detail: catalog.detail,
      },
    },
  });
}

function buildScriptsState() {
  return createBaseScenario({
    scenario: "scripts",
  });
}

function buildNotificationsState() {
  return createBaseScenario({
    scenario: "notifications",
    state: {
      notifications: createNotifications("/tmp/stave-project"),
    },
  });
}

function buildMcpState() {
  return createBaseScenario({
    scenario: "mcp",
  });
}

function buildSettingsState() {
  const projectPath = "/tmp/stave-project";
  return createBaseScenario({
    scenario: "settings",
    state: {
      recentProjects: [
        {
          projectPath,
          projectName: "stave",
          lastOpenedAt: sampleTimestamp,
          defaultBranch: "main",
          workspaces: [
            {
              id: "ws-main",
              name: "main",
              updatedAt: sampleTimestamp,
            },
          ],
          activeWorkspaceId: "ws-main",
          workspaceBranchById: { "ws-main": "main" },
          workspacePathById: { "ws-main": projectPath },
          workspaceDefaultById: { "ws-main": true },
          projectBasePrompt:
            "Prefer bun over npm. Keep docs in sync with user-facing changes.",
          newWorkspaceInitCommand: "bun install\nbun run build:pages",
          newWorkspaceUseRootNodeModulesSymlink: true,
        },
      ],
      settings: {
        claudePermissionMode: "acceptEdits",
        claudeSandboxEnabled: true,
        claudeAllowUnsandboxedCommands: false,
        codexNetworkAccess: false,
        codexFileAccess: "workspace-write",
        codexApprovalPolicy: "untrusted",
        codexWebSearch: "cached",
        editorLspEnabled: true,
        typescriptLspCommand: "typescript-language-server",
        pythonLspCommand: "basedpyright-langserver",
      },
    },
  });
}

async function waitForServer(url, timeoutMs = 120_000) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    try {
      const response = await fetch(url);
      if (response.ok) {
        return;
      }
    } catch {}
    await new Promise((resolve) => setTimeout(resolve, 1_000));
  }
  throw new Error(`Timed out waiting for ${url}`);
}

function startDevServer() {
  const child = spawn(
    "bun",
    [
      "run",
      "dev",
      "--",
      "--host",
      "127.0.0.1",
      "--port",
      String(port),
      "--force",
    ],
    {
      cwd: repoRoot,
      stdio: ["ignore", "pipe", "pipe"],
      env: {
        ...process.env,
        CI: "1",
      },
    },
  );

  child.stdout.on("data", (chunk) => {
    process.stdout.write(`[vite] ${chunk}`);
  });
  child.stderr.on("data", (chunk) => {
    process.stderr.write(`[vite] ${chunk}`);
  });

  return child;
}

async function installState(page, state) {
  await page.addInitScript((payload) => {
    const workspacePath =
      payload.store?.state?.workspacePathById?.["ws-main"] ??
      "/tmp/stave-project";

    window.localStorage.clear();
    if (payload.workspaceFallback) {
      window.localStorage.setItem(
        "stave:workspace-fallback:v1",
        JSON.stringify(payload.workspaceFallback),
      );
    }
    window.localStorage.setItem("stave-store", JSON.stringify(payload.store));

    window.api = {
      provider: {
        streamTurn: async () => [],
        cleanupTask: async () => ({ ok: true, message: "cleaned" }),
      },
      sourceControl: {
        getStatus: async () => ({
          ok: true,
          branch: "main",
          items: [],
          hasConflicts: false,
          stderr: "",
        }),
        getHistory: async () => ({
          ok: true,
          items: [],
          stderr: "",
        }),
        listBranches: async () => ({
          ok: true,
          current: "main",
          branches: ["main", "feature/docs"],
          remoteBranches: [],
          worktreePathByBranch: {
            main: workspacePath,
            "feature/docs": `${workspacePath}/.stave/workspaces/feature-docs`,
          },
          stderr: "",
        }),
      },
      terminal: {
        createSession: async () => ({
          ok: true,
          sessionId:
            payload.scenario === "terminal"
              ? "terminal-dock-1"
              : "terminal-overview-1",
        }),
        runCommand: async () => ({ ok: true, code: 0, stdout: "", stderr: "" }),
      },
    };
  }, state);
}

async function createPage(browser) {
  const context = await browser.newContext({
    viewport: { width: 1600, height: 1000 },
    deviceScaleFactor: 2,
  });
  const page = await context.newPage();
  page.on("pageerror", (error) => {
    console.error("[pageerror]", error);
  });
  page.on("console", (message) => {
    if (message.type() === "error") {
      console.error("[console:error]", message.text());
    }
  });
  return { context, page };
}

async function openApp(page) {
  console.log("[capture] navigating");
  await page.goto(baseUrl, { waitUntil: "domcontentloaded" });
  console.log("[capture] waiting for workspace bar");
  await page.getByTestId("workspace-bar").waitFor();
  console.log("[capture] workspace bar ready");
}

async function installSkillsApi(page) {
  await page.evaluate((catalog) => {
    window.api = {
      ...(window.api ?? {}),
      skills: {
        getCatalog: async () => catalog,
      },
    };
  }, createSkillCatalog("/tmp/stave-project"));
}

async function installScriptsApi(page) {
  const config = createScriptsConfig();
  const statuses = createScriptStatuses();

  await page.evaluate(
    ({ nextConfig, nextStatuses }) => {
      window.api = {
        ...(window.api ?? {}),
        scripts: {
          getConfig: async () => ({
            ok: true,
            config: nextConfig,
          }),
          getStatus: async () => ({
            ok: true,
            statuses: nextStatuses,
          }),
          runEntry: async () => ({
            ok: true,
            runId: "run-demo",
            sessionId: "session-demo",
            alreadyRunning: false,
          }),
          stopEntry: async () => ({
            ok: true,
          }),
          runHook: async (args) => ({
            ok: true,
            summary: {
              trigger: args.trigger,
              totalEntries: 1,
              executedEntries: 1,
              failures: [],
            },
          }),
          subscribeEvents: () => () => {},
        },
        shell: {
          ...(window.api?.shell ?? {}),
          openExternal: async () => ({ ok: true, stderr: "" }),
          showInFinder: async () => ({ ok: true, stderr: "" }),
          openInVSCode: async () => ({ ok: true, stderr: "" }),
          openInTerminal: async () => ({ ok: true, stderr: "" }),
        },
      };
    },
    {
      nextConfig: config,
      nextStatuses: statuses,
    },
  );
}

async function installLocalMcpApi(page) {
  const status = createLocalMcpStatus();
  const logs = createLocalMcpLogs();
  const servers = createCodexMcpServers();

  await page.evaluate(
    ({ nextStatus, nextLogs, nextServers }) => {
      window.api = {
        ...(window.api ?? {}),
        provider: {
          ...(window.api?.provider ?? {}),
          getCodexMcpStatus: async () => ({
            ok: true,
            detail: "Loaded Codex MCP status from the active CLI.",
            servers: nextServers,
          }),
        },
        localMcp: {
          getStatus: async () => ({
            ok: true,
            status: nextStatus,
          }),
          updateConfig: async () => ({
            ok: true,
            status: nextStatus,
          }),
          rotateToken: async () => ({
            ok: true,
            status: nextStatus,
          }),
          listRequestLogs: async (args = {}) => ({
            ok: true,
            logs: nextLogs.slice(
              args.offset ?? 0,
              (args.offset ?? 0) + (args.limit ?? 25),
            ),
            total: nextLogs.length,
            limit: args.limit ?? 25,
            offset: args.offset ?? 0,
            hasMore: false,
          }),
          getRequestLog: async (args) => ({
            ok: true,
            log: nextLogs.find((entry) => entry.id === args.id) ?? null,
          }),
          clearRequestLogs: async () => ({
            ok: true,
            cleared: nextLogs.length,
          }),
        },
      };
    },
    {
      nextStatus: status,
      nextLogs: logs,
      nextServers: servers,
    },
  );
}

async function captureOverview(browser) {
  console.log("[capture] overview");
  const { context, page } = await createPage(browser);
  await installState(page, buildOverviewState());
  await openApp(page);
  await page
    .getByTestId("workspace-bar")
    .getByRole("button", { name: "Explorer" })
    .click();
  await page.screenshot({
    path: path.join(outputDir, "stave-app.png"),
  });
  await context.close();
  console.log("[capture] overview done");
}

async function captureIntegratedTerminal(browser) {
  console.log("[capture] integrated-terminal");
  const { context, page } = await createPage(browser);
  await installState(page, buildTerminalState());
  await openApp(page);
  await page
    .getByTestId("workspace-bar")
    .getByRole("button", { name: "Terminal" })
    .click();
  await page.getByTestId("terminal-dock").waitFor();
  await page.screenshot({
    path: path.join(outputDir, "integrated-terminal.png"),
  });
  await context.close();
  console.log("[capture] integrated-terminal done");
}

async function captureCommandPalette(browser) {
  console.log("[capture] command-palette");
  const { context, page } = await createPage(browser);
  await installState(page, buildOverviewState());
  await openApp(page);

  await page.keyboard.press("Meta+Shift+P");
  let palette = page.getByRole("dialog", { name: "Command Palette" });
  if (!(await palette.isVisible().catch(() => false))) {
    await page.getByRole("button", { name: "Open Stave menu" }).click();
    await page.getByRole("menuitem", { name: /^Command Palette$/ }).click();
    palette = page.getByRole("dialog", { name: "Command Palette" });
  }

  await palette.waitFor();
  await palette.screenshot({
    path: path.join(outputDir, "command-palette.png"),
  });
  await context.close();
  console.log("[capture] command-palette done");
}

async function captureInformationPanel(browser) {
  console.log("[capture] information-panel");
  const { context, page } = await createPage(browser);
  await installState(page, buildInformationState());
  await openApp(page);
  await page
    .getByTestId("workspace-bar")
    .getByRole("button", { name: "Information" })
    .click();
  await page.getByText("Summary").waitFor();
  await page.screenshot({
    path: path.join(outputDir, "information-panel.png"),
  });
  await context.close();
  console.log("[capture] information-panel done");
}

async function captureSkillsPanel(browser) {
  console.log("[capture] skills-panel");
  const { context, page } = await createPage(browser);
  await installState(page, buildSkillsState());
  await openApp(page);
  await installSkillsApi(page);
  console.log("[capture] opening skills panel");
  await page.locator('button[aria-label="Skills"]').click({ force: true });
  await page.waitForTimeout(1200);
  await page.screenshot({
    path: path.join(outputDir, "skills-panel.png"),
  });
  await context.close();
  console.log("[capture] skills-panel done");
}

async function captureScriptsPanel(browser) {
  console.log("[capture] scripts-panel");
  const { context, page } = await createPage(browser);
  await installState(page, buildScriptsState());
  await openApp(page);
  await installScriptsApi(page);
  console.log("[capture] opening scripts panel");
  await page.locator('button[aria-label="Scripts"]').click({ force: true });
  await page.waitForTimeout(1200);
  await page.screenshot({
    path: path.join(outputDir, "scripts-panel.png"),
  });
  await context.close();
  console.log("[capture] scripts-panel done");
}

async function captureNotifications(browser) {
  console.log("[capture] notifications");
  const { context, page } = await createPage(browser);
  await installState(page, buildNotificationsState());
  await openApp(page);
  await page.getByRole("button", { name: "notifications" }).click();
  await page.getByText("Mark all read").waitFor();
  await page.screenshot({
    path: path.join(outputDir, "notifications.png"),
  });
  await context.close();
  console.log("[capture] notifications done");
}

async function captureMcpSettings(browser) {
  console.log("[capture] mcp-settings");
  const { context, page } = await createPage(browser);
  await installState(page, buildMcpState());
  await openApp(page);
  await installLocalMcpApi(page);
  await page.getByRole("button", { name: "open-settings" }).first().click();
  const settingsDialog = page.getByRole("dialog", { name: "Settings" });
  await settingsDialog.waitFor();
  await settingsDialog.getByRole("button", { name: "MCP" }).click();
  await page.waitForTimeout(1200);
  await settingsDialog.screenshot({
    path: path.join(outputDir, "mcp-settings.png"),
  });
  await context.close();
  console.log("[capture] mcp-settings done");
}

async function openSettingsDialog(page) {
  await page.getByRole("button", { name: "open-settings" }).first().click();
  const settingsDialog = page.getByRole("dialog", { name: "Settings" });
  await settingsDialog.waitFor();
  return settingsDialog;
}

async function openSettingsSidebarSection(settingsDialog, label) {
  await settingsDialog
    .locator('button[data-sidebar="menu-button"]')
    .filter({ hasText: label })
    .first()
    .click();
}

async function captureProjectInstructionsSettings(browser) {
  console.log("[capture] project-instructions-settings");
  const { context, page } = await createPage(browser);
  await installState(page, buildSettingsState());
  await openApp(page);
  await installScriptsApi(page);
  const settingsDialog = await openSettingsDialog(page);
  await settingsDialog.getByRole("button", { name: /stave/i }).first().click();
  await settingsDialog.getByText("Project Instructions").waitFor();
  await settingsDialog.screenshot({
    path: path.join(outputDir, "project-instructions.png"),
  });
  await context.close();
  console.log("[capture] project-instructions-settings done");
}

async function captureProviderControls(browser) {
  console.log("[capture] provider-controls");
  const { context, page } = await createPage(browser);
  await installState(page, buildSettingsState());
  await openApp(page);
  const settingsDialog = await openSettingsDialog(page);
  await openSettingsSidebarSection(settingsDialog, "Providers");
  await settingsDialog.getByRole("tab", { name: "Claude" }).click();
  await settingsDialog.getByText("Claude Runtime Controls").waitFor();
  await settingsDialog.screenshot({
    path: path.join(outputDir, "provider-controls-claude.png"),
  });
  await settingsDialog.getByRole("tab", { name: "Codex" }).click();
  await settingsDialog.getByText("Codex Runtime Controls").waitFor();
  await settingsDialog.screenshot({
    path: path.join(outputDir, "provider-controls-codex.png"),
  });
  await context.close();
  console.log("[capture] provider-controls done");
}

async function captureLanguageIntelligenceSettings(browser) {
  console.log("[capture] language-intelligence-settings");
  const { context, page } = await createPage(browser);
  await installState(page, buildSettingsState());
  await openApp(page);
  const settingsDialog = await openSettingsDialog(page);
  await openSettingsSidebarSection(settingsDialog, "Editor");
  await settingsDialog
    .getByText("Project Language Servers")
    .scrollIntoViewIfNeeded();
  await settingsDialog.getByText("Project Language Servers").waitFor();
  await settingsDialog.screenshot({
    path: path.join(outputDir, "language-intelligence.png"),
  });
  await context.close();
  console.log("[capture] language-intelligence-settings done");
}

const CAPTURE_STEPS = [
  ["stave-app", captureOverview],
  ["integrated-terminal", captureIntegratedTerminal],
  ["command-palette", captureCommandPalette],
  ["information-panel", captureInformationPanel],
  ["skills-panel", captureSkillsPanel],
  ["scripts-panel", captureScriptsPanel],
  ["notifications", captureNotifications],
  ["mcp-settings", captureMcpSettings],
  ["project-instructions", captureProjectInstructionsSettings],
  ["provider-controls", captureProviderControls],
  ["language-intelligence", captureLanguageIntelligenceSettings],
];

async function main() {
  await mkdir(outputDir, { recursive: true });
  const requestedCaptures = new Set(
    (process.env.DOC_SCREENSHOT_ONLY ?? "")
      .split(",")
      .map((value) => value.trim())
      .filter(Boolean),
  );

  let devServer = null;
  try {
    try {
      await waitForServer(baseUrl, 3_000);
    } catch {
      devServer = startDevServer();
      await waitForServer(baseUrl);
    }

    const browser = await chromium.launch({
      executablePath: chromeExecutablePath,
      headless: true,
    });
    try {
      for (const [captureName, captureStep] of CAPTURE_STEPS) {
        if (requestedCaptures.size > 0 && !requestedCaptures.has(captureName)) {
          continue;
        }
        await captureStep(browser);
      }
    } finally {
      await browser.close();
    }
  } finally {
    if (devServer) {
      devServer.kill("SIGTERM");
      await new Promise((resolve) => setTimeout(resolve, 1_000));
    }
  }
}

await main();
