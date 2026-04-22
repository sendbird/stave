import {
  getProviderLabel,
  listProviderIds,
  toHumanModelName,
} from "@/lib/providers/model-catalog";
import type { ProviderId } from "@/lib/providers/provider.types";

export const MODEL_SHORTCUT_SLOT_LABELS = [
  "1",
  "2",
  "3",
  "4",
  "5",
  "6",
  "7",
  "8",
  "9",
  "0",
] as const;

export const DEFAULT_MODEL_SHORTCUT_KEYS = [
  "claude-code:claude-opus-4-7",
  "codex:gpt-5.4",
  "stave:stave-auto",
  "",
  "",
  "",
  "",
  "",
  "",
  "",
] as const;

const PROVIDER_ID_SET = new Set(listProviderIds());

export function normalizeModelShortcutKeys(
  value?: readonly unknown[] | null,
): string[] {
  return MODEL_SHORTCUT_SLOT_LABELS.map((_, index) => {
    const entry = value?.[index];
    if (typeof entry === "string") {
      return entry.trim();
    }
    return DEFAULT_MODEL_SHORTCUT_KEYS[index] ?? "";
  });
}

export function resolveModelShortcutSlot(args: {
  key: string;
  code?: string;
  altKey?: boolean;
  ctrlKey?: boolean;
  metaKey?: boolean;
  shiftKey?: boolean;
}): number | null {
  if (!args.altKey || args.ctrlKey || args.metaKey || args.shiftKey) {
    return null;
  }

  if (typeof args.code === "string") {
    const digitMatch = args.code.match(/^Digit([0-9])$/);
    if (digitMatch) {
      const digit = digitMatch[1] ?? "";
      return digit === "0" ? 9 : Number.parseInt(digit, 10) - 1;
    }
  }

  if (args.key === "0") {
    return 9;
  }
  if (/^[1-9]$/.test(args.key)) {
    return Number.parseInt(args.key, 10) - 1;
  }

  return null;
}

export function parseModelShortcutKey(args: { shortcutKey: string }): {
  key: string;
  providerId: ProviderId;
  model: string;
} | null {
  const trimmed = args.shortcutKey.trim();
  if (!trimmed) {
    return null;
  }

  const delimiterIndex = trimmed.indexOf(":");
  if (delimiterIndex <= 0 || delimiterIndex >= trimmed.length - 1) {
    return null;
  }

  const providerId = trimmed.slice(0, delimiterIndex);
  const model = trimmed.slice(delimiterIndex + 1).trim();
  if (!PROVIDER_ID_SET.has(providerId as ProviderId) || !model) {
    return null;
  }

  return {
    key: trimmed,
    providerId: providerId as ProviderId,
    model,
  };
}

export function describeModelShortcutKey(args: { shortcutKey: string }) {
  const parsed = parseModelShortcutKey(args);
  if (!parsed) {
    return null;
  }

  const providerLabel = getProviderLabel({
    providerId: parsed.providerId,
    variant: "full",
  });
  const modelLabel = toHumanModelName({ model: parsed.model });

  return {
    ...parsed,
    providerLabel,
    modelLabel,
    fullLabel: `${providerLabel} · ${modelLabel}`,
  };
}

export function findModelShortcutOption<
  T extends {
    key: string;
    available?: boolean;
  },
>(args: {
  slotIndex: number;
  shortcutKeys?: readonly string[] | null;
  options: readonly T[];
  requireAvailable?: boolean;
}): T | null {
  const shortcutKey =
    normalizeModelShortcutKeys(args.shortcutKeys)[args.slotIndex] ?? "";
  if (!shortcutKey) {
    return null;
  }

  const option =
    args.options.find((candidate) => candidate.key === shortcutKey) ?? null;
  if (!option) {
    return null;
  }

  if (args.requireAvailable !== false && option.available === false) {
    return null;
  }

  return option;
}
