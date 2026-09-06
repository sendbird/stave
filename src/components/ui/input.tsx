import type { StyleXValue } from "../ads/utils/stylex";
import type { ComponentProps } from "react";
import { TextField } from "../ads/components/TextField";

/** Stable entry point for product forms and incoming workspace changes. */
export function Input({ size: _nativeSize, ...props }: ComponentProps<"input"> & { xstyle?: StyleXValue }) {
  return <TextField {...props} controlOnly data-slot="input" />;
}
