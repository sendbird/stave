import * as React from "react";

import type { ButtonSize } from "./Button.types";

/**
 * Default size for a `Button` rendered inside an in-surface action slot,
 * where #809's F1 rule (2026-11-07) sets actions on the 28px `xs` rung. A
 * Button's own `size` always wins; outside a provider the default stays `md`.
 */
export const ButtonSizeContext = React.createContext<ButtonSize | undefined>(
  undefined,
);
