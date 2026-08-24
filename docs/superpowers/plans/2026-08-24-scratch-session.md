# Scratch Session Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 등록된 프로젝트 없이 임의의 폴더에서 에이전트 세션을 열어 두는, 알림 팝업 형태의 경량 표면을 추가한다.

**Architecture:** 렌더러 전용 변경이다. 프로젝트 스코프 스토어(`src/store/app.store.ts`) 밖에 독립 zustand 스토어를 만들고, 이미 workspace 비의존적인 턴 실행 경로(`runProviderTurn`)에 `cwd`만 넘겨 턴을 돌린다. 채팅 의미론과 승인 처리는 기존 순수 함수(`replayProviderEventsToTaskState`, `src/store/provider-message.utils.ts`)를 재사용하고, 전사는 스토어 비의존 렌더러(`AssistantMessageBody`)로 그린다.

**Tech Stack:** TypeScript, React, zustand, Tailwind + shadcn/ui (`@/components/ui`), `bun test`, Electron preload IPC(`window.api`)

**Spec:** `docs/superpowers/specs/2026-08-24-scratch-session-design.md`

## Global Constraints

- `src/store/app.store.ts`를 수정하지 않는다. scratch 상태가 프로젝트 스코프 상태와 섞이지 않는 것이 이 기능의 핵심 보장이다.
- `electron/` 하위, IPC 스키마, 프로바이더 런타임을 수정하지 않는다. 필요한 모든 API가 이미 존재한다.
- `runProviderTurn` 호출 시 `workspaceId`를 **절대 넘기지 않는다**.
- `buildProviderRuntimeOptions` 호출 시 `includeAdvisor: false`를 고정한다 (Advisor와 Worker를 동시에 끈다).
- 영속화 계층(`recentProjects`, 프로젝트 레지스트리, sqlite 스냅샷)에 아무것도 쓰지 않는다.
- 새 테마 토큰을 만들지 않는다. `bg-card`, `border-border/80`, `text-warning`, `text-muted-foreground` 등 기존 토큰만 쓴다.
- 동시 scratch 세션은 1개다.
- 코드 식별자와 파일명은 `scratch` 계열로 확정한다. 사용자 노출 문구는 "Scratch session"으로 시작한다.
- Bun을 쓴다: `bun test`, `bun run typecheck`, `bunx --bun`.
- 커밋은 Conventional Commits이며 subject는 소문자 영어다.

**표기 규칙**: 이 플랜에서 `src/store/{example.ts}`처럼 중괄호가 붙은 경로는 **아직
존재하지 않는, 이 플랜이 만들 파일**이다. 중괄호는 `bun run check:doc-paths`(문서에
등장하는 리포 경로의 실존을 강제하는 게이트)를 통과시키기 위한 표기이며, **실제
코드와 명령에서는 중괄호를 쓰지 않는다**.

---

### Task 1: scratch 스토어 골격과 폴더 가드

**Files:**

- Create: `src/store/{scratch-session.store.ts}`
- Test: `tests/{scratch-session-store.test.ts}`

**Interfaces:**

- Consumes: 없음 (첫 태스크)
- Produces:
  - `useScratchSessionStore` — zustand 스토어
  - `ScratchSessionState` — 아래 필드/액션 전체
  - `ScratchSessionDependencies` — `{ pickDirectory?, runTurn?, abortTurn?, respondApproval?, cleanupTask? }` (태스크마다 하나씩 확장된다)
  - `createScratchTaskId(): string`

이 태스크에서 인터페이스 전체를 확정하고, 나머지 액션은 이후 태스크에서 채운다. 미구현 액션은 `throw new Error("not implemented")`가 아니라 **no-op이 아닌 명시적 미구현**으로 두지 않고, 각 태스크가 순서대로 채운다.

- [ ] **Step 1: 실패하는 테스트를 작성한다**

`tests/{scratch-session-store.test.ts}`:

```ts
import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { useScratchSessionStore } from "../src/store/scratch-session.store";

const originalWindow = (globalThis as { window?: unknown }).window;

beforeEach(() => {
  useScratchSessionStore.getState().reset();
});

afterEach(() => {
  (globalThis as { window?: unknown }).window = originalWindow;
});

describe("scratch session folder guard", () => {
  test("stores an absolute directory path", () => {
    const result = useScratchSessionStore
      .getState()
      .setFolder({ directoryPath: "/tmp/downloads" });

    expect(result.ok).toBe(true);
    expect(useScratchSessionStore.getState().folderPath).toBe("/tmp/downloads");
    expect(useScratchSessionStore.getState().error).toBeNull();
  });

  test("rejects a relative path", () => {
    const result = useScratchSessionStore
      .getState()
      .setFolder({ directoryPath: "./relative" });

    expect(result.ok).toBe(false);
    expect(useScratchSessionStore.getState().folderPath).toBeNull();
    expect(useScratchSessionStore.getState().error).toBe(
      "Scratch sessions need an absolute folder path.",
    );
  });

  test("adopts the folder the directory picker returned", async () => {
    const result = await useScratchSessionStore.getState().pickFolder({
      pickDirectory: async () => ({ ok: true, directoryPath: "/tmp/picked" }),
    });

    expect(result.ok).toBe(true);
    expect(useScratchSessionStore.getState().folderPath).toBe("/tmp/picked");
  });

  test("keeps the previous folder when the picker is cancelled", async () => {
    useScratchSessionStore.getState().setFolder({ directoryPath: "/tmp/kept" });

    const result = await useScratchSessionStore.getState().pickFolder({
      pickDirectory: async () => ({ ok: false, stderr: "No folder selected." }),
    });

    expect(result.ok).toBe(false);
    expect(useScratchSessionStore.getState().folderPath).toBe("/tmp/kept");
  });

  test("issues a distinct task id per session", () => {
    const first = useScratchSessionStore.getState().taskId;
    useScratchSessionStore.getState().reset();
    expect(useScratchSessionStore.getState().taskId).not.toBe(first);
    expect(first.startsWith("scratch-")).toBe(true);
  });
});
```

`fs:pick-directory`는 `dialog.showOpenDialog({ properties: ["openDirectory"] })`로 실제 디렉터리만 돌려주므로(`electron/main/ipc/filesystem.ts:72`) 별도의 존재 검증 IPC를 걸지 않는다. 절대 경로 가드는 방어선으로만 둔다.

**`fs:resolve-path`를 쓰지 않는 이유**: 그 핸들러는 경로 검증에 이어 `listFilesRecursive`로 폴더 전체를 재귀 순회한다(`electron/main/ipc/filesystem.ts:135`). 프로젝트를 열 때는 그 파일 목록이 필요하지만, scratch 세션은 필요하지 않다. 큰 폴더를 고를 때마다 전체 트리를 걷는 비용을 경량 팝오버에 들일 이유가 없다. 사용자가 경로를 직접 타이핑하는 입력은 v1 범위 밖이다 — spec §3.2의 폴더 칩은 피커 전용이다.

- [ ] **Step 2: 테스트가 실패하는 것을 확인한다**

Run: `bun test scratch-session-store`
Expected: FAIL — `Cannot find module '../src/store/scratch-session.store'`

- [ ] **Step 3: 최소 구현을 작성한다**

`src/store/{scratch-session.store.ts}`:

