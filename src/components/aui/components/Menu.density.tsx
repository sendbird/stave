import * as React from "react";

import type { OverlayDensity } from "../recipes/overlay-surface";

const MenuDensityContext = React.createContext<OverlayDensity>("regular");

export function MenuDensityProvider({
  children,
  density,
}: {
  children: React.ReactNode;
  density: OverlayDensity;
}) {
  return (
    <MenuDensityContext.Provider value={density}>
      {children}
    </MenuDensityContext.Provider>
  );
}

export function useMenuDensity() {
  return React.useContext(MenuDensityContext);
}
