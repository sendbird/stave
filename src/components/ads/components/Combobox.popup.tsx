import { i18n } from "@/i18n";
import { Combobox as BaseCombobox } from "@base-ui/react/combobox";
import { Plus } from "lucide-react";
import type * as React from "react";

import { listbox } from "../recipes/listbox";
import type { PopupPlacement } from "../utils/placement";
import { sx } from "../utils/stylex";
import {
  LoadFailure,
  LoadMoreFooter,
  LoadMoreSentinel,
  useLoadMore,
  type ComboboxPagingProps,
} from "./Combobox.loadMore";
import { isCreateOption, type CreatableOption } from "./Combobox.create";
import type { ComboboxOption, OptionGroup } from "./Combobox.options";
import { compoundParts, type ComboboxSize } from "./Combobox.parts";
import { styles } from "./Combobox.styles";

const Collection = BaseCombobox.Collection;
const {
  Empty,
  Group,
  GroupLabel,
  Item,
  ItemIndicator,
  List,
  Popup,
  Portal,
  Positioner,
} = compoundParts;

export type ComboboxArrayPopupProps = ComboboxPagingProps & {
  createLabel: (query: string) => React.ReactNode;
  emptyText: string;
  grouped: boolean;
  hasOptions: boolean;
  loading: boolean;
  loadingText: React.ReactNode;
  placement?: PopupPlacement;
  size: ComboboxSize;
  zIndex?: number;
};

/** The option-list popup shared by the single and multi-select array APIs. */
export function ComboboxArrayPopup({
  createLabel,
  emptyText,
  grouped,
  hasOptions,
  loading,
  loadingText,
  placement,
  size,
  zIndex,
  ...paging
}: ComboboxArrayPopupProps) {
  const {
    loadError,
    loadingMoreText = i18n.t("ui:combobox.loadingMore"),
    loadMoreLabel = i18n.t("ui:combobox.loadMore"),
    onLoadRetry,
    retryLabel = i18n.t("ui:combobox.retry"),
    ...pagingProps
  } = paging;
  const loadMore = useLoadMore({
    ...pagingProps,
    loadError,
    loading,
    onLoadRetry,
    retryLabel,
  });
  const renderOption = (
    item: CreatableOption<ComboboxOption>,
    index?: number,
  ) => {
    const copy = (
      <span className={sx(listbox.itemCopy)}>
        <span
          className={sx(
            listbox.itemLabel,
            (isCreateOption(item) || Boolean(item.icon)) && styles.itemLabelRow,
          )}
        >
          {isCreateOption(item) ? (
            <span aria-hidden className={sx(styles.itemIcon)}>
              <Plus size={14} />
            </span>
          ) : item.icon ? (
            <span className={sx(styles.itemIcon)}>{item.icon}</span>
          ) : null}
          {isCreateOption(item) ? createLabel(item.query) : item.label}
        </span>
        {!isCreateOption(item) && item.description ? (
          <span className={sx(listbox.itemDescription)}>
            {item.description}
          </span>
        ) : null}
      </span>
    );
    const trailing = isCreateOption(item) ? undefined : item.trailing;
    return (
      <Item
        disabled={isCreateOption(item) ? false : item.disabled}
        index={index}
        key={item.value}
        size={size}
        value={item}
      >
        <ItemIndicator />
        {/*
         * The row is a two-column grid whose second track belongs to
         * `ItemIndicator`, so a `trailing` mark cannot be a third child — it
         * would auto-place onto a second row. It shares the copy's track
         * instead, which is also where it reads correctly: beside the option,
         * not beside the selection tick.
         */}
        {trailing ? (
          <span className={sx(styles.itemMain)}>
            {copy}
            <span className={sx(styles.itemTrailing)}>{trailing}</span>
          </span>
        ) : (
          copy
        )}
      </Item>
    );
  };

  return (
    <Portal>
      <Positioner
        placement={placement}
        style={zIndex !== undefined ? { zIndex } : undefined}
      >
        <Popup>
          {loading ? (
            <div className={sx(listbox.empty)} role="status">
              {loadingText}
            </div>
          ) : loadError != null && !hasOptions ? (
            <LoadFailure
              error={loadError}
              onRetry={onLoadRetry}
              retryLabel={retryLabel}
            />
          ) : (
            <>
              <Empty>{emptyText}</Empty>
              <List>
                {grouped ? (
                  <Collection>
                    {(group: OptionGroup<CreatableOption<ComboboxOption>>) => (
                      <Group items={group.items} key={group.value}>
                        {group.value && group.value !== "__ads-trailing" ? (
                          <GroupLabel className={sx(listbox.groupLabel)}>
                            {group.value}
                          </GroupLabel>
                        ) : null}
                        <Collection>
                          {(item: CreatableOption<ComboboxOption>) =>
                            renderOption(item)
                          }
                        </Collection>
                      </Group>
                    )}
                  </Collection>
                ) : (
                  <Collection>
                    {(item: CreatableOption<ComboboxOption>, index: number) =>
                      renderOption(item, index)
                    }
                  </Collection>
                )}
                <LoadMoreSentinel paging={loadMore} />
              </List>
              <LoadMoreFooter
                loadingMoreText={loadingMoreText}
                loadMoreLabel={loadMoreLabel}
                paging={loadMore}
              />
            </>
          )}
        </Popup>
      </Positioner>
    </Portal>
  );
}
