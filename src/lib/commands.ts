import type { ProviderId } from "@/lib/providers/provider.types";
import type {
  ProviderCommandCatalogState,
  ProviderSlashCommand,
} from "@/lib/providers/provider-command-catalog";
import {
  getProviderLabel,
  providerSupportsNativeCommandCatalog,
} from "@/lib/providers/model-catalog";

export interface CommandContext {
  provider: ProviderId;
}

export interface CommandPaletteItem {
  id: string;
  command: string;
  insertText: string;
  description: string;
  source: "stave_builtin" | "stave_custom" | "provider_native";
  searchText: string;
}

export interface CommandPaletteProviderNote {
  title: string;
  description: string;
}

export type CommandResult =
  | { kind: "not-command" }
  | { kind: "provider-passthrough"; command: string; rawArgs: string };

export interface SlashCommandTokenMatch {
  start: number;
  end: number;
  query: string;
  token: string;
}

interface ParsedSlashCommand {
  command: string;
  rawArgs: string;
}

const SLASH_COMMAND_QUERY_PATTERN = /(^|[\s(])(\/[A-Za-z0-9:._-]*)$/;

function parseSlashCommand(input: string): ParsedSlashCommand | null {
  const trimmed = input.trim();
  if (!trimmed.startsWith("/")) {
    return null;
  }

  const parts = trimmed.split(/\s+/);
  const command = (parts[0] ?? "").toLowerCase();
  const rawArgs = parts.slice(1).join(" ").trim();
  if (!command) {
    return null;
  }

  return { command, rawArgs };
}

function toCommandSearchText(args: { command: string; description: string }) {
  return [
    args.command,
    args.command.replace(/^\//, ""),
    args.command.replace(/^\//, "").replaceAll(":", " "),
    args.description,
  ]
    .join(" ")
    .toLowerCase();
}

function buildProviderPassthroughNote(provider: ProviderId) {
  const providerLabel = getProviderLabel({ providerId: provider });
  if (provider === "stave") {
    return [
      "Stave Auto does not expose provider-native slash commands.",
      "Switch to Claude Code or Codex directly if you want slash-command passthrough behavior.",
    ].join("\n");
  }
  if (provider === "codex") {
    return [
      "Stave shows a bundled Codex slash-command reference in the popup.",
      "Commands are still forwarded to Codex unchanged at send time, so unlisted commands can still work.",
    ].join("\n");
  }
  if (!providerSupportsNativeCommandCatalog({ providerId: provider })) {
    return [
      `${providerLabel} does not expose a native slash-command catalog through the current SDK/CLI APIs.`,
      `Stave forwards slash commands to ${providerLabel} unchanged.`,
    ].join("\n");
  }
  return [
    `Stave forwards slash commands to ${providerLabel} unchanged.`,
    `${providerLabel} commands that are not listed in the current SDK catalog can still be valid and are not blocked locally.`,
  ].join("\n");
}

function buildProviderPaletteNote(args: {
  provider: ProviderId;
  providerCommandCatalog?: ProviderCommandCatalogState;
}): CommandPaletteProviderNote {
  const providerLabel = getProviderLabel({ providerId: args.provider });
  if (!providerSupportsNativeCommandCatalog({ providerId: args.provider })) {
    return {
      title: `${providerLabel} passthrough`,
      description: buildProviderPassthroughNote(args.provider),
    };
  }

  const catalog = args.providerCommandCatalog;
  const catalogTitle =
    args.provider === "codex"
      ? `${providerLabel} slash commands`
      : `${providerLabel} command catalog`;
  const readyTitle =
    args.provider === "codex"
      ? `${providerLabel} slash commands`
      : `${providerLabel} native commands`;
  if (!catalog || catalog.status === "idle") {
    return {
      title: catalogTitle,
      description:
        args.provider === "codex"
          ? `Loading the bundled ${providerLabel} slash-command reference for this workspace.`
          : `${providerLabel} native slash commands have not been loaded yet for this workspace.`,
    };
  }
  if (catalog.status === "loading") {
    return {
      title: catalogTitle,
      description:
        args.provider === "codex"
          ? `Loading the bundled ${providerLabel} slash-command reference for the current workspace...`
          : `Loading ${providerLabel} native slash commands for the current workspace...`,
    };
  }
  if (catalog.status === "error") {
    return {
      title: catalogTitle,
      description: `${catalog.detail}\nSlash commands are still passed through unchanged while the catalog is unavailable.`,
    };
  }
  if (catalog.status === "unsupported") {
    return {
      title: `${providerLabel} passthrough`,
      description: buildProviderPassthroughNote(args.provider),
    };
  }

  return {
    title: readyTitle,
    description: catalog.detail || buildProviderPassthroughNote(args.provider),
  };
}

export function getActiveSlashCommandTokenMatch(args: {
  value: string;
  caretIndex: number;
}): SlashCommandTokenMatch | null {
  const cappedCaretIndex = Math.max(
    0,
    Math.min(args.caretIndex, args.value.length),
  );
  const beforeCaret = args.value.slice(0, cappedCaretIndex);
  const lineStart = Math.max(0, beforeCaret.lastIndexOf("\n") + 1);
  const activeSlice = beforeCaret.slice(lineStart);
  const match = activeSlice.match(SLASH_COMMAND_QUERY_PATTERN);

  if (!match) {
    return null;
  }

  const token = match[2] ?? "";
  if (!token) {
    return null;
  }

  const triggerStart = cappedCaretIndex - token.length;
  const prefixChar =
    triggerStart > 0 ? (args.value[triggerStart - 1] ?? "") : "";
  if (prefixChar && !/\s|\(/.test(prefixChar)) {
    return null;
  }

  return {
    start: triggerStart,
    end: cappedCaretIndex,
    query: token.slice(1),
    token,
  };
}

export function getSlashCommandSearchQuery(input: string) {
  return (
    getActiveSlashCommandTokenMatch({
      value: input,
      caretIndex: input.length,
    })?.token ?? null
  );
}

export function replaceSlashCommandToken(args: {
  value: string;
  match: SlashCommandTokenMatch;
  command: Pick<ProviderSlashCommand, "command">;
}) {
  const nextToken = `${args.command.command} `;
  return `${args.value.slice(0, args.match.start)}${nextToken}${args.value.slice(args.match.end)}`;
}

export function buildCommandPaletteItems(args: {
  provider: ProviderId;
  providerCommandCatalog?: ProviderCommandCatalogState;
}) {
  const items: CommandPaletteItem[] = [];

  if (
    providerSupportsNativeCommandCatalog({ providerId: args.provider }) &&
    args.providerCommandCatalog?.status === "ready"
  ) {
    args.providerCommandCatalog.commands
      .slice()
      .sort((left, right) => left.command.localeCompare(right.command))
      .forEach((command) => {
        items.push({
          id: `provider:${command.command}`,
          command: command.command,
          insertText: `${command.command} `,
          description: command.argumentHint
            ? `${command.description} ${command.argumentHint}`.trim()
            : command.description,
          source: "provider_native",
          searchText: toCommandSearchText({
            command: command.command,
            description: [command.description, command.argumentHint]
              .filter(Boolean)
              .join(" "),
          }),
        });
      });
  }

  return {
    items,
    providerNote: buildProviderPaletteNote({
      provider: args.provider,
      providerCommandCatalog: args.providerCommandCatalog,
    }),
  };
}

export function filterCommandPaletteItems(args: {
  items: readonly CommandPaletteItem[];
  query: string | null;
}) {
  const normalized = (args.query ?? "")
    .trim()
    .toLowerCase()
    .replace(/^\//, "")
    .trim();

  if (!normalized) {
    return args.items;
  }

  return args.items.filter((item) => {
    const commandWithoutPrefix = item.command.replace(/^\//, "");
    return (
      item.searchText.includes(normalized) ||
      commandWithoutPrefix.includes(normalized)
    );
  });
}

export function resolveCommandInput(
  input: string,
  _ctx: CommandContext,
): CommandResult {
  const parsed = parseSlashCommand(input);
  if (!parsed) {
    return { kind: "not-command" };
  }

  return {
    kind: "provider-passthrough",
    command: parsed.command,
    rawArgs: parsed.rawArgs,
  };
}
