import * as stylex from "@stylexjs/stylex";
import { vars } from "@/components/aui/tokens/tokens.stylex";
import { useTranslation } from "@/i18n";
import { Checkbox } from "@/components/aui/components/Checkbox";
import { SegmentedControl } from "@/components/system/SegmentedControl";
import { useFleetGroupingStore } from "@/store/fleet-grouping-store";
import { useFleetSelectionStore } from "@/store/fleet-selection-store";
import type { FleetGrouping } from "@/lib/fleet/status-groups";

export function FleetGroupingControl() {
  const { t } = useTranslation(["fleet"]);
  const grouping = useFleetGroupingStore((state) => state.grouping);
  return <SegmentedControl<FleetGrouping> aria-label={t("fleet:grouping.label")} value={grouping} onValueChange={useFleetGroupingStore.getState().setGrouping}
    options={(["default", "repository", "status"] as const).map((value) => ({ value, label: t(`fleet:grouping.${value}`) }))} />;
}
export function FleetGroupHeader({ title, keys, controlOnly = false }: { title: string; keys: readonly string[]; controlOnly?: boolean }) {
  const selected = useFleetSelectionStore((state) => state.selectedKeys);
  const count = keys.filter((key) => selected.has(key)).length;
  return <Checkbox disabled={!keys.length} xstyle={controlOnly ? styles.control : undefined} controlOnly={controlOnly} aria-label={`${title} (${keys.length})`} checked={keys.length > 0 && count === keys.length} indeterminate={count > 0 && count < keys.length}
    label={`${title} (${keys.length})`} onCheckedChange={() => useFleetSelectionStore.getState().selectGroup(keys)} />;
}

const styles = stylex.create({ control: { minInlineSize: vars["--aui-control-mark-size-lg"], minBlockSize: vars["--aui-control-mark-size-lg"] } });
