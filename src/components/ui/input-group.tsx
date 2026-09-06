import type { StyleXValue } from "../ads/utils/stylex";
import { inputGroupMarker, layout } from "./input-group.stylex";
"use client"

import * as React from "react"

import { styles as inputGroupStyles } from "../ads/components/InputGroup.styles"
import { sx } from "../ads/utils/stylex"
import { cx } from "../ads/utils/stylex"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Textarea } from "@/components/ui/textarea"

function InputGroup({ className, xstyle, ...props }: React.ComponentProps<"div"> & { xstyle?: StyleXValue }) {
  return (
    <div
      data-slot="input-group"
      role="group"
      className={cx(
        sx(inputGroupStyles.group, layout.group, inputGroupMarker, xstyle),
        className
      )}
      {...props}
    />
  )
}

const addonAlign = {
  "inline-start": layout.inlineStart,
  "inline-end": layout.inlineEnd,
  "block-start": layout.blockStart,
  "block-end": layout.blockEnd,
};

function InputGroupAddon({
  className,
  align = "inline-start",
  xstyle,
  ...props
}: React.ComponentProps<"div"> & { align?: keyof typeof addonAlign; xstyle?: StyleXValue }) {
  return (
    <div
      role="group"
      data-slot="input-group-addon"
      data-align={align}
      className={cx(sx(layout.addon, addonAlign[align], xstyle), className)}
      onClick={(e) => {
        if ((e.target as HTMLElement).closest("button")) {
          return
        }
        e.currentTarget.parentElement?.querySelector("input")?.focus()
      }}
      {...props}
    />
  )
}

const buttonSizes = {
  xs: layout.buttonXs,
  sm: undefined,
  "icon-xs": layout.buttonIconXs,
  "icon-sm": layout.buttonIconSm,
};
function inputGroupButtonVariants({ size = "xs" }: { size?: keyof typeof buttonSizes }) {
  return sx(layout.button, buttonSizes[size]);
}

function InputGroupButton({
  className,
  type = "button",
  variant = "ghost",
  size = "xs",
  ...props
}: Omit<React.ComponentProps<typeof Button>, "size"> &
  { size?: keyof typeof buttonSizes }) {
  return (
    <Button
      type={type}
      data-size={size}
      variant={variant}
      className={cx(inputGroupButtonVariants({ size }), className)}
      {...props}
    />
  )
}

function InputGroupText({ className, ...props }: React.ComponentProps<"span">) {
  return (
    <span
      data-slot="input-group-text"
      className={cx(
        sx(layout.text),
        className
      )}
      {...props}
    />
  )
}

function InputGroupInput({
  className,
  xstyle,
  ...props
}: React.ComponentProps<"input"> & { xstyle?: StyleXValue }) {
  return (
    <Input
      data-slot="input-group-control"
      className={className}
      xstyle={[layout.control, layout.input, xstyle]}
      {...props}
    />
  )
}

function InputGroupTextarea({
  className,
  xstyle,
  ...props
}: React.ComponentProps<"textarea"> & { xstyle?: StyleXValue }) {
  return (
    <Textarea
      data-slot="input-group-control"
      className={className}
      xstyle={[layout.control, layout.textarea, xstyle]}
      {...props}
    />
  )
}

export {
  InputGroup,
  InputGroupAddon,
  InputGroupButton,
  InputGroupText,
  InputGroupInput,
  InputGroupTextarea,
}
