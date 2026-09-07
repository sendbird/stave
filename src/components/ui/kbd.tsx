import { sx } from "../ads/utils/stylex";
import { overlayLayout } from "./overlay-layout.styles";
import { cx } from "../ads/utils/stylex";

import { Kbd as AdsKbd } from "../ads/components/Kbd";
function Kbd({ className, ...props }: React.ComponentProps<"kbd">) {
  return (
    <AdsKbd
      {...props}
      size="sm"
      data-slot="kbd"
      className={cx(sx(overlayLayout.keyCap), className)}
    />
  );
}

function KbdGroup({ className, ...props }: React.ComponentProps<"span">) {
  return (
    <span
      data-slot="kbd-group"
      className={cx(
        sx(overlayLayout.keyGroup),
        className,
      )}
      {...props}
    />
  );
}

function KbdSeparator({ className, ...props }: React.ComponentProps<"span">) {
  return (
    <span
      data-slot="kbd-separator"
      className={cx(sx(overlayLayout.muted), className)}
      {...props}
    >
      +
    </span>
  );
}

export { Kbd, KbdGroup, KbdSeparator };