```ts
import { create } from "zustand";
import type { TaskProviderSessionState } from "@/lib/db/workspaces.db";
import type { ProviderId } from "@/lib/providers/provider.types";
import type { ChatMessage } from "@/types/chat";

export interface ScratchSessionDependencies {
  pickDirectory?: () => Promise<{
    ok: boolean;
    directoryPath?: string;
    stderr?: string;
  }>;
}

export interface ScratchSessionState {
  folderPath: string | null;
  provider: ProviderId;
  taskId: string;
  messages: ChatMessage[];
  activeTurnId: string | null;
  providerSession: TaskProviderSessionState;
  error: string | null;

  setProvider: (args: { provider: ProviderId }) => void;
  setFolder: (args: { directoryPath: string }) => {
    ok: boolean;
    message?: string;
  };
  pickFolder: (
    dependencies?: ScratchSessionDependencies,
  ) => Promise<{ ok: boolean; message?: string }>;
  reset: () => void;
}

export function createScratchTaskId() {
  return `scratch-${crypto.randomUUID()}`;
}

function isAbsolutePosixOrWindowsPath(candidate: string) {
  return candidate.startsWith("/") || /^[A-Za-z]:[\\/]/.test(candidate);
}

export const useScratchSessionStore = create<ScratchSessionState>()(
  (set, get) => ({
    folderPath: null,
    provider: "claude-code",
    taskId: createScratchTaskId(),
    messages: [],
    activeTurnId: null,
    providerSession: {},
    error: null,

    setProvider: ({ provider }) => {
      set({ provider });
    },

    setFolder: ({ directoryPath }) => {
      if (!isAbsolutePosixOrWindowsPath(directoryPath)) {
        const message = "Scratch sessions need an absolute folder path.";
        set({ error: message });
        return { ok: false, message };
      }
      set({ folderPath: directoryPath, error: null });
      return { ok: true };
    },

    pickFolder: async (dependencies) => {
      const pickDirectory =
        dependencies?.pickDirectory ?? window.api?.fs?.pickDirectory;
      if (!pickDirectory) {
        const message = "The folder picker is unavailable in this environment.";
        set({ error: message });
        return { ok: false, message };
      }

      const picked = await pickDirectory();
      if (!picked.ok || !picked.directoryPath) {
        // A cancelled picker is not an error: keep the current folder and stay quiet.
        return { ok: false, message: picked.stderr };
      }
      return get().setFolder({ directoryPath: picked.directoryPath });
    },

    reset: () => {
      set({
        folderPath: null,
        messages: [],
        activeTurnId: null,
        providerSession: {},
        error: null,
        taskId: createScratchTaskId(),
      });
    },
  }),
);
```

- [ ] **Step 4: 테스트가 통과하는 것을 확인한다**

Run: `bun test scratch-session-store`
Expected: PASS (5 tests)

- [ ] **Step 5: 타입 검사**

Run: `bun run typecheck`
Expected: 오류 없음

- [ ] **Step 6: 커밋**

```bash
git add src/store tests
git commit -m "feat: add scratch session store with folder guard"
```

---

### Task 2: 턴 디스패치 — cwd만 넘기고 workspaceId는 넘기지 않는다

**Files:**

- Modify: `src/store/{scratch-session.store.ts}`
- Test: `tests/{scratch-session-store.test.ts}`

**Interfaces:**

- Consumes: Task 1의 `useScratchSessionStore`, `setFolder`, `ScratchSessionDependencies`
- Produces:
  - `ScratchSessionState.send(args: { prompt: string; settings: AppSettings }, dependencies?) => Promise<void>`
  - `ScratchSessionDependencies.runTurn` — `runProviderTurn`의 `dependencies.runTurn`과 동일한 시그니처(async generator를 돌려주는 함수)
  - `resolveScratchModel(args: { provider: ProviderId; settings: AppSettings }): string`

- [ ] **Step 1: 실패하는 테스트를 작성한다**

`tests/{scratch-session-store.test.ts}`에 추가한다:

```ts
import { defaultSettings } from "@/store/app-settings";
import type { NormalizedProviderEvent } from "../src/lib/providers/provider.types";

function buildFakeRunTurn(events: NormalizedProviderEvent[]) {
  const calls: Array<Record<string, unknown>> = [];
  const runTurn = (args: Record<string, unknown>) => {
    calls.push(args);
    return (async function* () {
      for (const event of events) {
        yield event;
      }
    })();
  };
  return { calls, runTurn };
}

describe("scratch session turn dispatch", () => {
  test("passes cwd and omits workspaceId", async () => {
    const { calls, runTurn } = buildFakeRunTurn([
      { type: "text", text: "hello" },
      { type: "done" },
    ]);

    useScratchSessionStore
      .getState()
      .setFolder({ directoryPath: "/tmp/scratch" });
    await useScratchSessionStore
      .getState()
      .send(
        { prompt: "what is here?", settings: defaultSettings },
        { runTurn },
      );

    expect(calls).toHaveLength(1);
    expect(calls[0]?.cwd).toBe("/tmp/scratch");
    // `runProviderTurn` forwards the key unconditionally
    // (src/store/provider-turn-runtime.ts:36), so assert the VALUE is absent —
    // not the key. What matters is that no workspace binding reaches the runtime.
    expect(calls[0]?.workspaceId).toBeUndefined();
    expect(calls[0]?.taskId).toBe(useScratchSessionStore.getState().taskId);
  });

  test("refuses to start a turn without a folder", async () => {
    const { calls, runTurn } = buildFakeRunTurn([{ type: "done" }]);

    await useScratchSessionStore
      .getState()
      .send({ prompt: "anything", settings: defaultSettings }, { runTurn });

    expect(calls).toHaveLength(0);
    expect(useScratchSessionStore.getState().error).toBe(
      "Pick a folder before sending a message.",
    );
  });

  test("seeds a user message and a streaming assistant message", async () => {
    const { runTurn } = buildFakeRunTurn([{ type: "done" }]);

    useScratchSessionStore
      .getState()
      .setFolder({ directoryPath: "/tmp/scratch" });
    await useScratchSessionStore
      .getState()
      .send({ prompt: "hi", settings: defaultSettings }, { runTurn });

    const messages = useScratchSessionStore.getState().messages;
    expect(messages[0]?.role).toBe("user");
    expect(messages[0]?.content).toBe("hi");
    expect(messages[1]?.role).toBe("assistant");
  });

  test("disables the advisor on every scratch turn", async () => {
    const { calls, runTurn } = buildFakeRunTurn([{ type: "done" }]);

    useScratchSessionStore
      .getState()
      .setFolder({ directoryPath: "/tmp/scratch" });
    await useScratchSessionStore
      .getState()
      .send({ prompt: "hi", settings: defaultSettings }, { runTurn });

    const runtimeOptions = (calls[0]?.runtimeOptions ?? {}) as Record<
      string,
      unknown
    >;
    expect("advisorTarget" in runtimeOptions).toBe(false);
    expect("workerIntent" in runtimeOptions).toBe(false);
  });
});
```

`defaultSettings`는 `src/store/app-settings.ts:455`의 확정된 export다. `includeAdvisor: false`면 `buildProviderRuntimeOptions`가 `advisorTarget`과 `workerIntent`를 조건부 스프레드로 **키 자체를 넣지 않으므로**(`src/store/provider-runtime-options.ts:281`, `:289`) 존재 여부로 단정한다.

- [ ] **Step 2: 테스트가 실패하는 것을 확인한다**

Run: `bun test scratch-session-store`
Expected: FAIL — `send is not a function`

- [ ] **Step 3: 최소 구현을 작성한다**

`src/store/{scratch-session.store.ts}`에 추가한다:

```ts
import { applyModelRuntimePreference } from "@/lib/providers/model-runtime-preferences";
import { buildProviderRuntimeOptions } from "@/store/provider-runtime-options";
import { runProviderTurn } from "@/store/provider-turn-runtime";
import {
  buildMessageId,
  buildRecentTimestamp,
  createUserTextPart,
} from "@/store/chat-state-helpers";
import type { AppSettings } from "@/store/app-settings";

export function resolveScratchModel(args: {
  provider: ProviderId;
  settings: AppSettings;
}) {
  return args.provider === "claude-code"
    ? args.settings.modelClaude
    : args.settings.modelCodex;
}
```

`send` 액션 본문:

