import { overlayLayout } from "./overlay-layout.styles";
import type { ComponentProps } from "react";
import { tableStyles } from "../aui/components/Table";
import { sx, cx } from "../aui/utils/stylex";
export { TableHeader, TableBody, TableFooter, TableRow, TableHead, TableCell, TableCaption } from "../aui/components/Table";

export function Table({ className, ...props }: ComponentProps<"table">) {
  return <div data-slot="table-container" className={sx(overlayLayout.tableViewport)}>
    <table {...props} data-slot="table" className={cx(sx(tableStyles.table), className)} />
  </div>;
}
