import { overlayLayout } from "./overlay-layout.styles";
import type { ComponentProps } from "react";
import { tableStyles } from "../ads/components/Table";
import { sx, cx } from "../ads/utils/stylex";
export { TableHeader, TableBody, TableFooter, TableRow, TableHead, TableCell, TableCaption } from "../ads/components/Table";

export function Table({ className, ...props }: ComponentProps<"table">) {
  return <div data-slot="table-container" className={sx(overlayLayout.tableViewport)}>
    <table {...props} data-slot="table" className={cx(sx(tableStyles.table), className)} />
  </div>;
}
