import type { ComponentProps } from "react";
import { Separator as AdsSeparator } from "../ads/components/Separator";

export function Separator({ decorative = true, ...props }: ComponentProps<typeof AdsSeparator> & { decorative?: boolean }) {
  return <AdsSeparator {...props} data-slot="separator" role={decorative ? "none" : "separator"} aria-hidden={decorative || undefined} />;
}
