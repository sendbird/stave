import {
  getDefaultModelForProvider,
  toHumanModelName,
} from "@/lib/providers/model-catalog";
import type {
  ManagedExecutionProviderId,
  ProviderId,
} from "@/lib/providers/provider.types";
import { generateMacroId } from "./normalize";
import type { Macro } from "./types";

export interface MacroModelOption {
  key: string;
  providerId: ProviderId;
  model: string;
  label: string;
  available: boolean;
  isAuto?: boolean;
  isDefault?: boolean;
}

export function createEmptyMacroDraft(args: { body?: string } = {}): Macro {
  const now = new Date().toISOString();
  return {
    id: generateMacroId(),
    label: "",
    slug: "",
    body: args.body ?? "",
    insertMode: "replace",
    createdAt: now,
    updatedAt: now,
  };
}

export function listMacroModelOptions<T extends MacroModelOption>(args: {
  options: readonly T[];
  providerId: ManagedExecutionProviderId;
}): T[] {
  return args.options.filter(
    (option) =>
      option.providerId === args.providerId &&
      !option.isAuto &&
      option.model.trim().length > 0,
  );
}

export function resolveMacroModelForProvider(args: {
  options: readonly MacroModelOption[];
  providerId: ManagedExecutionProviderId;
  currentModel?: string;
}): string {
  const options = listMacroModelOptions(args);
  const currentModel = args.currentModel?.trim();
  if (
    currentModel &&
    options.some((option) => option.model === currentModel)
  ) {
    return currentModel;
  }

  const providerDefault = getDefaultModelForProvider({
    providerId: args.providerId,
  });
  return (
    options.find((option) => option.isDefault)?.model ??
    options.find((option) => option.model === providerDefault)?.model ??
    options[0]?.model ??
    providerDefault
  );
}

export function createUnlistedMacroModelOption(args: {
  providerId: ManagedExecutionProviderId;
  model: string;
}): MacroModelOption {
  return {
    key: `${args.providerId}:${args.model}`,
    providerId: args.providerId,
    model: args.model,
    label: toHumanModelName({ model: args.model }),
    available: true,
  };
}