```ts
send: async ({ prompt, settings }, dependencies) => {
  const state = get();
  if (!state.folderPath) {
    set({ error: "Pick a folder before sending a message." });
    return;
  }
  if (state.activeTurnId) {
    set({ error: "A scratch turn is already running." });
    return;
  }
  if (prompt.trim().length === 0) {
    return;
  }

  const provider = state.provider;
  const model = resolveScratchModel({ provider, settings });
  const turnId = crypto.randomUUID();
  const baseCount = state.messages.length;

  const userMessage: ChatMessage = {
    id: buildMessageId({ taskId: state.taskId, count: baseCount }),
    role: "user",
    model: "user",
    providerId: "user",
    content: prompt,
    parts: [createUserTextPart({ text: prompt })],
  };
  const assistantMessage: ChatMessage = {
    id: buildMessageId({ taskId: state.taskId, count: baseCount + 1 }),
    role: "assistant",
    model,
    providerId: provider,
    content: "",
    startedAt: buildRecentTimestamp(),
    isStreaming: true,
    parts: [],
  };

  set({
    messages: [...state.messages, userMessage, assistantMessage],
    activeTurnId: turnId,
    error: null,
  });

  const runtimeOptions = buildProviderRuntimeOptions({
    provider,
    model,
    includeAdvisor: false,
    settings: applyModelRuntimePreference({
      settings,
      providerId: provider,
      model,
    }),
    providerSession: get().providerSession,
  });

  runProviderTurn(
    {
      turnId,
      provider,
      prompt,
      taskId: state.taskId,
      cwd: state.folderPath,
      runtimeOptions,
      onEvent: ({ event }) => {
        get().ingestEvent({ event, turnId, provider, model });
      },
    },
    dependencies?.runTurn ? { runTurn: dependencies.runTurn } : undefined,
  );
},
```

`ingestEvent`는 Task 3에서 구현한다. 이 태스크에서는 다음 임시 본문으로 두고, Task 3이 교체한다:

```ts
ingestEvent: ({ event }) => {
  if (event.type === "done") {
    set({ activeTurnId: null });
  }
},
```

`ScratchSessionState`에 다음을 추가한다:

```ts
  send: (
    args: { prompt: string; settings: AppSettings },
    dependencies?: ScratchSessionDependencies,
  ) => Promise<void>;
  ingestEvent: (args: {
    event: NormalizedProviderEvent;
    turnId: string;
    provider: ProviderId;
    model: string;
  }) => void;
```

`ScratchSessionDependencies`에 다음을 추가한다:

```ts
import type { ProviderAdapter } from "@/lib/providers/provider.types";

// ...

  runTurn?: ProviderAdapter["runTurn"];
```

`runProviderTurn`은 Promise를 돌려주지 않으므로 `send`의 `await`는 디스패치까지만 보장한다. 테스트는 가짜 generator가 동기적으로 소진되는 점에 의존하지 않도록, 이벤트 검증은 Task 3에서 `await` 가능한 지점을 만든 뒤 수행한다. 이 태스크의 테스트는 **호출 인자만** 검증한다.

- [ ] **Step 4: 테스트가 통과하는 것을 확인한다**

Run: `bun test scratch-session-store`
Expected: PASS (8 tests)

- [ ] **Step 5: 타입 검사**

Run: `bun run typecheck`
Expected: 오류 없음

- [ ] **Step 6: 커밋**

```bash
git add src/store tests
git commit -m "feat: dispatch scratch session turns with cwd only"
```

---

### Task 3: 이벤트 폴딩과 세션 커서

**Files:**

- Modify: `src/store/{scratch-session.store.ts}`
- Test: `tests/{scratch-session-store.test.ts}`

**Interfaces:**

- Consumes: Task 2의 `send`, `ingestEvent`
- Produces: `ingestEvent` 실구현 — `messages` / `activeTurnId` / `providerSession`을 갱신한다

- [ ] **Step 1: 실패하는 테스트를 작성한다**

```ts
describe("scratch session event folding", () => {
  test("folds streamed text into the assistant message and clears the turn on done", async () => {
    const { runTurn } = buildFakeRunTurn([
      { type: "text", text: "the folder holds a rust crate" },
      { type: "done" },
    ]);

    useScratchSessionStore
      .getState()
      .setFolder({ directoryPath: "/tmp/scratch" });
    await useScratchSessionStore
      .getState()
      .send(
        { prompt: "what is here?", settings: defaultSettings },
        { runTurn },
      );
    await Bun.sleep(0);

    const messages = useScratchSessionStore.getState().messages;
    const assistant = messages[messages.length - 1];
    expect(assistant?.content).toContain("rust crate");
    expect(useScratchSessionStore.getState().activeTurnId).toBeNull();
  });

  test("remembers the native session id and carries it into the next turn", async () => {
    const first = buildFakeRunTurn([
      {
        type: "provider_session",
        providerId: "claude-code",
        nativeSessionId: "session-abc",
      },
      { type: "done" },
    ]);

    useScratchSessionStore
      .getState()
      .setFolder({ directoryPath: "/tmp/scratch" });
    await useScratchSessionStore
      .getState()
      .send(
        { prompt: "first", settings: defaultSettings },
        { runTurn: first.runTurn },
      );
    await Bun.sleep(0);

    expect(
      useScratchSessionStore.getState().providerSession["claude-code"],
    ).toBeDefined();

    const second = buildFakeRunTurn([{ type: "done" }]);
    await useScratchSessionStore
      .getState()
      .send(
        { prompt: "second", settings: defaultSettings },
        { runTurn: second.runTurn },
      );
    await Bun.sleep(0);

    expect(second.calls[0]?.runtimeOptions).toBeDefined();
    expect(useScratchSessionStore.getState().messages).toHaveLength(4);
  });
});
```

- [ ] **Step 2: 테스트가 실패하는 것을 확인한다**

Run: `bun test scratch-session-store`
Expected: FAIL — assistant content가 비어 있고 `providerSession["claude-code"]`가 `undefined`

- [ ] **Step 3: 최소 구현을 작성한다**

Task 2의 임시 `ingestEvent`를 교체한다:

```ts
import { replayProviderEventsToTaskState } from "@/lib/session/provider-event-replay";
import type { NormalizedProviderEvent } from "@/lib/providers/provider.types";

// ...

ingestEvent: ({ event, turnId, provider, model }) => {
  const state = get();
  if (state.activeTurnId !== turnId) {
    return;
  }

  const next = replayProviderEventsToTaskState({
    taskId: state.taskId,
    messages: state.messages,
    events: [event],
    provider,
    model,
    turnId,
    providerSession: state.providerSession,
    messageCount: state.messages.length,
  });

  if (!next.changed) {
    return;
  }

  set({
    messages: next.messages,
    activeTurnId: next.activeTurnId ?? null,
    providerSession: next.providerSession ?? state.providerSession,
  });
},
```

`activeTurnId !== turnId` 가드는 Clear나 abort 이후에 늦게 도착한 이벤트가 새 세션을 오염시키는 것을 막는다.

- [ ] **Step 4: 테스트가 통과하는 것을 확인한다**

Run: `bun test scratch-session-store`
Expected: PASS (10 tests)

- [ ] **Step 5: 타입 검사**

Run: `bun run typecheck`
Expected: 오류 없음

- [ ] **Step 6: 커밋**

```bash
git add src/store tests
git commit -m "feat: fold provider events into scratch session state"
```

---

### Task 4: 중지와 인라인 승인 응답

**Files:**

- Modify: `src/store/{scratch-session.store.ts}`
- Test: `tests/{scratch-session-store.test.ts}`

**Interfaces:**

