import {
  DEFAULT_REPOSITORY_MEMORY_SETTINGS,
  type RepositoryMemorySettingsPatch,
} from "@/lib/repository-memory-settings";
import {
  REPOSITORY_MEMORY_AUTO_CONFIDENCE,
  REPOSITORY_MEMORY_EXPLICIT_CONFIDENCE,
  type RepositoryMemory,
} from "@/lib/repository-memory";
import { useAppStore } from "@/store/app.store";

/**
 * The slice of `window.api` the plan and memory lists read.
 *
 * The browser dev bridge exposes neither `fs` nor `repositoryMemory`, so both
 * sections render their empty state in a browser no matter what is on disk.
 * This installs an in-memory stand-in — reads are served from the fixtures
 * below and writes mutate them — so the rows are real components driven by
 * real state, not a static mock of their markup.
 */

const PLAN_FILES = [
  ".stave/context/plans/retry-design.md",
  ".stave/context/plans/10d53a9c_2026-09-07T10-12-00.md",
  ".stave/context/plans/1f82d08b_20260905_controls-and-overlay-geometry.md",
];

/**
 * `&plans=many`: ten newer task documents push the three above, one more
 * content-named document and the legacy one past the list's recent ten.
 */
const MANY_PLAN_FILES = [
  ...PLAN_FILES,
  ...Array.from(
    { length: 10 },
    (_, index) => `.stave/context/plans/7c41e0${String(index).padStart(2, "0")}_2026-09-${String(10 + index)}T09-00-00.md`,
  ),
  ".stave/context/plans/oldest-audit-notes.md",
];

function previewPlanFiles() {
  return new URLSearchParams(window.location.search).get("plans") === "many" ? MANY_PLAN_FILES : PLAN_FILES;
}

/** Recorded revisions for two of the documents above. */
export const PREVIEW_DOCUMENT_ACTIVITY = {
  documentsByPath: {
    ".stave/context/plans/retry-design.md": {
      filePath: ".stave/context/plans/retry-design.md",
      latestRevision: 3,
      latestAuthor: "external" as const,
      latestCreatedAt: "2026-09-08T09:00:00.000Z",
      revisionCount: 3,
    },
    ".stave/context/plans/10d53a9c_2026-09-07T10-12-00.md": {
      filePath: ".stave/context/plans/10d53a9c_2026-09-07T10-12-00.md",
      latestRevision: 1,
      latestAuthor: "agent" as const,
      latestCreatedAt: "2026-09-07T10:12:00.000Z",
      revisionCount: 1,
    },
  },
  linksByTurn: {
    "preview-turn": [
      {
        turnId: "preview-turn",
        taskId: "10d53a9c",
        filePath: ".stave/context/plans/retry-design.md",
        revision: 3,
      },
      {
        turnId: "preview-turn",
        taskId: "10d53a9c",
        filePath: ".stave/context/plans/10d53a9c_2026-09-07T10-12-00.md",
        revision: 1,
      },
    ],
  },
};

const LEGACY_PLAN_FILES = [".stave/plans/0b91ff2c_20260901_initial-sweep.md"];

const PREVIEW_REPOSITORY = "/tmp/stave-project";
const HOUR = 3_600_000;
const DAY = 24 * HOUR;
const PREVIEW_SOURCE_TASK = { taskId: "10d53a9c", title: "Tighten the memory panel" };

function previewMemory(
  args: Pick<RepositoryMemory, "id" | "kind" | "recallMode" | "content"> & {
    confirmedAgo: number;
    fromPreviewTask?: boolean;
  },
): RepositoryMemory {
  const confirmedAt = Date.now() - args.confirmedAgo;
  return {
    id: args.id,
    repositoryPath: PREVIEW_REPOSITORY,
    kind: args.kind,
    recallMode: args.recallMode,
    content: args.content,
    sourceTaskId: args.fromPreviewTask ? PREVIEW_SOURCE_TASK.taskId : null,
    sourceTurnId: args.fromPreviewTask ? "turn-1" : null,
    confidence:
      args.recallMode === "candidate"
        ? REPOSITORY_MEMORY_AUTO_CONFIDENCE
        : REPOSITORY_MEMORY_EXPLICIT_CONFIDENCE,
    createdAt: confirmedAt - DAY,
    updatedAt: confirmedAt,
    lastConfirmedAt: confirmedAt,
    deletedAt: null,
  };
}

/**
 * Ten memories, past the list's filter threshold, in every kind. `&memories=few`
 * keeps the first three, under it.
 */
