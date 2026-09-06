import { contentLayout } from "./content-layout.styles";
import { VisuallyHidden } from "../ads/components/VisuallyHidden";
import * as React from "react";
import { mergeProps } from "@base-ui/react/merge-props";
import { useRender } from "@base-ui/react/use-render";

import { Breadcrumb as AdsBreadcrumb, breadcrumbStyles } from "../ads/components/Breadcrumb";
import { sx } from "../ads/utils/stylex";
import { cx } from "../ads/utils/stylex";
import { MoreHorizontalIcon } from "lucide-react";

const Breadcrumb = AdsBreadcrumb.Root;
const BreadcrumbList = AdsBreadcrumb.List;
const BreadcrumbItem = AdsBreadcrumb.Item;

function BreadcrumbLink({
  className,
  render,
  ...props
}: useRender.ComponentProps<"a">) {
  return useRender({
    defaultTagName: "a",
    props: mergeProps<"a">(
      {
        className: cx(sx(breadcrumbStyles.link), className),
      },
      props,
    ),
    render,
    state: {
      slot: "breadcrumb-link",
    },
  });
}

const BreadcrumbPage = AdsBreadcrumb.Page;
const BreadcrumbSeparator = AdsBreadcrumb.Separator;

function BreadcrumbEllipsis({
  className,
  ...props
}: React.ComponentProps<"span">) {
  return (
    <span
      data-slot="breadcrumb-ellipsis"
      role="presentation"
      aria-hidden="true"
      className={cx(
        sx(contentLayout.ellipsis),
        className,
      )}
      {...props}
    >
      <MoreHorizontalIcon className={sx(contentLayout.ellipsisIcon)} />
      <VisuallyHidden>More</VisuallyHidden>
    </span>
  );
}

export {
  Breadcrumb,
  BreadcrumbList,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbPage,
  BreadcrumbSeparator,
  BreadcrumbEllipsis,
};
