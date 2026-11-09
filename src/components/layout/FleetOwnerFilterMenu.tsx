import { UserRound } from "lucide-react";
import { useTranslation } from "@/i18n";
import {
  Button,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuLabel,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuTrigger,
} from "@/components/ui";
import { FLEET_OWNER_FILTER_OPTIONS, type FleetOwnerFilter } from "@/lib/fleet/task-owner";

export function isFleetOwnerFilter(value: unknown): value is FleetOwnerFilter {
  return FLEET_OWNER_FILTER_OPTIONS.some((option) => option.value === value);
}

/**
 * Fleet's owner filter. One icon-sized trigger, so the toolbar keeps the
 * layout switch on its line; a narrowed owner shows as an applied-filter chip
 * and in the trigger's name, and the trigger stays pressed while it narrows.
 */
export function FleetOwnerFilterMenu(props: { value: FleetOwnerFilter; onChange: (value: FleetOwnerFilter) => void }) {
  const { t } = useTranslation(["fleet"]);
  const label = t("fleet:ownerFilter.label");
  const current = FLEET_OWNER_FILTER_OPTIONS.find((option) => option.value === props.value);
  const narrowed = props.value !== "all";
  const name = narrowed && current ? t("fleet:ownerFilter.labelWithValue", { value: current.label }) : label;
  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        render={
          <Button
            type="button"
            size="icon-sm"
            variant={narrowed ? "secondary" : "ghost"}
            aria-label={name}
            title={name}
            data-fleet-owner-filter={props.value}
          />
        }
      >
        <UserRound aria-hidden="true" />
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start">
        <DropdownMenuLabel>{label}</DropdownMenuLabel>
        <DropdownMenuRadioGroup
          value={props.value}
          onValueChange={(value: unknown) => {
            if (isFleetOwnerFilter(value)) props.onChange(value);
          }}
        >
          {FLEET_OWNER_FILTER_OPTIONS.map((option) => (
            <DropdownMenuRadioItem key={option.value} value={option.value}>
              {option.label}
            </DropdownMenuRadioItem>
          ))}
        </DropdownMenuRadioGroup>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
