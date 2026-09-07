import {
  PROJECT_MEMORY_AUTO_CONFIDENCE,
  PROJECT_MEMORY_EXPLICIT_CONFIDENCE,
  type ProjectMemory,
} from "@/lib/project-memory";

/**
 * The slice of `window.api` the plan and memory lists read.
 *
 * The browser dev bridge exposes neither `fs` nor `projectMemory`, so both
 * sections render their empty state in a browser no matter what is on disk.
 * This installs an in-memory stand-in — reads are served from the fixtures
 * below and writes mutate them — so the rows are real components driven by
 * real state, not a static mock of their markup.
 */

const PLAN_FILES = [
  ".stave/context/plans/10d53a9c_20260907_phase1.md",
  ".stave/context/plans/aec2fb03_20260906_tasks-board.md",
  ".stave/context/plans/1f82d08b_20260905_controls-and-overlay-geometry.md",
];

const LEGACY_PLAN_FILES = [".stave/plans/0b91ff2c_20260901_initial-sweep.md"];

let memories: ProjectMemory[] = [
  {
    id: "mem-core",
    projectPath: "/tmp/stave-project",
    kind: "convention",
    recallMode: "core",
    content: "Use Bun for install, test and build; use bunx --bun, never npx.",
    sourceTaskId: null,
    sourceTurnId: null,
    confidence: PROJECT_MEMORY_EXPLICIT_CONFIDENCE,
    createdAt: Date.now() - 86_400_000 * 12,
    updatedAt: Date.now() - 86_400_000 * 12,
    lastConfirmedAt: Date.now() - 3_600_000,
    deletedAt: null,
  },
  {
    id: "mem-contextual",
    projectPath: "/tmp/stave-project",
    kind: "decision",
    recallMode: "contextual",
    content:
      "Author styles with stylex.create and compose before compiling. No Tailwind utility strings, no @apply, no CVA recipes anywhere under src/components/ui.",
    sourceTaskId: null,
    sourceTurnId: null,
    confidence: PROJECT_MEMORY_EXPLICIT_CONFIDENCE,
    createdAt: Date.now() - 86_400_000 * 4,
    updatedAt: Date.now() - 86_400_000 * 4,
    lastConfirmedAt: Date.now() - 86_400_000,
    deletedAt: null,
  },
  {
    id: "mem-candidate",
    projectPath: "/tmp/stave-project",
    kind: "gotcha",
    recallMode: "candidate",
    content:
      "The renderer's provider event schema and the main process copy have to move together.",
    sourceTaskId: "10d53a9c",
    sourceTurnId: "turn-1",
    confidence: PROJECT_MEMORY_AUTO_CONFIDENCE,
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

  api.projectMemory = {
    list: async () => ({ ok: true, items: memories }),
    update: async (patch: {
      id: string;
      content: string;
      kind: ProjectMemory["kind"];
      recallMode: ProjectMemory["recallMode"];
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
    getSettings: async () => ({ ok: true, settings: null }),
  };

  (window as unknown as { api?: unknown }).api = api;
}
