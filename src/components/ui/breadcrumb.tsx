import { i18n, useTranslation } from "@/i18n";
import { contentLayout } from "./content-layout.styles";
import { VisuallyHidden } from "../aui/components/VisuallyHidden";
import * as React from "react";
import { mergeProps } from "@base-ui/react/merge-props";
import { useRender } from "@base-ui/react/use-render";

import { Breadcrumb as AuiBreadcrumb, breadcrumbStyles } from "../aui/components/Breadcrumb";
import { sx } from "../aui/utils/stylex";
import { cx } from "../aui/utils/stylex";
import { MoreHorizontalIcon } from "lucide-react";

const Breadcrumb = AuiBreadcrumb.Root;
const BreadcrumbList = AuiBreadcrumb.List;
const BreadcrumbItem = AuiBreadcrumb.Item;

function BreadcrumbLink({
  className,
  render,
  ...props
}: useRender.ComponentProps<"a">) {
  useTranslation();
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

const BreadcrumbPage = AuiBreadcrumb.Page;
const BreadcrumbSeparator = AuiBreadcrumb.Separator;

function BreadcrumbEllipsis({
  className,
  ...props
}: React.ComponentProps<"span">) {
  useTranslation();
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
      <VisuallyHidden>{i18n.t("ui:breadcrumb.more")}</VisuallyHidden>
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
