import * as stylex from "@stylexjs/stylex";
import { vars } from "../ads/tokens/tokens.stylex";
export const drawerMarker = stylex.defineMarker();

export const layout = stylex.create({
  "overlay": {
    "position": {
      "default": "fixed",
      "@supports (-webkit-touch-callout:none)": "absolute"
    },
    "inset": `${vars.space0}`,
    "minHeight": "100dvh",
    "backgroundColor": "var(--overlay)",
    "opacity": {
      "default": "max(var(--drawer-overlay-min-opacity,0), calc(1 - var(--drawer-swipe-progress)))",
      ":is([data-ending-style])": "0%",
      ":is([data-starting-style])": "0%"
    },
    "transitionProperty": "opacity",
    "transitionTimingFunction": "cubic-bezier(0.32,0.72,0,1)",
    "transitionDuration": {
      "default": "300ms",
      ":is([data-ending-style])": "calc(var(--drawer-swipe-strength) * 300ms)",
      ":is([data-swiping])": "0ms"
    },
    "WebkitUserSelect": "none",
    "userSelect": "none",
    "pointerEvents": {
      "default": null,
      ":is([data-ending-style])": "none"
    },
    "--drawer-overlay-min-opacity": {
      "default": null,
      ":is([data-snap-points])": "0.5"
    }
  },
  "handle": {
    "position": "relative",
    "zIndex": "10",
    "display": "flex",
    "flexShrink": "0",
    "cursor": {
      "default": "grab",
      ":active": "grabbing"
    },
    "transitionProperty": "opacity",
    "transitionTimingFunction": `${vars.motionEaseStandard}`,
    "transitionDuration": "200ms",
    "opacity": {
      "default": null,
      [stylex.when.ancestor(":is([data-nested-drawer-open])", drawerMarker)]: "0%",
      [stylex.when.ancestor(":is([data-nested-drawer-swiping])", drawerMarker)]: "100%"
    },
    "height": {
      "default": null,
      [stylex.when.ancestor(":is([data-swipe-axis=\"x\"])", drawerMarker)]: "100%",
      [stylex.when.ancestor(":is([data-swipe-axis=\"y\"])", drawerMarker)]: `${vars.space12}`
    },
    "width": {
      "default": null,
      [stylex.when.ancestor(":is([data-swipe-axis=\"x\"])", drawerMarker)]: `${vars.space12}`,
      [stylex.when.ancestor(":is([data-swipe-axis=\"y\"])", drawerMarker)]: "100%"
    },
    "alignItems": {
      "default": null,
      [stylex.when.ancestor(":is([data-swipe-axis=\"x\"])", drawerMarker)]: "center",
      [stylex.when.ancestor(":is([data-swipe-direction=\"down\"])", drawerMarker)]: "flex-end",
      [stylex.when.ancestor(":is([data-swipe-direction=\"up\"])", drawerMarker)]: "flex-start"
    },
    "justifyContent": {
      "default": null,
      [stylex.when.ancestor(":is([data-swipe-axis=\"y\"])", drawerMarker)]: "center",
      [stylex.when.ancestor(":is([data-swipe-direction=\"left\"])", drawerMarker)]: "flex-start",
      [stylex.when.ancestor(":is([data-swipe-direction=\"right\"])", drawerMarker)]: "flex-end"
    },
    "order": {
      "default": null,
      [stylex.when.ancestor(":is([data-swipe-direction=\"left\"])", drawerMarker)]: "9999",
      [stylex.when.ancestor(":is([data-swipe-direction=\"up\"])", drawerMarker)]: "9999"
    },
    "::after": {
      "content": {
        "default": "''",
        [stylex.when.ancestor(":is([data-swipe-axis=\"x\"])", drawerMarker)]: "''",
        [stylex.when.ancestor(":is([data-swipe-axis=\"y\"])", drawerMarker)]: "''"
      },
      "display": "block",
      "flexShrink": "0",
      "borderRadius": 9999,
      "backgroundColor": `${vars.colorSurfaceTint}`,
      "height": {
        "default": null,
        [stylex.when.ancestor(":is([data-swipe-axis=\"x\"])", drawerMarker)]: "100px",
        [stylex.when.ancestor(":is([data-swipe-axis=\"y\"])", drawerMarker)]: "6px"
      },
      "width": {
        "default": null,
        [stylex.when.ancestor(":is([data-swipe-axis=\"x\"])", drawerMarker)]: "6px",
        [stylex.when.ancestor(":is([data-swipe-axis=\"y\"])", drawerMarker)]: "100px"
      }
    }
  },
  "popup": {
    "pointerEvents": "auto",
    "position": "fixed",
    "margin": "var(--drawer-inset,0px)",
    "display": "flex",
    "height": {
      "default": "var(--drawer-content-height)",
      ":is([data-swipe-axis=\"y\"])": {
        "default": null,
        ":is([data-nested-drawer-open])": "var(--stack-height)"
      }
    },
    "maxHeight": "var(--drawer-content-max-height,none)",
    "minHeight": `${vars.space0}`,
    "width": "var(--drawer-content-width,auto)",
    "transform": {
      "default": "translate3d(var(--translate-x,0px),var(--translate-y,0px),0) scale(var(--stack-scale))",
      ":is([data-ending-style])": "var(--closed-transform)",
      ":is([data-starting-style])": "var(--closed-transform)"
    },
    "flexDirection": {
      "default": "column",
      ":is([data-swipe-axis=\"x\"])": "row"
    },
    "fontSize": `${vars.fontSizeBody}`,
    "lineHeight": "1.428571",
    "transitionProperty": "transform,height,opacity,filter",
    "transitionTimingFunction": "cubic-bezier(0.22,1,0.36,1)",
    "transitionDuration": {
      "default": "300ms",
      ":is([data-ending-style])": {
        "default": "calc(var(--drawer-swipe-strength) * 300ms)",
        ":is([data-nested-drawer-swiping])": "calc(var(--drawer-swipe-strength) * 300ms)",
        ":is([data-swiping])": "calc(var(--drawer-swipe-strength) * 300ms)"
      },
      ":is([data-nested-drawer-swiping])": "0ms",
      ":is([data-swiping])": "0ms"
    },
    "willChange": "transform",
    "outlineStyle": "none",
    "WebkitUserSelect": "none",
    "userSelect": "none",
    "--bleed": "3rem",
    "--drawer-content-height": {
      "default": "var(--drawer-height,auto)",
      ":is([data-swipe-axis=\"y\"])": {
        "default": null,
        ":is([data-snap-points])": "100dvh"
      }
    },
    "--peek": "1rem",
    "--stack-height": "var(--drawer-frontmost-height,var(--drawer-height,0px))",
    "--stack-peek-offset": "max(0px, calc((var(--nested-drawers) - var(--stack-progress)) * var(--peek)))",
    "--stack-progress": "clamp(0, var(--drawer-swipe-progress), 1)",
    "--stack-scale-base": "max(0, calc(1 - (var(--nested-drawers) * var(--stack-step))))",
    "--stack-scale": "clamp(0, calc(var(--stack-scale-base) + (var(--stack-step) * var(--stack-progress))), 1)",
    "--stack-shrink": "calc(1 - var(--stack-scale))",
    "--stack-step": "0.05",
    "interpolateSize": "allow-keywords",
    "::after": {
      "content": {
        "default": "''",
        ":is([data-swipe-axis=\"x\"])": "''",
        ":is([data-swipe-axis=\"y\"])": "''",
        ":is([data-swipe-direction=\"down\"])": "''",
        ":is([data-swipe-direction=\"left\"])": "''",
        ":is([data-swipe-direction=\"right\"])": "''",
        ":is([data-swipe-direction=\"up\"])": "''"
      },
      "pointerEvents": "none",
      "position": "absolute",
      "backgroundColor": `var(--drawer-bleed-background, ${vars.colorSurfaceRaised})`,
      "insetBlock": {
        "default": null,
        ":is([data-swipe-axis=\"x\"])": `${vars.space0}`
      },
      "width": {
        "default": null,
        ":is([data-swipe-axis=\"x\"])": "var(--bleed)"
      },
      "insetInline": {
        "default": null,
        ":is([data-swipe-axis=\"y\"])": `${vars.space0}`
      },
      "height": {
        "default": null,
        ":is([data-swipe-axis=\"y\"])": "var(--bleed)"
      },
      "top": {
        "default": null,
        ":is([data-swipe-direction=\"down\"])": "100%"
      },
      "right": {
        "default": null,
        ":is([data-swipe-direction=\"left\"])": "100%"
      },
      "left": {
        "default": null,
        ":is([data-swipe-direction=\"right\"])": "100%"
      },
      "bottom": {
        "default": null,
        ":is([data-swipe-direction=\"up\"])": "100%"
      }
    },
    "opacity": {
      "default": null,
      ":is([data-ending-style])": "0.9999"
    },
    "overflow": {
      "default": null,
      ":is([data-nested-drawer-open])": "hidden"
    },
    "filter": {
      "default": null,
      ":is([data-nested-drawer-open])": "brightness(95%)"
    },
    "insetBlock": {
      "default": null,
      ":is([data-swipe-axis=\"x\"])": `${vars.space0}`
    },
    "--drawer-content-width": {
      "default": null,
      ":is([data-swipe-axis=\"x\"])": {
        "default": "75%",
        "@media (width >= 40rem)": "24rem"
      }
    },
    "insetInline": {
      "default": null,
      ":is([data-swipe-axis=\"y\"])": `${vars.space0}`
    },
    "--drawer-content-max-height": {
      "default": null,
      ":is([data-swipe-axis=\"y\"])": "calc(100dvh - 6rem)"
    },
    "bottom": {
      "default": null,
      ":is([data-swipe-direction=\"down\"])": `${vars.space0}`
    },
    "transformOrigin": {
      "default": null,
      ":is([data-swipe-direction=\"down\"])": "bottom",
      ":is([data-swipe-direction=\"left\"])": "0",
      ":is([data-swipe-direction=\"right\"])": "100%",
      ":is([data-swipe-direction=\"up\"])": "top"
    },
    "borderTopLeftRadius": {
      "default": null,
      ":is([data-swipe-direction=\"down\"])": vars.radiusPanel,
      ":is([data-swipe-direction=\"right\"])": vars.radiusPanel
    },
    "borderTopRightRadius": {
      "default": null,
      ":is([data-swipe-direction=\"down\"])": vars.radiusPanel,
      ":is([data-swipe-direction=\"left\"])": vars.radiusPanel
    },
    "borderTopStyle": {
      "default": null,
      ":is([data-swipe-direction=\"down\"])": "solid"
    },
    "borderTopWidth": {
      "default": null,
      ":is([data-swipe-direction=\"down\"])": "1px"
    },
    "--closed-transform": {
      "default": null,
      ":is([data-swipe-direction=\"down\"])": "translate3d(0,calc(100% + var(--drawer-inset,0px) + 2px),0)",
      ":is([data-swipe-direction=\"left\"])": "translate3d(calc(-100% - var(--drawer-inset,0px) - 2px),0,0)",
      ":is([data-swipe-direction=\"right\"])": "translate3d(calc(100% + var(--drawer-inset,0px) + 2px),0,0)",
      ":is([data-swipe-direction=\"up\"])": "translate3d(0,calc(-100% - var(--drawer-inset,0px) - 2px),0)"
    },
    "--translate-y": {
      "default": null,
      ":is([data-swipe-direction=\"down\"])": "calc(var(--drawer-snap-point-offset,0px) + var(--drawer-swipe-movement-y) - var(--stack-peek-offset) - (var(--stack-shrink) * var(--stack-height)))",
      ":is([data-swipe-direction=\"up\"])": "calc(var(--drawer-snap-point-offset,0px) + var(--drawer-swipe-movement-y) + var(--stack-peek-offset) + (var(--stack-shrink) * var(--stack-height)))"
    },
    "left": {
      "default": null,
      ":is([data-swipe-direction=\"left\"])": `${vars.space0}`
    },
    "borderBottomRightRadius": {
      "default": null,
      ":is([data-swipe-direction=\"left\"])": vars.radiusPanel,
      ":is([data-swipe-direction=\"up\"])": vars.radiusPanel
    },
    "borderRightStyle": {
      "default": null,
      ":is([data-swipe-direction=\"left\"])": "solid"
    },
    "borderRightWidth": {
      "default": null,
      ":is([data-swipe-direction=\"left\"])": "1px"
    },
    "--translate-x": {
      "default": null,
      ":is([data-swipe-direction=\"left\"])": "calc(var(--drawer-swipe-movement-x) + var(--stack-peek-offset) + (var(--stack-shrink) * 100%))",
      ":is([data-swipe-direction=\"right\"])": "calc(var(--drawer-swipe-movement-x) - var(--stack-peek-offset) - (var(--stack-shrink) * 100%))"
    },
    "right": {
      "default": null,
      ":is([data-swipe-direction=\"right\"])": `${vars.space0}`
    },
    "borderBottomLeftRadius": {
      "default": null,
      ":is([data-swipe-direction=\"right\"])": vars.radiusPanel,
      ":is([data-swipe-direction=\"up\"])": vars.radiusPanel
    },
    "borderLeftStyle": {
      "default": null,
      ":is([data-swipe-direction=\"right\"])": "solid"
    },
    "borderLeftWidth": {
      "default": null,
      ":is([data-swipe-direction=\"right\"])": "1px"
    },
    "top": {
      "default": null,
      ":is([data-swipe-direction=\"up\"])": `${vars.space0}`
    },
    "borderBottomStyle": {
      "default": null,
      ":is([data-swipe-direction=\"up\"])": "solid"
    },
    "borderBottomWidth": {
      "default": null,
      ":is([data-swipe-direction=\"up\"])": "1px"
    }
  },
  "content": {
    "display": "flex",
    "minHeight": `${vars.space0}`,
    "flex": "1",
    "flexDirection": "column",
    "overflow": "hidden",
    "overscrollBehavior": "contain",
    "borderRadius": "inherit",
    "transitionProperty": "opacity",
    "transitionTimingFunction": "cubic-bezier(0.45,1.005,0,1.005)",
    "transitionDuration": "300ms",
    "WebkitUserSelect": {
      "default": "text",
      [stylex.when.ancestor(":is([data-swiping])", drawerMarker)]: "none"
    },
    "userSelect": {
      "default": "text",
      [stylex.when.ancestor(":is([data-swiping])", drawerMarker)]: "none"
    },
    "opacity": {
      "default": null,
      [stylex.when.ancestor(":is([data-nested-drawer-open])", drawerMarker)]: "0%",
      [stylex.when.ancestor(":is([data-nested-drawer-swiping])", drawerMarker)]: "100%"
    }
  },
  "header": {
    "display": "flex",
    "flexShrink": "0",
    "flexDirection": "column",
    "gap": {
      "default": `${vars.space2}`,
      "@media (width >= 48rem)": "6px"
    },
    "padding": `${vars.space16}`,
    "paddingBottom": `${vars.space0}`,
    "textAlign": {
      "default": null,
      [stylex.when.ancestor(":is([data-swipe-axis=\"y\"])", drawerMarker)]: "center",
      "@media (width >= 48rem)": "left"
    }
  },
  "footer": {
    "marginTop": "auto",
    "display": "flex",
    "flexShrink": "0",
    "flexDirection": "column",
    "gap": `${vars.space8}`,
    "padding": `${vars.space16}`,
    "paddingTop": `${vars.space0}`
  },
  "description": {
    "textWrap": "balance"
  },
  "viewport": {
    "pointerEvents": {
      "default": "none",
      ":is([data-modal=\"true\"])": "auto"
    },
    "position": "fixed",
    "inset": `${vars.space0}`,
    "WebkitUserSelect": "none",
    "userSelect": "none"
  }
});
