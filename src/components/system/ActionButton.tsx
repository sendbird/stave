import { Button, type ButtonProps } from "../aui/components/Button";

/** Compatibility entry point while product surfaces migrate to AUI names. */
export type ActionButtonProps = Omit<ButtonProps, "variant" | "size"> & {
  weight?: "primary" | "secondary" | "quiet";
  size?: "xs" | "sm" | "md" | "lg";
};

export function ActionButton({
  weight = "secondary",
  size = "sm",
  ...props
}: ActionButtonProps) {
  return <Button {...props} variant={weight} size={size} />;
}
