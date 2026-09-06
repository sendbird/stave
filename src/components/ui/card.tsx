import type { ComponentProps } from "react";
import { Card as AdsCard } from "../ads/components/Card";
export { CardHeader, CardTitle, CardDescription, CardAction, CardContent, CardFooter } from "../ads/components/Card";
export function Card({ size = "default", ...props }: ComponentProps<typeof AdsCard> & { size?: "default" | "sm" }) {
  return <AdsCard {...props} density={size === "sm" ? "compact" : "regular"} data-slot="card" />;
}
