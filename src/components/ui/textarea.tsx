import type { StyleXValue } from "../ads/utils/stylex";
import type { ComponentProps } from "react";
import { Textarea as AdsTextarea } from "../ads/components/Textarea";

export function Textarea(props: ComponentProps<"textarea"> & { xstyle?: StyleXValue }) {
  return <AdsTextarea {...props} controlOnly data-slot="textarea" />;
}
