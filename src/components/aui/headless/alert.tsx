import type * as React from "react";

export type AlertRootProps = React.ComponentProps<"div">;

export function AlertRoot(props: AlertRootProps) {
  return <div {...props} />;
}