- Consumes: Task 3의 `ingestEvent`
- Produces:
  - `ScratchSessionState.stop(dependencies?) => Promise<void>`
  - `ScratchSessionState.respondApproval(args: { requestId: string; approved: boolean }, dependencies?) => Promise<void>`
  - `selectScratchPendingApprovals(state: ScratchSessionState): Array<{ messageId: string; part: ApprovalPart }>`
  - `ScratchSessionDependencies.abortTurn`, `ScratchSessionDependencies.respondApproval`

- [ ] **Step 1: 실패하는 테스트를 작성한다**

```ts
import {
  selectScratchPendingApprovals,
  useScratchSessionStore,
} from "../src/store/scratch-session.store";

async function startTurnWithPendingApproval() {
  const { runTurn } = buildFakeRunTurn([
    {
      type: "approval",
      toolName: "Edit",
      requestId: "req-1",
      description: "Rewrite README.md",
    },
  ]);

  await useScratchSessionStore
    .getState()
    .setFolder(
      { inputPath: "/tmp/scratch" },
      { resolvePath: async () => ({ ok: true, path: "/tmp/scratch" }) },
    );
  await useScratchSessionStore
    .getState()
    .send(
      { prompt: "edit the readme", settings: defaultSettings },
      { runTurn },
    );
  await Bun.sleep(0);
}

describe("scratch session approvals", () => {
  test("exposes the pending approval", async () => {
    await startTurnWithPendingApproval();
    const pending = selectScratchPendingApprovals(
      useScratchSessionStore.getState(),
    );
    expect(pending).toHaveLength(1);
    expect(pending[0]?.part.requestId).toBe("req-1");
  });

  test("responds with the live turn id and transitions the part", async () => {
    await startTurnWithPendingApproval();
    const turnId = useScratchSessionStore.getState().activeTurnId;
    const seen: Array<Record<string, unknown>> = [];

    await useScratchSessionStore.getState().respondApproval(
      { requestId: "req-1", approved: true },
      {
        respondApproval: async (args) => {
          seen.push(args);
          return { ok: true };
        },
      },
    );

    expect(seen[0]).toEqual({ turnId, requestId: "req-1", approved: true });
    expect(
      selectScratchPendingApprovals(useScratchSessionStore.getState()),
    ).toHaveLength(0);
  });

  test("keeps the approval pending and records the failure when delivery fails", async () => {
    await startTurnWithPendingApproval();

    await useScratchSessionStore
      .getState()
      .respondApproval(
        { requestId: "req-1", approved: true },
        { respondApproval: async () => ({ ok: false, message: "gone" }) },
      );

    expect(
      selectScratchPendingApprovals(useScratchSessionStore.getState()),
    ).toHaveLength(1);
    expect(useScratchSessionStore.getState().error).toContain("gone");
  });
});

describe("scratch session stop", () => {
  test("aborts the live turn and interrupts pending approvals", async () => {
    await startTurnWithPendingApproval();
    const turnId = useScratchSessionStore.getState().activeTurnId;
    const aborted: Array<Record<string, unknown>> = [];

    await useScratchSessionStore.getState().stop({
      abortTurn: async (args) => {
        aborted.push(args);
        return { ok: true };
      },
    });

    expect(aborted[0]).toEqual({ turnId });
    expect(useScratchSessionStore.getState().activeTurnId).toBeNull();
    expect(
      selectScratchPendingApprovals(useScratchSessionStore.getState()),
    ).toHaveLength(0);
  });
});
```

승인 이벤트 variant는 `src/lib/providers/provider.types.ts`에서 확인된 `{ type: "approval", toolName, requestId, description, input?, ownerAgentId? }`다.

- [ ] **Step 2: 테스트가 실패하는 것을 확인한다**

Run: `bun test scratch-session-store`
Expected: FAIL — `respondApproval is not a function`

- [ ] **Step 3: 최소 구현을 작성한다**

```ts
import type { ApprovalPart } from "@/types/chat";
import {
  findPendingApprovals,
  interruptPendingToolInteractionsInMessages,
  updateApprovalPartsByRequestId,
} from "@/store/provider-message.utils";

export function selectScratchPendingApprovals(state: ScratchSessionState) {
  return findPendingApprovals({ messages: state.messages });
}
```

액션 본문:

```ts
stop: async (dependencies) => {
  const state = get();
  const turnId = state.activeTurnId;
  set({
    activeTurnId: null,
    messages: interruptPendingToolInteractionsInMessages({
      messages: state.messages,
    }),
  });
  if (!turnId) {
    return;
  }
  const abortTurn = dependencies?.abortTurn ?? window.api?.provider?.abortTurn;
  await abortTurn?.({ turnId });
},

respondApproval: async ({ requestId, approved }, dependencies) => {
  const state = get();
  const turnId = state.activeTurnId;
  if (!turnId) {
    set({
      error:
        "That approval can no longer be answered — the scratch turn already ended.",
    });
    return;
  }

  const respondApproval =
    dependencies?.respondApproval ?? window.api?.provider?.respondApproval;
  if (!respondApproval) {
    set({ error: "Approval delivery is unavailable in this environment." });
    return;
  }

  const result = await respondApproval({ turnId, requestId, approved });
  if (!result.ok) {
    set({ error: `Approval delivery failed: ${result.message ?? "unknown"}` });
    return;
  }

  set({
    error: null,
    messages: get().messages.map((message) => ({
      ...message,
      parts: updateApprovalPartsByRequestId({
        parts: message.parts,
        requestId,
        approved,
      }),
    })),
  });
},
```

`ScratchSessionDependencies`에 추가한다:

```ts
  abortTurn?: (args: { turnId: string }) => Promise<{ ok: boolean; message?: string }>;
  respondApproval?: (args: {
    turnId: string;
    requestId: string;
    approved: boolean;
  }) => Promise<{ ok: boolean; message?: string }>;
```

이 시그니처는 `src/types/window-api.d.ts:269`(`abortTurn`), `:282`(`respondApproval`), `:279`(`cleanupTask`)의 확정된 형태와 일치한다.

- [ ] **Step 4: 테스트가 통과하는 것을 확인한다**

Run: `bun test scratch-session-store`
Expected: PASS (14 tests)

- [ ] **Step 5: 타입 검사**

Run: `bun run typecheck`
Expected: 오류 없음

- [ ] **Step 6: 커밋**

```bash
git add src/store tests
git commit -m "feat: answer scratch session approvals inline"
```

---

### Task 5: Clear

**Files:**

- Modify: `src/store/{scratch-session.store.ts}`
- Test: `tests/{scratch-session-store.test.ts}`

**Interfaces:**

- Consumes: Task 4의 `stop`
- Produces:
  - `ScratchSessionState.clear(dependencies?) => Promise<void>` — abort → 대기 승인 정리 → `cleanupTask` → 상태 초기화 + `taskId` 재발급. `folderPath`와 `provider`는 유지한다.
  - `ScratchSessionDependencies.cleanupTask`

- [ ] **Step 1: 실패하는 테스트를 작성한다**

