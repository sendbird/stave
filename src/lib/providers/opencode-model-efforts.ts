import type { ProviderRuntimeOptions } from "@/lib/providers/provider.types";

export type OpenCodeEffort = NonNullable<ProviderRuntimeOptions["opencodeEffort"]>;

const OPENCODE_EFFORTS: ReadonlySet<string> = new Set<OpenCodeEffort>([
  "minimal",
  "low",
  "medium",
  "high",
  "xhigh",
  "max",
]);

/**
 * OpenCode's effort levels are per-model variants, reported by the model
 * catalog. Stave only sends an effort the selected model is known to offer;
 * for a model with no known variants it sends none, and OpenCode keeps the
 * model's default. Filled from the catalog when it loads.
 */
let supportedEffortsByModel = new Map<string, readonly OpenCodeEffort[]>();

export function isOpenCodeEffort(value: unknown): value is OpenCodeEffort {
  return typeof value === "string" && OPENCODE_EFFORTS.has(value);
}

export function registerOpenCodeModelEfforts(
  entries: Iterable<readonly [string, readonly string[]]>,
) {
  const next = new Map<string, readonly OpenCodeEffort[]>();
  for (const [model, efforts] of entries) {
    const supported = efforts.filter(isOpenCodeEffort);
    if (supported.length > 0) {
      next.set(model, supported);
    }
  }
  supportedEffortsByModel = next;
}

export function listOpenCodeModelEfforts(model: string): readonly OpenCodeEffort[] {
  return supportedEffortsByModel.get(model.trim()) ?? [];
}

/** The effort to send for this model, or undefined when the model does not offer it. */
export function resolveSupportedOpenCodeEffort(args: {
  model: string;
  effort: unknown;
}): OpenCodeEffort | undefined {
  return isOpenCodeEffort(args.effort) &&
    listOpenCodeModelEfforts(args.model).includes(args.effort)
    ? args.effort
    : undefined;
}
