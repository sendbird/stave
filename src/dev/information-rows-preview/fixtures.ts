import {
  DEFAULT_REPOSITORY_MEMORY_SETTINGS,
  type RepositoryMemorySettingsPatch,
} from "@/lib/repository-memory-settings";
import {
  REPOSITORY_MEMORY_AUTO_CONFIDENCE,
  REPOSITORY_MEMORY_EXPLICIT_CONFIDENCE,
  type RepositoryMemory,
} from "@/lib/repository-memory";

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

let memories: RepositoryMemory[] = [
  {
    id: "mem-core",
    repositoryPath: "/tmp/stave-project",
    kind: "convention",
    recallMode: "core",
    content: "Use Bun for install, test and build; use bunx --bun, never npx.",
    sourceTaskId: null,
    sourceTurnId: null,
    confidence: REPOSITORY_MEMORY_EXPLICIT_CONFIDENCE,
    createdAt: Date.now() - 86_400_000 * 12,
    updatedAt: Date.now() - 86_400_000 * 12,
    lastConfirmedAt: Date.now() - 3_600_000,
    deletedAt: null,
  },
  {
    id: "mem-contextual",
    repositoryPath: "/tmp/stave-project",
    kind: "decision",
    recallMode: "contextual",
    content:
      "Author styles with stylex.create and compose before compiling. No Tailwind utility strings, no @apply, no CVA recipes anywhere under src/components/ui.",
    sourceTaskId: null,
    sourceTurnId: null,
    confidence: REPOSITORY_MEMORY_EXPLICIT_CONFIDENCE,
    createdAt: Date.now() - 86_400_000 * 4,
    updatedAt: Date.now() - 86_400_000 * 4,
    lastConfirmedAt: Date.now() - 86_400_000,
    deletedAt: null,
  },
  {
    id: "mem-candidate",
    repositoryPath: "/tmp/stave-project",
    kind: "gotcha",
    recallMode: "candidate",
    content:
      "The renderer's provider event schema and the main process copy have to move together.",
    sourceTaskId: "10d53a9c",
    sourceTurnId: "turn-1",
    confidence: REPOSITORY_MEMORY_AUTO_CONFIDENCE,
    createdAt: Date.now() - 3_600_000,
    updatedAt: Date.now() - 3_600_000,
    lastConfirmedAt: Date.now() - 86_400_000,
    deletedAt: null,
  },
];

export function installInformationRowPreviewApi() {
  const existing = (window as unknown as { api?: Record<string, unknown> }).api;
  const api = { ...(existing ?? {}) } as Record<string, unknown>;

  api.fs = {
    ...(existing?.fs as object | undefined),
    listDirectory: async (args: { directoryPath: string }) => ({
      ok: true,
      entries: (args.directoryPath.startsWith(".stave/context")
        ? PLAN_FILES
        : LEGACY_PLAN_FILES
      ).map((path) => ({ path, type: "file" as const })),
    }),
    readFile: async () => ({ ok: true, content: "- [ ] A checklist item\n" }),
    createDirectory: async () => ({ ok: true }),
  };

  let settings = { ...DEFAULT_REPOSITORY_MEMORY_SETTINGS };
  api.projectMemory = {
    list: async () => ({ ok: true, items: memories }),
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
      memories = memories.filter((item) => item.id !== args.id);
      return { ok: true };
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