```ts
describe("scratch session clear", () => {
  test("aborts, releases the provider task, and keeps the folder", async () => {
    await startTurnWithPendingApproval();
    const previousTaskId = useScratchSessionStore.getState().taskId;
    const turnId = useScratchSessionStore.getState().activeTurnId;
    const aborted: Array<Record<string, unknown>> = [];
    const cleaned: Array<Record<string, unknown>> = [];

    await useScratchSessionStore.getState().clear({
      abortTurn: async (args) => {
        aborted.push(args);
        return { ok: true };
      },
      cleanupTask: async (args) => {
        cleaned.push(args);
        return { ok: true };
      },
    });

    const state = useScratchSessionStore.getState();
    expect(aborted[0]).toEqual({ turnId });
    expect(cleaned[0]).toEqual({ taskId: previousTaskId });
    expect(state.messages).toEqual([]);
    expect(state.activeTurnId).toBeNull();
    expect(state.providerSession).toEqual({});
    expect(state.taskId).not.toBe(previousTaskId);
    expect(state.folderPath).toBe("/tmp/scratch");
  });

  test("ignores provider events that arrive after a clear", async () => {
    const { runTurn } = buildFakeRunTurn([]);
    useScratchSessionStore
      .getState()
      .setFolder({ directoryPath: "/tmp/scratch" });
    await useScratchSessionStore
      .getState()
      .send({ prompt: "hi", settings: defaultSettings }, { runTurn });
    const staleTurnId = useScratchSessionStore.getState().activeTurnId ?? "";

    await useScratchSessionStore.getState().clear({
      abortTurn: async () => ({ ok: true }),
      cleanupTask: async () => ({ ok: true }),
    });

    useScratchSessionStore.getState().ingestEvent({
      event: { type: "text", text: "late" },
      turnId: staleTurnId,
      provider: "claude-code",
      model: defaultSettings.modelClaude,
    });

    expect(useScratchSessionStore.getState().messages).toEqual([]);
  });
});
```

- [ ] **Step 2: 테스트가 실패하는 것을 확인한다**

Run: `bun test scratch-session-store`
Expected: FAIL — `clear is not a function`

- [ ] **Step 3: 최소 구현을 작성한다**

```ts
clear: async (dependencies) => {
  const previousTaskId = get().taskId;
  await get().stop(dependencies);

  const cleanupTask =
    dependencies?.cleanupTask ?? window.api?.provider?.cleanupTask;
  await cleanupTask?.({ taskId: previousTaskId });

  set({
    messages: [],
    activeTurnId: null,
    providerSession: {},
    error: null,
    taskId: createScratchTaskId(),
  });
},
```

`ScratchSessionDependencies`에 추가한다:

```ts
  cleanupTask?: (args: { taskId: string }) => Promise<{ ok: boolean; message?: string }>;
```

`reset`은 Task 1에서 만든 테스트 전용 초기화로 남기고, 사용자 동작은 `clear`를 쓴다. `reset`은 `folderPath`까지 비우고 IPC를 호출하지 않는 점이 `clear`와 다르다 — 두 함수의 주석에 이 차이를 명시한다.

- [ ] **Step 4: 테스트가 통과하는 것을 확인한다**

Run: `bun test scratch-session-store`
Expected: PASS (16 tests)

- [ ] **Step 5: 타입 검사**

Run: `bun run typecheck`
Expected: 오류 없음

- [ ] **Step 6: 커밋**

```bash
git add src/store tests
git commit -m "feat: clear the scratch session on demand"
```

---

### Task 6: 팝오버 셸과 트리거

**Files:**

- Create: `src/components/layout/{TopBarScratchSession.tsx}`
- Modify: `src/components/layout/TopBar.tsx` (오른쪽 클러스터, `TopBarRoutines` 바로 뒤)
- Test: `tests/{scratch-session-popover.test.tsx}`

**Interfaces:**

- Consumes: Task 1–5의 `useScratchSessionStore`, `selectScratchPendingApprovals`
- Produces:
  - `TopBarScratchSession(props: { noDragStyle: CSSProperties })`
  - `buildScratchTriggerLabel(args: { pendingApprovalCount: number; turnActive: boolean }): string`

**렌더 테스트 방식**: 이 리포에는 `@testing-library/react`도 DOM 환경도 없다. 컴포넌트 테스트는 `react-dom/server`의 `renderToStaticMarkup`으로 마크업 문자열을 만들고 그 내용을 단정한다 (`tests/assistant-message-body.test.tsx`, `tests/advisor-consult-log-render.test.tsx` 참조). **클릭·입력 상호작용은 이 방식으로 검증할 수 없다** — 상호작용의 결과는 Task 1–5의 스토어 테스트가 이미 덮는다.

**패턴 참조**: `src/components/layout/TopBarNotifications.tsx`의 `Popover` / `PopoverTrigger` / `PopoverContent` 구성. `TopBarNotifications`는 `hasProjectContext`로 감싸져 있지만 **이 트리거는 감싸지 않는다** — 프로젝트가 없어도 떠야 한다.

- [ ] **Step 1: 실패하는 테스트를 작성한다**

`tests/{scratch-session-popover.test.tsx}`:

```tsx
import { describe, expect, test } from "bun:test";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { TooltipProvider } from "@/components/ui";
import {
  buildScratchTriggerLabel,
  TopBarScratchSession,
} from "@/components/layout/TopBarScratchSession";
import { useScratchSessionStore } from "@/store/scratch-session.store";

function renderTrigger() {
  return renderToStaticMarkup(
    createElement(
      TooltipProvider,
      null,
      createElement(TopBarScratchSession, { noDragStyle: {} }),
    ),
  );
}

describe("buildScratchTriggerLabel", () => {
  test("names the waiting approval ahead of the running turn", () => {
    expect(
      buildScratchTriggerLabel({ pendingApprovalCount: 1, turnActive: true }),
    ).toBe("Scratch session — approval waiting");
    expect(
      buildScratchTriggerLabel({ pendingApprovalCount: 0, turnActive: true }),
    ).toBe("Scratch session — running");
    expect(
      buildScratchTriggerLabel({ pendingApprovalCount: 0, turnActive: false }),
    ).toBe("Scratch session");
  });
});

describe("TopBarScratchSession", () => {
  test("renders a trigger with no project context and no folder", () => {
    useScratchSessionStore.getState().reset();
    const markup = renderTrigger();
    expect(markup).toContain("Scratch session");
    expect(markup).toContain("Pick a folder");
  });

  test("marks the trigger when an approval is waiting", () => {
    useScratchSessionStore.getState().reset();
    useScratchSessionStore.setState({
      messages: [
        {
          id: "scratch-m-2",
          role: "assistant",
          model: "test-model",
          providerId: "claude-code",
          content: "",
          parts: [
            {
              type: "approval",
              toolName: "Edit",
              description: "Rewrite README.md",
              requestId: "req-1",
              state: "approval-requested",
            },
          ],
        },
      ],
    });

    expect(renderTrigger()).toContain("approval waiting");
    useScratchSessionStore.getState().reset();
  });
});
```

두 번째 테스트가 "Pick a folder"를 찾는 것은 Radix `Popover`가 닫힌 상태에서 `PopoverContent`를 렌더하지 않을 경우 실패한다. 실패하면 빈 상태 문구를 `PopoverContent` 밖(트리거의 `aria-label`이나 `TooltipContent`)에서 찾도록 단정을 옮기지 말고, **빈 상태 문구를 담은 순수 함수** `buildScratchEmptyStateText()`를 만들어 그것을 테스트한다. 마크업 단정은 트리거 라벨에만 의존하게 유지한다.

렌더 중 `window`나 `localStorage` 부재로 예외가 나면 `tests/assistant-message-body.test.tsx:26`의 스텁 패턴을 그대로 쓰고, 컴포넌트를 동적 `import`로 불러온다.

- [ ] **Step 2: 테스트가 실패하는 것을 확인한다**

Run: `bun test scratch-session-popover`
Expected: FAIL — 모듈을 찾을 수 없음

- [ ] **Step 3: 최소 구현을 작성한다**

`src/components/layout/{TopBarScratchSession.tsx}`:

