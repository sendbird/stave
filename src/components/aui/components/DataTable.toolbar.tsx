/**
 * The band above a `DataTable`: the caller's `filter` slot, and at its end
 * the table's own controls — the row-density switch, CSV export and the
 * Columns menu (visibility, and pin to an edge).
 *
 * Moved out of `DataTable.view.tsx` on 2026-11-14 with the three additions
 * below; a table that asks for none of them renders the band it always did.
 *
 * - Density switch (`onDensityChange`): comfortable and compact rows. AUI
 *   had `density` as a prop with no control for it.
 * - Export (`exportable`): writes the visible columns as CSV.
 * - Pin (`onColumnPinningChange`): a frozen first column. AUI's headers have
 *   no per-column menu, so "Pin to start", "Pin to end" and "Unpin" sit in
 *   the Columns menu, one submenu per column.
 *
 * Built on AUI's `ToggleGroup`, `Button` and `Menu`.
 */
import * as stylex from "@stylexjs/stylex";
import { Columns3, Download, Rows3, Rows4 } from "lucide-react";
import type * as React from "react";

import { i18n, useTranslation } from "@/i18n";

import { actionGap } from "../recipes/action-gap";
import { controlChrome } from "../recipes/control-chrome";
import { focusRing } from "../recipes/focus-ring";
import { transition } from "../recipes/transition";
import { themeSlotProps } from "../theming/theme-props";
import { sx } from "../utils/stylex";
import { Button } from "./Button";
import { columnGroupOf, type DataTablePinSide } from "./DataTable.columns";
import { panelStyles } from "./DataTable.panel.styles";
import { styles } from "./DataTable.styles";
import type {
  DataTableColumn,
  DataTableColumnPinning,
} from "./DataTable.types";
import { MenuRowContent } from "./DropdownMenu.row";
import { Menu } from "./Menu";
import { ToggleGroup } from "./ToggleGroup";

/** The opt-in toolbar controls, resolved by `DataTable.root.tsx`. */
export type DataTableTools = {
  /** Present when `exportable`: the control's label and what it runs. */
  exportCsv?: { label: string; run: () => void };
  onDensityChange?: (density: "compact" | "regular") => void;
  /** Present when columns can be pinned from the Columns menu. */
  pin?: {
    pinning: DataTableColumnPinning | undefined;
    set: (columnId: string, side: DataTablePinSide) => void;
  };
};

export type DataTableToolbarProps<TRow> = {
  columnVisibility?: Record<string, boolean>;
  columnVisibilityLabel: React.ReactNode;
  configurableColumns: Array<DataTableColumn<TRow>>;
  density: "compact" | "regular";
  filter?: React.ReactNode;
  frame: boolean;
  onColumnVisibilityChange?: (
    columnVisibility: Record<string, boolean>,
  ) => void;
  showColumnVisibility: boolean;
  tools?: DataTableTools;
  visibleColumns: Array<DataTableColumn<TRow>>;
};

const pinActions = (): Array<{ label: string; side: DataTablePinSide }> => [
  { label: i18n.t("ui:dataTable.pin.start"), side: "leading" },
  { label: i18n.t("ui:dataTable.pin.end"), side: "trailing" },
  { label: i18n.t("ui:dataTable.pin.unpin"), side: null },
];

const toolbarStyles = stylex.create({
  /** The table's own controls, kept together at the band's end. */
  tools: {
    alignItems: "center",
    display: "flex",
    flexWrap: "wrap",
    justifyContent: "flex-end",
    marginInlineStart: "auto",
    minInlineSize: 0,
  },
});

