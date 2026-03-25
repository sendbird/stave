import type { ProviderId } from "@/lib/providers/provider.types";

const CLAUDE_COLOR_ICON_URL = `${import.meta.env.BASE_URL}claude-color.svg`;
const CODEX_COLOR_ICON_URL = `${import.meta.env.BASE_URL}codex-color.svg`;
const STAVE_LOGO_DARK_ICON_URL = `${import.meta.env.BASE_URL}stave-logo-dark.svg`;
const STAVE_LOGO_LIGHT_ICON_URL = `${import.meta.env.BASE_URL}stave-logo-light.svg`;

// Source: https://platform.claude.com/docs/en/about-claude/models/overview
// Latest models comparison (as of 2026-03-06)
export const CLAUDE_SDK_MODEL_OPTIONS = [
  "claude-opus-4-6",
  "opusplan",
  "claude-sonnet-4-6",
  "claude-haiku-4-5",
] as const;

// Source:
// - @openai/codex-sdk/dist/index.d.ts (ThreadOptions.model?: string)
// - https://developers.openai.com/api/docs/models/gpt-5.4
// - https://developers.openai.com/api/docs/models/gpt-5.3-codex
export const CODEX_SDK_MODEL_OPTIONS = [
  "gpt-5.4",
  "gpt-5.3-codex",
] as const;

// Stave meta-provider: a single "Auto" pseudo-model that the router replaces
// at runtime with the best matching real model for each prompt.
export const STAVE_META_MODEL_OPTIONS = [
  "stave-auto",
] as const;

export interface ProviderDescriptor {
  id: ProviderId;
  label: string;
  shortLabel: string;
  iconUrl: string;
  fallbackLabel: string;
  models: readonly string[];
  defaultModel: string;
  conversationLabel: string;
  capabilities: {
    nativeCommandCatalog: boolean;
  };
}

export const PROVIDER_DESCRIPTORS = [
  {
    id: "claude-code",
    label: "Claude Code",
    shortLabel: "Claude",
    iconUrl: CLAUDE_COLOR_ICON_URL,
    fallbackLabel: "C",
    models: CLAUDE_SDK_MODEL_OPTIONS,
    defaultModel: "claude-sonnet-4-6",
    conversationLabel: "Claude session ID",
    capabilities: {
      nativeCommandCatalog: true,
    },
  },
  {
    id: "codex",
    label: "Codex",
    shortLabel: "Codex",
    iconUrl: CODEX_COLOR_ICON_URL,
    fallbackLabel: "O",
    models: CODEX_SDK_MODEL_OPTIONS,
    defaultModel: "gpt-5.4",
    conversationLabel: "Codex thread ID",
    capabilities: {
      nativeCommandCatalog: false,
    },
  },
  {
    // Stave meta-provider: analyses each prompt and automatically routes to
    // the best underlying provider+model (claude-code or codex).
    id: "stave",
    label: "Stave",
    shortLabel: "Stave",
    iconUrl: STAVE_LOGO_DARK_ICON_URL,
    fallbackLabel: "S",
    models: STAVE_META_MODEL_OPTIONS,
    defaultModel: "stave-auto",
    conversationLabel: "Stave router",
    capabilities: {
      nativeCommandCatalog: false,
    },
  },
] as const satisfies readonly ProviderDescriptor[];

export function listProviderDescriptors() {
  return [...PROVIDER_DESCRIPTORS];
}

export function listProviderIds(): ProviderId[] {
  return PROVIDER_DESCRIPTORS.map((descriptor) => descriptor.id);
}

export function getProviderDescriptor(args: { providerId: ProviderId }) {
  const descriptor = PROVIDER_DESCRIPTORS.find((candidate) => candidate.id === args.providerId);
  if (!descriptor) {
    throw new Error(`Unknown provider descriptor: ${args.providerId}`);
  }
  return descriptor;
}

export function getProviderLabel(args: {
  providerId: ProviderId;
  variant?: "short" | "full";
}) {
  const descriptor = getProviderDescriptor(args);
  return args.variant === "full" ? descriptor.label : descriptor.shortLabel;
}

export function getProviderIconUrl(args: { providerId: ProviderId; isDarkMode?: boolean }) {
  if (args.providerId === "stave") {
    return args.isDarkMode ? STAVE_LOGO_LIGHT_ICON_URL : STAVE_LOGO_DARK_ICON_URL;
  }
  return getProviderDescriptor({ providerId: args.providerId }).iconUrl;
}

export function getProviderFallbackLabel(args: { providerId: ProviderId }) {
  return getProviderDescriptor(args).fallbackLabel;
}

export function getProviderConversationLabel(args: { providerId: ProviderId }) {
  return getProviderDescriptor(args).conversationLabel;
}

export function providerSupportsNativeCommandCatalog(args: { providerId: ProviderId }) {
  return getProviderDescriptor(args).capabilities.nativeCommandCatalog;
}

export function getDefaultModelForProvider(args: { providerId: ProviderId }) {
  return getProviderDescriptor(args).defaultModel;
}

export function getNextProviderId(args: { providerId: ProviderId }) {
  const providerIds = listProviderIds();
  const currentIndex = providerIds.indexOf(args.providerId);
  if (currentIndex < 0) {
    return providerIds[0] ?? args.providerId;
  }
  return providerIds[(currentIndex + 1) % providerIds.length] ?? args.providerId;
}

export function getSdkModelOptions(args: { providerId: ProviderId }) {
  return getProviderDescriptor(args).models;
}

export function normalizeModelSelection(args: { value: string; fallback: string }) {
  const trimmed = args.value.trim();
  if (trimmed.length === 0) {
    return args.fallback;
  }
  return trimmed;
}

export function toHumanModelName(args: { model: string }) {
  const known: Record<string, string> = {
    "claude-opus-4-6": "Claude Opus 4.6",
    "opusplan": "Claude Opus Plan",
    "claude-sonnet-4-6": "Claude Sonnet 4.6",
    "claude-haiku-4-5": "Claude Haiku 4.5",
    "gpt-5.4": "GPT-5.4",
    "gpt-5-codex": "GPT-5-Codex",
    "gpt-5.3-codex": "GPT-5.3-Codex",
    "stave-auto": "Stave Auto",
  };
  const exact = known[args.model];
  if (exact) {
    return exact;
  }

  return args.model
    .split("-")
    .map((chunk) => {
      if (/^\d+(\.\d+)?$/.test(chunk)) {
        return chunk;
      }
      if (chunk.length <= 3) {
        return chunk.toUpperCase();
      }
      return `${chunk.slice(0, 1).toUpperCase()}${chunk.slice(1)}`;
    })
    .join(" ");
}