```tsx
import { FolderCode } from "lucide-react";
import { useState, type CSSProperties } from "react";
import {
  Button,
  Popover,
  PopoverContent,
  PopoverHeader,
  PopoverTitle,
  PopoverTrigger,
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui";
import { cn } from "@/lib/utils";
import {
  selectScratchPendingApprovals,
  useScratchSessionStore,
} from "@/store/scratch-session.store";

export function buildScratchTriggerLabel(args: {
  pendingApprovalCount: number;
  turnActive: boolean;
}) {
  if (args.pendingApprovalCount > 0) {
    return "Scratch session — approval waiting";
  }
  if (args.turnActive) {
    return "Scratch session — running";
  }
  return "Scratch session";
}

export function buildScratchEmptyStateText() {
  return "Pick a folder to start a scratch session. Nothing is added to your projects.";
}

export function TopBarScratchSession(props: { noDragStyle: CSSProperties }) {
  const [open, setOpen] = useState(false);
  const folderPath = useScratchSessionStore((state) => state.folderPath);
  const activeTurnId = useScratchSessionStore((state) => state.activeTurnId);
  const pendingApprovalCount = useScratchSessionStore(
    (state) => selectScratchPendingApprovals(state).length,
  );

  const label = buildScratchTriggerLabel({
    pendingApprovalCount,
    turnActive: Boolean(activeTurnId),
  });

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <Tooltip>
        <TooltipTrigger asChild>
          <PopoverTrigger asChild>
            <Button
              variant="ghost"
              size="icon"
              aria-label={label}
              style={props.noDragStyle}
              className="relative shrink-0"
            >
              <FolderCode className="size-4" />
              {pendingApprovalCount > 0 || activeTurnId ? (
                <span
                  className={cn(
                    "absolute right-1 top-1 size-1.5 rounded-full",
                    pendingApprovalCount > 0
                      ? "bg-warning"
                      : "bg-foreground/60",
                  )}
                />
              ) : null}
            </Button>
          </PopoverTrigger>
        </TooltipTrigger>
        <TooltipContent>{label}</TooltipContent>
      </Tooltip>
      <PopoverContent
        align="end"
        className="w-[min(32rem,calc(100vw-1rem))] overflow-hidden rounded-xl border-border/80 bg-card p-0"
      >
        <PopoverHeader>
          <PopoverTitle>Scratch session</PopoverTitle>
        </PopoverHeader>
        {folderPath ? null : (
          <p className="px-4 py-6 text-sm text-muted-foreground">
            {buildScratchEmptyStateText()}
          </p>
        )}
      </PopoverContent>
    </Popover>
  );
}
```

`PopoverHeader`, `PopoverTitle`, `TooltipProvider`는 `src/components/ui/index.ts`에서 export가 확인되었다. `bg-warning`은 `src/globals.css:136`의 `--warning` 토큰에 대응하는 기존 유틸리티이며 `src/components/ui/badge.tsx:18`에서 이미 쓰인다 — **새 토큰이 아니다**.

`src/components/layout/TopBar.tsx`의 오른쪽 클러스터에서 `TopBarRoutines` 바로 뒤에 삽입한다. `hasProjectContext`로 감싸지 않는다:

```tsx
<TopBarRoutines noDragStyle={TOP_BAR_NO_DRAG_STYLE} />
<TopBarScratchSession noDragStyle={TOP_BAR_NO_DRAG_STYLE} />
```

- [ ] **Step 4: 테스트가 통과하는 것을 확인한다**

Run: `bun test scratch-session-popover`
Expected: PASS

- [ ] **Step 5: 타입 검사와 린트**

Run: `bun run typecheck`
Run: `bunx --bun eslint src/components/layout`
Expected: 오류 없음

- [ ] **Step 6: 테마 확인**

`AGENTS.md` UI 가드레일: 새 semantic surface 색을 도입하지 않았음을 확인한다.

Run: `git diff --stat src/globals.css src/lib/themes`
Expected: 출력 없음

- [ ] **Step 7: 커밋**

```bash
git add src/components/layout tests
git commit -m "feat: add scratch session popover trigger to the top bar"
```

---

### Task 7: 전사와 인라인 승인 행

**Files:**

- Create: `src/components/layout/{scratch-session/ScratchTranscript.tsx}`
- Modify: `src/components/layout/{TopBarScratchSession.tsx}` (본문에 전사 삽입)
- Test: `tests/{scratch-session-transcript.test.tsx}`

**Interfaces:**

- Consumes: `useScratchSessionStore`, `AssistantMessageBody`
- Produces:
  - `ScratchTranscript()` — 스토어에서 직접 읽는다
  - `ScratchApprovalRow(props: { part: ApprovalPart; disabled: boolean; onRespond: (args: { approved: boolean }) => void })`

`AssistantMessageBody`의 확정된 시그니처(`src/components/session/message/assistant-trace.tsx:843`):

```ts
AssistantMessageBody(args: {
  message: Pick<ChatMessage, "content" | "parts" | "displayContent" | "displayParts" | "isStreaming" | "role">;
  taskId: string;
  messageId: string;
  streamingEnabled: boolean;
  traceExpansionMode?: "auto" | "manual";
  showInterimMessages?: boolean;
})
```

- [ ] **Step 1: 실패하는 테스트를 작성한다**

`tests/{scratch-session-transcript.test.tsx}`:

```tsx
import { describe, expect, test } from "bun:test";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { ScratchApprovalRow } from "@/components/layout/scratch-session/ScratchTranscript";
import type { ApprovalPart } from "@/types/chat";

const editApproval: ApprovalPart = {
  type: "approval",
  toolName: "Edit",
  description: "Rewrite README.md",
  requestId: "req-1",
  state: "approval-requested",
};

describe("ScratchApprovalRow", () => {
  test("shows the tool name and the description", () => {
    const markup = renderToStaticMarkup(
      createElement(ScratchApprovalRow, {
        part: editApproval,
        disabled: false,
        onRespond: () => {},
      }),
    );

    expect(markup).toContain("Edit");
    expect(markup).toContain("Rewrite README.md");
    expect(markup).toContain("Approve");
    expect(markup).toContain("Deny");
    expect(markup).not.toContain("disabled");
  });

  test("disables both decisions while a response is in flight", () => {
    const markup = renderToStaticMarkup(
      createElement(ScratchApprovalRow, {
        part: { ...editApproval, requestId: "req-2" },
        disabled: true,
        onRespond: () => {},
      }),
    );

    expect(markup).toContain("disabled");
  });
});
```

- [ ] **Step 2: 테스트가 실패하는 것을 확인한다**

Run: `bun test scratch-session-transcript`
Expected: FAIL — 모듈을 찾을 수 없음

- [ ] **Step 3: 최소 구현을 작성한다**

`src/components/layout/{scratch-session/ScratchTranscript.tsx}`:

```tsx
import { useState } from "react";
import { Button } from "@/components/ui";
import { AssistantMessageBody } from "@/components/session/message/assistant-trace";
import { useScratchSessionStore } from "@/store/scratch-session.store";
import type { ApprovalPart } from "@/types/chat";

export function ScratchApprovalRow(props: {
  part: ApprovalPart;
  disabled: boolean;
  onRespond: (args: { approved: boolean }) => void;
}) {
  return (
    <div className="rounded-lg border border-border/80 bg-card p-3">
      <p className="text-sm font-medium">{props.part.toolName}</p>
      <p className="mt-1 text-xs text-muted-foreground">
        {props.part.description}
      </p>
      <div className="mt-2 flex gap-2">
        <Button
          size="sm"
          disabled={props.disabled}
          onClick={() => props.onRespond({ approved: true })}
        >
          Approve
        </Button>
        <Button
          size="sm"
          variant="outline"
          disabled={props.disabled}
          onClick={() => props.onRespond({ approved: false })}
        >
          Deny
        </Button>
      </div>
    </div>
  );
}

export function ScratchTranscript() {
  const messages = useScratchSessionStore((state) => state.messages);
  const taskId = useScratchSessionStore((state) => state.taskId);
  const respondApproval = useScratchSessionStore(
    (state) => state.respondApproval,
  );
  const [inFlightRequestId, setInFlightRequestId] = useState<string | null>(
    null,
  );

  return (
    <div className="max-h-[24rem] space-y-3 overflow-y-auto px-4 py-3">
      {messages.map((message) => {
        if (message.role === "user") {
          return (
            <p key={message.id} className="text-sm text-muted-foreground">
              {message.content}
            </p>
          );
        }

        const approvals = message.parts.filter(
          (part): part is ApprovalPart =>
            part.type === "approval" && part.state === "approval-requested",
        );

        return (
          <div key={message.id} className="space-y-2">
            <AssistantMessageBody
              message={message}
              taskId={taskId}
              messageId={message.id}
              streamingEnabled
            />
            {approvals.map((part) => (
              <ScratchApprovalRow
                key={part.requestId}
                part={part}
                disabled={inFlightRequestId === part.requestId}
                onRespond={({ approved }) => {
                  setInFlightRequestId(part.requestId);
                  void respondApproval({
                    requestId: part.requestId,
                    approved,
                  }).finally(() => setInFlightRequestId(null));
                }}
              />
            ))}
          </div>
        );
      })}
    </div>
  );
}
```

