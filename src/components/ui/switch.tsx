import type { Switch as BaseSwitch } from "@base-ui/react/switch";
import { Switch as AdsSwitch } from "../ads/components/Switch";

export function Switch({ size = "default", className, ...props }: BaseSwitch.Root.Props & { size?: "sm" | "default" | "lg" }) {
  return <AdsSwitch {...props} className={typeof className === "string" ? className : undefined} density={size === "lg" ? "regular" : "compact"} data-slot="switch" data-size={size} />;
}
