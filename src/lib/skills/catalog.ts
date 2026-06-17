import type { ProviderId } from "@/lib/providers/provider.types";
import type {
  ResolvedSkillSelection,
  SkillCatalogEntry,
  SkillCatalogProvider,
  SkillPromptContext,
  SkillTokenMatch,
} from "./types";

const SKILL_SCOPE_PRIORITY = {
  local: 3,
  user: 2,
  global: 1,
} as const;

const SKILL_PROVIDER_PRIORITY = {
  "claude-code": 2,
  codex: 2,
  shared: 1,
} as const;

const SKILL_QUERY_PATTERN = /\$([A-Za-z0-9._-]*)$/;
const SKILL_TOKEN_PATTERN = /(^|[\s(])\$([A-Za-z0-9._-]+)/g;

function isSkillCompatible(args: {
  providerId: ProviderId;
  skillProvider: SkillCatalogProvider;
}) {
  return args.skillProvider === "shared" || args.skillProvider === args.providerId;
}

function compareSkillEntryPriority(left: SkillCatalogEntry, right: SkillCatalogEntry) {
  const scopeDelta = SKILL_SCOPE_PRIORITY[right.scope] - SKILL_SCOPE_PRIORITY[left.scope];
  if (scopeDelta !== 0) {
    return scopeDelta;
  }
  const providerDelta = SKILL_PROVIDER_PRIORITY[right.provider] - SKILL_PROVIDER_PRIORITY[left.provider];
  if (providerDelta !== 0) {
    return providerDelta;
  }
  return left.slug.localeCompare(right.slug);
}

export function getCompatibleSkillEntries(args: {
  skills: readonly SkillCatalogEntry[];
  providerId: ProviderId;
}) {
  return args.skills.filter((skill) => isSkillCompatible({
    providerId: args.providerId,
    skillProvider: skill.provider,
  }));
}

export function getEffectiveSkillEntries(args: {
  skills: readonly SkillCatalogEntry[];
  providerId: ProviderId;
}) {
  const compatibleSkills = getCompatibleSkillEntries(args);
  const bestBySlug = new Map<string, SkillCatalogEntry>();

  for (const skill of compatibleSkills) {
    const existing = bestBySlug.get(skill.slug);
    if (!existing || compareSkillEntryPriority(existing, skill) > 0) {
      bestBySlug.set(skill.slug, skill);
    }
  }

  return Array.from(bestBySlug.values()).sort((left, right) => {
    const priority = compareSkillEntryPriority(left, right);
    if (priority !== 0) {
      return priority;
    }
    return left.name.localeCompare(right.name);
  });
}

export function filterSkillEntries(args: {
  skills: readonly SkillCatalogEntry[];
  providerId: ProviderId;
  query: string;
}) {
  const normalizedQuery = args.query.trim().toLowerCase();
  const effectiveSkills = getEffectiveSkillEntries({
    skills: args.skills,
    providerId: args.providerId,
  });

  if (!normalizedQuery) {
    return effectiveSkills;
  }

  return effectiveSkills.filter((skill) => {
    const haystacks = [
      skill.slug,
      skill.name,
      skill.description,
      skill.scope,
      skill.provider,
    ];
    return haystacks.some((value) => value.toLowerCase().includes(normalizedQuery));
  });
}

export function getActiveSkillTokenMatch(args: {
  value: string;
  caretIndex: number;
}): SkillTokenMatch | null {
  const cappedCaretIndex = Math.max(0, Math.min(args.caretIndex, args.value.length));
  const beforeCaret = args.value.slice(0, cappedCaretIndex);
  const lineStart = Math.max(0, beforeCaret.lastIndexOf("\n") + 1);
  const activeSlice = beforeCaret.slice(lineStart);
  const match = activeSlice.match(SKILL_QUERY_PATTERN);

  if (!match) {
    return null;
  }

  const triggerStart = cappedCaretIndex - match[0].length;
  const prefixChar = triggerStart > 0 ? args.value[triggerStart - 1] ?? "" : "";
  if (prefixChar && !/\s|\(/.test(prefixChar)) {
    return null;
  }

  return {
    start: triggerStart,
    end: cappedCaretIndex,
    query: match[1] ?? "",
    token: match[0],
  };
}

export function replaceSkillToken(args: {
  value: string;
  match: SkillTokenMatch;
  skill: Pick<SkillCatalogEntry, "slug">;
}) {
  const nextToken = `$${args.skill.slug} `;
  return `${args.value.slice(0, args.match.start)}${nextToken}${args.value.slice(args.match.end)}`;
}

function collapseSkillWhitespace(value: string) {
  return value
    .split("\n")
    .map((line) => line.replace(/[ \t]{2,}/g, " ").trimEnd())
    .join("\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

function toSkillPromptContext(skill: SkillCatalogEntry): SkillPromptContext {
  return {
    id: skill.id,
    slug: skill.slug,
    name: skill.name,
    description: skill.description,
    scope: skill.scope,
    provider: skill.provider,
    path: skill.path,
    invocationToken: skill.invocationToken,
    instructions: skill.instructions,
  };
}

export function resolveSkillSelections(args: {
  text: string;
  skills: readonly SkillCatalogEntry[];
  providerId: ProviderId;
}): ResolvedSkillSelection {
  const effectiveSkills = getEffectiveSkillEntries({
    skills: args.skills,
    providerId: args.providerId,
  });
  const skillBySlug = new Map(effectiveSkills.map((skill) => [skill.slug.toLowerCase(), skill]));
  const selectedSkills = new Map<string, SkillPromptContext>();
  let normalizedText = "";
  let lastIndex = 0;
  let match: RegExpExecArray | null;
  const matcher = new RegExp(SKILL_TOKEN_PATTERN);

  while ((match = matcher.exec(args.text)) !== null) {
    const fullMatch = match[0] ?? "";
    const boundary = match[1] ?? "";
    const slug = match[2] ?? "";
    const tokenStart = match.index + boundary.length;
    const tokenEnd = tokenStart + slug.length + 1;
    const resolvedSkill = skillBySlug.get(slug.toLowerCase());

    if (!resolvedSkill) {
      continue;
    }

    normalizedText += args.text.slice(lastIndex, match.index);
    normalizedText += boundary;
    lastIndex = tokenEnd;

    if (!selectedSkills.has(resolvedSkill.id)) {
      selectedSkills.set(resolvedSkill.id, toSkillPromptContext(resolvedSkill));
    }
  }

  normalizedText += args.text.slice(lastIndex);

  return {
    selectedSkills: Array.from(selectedSkills.values()),
    normalizedText: collapseSkillWhitespace(normalizedText),
  };
}