`TopBarScratchSession`의 `PopoverContent`에서 `folderPath`가 있을 때 빈 상태 대신 `<ScratchTranscript />`를 렌더한다.

- [ ] **Step 4: 테스트가 통과하는 것을 확인한다**

Run: `bun test scratch-session-transcript`
Expected: PASS

- [ ] **Step 5: 타입 검사와 린트**

Run: `bun run typecheck`
Run: `bunx --bun eslint src/components/layout`
Expected: 오류 없음

- [ ] **Step 6: 커밋**

```bash
git add src/components/layout tests
git commit -m "feat: render the scratch session transcript with inline approvals"
```

---

### Task 8: 컴포저, 폴더 선택, Clear 배선

**Files:**

- Create: `src/components/layout/{scratch-session/ScratchComposer.tsx}`
- Modify: `src/components/layout/{TopBarScratchSession.tsx}` (헤더 컨트롤 + 푸터)
- Test: `tests/{scratch-session-composer.test.tsx}`

**Interfaces:**

- Consumes: `useScratchSessionStore`, `selectScratchPendingApprovals`, `useAppStore`(설정 읽기 전용), `ConfirmDialog`
- Produces: `ScratchComposer()`

`ConfirmDialog`의 확정된 props(`src/components/layout/ConfirmDialog.tsx:28`): `open`, `title`, `description`, `confirmLabel?`, `cancelLabel?`, `loading?`, `children?`, `onConfirm`, `onCancel`.

`window.api.fs.pickDirectory`는 **인자를 받지 않는다**(`electron/preload.ts:1411`).

- [ ] **Step 1: 실패하는 테스트를 작성한다**

`tests/{scratch-session-composer.test.tsx}`. `ScratchComposer`는 `useAppStore`를 import하므로 `tests/assistant-message-body.test.tsx:26`의 스텁 패턴을 따라 스텁을 먼저 설치하고 **동적 import**로 컴포넌트를 불러온다:

```tsx
import { describe, expect, test } from "bun:test";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";

async function loadComposer() {
  const storageStub = {
    getItem: (_key: string) => null,
    setItem: (_key: string, _value: string) => {},
    removeItem: (_key: string) => {},
    clear: () => {},
    key: (_index: number) => null,
    length: 0,
  };
  Object.defineProperty(globalThis, "localStorage", {
    value: storageStub,
    configurable: true,
  });
  Object.defineProperty(globalThis, "window", {
    value: { api: {} },
    configurable: true,
  });

  const composerModule =
    await import("@/components/layout/scratch-session/ScratchComposer");
  const storeModule = await import("@/store/scratch-session.store");
  return {
    ScratchComposer: composerModule.ScratchComposer,
    useScratchSessionStore: storeModule.useScratchSessionStore,
  };
}

describe("ScratchComposer", () => {
  test("disables send until a folder is picked", async () => {
    const { ScratchComposer, useScratchSessionStore } = await loadComposer();
    useScratchSessionStore.getState().reset();

    const markup = renderToStaticMarkup(createElement(ScratchComposer));
    expect(markup).toContain("Pick a folder first");
    expect(markup).toContain("disabled");
    expect(markup).toContain("Send");
  });

  test("offers stop instead of send while a turn is running", async () => {
    const { ScratchComposer, useScratchSessionStore } = await loadComposer();
    useScratchSessionStore.getState().reset();
    useScratchSessionStore.setState({
      folderPath: "/tmp/scratch",
      activeTurnId: "turn-1",
    });

    const markup = renderToStaticMarkup(createElement(ScratchComposer));
    expect(markup).toContain("Stop");
    expect(markup).not.toContain(">Send<");
    useScratchSessionStore.getState().reset();
  });
});
```

`window` 스텁이 `{ api: {} }`인 이유는 이 테스트가 IPC를 호출하지 않기 때문이다. `useAppStore`가 부팅 시 다른 전역을 요구해 예외가 나면, 그 전역만 스텁에 추가한다 — 스텁을 넓히기보다 필요한 것만 더한다.

- [ ] **Step 2: 테스트가 실패하는 것을 확인한다**

Run: `bun test scratch-session-composer`
Expected: FAIL — 모듈을 찾을 수 없음

- [ ] **Step 3: 최소 구현을 작성한다**

`src/components/layout/{scratch-session/ScratchComposer.tsx}`:

```tsx
import { useState } from "react";
import { Button, Textarea } from "@/components/ui";
import { useAppStore } from "@/store/app.store";
import { useScratchSessionStore } from "@/store/scratch-session.store";

export function ScratchComposer() {
  const [draft, setDraft] = useState("");
  const folderPath = useScratchSessionStore((state) => state.folderPath);
  const activeTurnId = useScratchSessionStore((state) => state.activeTurnId);
  const send = useScratchSessionStore((state) => state.send);
  const stop = useScratchSessionStore((state) => state.stop);
  const settings = useAppStore((state) => state.settings);

  return (
    <div className="border-t border-border/80 p-3">
      <Textarea
        rows={2}
        value={draft}
        placeholder={
          folderPath ? "Ask about this folder…" : "Pick a folder first"
        }
        disabled={!folderPath}
        onChange={(event) => setDraft(event.target.value)}
      />
      <div className="mt-2 flex justify-end">
        {activeTurnId ? (
          <Button size="sm" variant="outline" onClick={() => void stop()}>
            Stop
          </Button>
        ) : (
          <Button
            size="sm"
            disabled={!folderPath || draft.trim().length === 0}
            onClick={() => {
              const prompt = draft;
              setDraft("");
              void send({ prompt, settings });
            }}
          >
            Send
          </Button>
        )}
      </div>
    </div>
  );
}
```

`Textarea`는 `src/components/ui/index.ts:81`에서 export가 확인되었다.

`TopBarScratchSession`에 헤더 컨트롤 두 개와 푸터를 추가한다.

폴더 선택:

```tsx
const pickFolder = useScratchSessionStore((state) => state.pickFolder);

// 폴더 칩 onClick
() => void pickFolder();
```

피커 호출과 절대 경로 가드는 Task 1의 `pickFolder`에 이미 들어 있다. 컴포넌트는 IPC를 직접 부르지 않는다.

Clear:

```tsx
const clear = useScratchSessionStore((state) => state.clear);
const [clearPromptOpen, setClearPromptOpen] = useState(false);
const needsClearConfirm = Boolean(activeTurnId) || pendingApprovalCount > 0;

// Clear 버튼 onClick
() => (needsClearConfirm ? setClearPromptOpen(true) : void clear())

// PopoverContent 안에 함께 렌더
<ConfirmDialog
  open={clearPromptOpen}
  title="Clear this scratch session?"
  description="The running turn stops and any waiting approval is dropped. The folder stays selected."
  confirmLabel="Clear"
  onConfirm={async () => {
    await clear();
    setClearPromptOpen(false);
  }}
  onCancel={() => setClearPromptOpen(false)}
/>
```

