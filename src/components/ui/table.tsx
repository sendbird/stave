import { overlayLayout } from "./overlay-layout.styles";
import type { ComponentProps } from "react";
import { tableStyles } from "../aui/components/Table";
import { sx, cx, type XstyleProp } from "../aui/utils/stylex";
export { TableHeader, TableBody, TableFooter, TableRow, TableHead, TableCell, TableCaption } from "../aui/components/Table";

/** `xstyle` resolves over the base table's own size, so a caller can let the table size to its content. */
export function Table({ className, xstyle, ...props }: ComponentProps<"table"> & XstyleProp) {
  return <div data-slot="table-container" className={sx(overlayLayout.tableViewport)}>
    <table {...props} data-slot="table" className={cx(sx(tableStyles.table, xstyle), className)} />
  </div>;
}
