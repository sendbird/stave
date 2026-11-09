import type { StyleXValue } from "../aui/utils/stylex";
import type { ComponentProps } from "react";
import { Textarea as AuiTextarea } from "../aui/components/Textarea";

export function Textarea(props: ComponentProps<"textarea"> & { xstyle?: StyleXValue }) {
  return <AuiTextarea {...props} controlOnly data-slot="textarea" />;
}
