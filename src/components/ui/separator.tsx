import type { ComponentProps } from "react";
import { Separator as AuiSeparator } from "../aui/components/Separator";

export function Separator({ decorative = true, ...props }: ComponentProps<typeof AuiSeparator> & { decorative?: boolean }) {
  return <AuiSeparator {...props} data-slot="separator" role={decorative ? "none" : "separator"} aria-hidden={decorative || undefined} />;
}
