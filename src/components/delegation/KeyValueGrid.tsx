import type { ReactNode } from "react";
import { sx } from "@/components/ads/utils/stylex";
import { delegationStyles as styles } from "./delegation.styles";

export interface KeyValueItem {
  key: string;
  label: string;
  value: ReactNode;
  /** Long values wrap; short identifiers truncate on one line. */
  nowrap?: boolean;
  "data-testid"?: string;
}

/** A `dl` grid of setup facts, one label style, one value style. */
export function KeyValueGrid(props: { items: readonly KeyValueItem[] }) {
  if (props.items.length === 0) {
    return null;
  }
  return (
    <dl className={sx(styles.grid)}>
      {props.items.map((item) => (
        <div key={item.key} className={sx(styles.gridCell)}>
          <dt className={sx(styles.label)}>{item.label}</dt>
          <dd
            className={sx(styles.gridValue, item.nowrap && styles.gridValueNowrap)}
            data-testid={item["data-testid"]}
          >
            {item.value}
          </dd>
        </div>
      ))}
    </dl>
  );
}
