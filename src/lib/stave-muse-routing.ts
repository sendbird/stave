export interface StaveMuseRoutingDecision {
  mode: "chat" | "planner" | "handoff";
  reason: string;
}

export const DEFAULT_STAVE_MUSE_ROUTING_DECISION: StaveMuseRoutingDecision = {
  mode: "chat",
  reason: "",
};

const STAVE_MUSE_TASK_REQUEST_PATTERNS = [
  /\b(create|open|new)\s+task\b/i,
  /\btask\s+(open|create|handoff|hand off)\b/i,
  /\bhand\s*off\b/i,
  /새\s*(task|태스크)/i,
  /(task|태스크).*(열|만들|생성|넘겨|handoff)/i,
] as const;

const STAVE_MUSE_PLANNER_PATTERNS = [
  /\b(plan|planning|strategy|design|roadmap|scope|trade-?off)\b/i,
  /(계획|전략|설계|로드맵|범위|트레이드오프|방향)/i,
] as const;

const STAVE_MUSE_CONNECTED_TOOL_PATTERNS = [
  /\b(slack|jira|confluence|figma|github)\b/i,
  /\b(pull request|custom field|information panel|eta)\b/i,
  /https?:\/\/\S+/i,
] as const;

const STAVE_MUSE_REPO_WORK_PATTERNS = [
  /\b(code|repo|repository|file|function|component|database|db|sqlite|schema|migration|terminal|git)\b/i,
  /(코드|리포|레포|파일|함수|컴포넌트|데이터베이스|db|sqlite|스키마|마이그레이션|터미널|깃)/i,
] as const;

const STAVE_MUSE_REPO_INSPECTION_PATTERNS = [
  /\b(inspect|investigate|debug|trace|read|check|look into|examine)\b/i,
  /(살펴|확인|조사|읽어|추적|디버그|들여다)/i,
] as const;

const STAVE_MUSE_IMPLEMENTATION_PATTERNS = [
  /\b(fix|debug|implement|modify|patch|repair|investigate|refactor|rename)\b/i,
  /(고쳐|수정|디버그|구현|패치|조사|리팩터|리네임|버그)/i,
] as const;

const STAVE_MUSE_PRODUCT_SURFACE_PATTERNS = [
  /\b(muse|stave|dropdown|button|panel|sidebar|input|workspace|task|settings)\b/i,
  /(뮤즈|드롭다운|버튼|패널|사이드바|입력|워크스페이스|태스크|설정)/i,
] as const;

function matchesAny(value: string, patterns: readonly RegExp[]) {
  return patterns.some((pattern) => pattern.test(value));
}

export function isStaveMuseExplicitTaskRequest(input: string) {
  return matchesAny(input, STAVE_MUSE_TASK_REQUEST_PATTERNS);
}

export function resolveStaveMuseFastPathDecision(args: {
  input: string;
}): StaveMuseRoutingDecision | null {
  const input = args.input.trim();
  if (!input) {
    return null;
  }

  const requestsTask = isStaveMuseExplicitTaskRequest(input);
  const requestsPlanning = matchesAny(input, STAVE_MUSE_PLANNER_PATTERNS);
  const requestsConnectedTools = matchesAny(input, STAVE_MUSE_CONNECTED_TOOL_PATTERNS);
  const requestsRepoWork = matchesAny(input, STAVE_MUSE_REPO_WORK_PATTERNS);
  const requestsRepoInspection = matchesAny(input, STAVE_MUSE_REPO_INSPECTION_PATTERNS);
  const requestsImplementation = matchesAny(input, STAVE_MUSE_IMPLEMENTATION_PATTERNS);
  const mentionsStaveSurface = matchesAny(input, STAVE_MUSE_PRODUCT_SURFACE_PATTERNS);

  if (requestsTask) {
    return {
      mode: "handoff",
      reason: "explicit task request",
    };
  }

  if (requestsImplementation && mentionsStaveSurface) {
    return {
      mode: "handoff",
      reason: "stave implementation work",
    };
  }

  if (requestsRepoWork && requestsRepoInspection && mentionsStaveSurface) {
    return {
      mode: "handoff",
      reason: "stave repository inspection",
    };
  }

  if (requestsPlanning) {
    return {
      mode: "planner",
      reason: "planning request",
    };
  }

  if (requestsConnectedTools) {
    return {
      mode: "chat",
      reason: "connected tool workflow",
    };
  }

  return null;
}

export function parseStaveMuseRoutingDecision(
  responseText: string,
): StaveMuseRoutingDecision {
  const cleaned = responseText
    .replace(/^```json\s*/i, "")
    .replace(/^```\s*/i, "")
    .replace(/\s*```$/i, "")
    .trim();

  try {
    const parsed = JSON.parse(cleaned) as { mode?: string; reason?: string };
    if (
      parsed.mode === "chat"
      || parsed.mode === "planner"
      || parsed.mode === "handoff"
    ) {
      return {
        mode: parsed.mode,
        reason: typeof parsed.reason === "string" ? parsed.reason : "",
      };
    }
  } catch {
    // Fall through to the safe default.
  }

  return DEFAULT_STAVE_MUSE_ROUTING_DECISION;
}
