import { getCursorModelBaseId } from "../../../src/lib/providers/cursor-model-id";
import { KIRO_EFFORT_OPTIONS } from "../../../src/lib/providers/runtime-option-contract";
import { AcpConfigSelectGroupSchema, type AcpSessionConfigOption } from "../acp/acp-schemas";

export const CURSOR_EFFORT_CONFIG_IDS = ["effort", "reasoning"] as const;
export const CURSOR_FAST_CONFIG_ID = "fast";

const CURSOR_EFFORT_VALUES = new Set(
  KIRO_EFFORT_OPTIONS.map((option) => option.value),
);

export function buildCursorAcpClientCapabilities(
  base: Record<string, unknown> = {},
) {
  const existingMeta =
    base._meta && typeof base._meta === "object" && !Array.isArray(base._meta)
      ? (base._meta as Record<string, unknown>)
      : {};
  return {
    ...base,
    _meta: {
      ...existingMeta,
      parameterizedModelPicker: true,
    },
  };
}

export function flattenCursorConfigOptions(option: AcpSessionConfigOption) {
  return (option.options ?? []).flatMap((item) => {
    if (typeof item.value === "string") {
      return [
        {
          value: item.value,
          name: item.name,
          description:
            typeof item.description === "string" ? item.description : "",
        },
      ];
    }
    const group = AcpConfigSelectGroupSchema.safeParse(item);
    return group.success ? group.data.options : [];
  });
}

export function findCursorConfigOption(
  configOptions: readonly AcpSessionConfigOption[] | null | undefined,
  ids: readonly string[],
) {
  return configOptions?.find((option) => ids.includes(option.id));
}

export function findCursorEffortConfig(
  configOptions: readonly AcpSessionConfigOption[] | null | undefined,
) {
  return findCursorConfigOption(configOptions, CURSOR_EFFORT_CONFIG_IDS);
}

export function findCursorFastConfig(
  configOptions: readonly AcpSessionConfigOption[] | null | undefined,
) {
  return findCursorConfigOption(configOptions, [CURSOR_FAST_CONFIG_ID]);
}

export function isCursorParameterizedCatalog(
  configOptions: readonly AcpSessionConfigOption[] | null | undefined,
) {
  return Boolean(
    findCursorEffortConfig(configOptions) || findCursorFastConfig(configOptions),
  );
}

export function normalizeCursorEffortValue(value: string | undefined) {
  const normalized = value?.trim().toLowerCase();
  if (!normalized) {
    return undefined;
  }
  if (
    normalized === "x-high" ||
    normalized === "extra-high" ||
    normalized === "extra_high"
  ) {
    return "xhigh";
  }
  return CURSOR_EFFORT_VALUES.has(normalized) ? normalized : undefined;
}

export function listCursorAdvertisedEfforts(
  option: AcpSessionConfigOption | undefined,
) {
  const advertised = (option ? flattenCursorConfigOptions(option) : [])
    .map((item) => normalizeCursorEffortValue(item.value))
    .filter((value): value is string => Boolean(value));
  if (advertised.length > 0) {
    return [...new Set(advertised)];
  }
  return option ? KIRO_EFFORT_OPTIONS.map((item) => item.value) : [];
}

export function resolveAdvertisedCursorModelId(args: {
  requestedModel: string;
  advertised: readonly string[];
}) {
  const requested = args.requestedModel.trim();
  if (!requested || requested === "auto") {
    return undefined;
  }
  if (args.advertised.includes(requested)) {
    return requested;
  }
  const requestedBase = getCursorModelBaseId(requested);
  if (args.advertised.includes(requestedBase)) {
    return requestedBase;
  }
  return args.advertised.find(
    (value) => getCursorModelBaseId(value) === requestedBase,
  );
}

function configValueAsString(value: AcpSessionConfigOption["currentValue"]) {
  if (typeof value === "boolean") {
    return value ? "true" : "false";
  }
  return value;
}

export function listCursorSessionParameterUpdates(args: {
  configOptions: readonly AcpSessionConfigOption[] | null | undefined;
  effort?: string;
  fastMode?: boolean;
}) {
  const updates: { configId: string; value: string }[] = [];
  const effortOption = findCursorEffortConfig(args.configOptions);
  const requestedEffort = normalizeCursorEffortValue(args.effort);
  if (effortOption && requestedEffort) {
    const advertised = flattenCursorConfigOptions(effortOption);
    const matched =
      advertised.find(
        (item) => normalizeCursorEffortValue(item.value) === requestedEffort,
      )?.value ??
      (advertised.length === 0 ? requestedEffort : undefined);
    if (
      matched &&
      configValueAsString(effortOption.currentValue) !== matched
    ) {
      updates.push({ configId: effortOption.id, value: matched });
    }
  }

  const fastOption = findCursorFastConfig(args.configOptions);
  if (fastOption && args.fastMode !== undefined) {
    const value = args.fastMode ? "true" : "false";
    if (configValueAsString(fastOption.currentValue) !== value) {
      updates.push({ configId: fastOption.id, value });
    }
  }
  return updates;
}