export function DataTableToolbar<TRow>({
  columnVisibility,
  columnVisibilityLabel,
  configurableColumns,
  density,
  filter,
  frame,
  onColumnVisibilityChange,
  showColumnVisibility,
  tools,
  visibleColumns,
}: DataTableToolbarProps<TRow>) {
  useTranslation();
  const pinActionItems = pinActions();
  const pin = tools?.pin;
  const showColumnsMenu = showColumnVisibility || pin !== undefined;
  const onDensityChange = tools?.onDensityChange;
  const exportCsv = tools?.exportCsv;
  const hasTools = Boolean(onDensityChange || exportCsv || pin);
  if (!filter && !showColumnsMenu && !hasTools) return null;

  const columnsMenu = showColumnsMenu ? (
    <Menu.Root>
      <Menu.Trigger
        // `sm`, the size `FilterBar` defaults to: the toolbar's own
        // trigger was 36px beside a 32px Filter button in the default
        // composition (measured 2026-11-13).
        size="sm"
        className={(state) =>
          sx(
            styles.columnSummary,
            controlChrome.trigger,
            transition.colors,
            focusRing.ring,
            state.open && controlChrome.triggerOpen,
          )
        }
      >
        <Columns3 aria-hidden size={14} />
        <span>{columnVisibilityLabel}</span>
      </Menu.Trigger>
      <Menu.Portal>
        <Menu.Positioner placement="bottom-end">
          <Menu.Popup>
            {showColumnVisibility
              ? configurableColumns.map((column) => (
                  <Menu.CheckboxItem
                    checked={columnVisibility?.[column.id] !== false}
                    closeOnClick={false}
                    key={column.id}
                    onCheckedChange={(next: boolean) =>
                      onColumnVisibilityChange?.({
                        ...columnVisibility,
                        [column.id]: next,
                      })
                    }
                  >
                    <Menu.CheckboxItemIndicator />
                    <span>{column.header}</span>
                  </Menu.CheckboxItem>
                ))
              : null}
            {pin && showColumnVisibility ? <Menu.Separator /> : null}
            {pin ? (
              <Menu.Group>
                <Menu.GroupLabel>
                  {i18n.t("ui:dataTable.pin.groupLabel")}
                </Menu.GroupLabel>
                {visibleColumns.map((column) => {
                  const group = columnGroupOf(pin.pinning, column.id);
                  const side = group === "center" ? null : group;
                  return (
                    <Menu.SubmenuRoot key={column.id}>
                      <Menu.SubmenuTrigger
                        data-aui-column-pin={column.id}
                        data-pinned={side ?? undefined}
                      >
                        <MenuRowContent
                          hasIconColumn={false}
                          item={{
                            label: column.header,
                            // The edge the column is held to, in words.
                            shortcut:
                              side === "leading"
                                ? i18n.t("ui:dataTable.pin.pinnedStart")
                                : side === "trailing"
                                  ? i18n.t("ui:dataTable.pin.pinnedEnd")
                                  : undefined,
                            submenu: pinActionItems,
                          }}
                        />
                      </Menu.SubmenuTrigger>
                      <Menu.Portal>
                        <Menu.Positioner sideOffset={4}>
                          <Menu.Popup>
                            {pinActionItems.map((action) => (
                              <Menu.Item
                                // The state the column is already in cannot
                                // be chosen again.
                                disabled={action.side === side}
                                key={action.label}
                                onClick={() => pin.set(column.id, action.side)}
                              >
                                {action.label}
                              </Menu.Item>
                            ))}
                          </Menu.Popup>
                        </Menu.Positioner>
                      </Menu.Portal>
                    </Menu.SubmenuRoot>
                  );
                })}
              </Menu.Group>
            ) : null}
          </Menu.Popup>
        </Menu.Positioner>
      </Menu.Portal>
    </Menu.Root>
  ) : null;

  return (
    <div
      {...themeSlotProps("data-table", "toolbar")}
      className={sx(
        styles.toolbar,
        actionGap.buttons,
        frame && panelStyles.toolbar,
      )}
    >
      {filter ? <div className={sx(styles.filterSlot)}>{filter}</div> : null}
      {hasTools ? (
        <div
          className={sx(toolbarStyles.tools, actionGap.buttons)}
          data-aui-data-table-tools=""
        >
          {onDensityChange ? (
            <ToggleGroup
              aria-label={i18n.t("ui:dataTable.density.label")}
              iconOnly
              onValueChange={(next) => {
                const value = next[0];
                // Pressing the active item again leaves nothing pressed:
                // density is always one of the two.
                if (value === "compact" || value === "regular") {
                  onDensityChange(value);
                }
              }}
              options={[
                {
                  icon: <Rows3 aria-hidden size={14} />,
                  label: i18n.t("ui:dataTable.density.comfortable"),
                  value: "regular",
                },
                {
                  icon: <Rows4 aria-hidden size={14} />,
                  label: i18n.t("ui:dataTable.density.compact"),
                  value: "compact",
                },
              ]}
              value={[density]}
            />
          ) : null}
          {exportCsv ? (
            <Button onClick={exportCsv.run} size="sm" variant="outlined">
              <Download aria-hidden size={14} />
              {exportCsv.label}
            </Button>
          ) : null}
          {columnsMenu}
        </div>
      ) : (
        columnsMenu
      )}
    </div>
  );
}
