import type { Switch as BaseSwitch } from "@base-ui/react/switch";
import { Switch as AuiSwitch } from "../aui/components/Switch";

export function Switch({ size = "default", className, ...props }: BaseSwitch.Root.Props & { size?: "sm" | "default" | "lg" }) {
  return <AuiSwitch {...props} className={typeof className === "string" ? className : undefined} density={size === "lg" ? "regular" : "compact"} data-slot="switch" data-size={size} />;
}
