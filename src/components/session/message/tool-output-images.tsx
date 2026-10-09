import { useEffect, useState } from "react";
import * as stylex from "@stylexjs/stylex";
import { i18n, useTranslation } from "@/i18n";
import { vars } from "@/components/ads/tokens/tokens.stylex";
import { sx } from "@/components/ads/utils/stylex";
import { focusRing } from "@/components/ads/recipes/focus-ring";
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";
import type { ToolOutputImage } from "@/lib/tool-images/tool-images";

type Loaded = { status: "loading" } | { status: "ready"; src: string } | { status: "missing" };

/** Reads a stored image once; an inline one is already a data URL. */
function useToolImageSource(image: ToolOutputImage): Loaded {
  const [loaded, setLoaded] = useState<Loaded>(() =>
    image.kind === "inline" ? { status: "ready", src: image.dataUrl } : { status: "loading" },
  );
  const imageId = image.kind === "stored" ? image.imageId : null;
  useEffect(() => {
    if (!imageId) return;
    const read = typeof window === "undefined" ? undefined : window.api?.toolImages?.read;
    if (!read) {
      setLoaded({ status: "missing" });
      return;
    }
    let cancelled = false;
    void read({ imageId })
      .then((result) => {
        if (!cancelled) setLoaded(result.ok ? { status: "ready", src: result.dataUrl } : { status: "missing" });
      })
      .catch(() => {
        if (!cancelled) setLoaded({ status: "missing" });
      });
    return () => {
      cancelled = true;
    };
  }, [imageId]);
  return loaded;
}

function ToolImageThumbnail(props: { image: ToolOutputImage; index: number }) {
  useTranslation();
  const loaded = useToolImageSource(props.image);
  const [open, setOpen] = useState(false);
  const label = i18n.t("session:toolOutputImages.label", { index: props.index + 1 });

  if (loaded.status !== "ready") {
    return (
      <span className={sx(styles.placeholder)}>
        {loaded.status === "loading"
          ? i18n.t("session:toolOutputImages.loading")
          : i18n.t("session:toolOutputImages.missing")}
      </span>
    );
  }
  return (
    <>
      <button
        type="button"
        className={sx(styles.thumbButton, focusRing.ring)}
        aria-label={i18n.t("session:toolOutputImages.open", { label })}
        onClick={() => setOpen(true)}
      >
        <img src={loaded.src} alt={label} className={sx(styles.thumb)} />
      </button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent xstyle={styles.dialog}>
          <DialogTitle>{label}</DialogTitle>
          <div className={sx(styles.fullFrame)}>
            <img src={loaded.src} alt={label} className={sx(styles.full)} />
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}

/** The images a tool call returned, as thumbnails that open full size. */
export function ToolOutputImages(props: { images: readonly ToolOutputImage[] }) {
  if (props.images.length === 0) return null;
  return (
    <div className={sx(styles.grid)} data-testid="tool-output-images">
      {props.images.map((image, index) => (
        <ToolImageThumbnail
          key={image.kind === "stored" ? image.imageId : `inline-${index}`}
          image={image}
          index={index}
        />
      ))}
    </div>
  );
}

const styles = stylex.create({
  grid: {
    display: "flex",
    flexWrap: "wrap",
    gap: vars["--ads-space-8"],
    minInlineSize: 0,
  },
  thumbButton: {
    backgroundColor: "transparent",
    borderColor: vars["--ads-color-border-subtle"],
    borderRadius: vars["--ads-radius-control"],
    borderStyle: "solid",
    borderWidth: vars["--ads-border-width-hairline"],
    cursor: "zoom-in",
    display: "block",
    overflow: "hidden",
    padding: 0,
  },
  thumb: {
    display: "block",
    maxBlockSize: 200,
    maxInlineSize: "min(100%, 360px)",
    objectFit: "contain",
  },
  placeholder: {
    color: vars["--ads-color-text-muted"],
    fontSize: vars["--ads-font-size-caption"],
  },
  dialog: {
    maxInlineSize: "min(92vw, 1400px)",
    inlineSize: "auto",
  },
  fullFrame: {
    maxBlockSize: "78vh",
    overflow: "auto",
  },
  full: {
    display: "block",
    maxInlineSize: "100%",
  },
});
