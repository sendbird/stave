import { createContext, useContext, useEffect, useState } from "react";
import * as stylex from "@stylexjs/stylex";
import { i18n, useTranslation } from "@/i18n";
import { vars } from "@/components/aui/tokens/tokens.stylex";
import { sx } from "@/components/aui/utils/stylex";
import { Button as AuiButton } from "@/components/aui/components/Button";
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";
import type { ReplyToolImage, ToolOutputImage } from "@/lib/tool-images/tool-images";

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

/**
 * The reply's number for the first image of each tool call, so a tool step
 * labels its screenshot the way the reply refers to it ("Image 2").
 */
export const ReplyImageNumbersContext = createContext<ReadonlyMap<string, number> | null>(null);

export function useReplyImageNumber(toolUseId: string | undefined): number | undefined {
  const numbers = useContext(ReplyImageNumbersContext);
  return toolUseId ? numbers?.get(toolUseId) : undefined;
}

function ToolImageThumbnail(props: { image: ToolOutputImage; number: number; compact?: boolean }) {
  useTranslation();
  const loaded = useToolImageSource(props.image);
  const [open, setOpen] = useState(false);
  const label = i18n.t("session:toolOutputImages.label", { index: props.number });

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
      <figure className={sx(styles.figure)}>
        <AuiButton
          layout="host"
          type="button"
          xstyle={styles.thumbButton}
          aria-label={i18n.t("session:toolOutputImages.open", { label })}
          title={i18n.t("session:toolOutputImages.open", { label })}
          onClick={() => setOpen(true)}
        >
          <img
            src={loaded.src}
            alt={label}
            className={sx(styles.thumb, props.compact && styles.thumbCompact)}
          />
        </AuiButton>
        {props.compact ? (
          <figcaption className={sx(styles.caption)}>{label}</figcaption>
        ) : null}
      </figure>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent xstyle={styles.dialog}>
          <DialogTitle>{label}</DialogTitle>
          {/* Original size: the frame scrolls instead of shrinking the image. */}
          <div className={sx(styles.fullFrame)} data-testid="tool-image-full-frame">
            <img src={loaded.src} alt={label} className={sx(styles.full)} />
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}

/** The images a tool call returned, as thumbnails that open full size. */
export function ToolOutputImages(props: { images: readonly ToolOutputImage[]; firstNumber?: number }) {
  if (props.images.length === 0) return null;
  const first = props.firstNumber ?? 1;
  return (
    <div className={sx(styles.grid)} data-testid="tool-output-images">
      {props.images.map((image, index) => (
        <ToolImageThumbnail
          key={image.kind === "stored" ? image.imageId : `inline-${index}`}
          image={image}
          number={first + index}
        />
      ))}
    </div>
  );
}

/**
 * The screenshots the assistant took during a reply, attached under it as
 * small numbered thumbnails ("Image 1", "Image 2"), in the order taken. The
 * reply refers to them by those numbers; a click opens one at original size.
 */
export function ReplyToolImages(props: { images: readonly ReplyToolImage[] }) {
  useTranslation();
  if (props.images.length === 0) return null;
  return (
    <div
      role="group"
      aria-label={i18n.t("session:toolOutputImages.attached", { count: props.images.length })}
      className={sx(styles.grid)}
      data-testid="reply-tool-images"
    >
      {props.images.map((entry) => (
        <ToolImageThumbnail
          key={entry.image.kind === "stored" ? entry.image.imageId : `inline-${entry.number}`}
          image={entry.image}
          number={entry.number}
          compact
        />
      ))}
    </div>
  );
}

const styles = stylex.create({
  grid: {
    display: "flex",
    flexWrap: "wrap",
    gap: vars["--aui-space-8"],
    minInlineSize: 0,
  },
  thumbButton: {
    backgroundColor: "transparent",
    borderColor: vars["--aui-color-border-subtle"],
    borderRadius: vars["--aui-radius-control"],
    borderStyle: "solid",
    borderWidth: vars["--aui-border-width-hairline"],
    cursor: "zoom-in",
    display: "block",
    overflow: "hidden",
    padding: 0,
  },
  figure: {
    display: "flex",
    flexDirection: "column",
    gap: vars["--aui-space-4"],
    margin: 0,
    minInlineSize: 0,
  },
  thumb: {
    display: "block",
    maxBlockSize: 200,
    maxInlineSize: "min(100%, 360px)",
    objectFit: "contain",
  },
  thumbCompact: {
    blockSize: 72,
    inlineSize: 112,
    maxInlineSize: "100%",
    objectFit: "cover",
    objectPosition: "top",
  },
  caption: {
    color: vars["--aui-color-text-muted"],
    fontSize: vars["--aui-font-size-caption"],
    overflow: "hidden",
    textOverflow: "ellipsis",
    whiteSpace: "nowrap",
  },
  placeholder: {
    color: vars["--aui-color-text-muted"],
    fontSize: vars["--aui-font-size-caption"],
  },
  dialog: {
    maxInlineSize: "min(92vw, 1400px)",
    inlineSize: "auto",
  },
  fullFrame: {
    maxBlockSize: "78vh",
    maxInlineSize: "100%",
    overflow: "auto",
  },
  full: {
    display: "block",
    maxInlineSize: "none",
  },
});