const MEMORIES: RepositoryMemory[] = [
  previewMemory({
    id: "mem-core",
    kind: "convention",
    recallMode: "core",
    content: "Use Bun for install, test and build; use bunx --bun, never npx.",
    confirmedAgo: HOUR,
  }),
  previewMemory({
    id: "mem-contextual",
    kind: "decision",
    recallMode: "contextual",
    content:
      "Author styles with stylex.create and compose before compiling. No Tailwind utility strings, no @apply, no CVA recipes anywhere under src/components/ui.",
    confirmedAgo: DAY,
  }),
  previewMemory({
    id: "mem-candidate",
    kind: "gotcha",
    recallMode: "candidate",
    content:
      "The renderer's provider event schema and the main process copy have to move together.",
    confirmedAgo: DAY,
    fromPreviewTask: true,
  }),
  previewMemory({
    id: "mem-pages",
    kind: "convention",
    recallMode: "core",
    content: "Run bun run build:pages before marking a PR ready, even when no docs changed.",
    confirmedAgo: 3 * DAY,
  }),
  previewMemory({
    id: "mem-bridge",
    kind: "fact",
    recallMode: "contextual",
    content: "The browser dev bridge listens on 127.0.0.1:3001 and only serves a subset of the desktop API.",
    confirmedAgo: 9 * DAY,
    fromPreviewTask: true,
  }),
  previewMemory({
    id: "mem-settings",
    kind: "gotcha",
    recallMode: "contextual",
    content: "Settings dialog sections remount on tab change; keep their drafts in the store, not in component state.",
    confirmedAgo: 6 * DAY,
    fromPreviewTask: true,
  }),
  previewMemory({
    id: "mem-toasts",
    kind: "decision",
    recallMode: "contextual",
    content: "Toasts: one top-center host for notifications, bottom-right for workspace progress.",
    confirmedAgo: 2 * DAY,
  }),
  previewMemory({
    id: "mem-context",
    kind: "gotcha",
    recallMode: "candidate",
    content: "One provider reports context usage only as a total, with no per-category breakdown.",
    confirmedAgo: 4 * HOUR,
  }),
  previewMemory({
    id: "mem-i18n",
    kind: "convention",
    recallMode: "contextual",
    content: "Put every user-facing string in both the English and Korean catalogs in the same change.",
    confirmedAgo: 12 * DAY,
  }),
  previewMemory({
    id: "mem-scope",
    kind: "fact",
    recallMode: "contextual",
    content: "Memory rows are scoped by project path and never read across projects.",
    confirmedAgo: 20 * DAY,
  }),
];

function previewMemories() {
  return new URLSearchParams(window.location.search).get("memories") === "few"
    ? MEMORIES.slice(0, 3)
    : MEMORIES;
}

let memories: RepositoryMemory[] = [];

export function installInformationRowPreviewApi() {
  const existing = (window as unknown as { api?: Record<string, unknown> }).api;
  const api = { ...(existing ?? {}) } as Record<string, unknown>;

  api.fs = {
    ...(existing?.fs as object | undefined),
    listDirectory: async (args: { directoryPath: string }) => ({
      ok: true,
      entries: (args.directoryPath.startsWith(".stave/context")
        ? previewPlanFiles()
        : LEGACY_PLAN_FILES
      ).map((path) => ({ path, type: "file" as const })),
    }),
    readFile: async () => ({ ok: true, content: "- [ ] A checklist item\n" }),
    createDirectory: async () => ({ ok: true }),
  };

  let settings = { ...DEFAULT_REPOSITORY_MEMORY_SETTINGS };
  memories = previewMemories().map((memory) => ({ ...memory }));
  // The bridge the Memory section reads. Forgetting is a soft delete, as in the
  // store, so Undo can bring the row back.
  api.repositoryMemory = {
    list: async () => ({
      ok: true,
      items: memories.filter((item) => item.deletedAt === null),
      sourceTasks: [
        {
          ...PREVIEW_SOURCE_TASK,
          workspaceId: useAppStore.getState().activeWorkspaceId,
        },
      ],
    }),
    update: async (patch: {
      id: string;
      content: string;
      kind: RepositoryMemory["kind"];
      recallMode: RepositoryMemory["recallMode"];
    }) => {
      const next = memories.map((item) =>
        item.id === patch.id
          ? {
              ...item,
              content: patch.content,
              kind: patch.kind,
              recallMode: patch.recallMode,
              updatedAt: Date.now(),
            }
          : item,
      );
      memories = next;
      return { ok: true, memory: next.find((item) => item.id === patch.id)! };
    },
    delete: async (args: { id: string }) => {
      const deletedAt = Date.now();
      memories = memories.map((item) =>
        item.id === args.id && item.deletedAt === null ? { ...item, deletedAt } : item,
      );
      return { ok: true, deleted: true };
    },
    restore: async (args: { id: string; repositoryPath: string }) => {
      const target = memories.find(
        (item) =>
          item.id === args.id &&
          item.repositoryPath === args.repositoryPath &&
          item.deletedAt !== null,
      );
      if (!target) return { ok: true, memory: null };
      const restored = { ...target, deletedAt: null };
      memories = memories.map((item) => (item.id === args.id ? restored : item));
      return { ok: true, memory: restored };
    },
    getSettings: async () => ({ ok: true, settings }),
    saveSettings: async (args: {
      patch: RepositoryMemorySettingsPatch;
      expectedRevision: number;
    }) => {
      if (args.expectedRevision !== settings.revision)
        return {
          ok: false,
          message:
            "Memory settings changed elsewhere. Reload before saving again.",
        };
      settings = {
        ...settings,
        ...args.patch,
        revision: settings.revision + 1,
      };
      return { ok: true, settings };
    },
  };

  (window as unknown as { api?: unknown }).api = api;
}
