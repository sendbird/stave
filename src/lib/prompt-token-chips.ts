import type { CommandPaletteItem } from "@/lib/commands";
import type { SkillCatalogEntry } from "@/lib/skills/types";
import {
  getWorkspaceInformationReferenceLabel,
  resolveWorkspaceInformationReferenceFromToken,
  type WorkspaceInformationReference,
  type WorkspaceInformationReferenceOption,
} from "@/lib/workspace-information-references";

export type PromptTokenKind = "command" | "skill" | "information";

export interface PromptTokenDescriptor {
  kind: PromptTokenKind;
  token: string;
  label: string;
  detail?: string;
  informationReference?: WorkspaceInformationReference;
}

export type PromptTokenSegment =
  | { type: "text"; text: string }
  | { type: "token"; descriptor: PromptTokenDescriptor };

export interface PromptTokenParseOptions {
  commandPaletteItems?: readonly CommandPaletteItem[];
  skillPaletteItems?: readonly SkillCatalogEntry[];
  workspaceInformationReferenceOptions?: readonly WorkspaceInformationReferenceOption[];
  allowGenericCommandTokens?: boolean;
  allowGenericSkillTokens?: boolean;
}

const COMMAND_TOKEN_PATTERN = /^\/[A-Za-z0-9:._-]+/;
const SKILL_TOKEN_PATTERN = /^\$[A-Za-z0-9._-]+/;
const INFORMATION_TOKEN_PATTERN =
  /^@(?:info(?::[^\s.,;!?)]*)?|lens(?![A-Za-z0-9_-]))/i;

function isTokenBoundaryBefore(text: string, index: number) {
  if (index === 0) {
    return true;
  }
  return /\s|\(/.test(text[index - 1] ?? "");
}

function buildCommandMap(items: readonly CommandPaletteItem[] | undefined) {
  return new Map((items ?? []).map((item) => [item.command.toLowerCase(), item]));
}

function buildSkillMap(items: readonly SkillCatalogEntry[] | undefined) {
  return new Map((items ?? []).map((item) => [item.slug.toLowerCase(), item]));
}

function buildInformationMap(
  items: readonly WorkspaceInformationReferenceOption[] | undefined,
) {
  return new Map(
    (items ?? []).map((item) => [
      item.reference.token.toLowerCase(),
      item,
    ]),
  );
}

function resolveCommandDescriptor(args: {
  token: string;
  commandMap: Map<string, CommandPaletteItem>;
  allowGeneric: boolean;
  genericAtLineStart: boolean;
}): PromptTokenDescriptor | null {
  const item = args.commandMap.get(args.token.toLowerCase());
  if (item) {
    return {
      kind: "command",
      token: item.command,
      label: item.command,
      detail: item.description,
    };
  }
  if (
    !args.allowGeneric ||
    !args.genericAtLineStart ||
    !/[A-Za-z]/.test(args.token)
  ) {
    return null;
  }
  return {
    kind: "command",
    token: args.token,
    label: args.token,
  };
}

function resolveSkillDescriptor(args: {
  token: string;
  skillMap: Map<string, SkillCatalogEntry>;
  allowGeneric: boolean;
}): PromptTokenDescriptor | null {
  const slug = args.token.slice(1);
  const item = args.skillMap.get(slug.toLowerCase());
  if (item) {
    return {
      kind: "skill",
      token: `$${item.slug}`,
      label: item.name || item.slug,
      detail: `$${item.slug}`,
    };
  }
  if (!args.allowGeneric || !/[A-Za-z_-]/.test(slug)) {
    return null;
  }
  return {
    kind: "skill",
    token: args.token,
    label: args.token,
  };
}

function resolveInformationDescriptor(args: {
  token: string;
  informationMap: Map<string, WorkspaceInformationReferenceOption>;
}): PromptTokenDescriptor | null {
  const option = args.informationMap.get(args.token.toLowerCase());
  const reference =
    option?.reference ?? resolveWorkspaceInformationReferenceFromToken(args.token);
  if (!reference) {
    return null;
  }
  return {
    kind: "information",
    token: reference.token,
    label: getWorkspaceInformationReferenceLabel(reference),
    detail:
      reference.section === "lens"
        ? "Lens browser"
        : reference.scope === "section"
          ? "Information section"
          : "Information item",
    informationReference: reference,
  };
}

function resolveDescriptorAt(args: {
  text: string;
  index: number;
  commandMap: Map<string, CommandPaletteItem>;
  skillMap: Map<string, SkillCatalogEntry>;
  informationMap: Map<string, WorkspaceInformationReferenceOption>;
  options: PromptTokenParseOptions;
}): { descriptor: PromptTokenDescriptor; end: number } | null {
  const slice = args.text.slice(args.index);
  const first = slice[0];

  if (first === "/") {
    const token = slice.match(COMMAND_TOKEN_PATTERN)?.[0];
    const descriptor = token
      ? resolveCommandDescriptor({
          token,
          commandMap: args.commandMap,
          allowGeneric: Boolean(args.options.allowGenericCommandTokens),
          genericAtLineStart:
            args.index === 0 || args.text[args.index - 1] === "\n",
        })
      : null;
    return descriptor ? { descriptor, end: args.index + token!.length } : null;
  }

  if (first === "$") {
    const token = slice.match(SKILL_TOKEN_PATTERN)?.[0];
    const descriptor = token
      ? resolveSkillDescriptor({
          token,
          skillMap: args.skillMap,
          allowGeneric: Boolean(args.options.allowGenericSkillTokens),
        })
      : null;
    return descriptor ? { descriptor, end: args.index + token!.length } : null;
  }

  if (first === "@") {
    const token = slice.match(INFORMATION_TOKEN_PATTERN)?.[0];
    const descriptor = token
      ? resolveInformationDescriptor({
          token,
          informationMap: args.informationMap,
        })
      : null;
    return descriptor ? { descriptor, end: args.index + token!.length } : null;
  }

  return null;
}

export function parsePromptTokenSegments(
  text: string,
  options: PromptTokenParseOptions = {},
): PromptTokenSegment[] {
  if (!text) {
    return [];
  }

  const commandMap = buildCommandMap(options.commandPaletteItems);
  const skillMap = buildSkillMap(options.skillPaletteItems);
  const informationMap = buildInformationMap(
    options.workspaceInformationReferenceOptions,
  );
  const segments: PromptTokenSegment[] = [];
  let textStart = 0;
  let index = 0;

  while (index < text.length) {
    const char = text[index];
    if (
      (char === "/" || char === "$" || char === "@") &&
      isTokenBoundaryBefore(text, index)
    ) {
      const resolved = resolveDescriptorAt({
        text,
        index,
        commandMap,
        skillMap,
        informationMap,
        options,
      });
      if (resolved) {
        if (textStart < index) {
          segments.push({ type: "text", text: text.slice(textStart, index) });
        }
        segments.push({ type: "token", descriptor: resolved.descriptor });
        index = resolved.end;
        textStart = index;
        continue;
      }
    }
    index += 1;
  }

  if (textStart < text.length) {
    segments.push({ type: "text", text: text.slice(textStart) });
  }

  return segments;
}

export function getPromptTokenSegmentSignature(
  segments: readonly PromptTokenSegment[],
) {
  return segments
    .filter((segment): segment is Extract<PromptTokenSegment, { type: "token" }> =>
      segment.type === "token",
    )
    .map(
      (segment) =>
        `${segment.descriptor.kind}:${segment.descriptor.token}:${segment.descriptor.label}`,
    )
    .join("|");
}
