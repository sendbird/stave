import { toHumanModelName } from "./model-catalog";

const cursorDisplayNames = new Map<string, string>();

export function registerCursorModelDisplayNames(
  displayNames: ReadonlyMap<string, string>,
) {
  for (const [model, displayName] of displayNames) {
    const normalizedModel = model.trim();
    const normalizedDisplayName = displayName.trim();
    if (normalizedModel && normalizedDisplayName) {
      cursorDisplayNames.set(normalizedModel, normalizedDisplayName);
    }
  }
}

/**
 * Cursor encodes a model's configuration inside the model id itself, for
 * example `claude-opus-5[thinking=true,context=300k,effort=high,fast=false]`
 * or `auto-smart[optimize_for=balanced]`.
 *
 * Those ids are the wire format, not display text. Rendering one raw leaks
 * bracket syntax into the UI, so every surface that shows a Cursor model splits
 * it into a name plus the parameters that name does not already carry.
 */
export function parseCursorModelParameters(model: string) {
  const match = model.match(/\[([^\]]*)\]$/);
  const parameters = new Map<string, string>();
  for (const pair of match?.[1]?.split(",") ?? []) {
    const separator = pair.indexOf("=");
    if (separator <= 0) {
      continue;
    }
    parameters.set(
      pair.slice(0, separator).trim(),
      pair.slice(separator + 1).trim(),
    );
  }
  return parameters;
}

export function getCursorModelBaseId(model: string) {
  return model.split("[")[0]?.trim() || model.trim();
}

const CURSOR_EFFORT_LABELS = new Map([
  ["low", "Low"],
  ["medium", "Medium"],
  ["high", "High"],
  ["xhigh", "X-High"],
  ["extra-high", "X-High"],
  ["extra_high", "X-High"],
  ["max", "Max"],
]);

function toTitleCase(value: string) {
  return value
    .replace(/[_-]+/g, " ")
    .split(" ")
    .filter(Boolean)
    .map((word) => `${word.slice(0, 1).toUpperCase()}${word.slice(1)}`)
    .join(" ");
}

export function formatCursorEffortLabel(effort: string) {
  const normalized = effort.trim().toLowerCase();
  return CURSOR_EFFORT_LABELS.get(normalized) ?? toTitleCase(normalized);
}

/**
 * Ordered to match the display names the Cursor runtime builds for its own
 * catalog, so the same model reads the same way in the picker and in a turn
 * footer.
 */
export function listCursorModelParameterLabels(args: {
  model: string;
  /**
   * `optimize_for` is already folded into the runtime's own display name for
   * `auto-*` models ("Auto Balance"), so it is only surfaced when Stave had to
   * fall back to humanizing the raw id.
   */
  includeOptimizeFor?: boolean;
}) {
  const parameters = parseCursorModelParameters(args.model);
  const labels: string[] = [];
  const context = parameters.get("context");
  if (context) {
    labels.push(context.toUpperCase());
  }
  if (parameters.get("thinking") === "true") {
    labels.push("Thinking");
  }
  const effort = parameters.get("effort") ?? parameters.get("reasoning");
  if (effort) {
    labels.push(formatCursorEffortLabel(effort));
  }
  if (parameters.get("fast") === "true") {
    labels.push("Fast");
  }
  const optimizeFor = parameters.get("optimize_for");
  if (args.includeOptimizeFor && optimizeFor) {
    labels.push(toTitleCase(optimizeFor));
  }
  return labels;
}

/**
 * Splits a Cursor model id into the parts a chip should render.
 *
 * The runtime's advertised display name wins when one is known, because it is
 * Cursor's own wording (and already omits the bracket syntax). Its `·`-joined
 * detail suffix is split back out so a chip can render the details as separate
 * elements instead of one long string.
 */
export function describeCursorModel(model: string) {
  const trimmed = model.trim();
  const displayName =
    cursorDisplayNames.get(trimmed) ?? toHumanModelName({ model: trimmed });
  const runtimeNamed = !displayName.includes("[");
  if (runtimeNamed) {
    const [name, ...details] = displayName.split(" · ");
    return {
      name: name?.trim() || trimmed,
      details:
        details.length > 0
          ? details.map((detail) => detail.trim()).filter(Boolean)
          : listCursorModelParameterLabels({ model: trimmed }),
    };
  }
  return {
    name: toHumanModelName({ model: getCursorModelBaseId(trimmed) }),
    details: listCursorModelParameterLabels({
      model: trimmed,
      includeOptimizeFor: true,
    }),
  };
}
