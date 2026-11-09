import type { ComponentProps } from "react";
import { Card as AuiCard } from "../aui/components/Card";
export { CardHeader, CardTitle, CardDescription, CardAction, CardContent, CardFooter } from "../aui/components/Card";
export function Card({ size = "default", ...props }: ComponentProps<typeof AuiCard> & { size?: "default" | "sm" }) {
  return <AuiCard {...props} density={size === "sm" ? "compact" : "regular"} data-slot="card" />;
}
