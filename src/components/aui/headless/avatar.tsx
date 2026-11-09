import { Avatar as BaseAvatar } from "@base-ui/react/avatar";
import type * as React from "react";

export const AvatarRoot = BaseAvatar.Root;
export const AvatarImage = BaseAvatar.Image;
export const AvatarFallback = BaseAvatar.Fallback;

export type AvatarRootProps = React.ComponentProps<typeof AvatarRoot>;
export type AvatarImageProps = React.ComponentProps<typeof AvatarImage>;
export type AvatarFallbackProps = React.ComponentProps<typeof AvatarFallback>;
