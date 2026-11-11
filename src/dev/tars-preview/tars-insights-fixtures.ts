import type { RepositoryMemory, RepositoryMemorySourceTask } from "@/lib/repository-memory";
import type { RecentRepositoryState } from "@/store/repository.utils";
import type { TarsBridgeApi, TarsResponsibility } from "@/lib/tars/types";
import { aggregateTarsUsage, type TarsUsageTurn } from "@/lib/tars/usage";

const MINUTE = 60_000;
const DAY = 86_400_000;

type MemoryBridge = NonNullable<NonNullable<Window["api"]>["repositoryMemory"]>;

/**
 * `insights=true`: what the "What Tars knows" and "Usage" views read, with no
 * provider or host. Usage is the real aggregation over fixture turns placed
 * relative to now, so Today, 7 days and 30 days show different figures:
 * Codex turns report tokens only, Claude turns also report a cost, and one
 * turn reports nothing. Memories live in memory for the page's life; editing
 * and forgetting go through the same bridge shape the desktop exposes.
 */
export function buildTarsInsightsFixtures(args: { now: Date; korean: boolean; responsibilities: readonly TarsResponsibility[] }) {
  const { korean } = args;
  const nowMs = args.now.getTime();
  const works = args.responsibilities.filter((row) => row.taskId);
  const turn = (work: TarsResponsibility, agoMs: number, minutes: number, providerId: "codex" | "claude-code", modelId: string, usage: TarsUsageTurn["usage"]): TarsUsageTurn => ({
    responsibilityId: work.id, providerId, modelId, createdAt: new Date(nowMs - agoMs).toISOString(),
    completedAt: new Date(nowMs - agoMs + minutes * MINUTE).toISOString(), usage,
  });
  const turns: TarsUsageTurn[] = [];
  works.forEach((work, index) => {
    // Recent Codex turns: tokens, never a cost.
    turns.push(turn(work, (index + 1) * 20 * MINUTE, 6 + index, "codex", "gpt-5.5-codex", { inputTokens: 240_000 + index * 60_000, outputTokens: 9_000 + index * 2_000, cacheReadTokens: 180_000 }));
    turns.push(turn(work, 2 * DAY + index * 40 * MINUTE, 11, "codex", "gpt-5.5-codex", { inputTokens: 410_000, outputTokens: 14_000, cacheReadTokens: 300_000 }));
    // An older Claude turn: tokens and a reported cost.
    if (index % 2 === 0) turns.push(turn(work, 12 * DAY + index * MINUTE, 9, "claude-code", "claude-sonnet-5-5", { inputTokens: 3_200, outputTokens: 5_400, cacheCreationTokens: 48_000, cacheReadTokens: 620_000, totalCostUsd: 0.86 + index * 0.31 }));
  });
  // One turn whose provider reported nothing: counted as a turn with time, no tokens.
  if (works[0]) turns.push(turn(works[0], 3 * DAY, 2, "codex", "gpt-5.5-codex", null));
  const replies = [5 * MINUTE, 50 * MINUTE, 3 * DAY, 4 * DAY, 15 * DAY, 20 * DAY].map((ago) => new Date(nowMs - ago).toISOString());
  const getUsage: NonNullable<TarsBridgeApi["getUsage"]> = async (period) => aggregateTarsUsage({ period, works, turns, replies, generatedAt: new Date().toISOString() });

  const repositoryPath = "/tmp/preview";
  const otherPath = "/tmp/preview-docs";
  const repository = (path: string, name: string, rule?: string): RecentRepositoryState => ({
    repositoryPath: path, repositoryName: name, lastOpenedAt: args.now.toISOString(), defaultBranch: "main", workspaces: [], activeWorkspaceId: "",
    workspaceBranchById: {}, workspacePathById: {}, workspaceDefaultById: {}, ...(rule ? { kickoffBranchNamingRule: rule } : {}),
  });
  const repositories = [
    repository(repositoryPath, "preview", korean ? "feat/, fix/, chore/ 중 하나로 시작하고 Jira 키가 있으면 뒤에 붙입니다." : "Start with feat/, fix/ or chore/ and append the Jira key when there is one."),
    repository(otherPath, "preview-docs"),
  ];
  const memory = (id: string, path: string, kind: RepositoryMemory["kind"], recallMode: RepositoryMemory["recallMode"], content: string, daysAgo: number, sourceTaskId: string | null = null): RepositoryMemory => ({
    id, repositoryPath: path, kind, recallMode, content, sourceTaskId, sourceTurnId: null, confidence: recallMode === "candidate" ? 0.6 : 0.9,
    createdAt: nowMs - (daysAgo + 3) * DAY, lastConfirmedAt: nowMs - daysAgo * DAY, updatedAt: nowMs - daysAgo * DAY, deletedAt: null,
  });
  let memories: RepositoryMemory[] = [
    memory("memory-core", repositoryPath, "convention", "core", korean ? "릴리스 브랜치는 직접 푸시하지 않고 항상 PR로 머지합니다." : "Never push to a release branch; always merge through a pull request.", 2),
    memory("memory-billing", repositoryPath, "gotcha", "contextual", korean ? "청구 내보내기 테스트는 빈 목록 픽스처가 없으면 통과한 것처럼 보입니다." : "Billing export tests look green without the empty-list fixture; add it before trusting them.", 5, "task-billing"),
    memory("memory-decision", repositoryPath, "decision", "contextual", korean ? "검색 인덱스는 야간 배치가 아니라 변경 시점에 다시 만듭니다." : "The search index rebuilds on change, not in the nightly batch.", 19),
    memory("memory-candidate", repositoryPath, "fact", "candidate", korean ? "스테이징 인증 키는 분기마다 교체합니다." : "Staging auth keys rotate every quarter.", 1),
  ];
  const sourceTasks: RepositoryMemorySourceTask[] = [{ taskId: "task-billing", workspaceId: "exec-billing", title: korean ? "빈 청구 목록 내보내기 수정" : "Fix the billing export on empty invoice lists" }];
  const forgotten = new Map<string, RepositoryMemory>();
  const repositoryMemory: MemoryBridge = {
    getSettings: async ({ repositoryPath: path }) => ({ ok: true, settings: { useMemory: path !== otherPath, collectAutomatically: false, kinds: ["decision", "convention", "gotcha", "fact"], collectionTemplate: "", revision: 0, resetBefore: 0 } }),
    list: async ({ repositoryPath: path }) => ({ ok: true, items: structuredClone(memories.filter((item) => item.repositoryPath === path)), sourceTasks: path === repositoryPath ? structuredClone(sourceTasks) : [] }),
    update: async (patch) => {
      const current = memories.find((item) => item.id === patch.id && item.repositoryPath === patch.repositoryPath);
      if (!current) return { ok: false, message: "Preview memory not found." };
      const next = { ...current, ...(patch.content ? { content: patch.content } : {}), ...(patch.kind ? { kind: patch.kind } : {}), ...(patch.recallMode ? { recallMode: patch.recallMode } : {}), updatedAt: Date.now(), lastConfirmedAt: Date.now() };
      memories = memories.map((item) => item.id === next.id ? next : item);
      return { ok: true, memory: structuredClone(next) };
    },
    delete: async ({ id }) => {
      const current = memories.find((item) => item.id === id);
      if (current) forgotten.set(id, current);
      memories = memories.filter((item) => item.id !== id);
      return { ok: true, deleted: Boolean(current) };
    },
    restore: async ({ id }) => {
      const current = forgotten.get(id);
      if (!current) return { ok: true, memory: null };
      forgotten.delete(id);
      memories = [...memories, current];
      return { ok: true, memory: structuredClone(current) };
    },
  };
  const instructions = korean
    ? "PR은 항상 초안으로 열고, 머지는 제가 직접 합니다.\n테스트가 실패하면 원인을 먼저 보고하세요.\n한국어로 답하세요."
    : "Open every pull request as a draft; I merge them myself.\nWhen a test fails, report the cause before changing code.\nKeep replies short.";
  return { getUsage, repositories, repositoryMemory, instructions };
}
