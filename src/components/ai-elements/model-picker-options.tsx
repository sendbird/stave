import { i18n } from "@/i18n";
import * as stylex from "@stylexjs/stylex";
import type { SearchablePickerOption } from "@/components/layout/searchable-picker-option";
import { sx, type StyleXValue } from "@/components/ads/utils/stylex";
import { vars } from "@/components/ads/tokens/tokens.stylex";
import { formatModelPrice, toHumanModelName } from "@/lib/providers/model-catalog";
import type { ProviderId } from "@/lib/providers/provider.types";
import { ModelIcon } from "./model-icon";

/**
 * The published list price of a model as a short muted label ("$5 / $25 /
 * MTok"), or null for a model without one: runtime-catalog providers and
 * connection models are never given a guessed number.
 */
export function modelPriceLabel(model: string): string | null {
  const price = formatModelPrice(model);
  return price ? i18n.t("composer:modelPrice.perMTok", { price }) : null;
}

/**
 * One searchable row per model id: the readable name, the id beneath it (both
 * searched), the provider mark, and the price where one is published.
 */
export function modelPickerOptions(args: {
  providerId: ProviderId;
  models: readonly string[];
  /** Section heading, for a list that mixes providers. */
  group?: string;
}): SearchablePickerOption[] {
  return args.models.map((model) => ({
    value: model,
    label: toHumanModelName({ model }),
    detail: model,
    icon: <ModelIcon providerId={args.providerId} model={model} className={sx(styles.icon)} />,
    meta: modelPriceLabel(model) ?? undefined,
    group: args.group,
  }));
}

/** The price as a muted trailing mark, or nothing for an unpriced model. */
export function ModelPrice(props: { model: string; xstyle?: StyleXValue }) {
  const label = modelPriceLabel(props.model);
  return label ? <span className={sx(styles.price, props.xstyle)}>{label}</span> : null;
}

const styles = stylex.create({
  price: {
    color: vars["--ads-color-text-muted"],
    flexShrink: 0,
    fontSize: vars["--ads-font-size-caption"],
    fontVariantNumeric: "tabular-nums",
    fontWeight: vars["--ads-font-weight-regular"],
    whiteSpace: "nowrap",
  },
  icon: {
    blockSize: vars["--ads-control-icon-size-md"],
    inlineSize: vars["--ads-control-icon-size-md"],
  },
});