푸터에 `<ScratchComposer />`를 렌더한다.

- [ ] **Step 4: 테스트가 통과하는 것을 확인한다**

Run: `bun test scratch-session-composer`
Expected: PASS

- [ ] **Step 5: 전체 scratch 테스트와 타입 검사, 린트**

Run: `bun test scratch-session`
Run: `bun run typecheck`
Run: `bunx --bun eslint src/components/layout src/store`
Expected: 전부 통과

- [ ] **Step 6: 커밋**

```bash
git add src/components/layout tests
git commit -m "feat: wire scratch session composer, folder picker, and clear"
```

---

### Task 9: 사용자 가이드와 최종 검증

**Files:**

- Create: `docs/features/{scratch-session.md}`
- Modify: `site/src/public-docs.ts`

`docs/features/README.md`가 신규 사용자 기능마다 요구하는 항목이다. `docs/templates/feature-guide-template.md`에서 시작하고 섹션 순서를 유지한다: Summary / When To Use It / Before You Start / Quick Start / Interface Walkthrough (Entry Points, Key Controls) / Common Workflows / Files And Data / Limitations And Advanced Options / Troubleshooting / Related Docs.

- [ ] **Step 1: 템플릿에서 가이드를 만든다**

```bash
GUIDE=scratch-session.md
cp docs/templates/feature-guide-template.md "docs/features/$GUIDE"
```

내용에 반드시 포함할 것:

- **Summary**: 상단 바의 Scratch session 버튼으로 임의 폴더에 세션을 열며, 프로젝트로 등록되지 않는다.
- **Before You Start**: 파일 수정이 가능하고 승인 요청이 팝오버 안에 뜬다.
- **Key Controls**: 폴더 칩, 프로바이더 토글, Clear, 입력창, Send/Stop.
- **Files And Data**: 아무것도 영속화되지 않는다. 앱을 닫으면 세션이 사라지고, 프로젝트 목록과 최근 프로젝트에 나타나지 않는다.
- **Limitations**: 동시 1개, 플랜/Advisor/서브태스크 없음, 이력 저장 없음.
- **Related Docs**: `docs/features/provider-sandbox-and-approval.md`, `docs/features/notifications.md`.

- [ ] **Step 2: 공개 내비게이션에 등록한다**

`site/src/public-docs.ts`의 기존 항목과 같은 형태로 추가한다:

```ts
{
  routePath: "scratch-session",
  sourcePath: "docs/features/{scratch-session.md}",
  title: "Scratch Session",
  description:
    "Ask about any folder from the top bar without registering it as a project.",
},
```

- [ ] **Step 3: 문서 게이트**

Run: `bun run check:doc-paths`
Expected: PASS

- [ ] **Step 4: CI 게이트**

Run: `bun run check:max-lines-ratchet`
Run: `bun run check:switch-exhaustiveness`
Run: `bun run typecheck`
Run: `bun test scratch-session`
Expected: 전부 통과

전체 스위트(`bun run test:isolated`)는 오래 걸린다. 이 워크트리 안에서만 돌리고, 실패가 나오면 `origin/main` 기준으로 기존 실패인지 먼저 확인한다.

- [ ] **Step 5: 커밋**

```bash
git add docs site
git commit -m "docs: add the scratch session feature guide"
```

---

## Self-Review

**Spec coverage**

| Spec 절                                                          | 담당 태스크                                        |
| ---------------------------------------------------------------- | -------------------------------------------------- |
| §3.1 트리거 (게이트 밖, 배지)                                    | Task 6                                             |
| §3.2 팝오버 3단 레이아웃                                         | Task 6, 7, 8                                       |
| §3.3 전사 렌더링 (`AssistantMessageBody`)                        | Task 7                                             |
| §4 전용 스토어, `app.store.ts` 미수정                            | Task 1–5                                           |
| §5 턴 실행 (cwd 전달, workspaceId 생략, `includeAdvisor: false`) | Task 2                                             |
| §5 이벤트 폴딩, 세션 커서                                        | Task 3                                             |
| §5 중지                                                          | Task 4                                             |
| §6 인라인 승인, 유령 승인 정리                                   | Task 4, 7                                          |
| §7.1 Clear 4단계 + ConfirmDialog                                 | Task 5, 8                                          |
| §7.2 팝오버를 닫아도 유지                                        | Task 1 — 상태가 컴포넌트 밖이므로 별도 코드 불필요 |
| §9 테스트 전략                                                   | Task 1–8                                           |
| 리포 정책: 기능 가이드 + 공개 내비                               | Task 9                                             |

**Spec에 없던 추가 항목**: Task 9의 사용자 가이드와 `site/src/public-docs.ts` 등록은 `docs/features/README.md`가 신규 사용자 기능에 요구하는 리포 정책이다. spec §8의 파일 목록에 빠져 있었으므로 이 플랜이 채운다.

**타입 일관성**: `setFolder` / `send` / `ingestEvent` / `stop` / `respondApproval` / `clear` / `reset`, `selectScratchPendingApprovals`, `createScratchTaskId`, `resolveScratchModel`, `buildScratchTriggerLabel`, `buildScratchEmptyStateText`, `ScratchApprovalRow`, `ScratchTranscript`, `ScratchComposer`, `TopBarScratchSession` — 태스크 간 이름과 시그니처가 일치한다. `ScratchSessionDependencies`는 Task 1(`pickDirectory`) → 2(`runTurn`) → 4(`abortTurn`, `respondApproval`) → 5(`cleanupTask`) 순으로만 확장된다.

**리포에서 확인해 확정한 사실** (플랜의 코드가 이미 반영하고 있다):

| 항목                                            | 확정값                                                                                                                                                                                                                    |
| ----------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 기본 설정 export                                | `defaultSettings` (`src/store/app-settings.ts:455`)                                                                                                                                                                       |
| 승인 이벤트 variant                             | `{ type: "approval", toolName, requestId, description, input?, ownerAgentId? }`                                                                                                                                           |
| `abortTurn` / `cleanupTask` / `respondApproval` | `Promise<{ ok: boolean; message?: string }>` (`src/types/window-api.d.ts:269`, `:279`, `:282`)                                                                                                                            |
| `fs.pickDirectory`                              | 인자 없음. `Promise<{ ok, directoryPath?, stderr? }>` (`electron/preload.ts:1411`, `src/types/window-api.d.ts:554`)                                                                                                       |
| `fs.resolvePath`                                | `Promise<{ ok, rootPath?, rootName?, files?, stderr? }>`이고 성공 시 폴더를 재귀 순회한다 (`src/types/window-api.d.ts:565`, `electron/main/ipc/filesystem.ts:135`). 이 비용 때문에 scratch 폴더 선택 경로에서 쓰지 않는다 |
| UI export                                       | `PopoverHeader`, `PopoverTitle`, `Textarea`, `TooltipProvider` 모두 `src/components/ui/index.ts`에 있다                                                                                                                   |
| `includeAdvisor: false`                         | `advisorTarget` / `workerIntent` 키가 결과에서 생략된다 (`src/store/provider-runtime-options.ts:281`, `:289`)                                                                                                             |
| `bg-warning`                                    | 기존 유틸리티. `src/globals.css:136`의 `--warning` 토큰, `src/components/ui/badge.tsx:18`에서 사용 중                                                                                                                     |
| 컴포넌트 테스트                                 | `@testing-library/react` 없음. `react-dom/server`의 `renderToStaticMarkup`을 쓰며 클릭 검증은 불가능하다                                                                                                                  |
| 파일 길이 게이트                                | `config/max-lines-ratchet.json`에 등재된 파일만 검사한다. 신규 파일은 추가하지 않으므로 제약이 없다                                                                                                                       |

**남은 확인 지점**: 없다. 플랜의 모든 외부 시그니처는 리포에서 확인된 값이다.
